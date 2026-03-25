import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { recordUserWarningNotice } from "./suspensionsFirestore";

export const REPORT_STATUSES = {
  OPEN: "open",
  REVIEWED: "reviewed",
  DISMISSED: "dismissed",
  ESCALATED: "escalated",
};

export const MOD_ACTION_TYPES = {
  NOTE: "note",
  WARN_USER: "warn_user",
  DELETE_MESSAGE: "delete_message",
  HIDE_MESSAGE: "hide_message",
  UNHIDE_MESSAGE: "unhide_message",
  DISMISS_REPORT: "dismiss_report",
  ESCALATE_REPORT: "escalate_report",
  REVIEW_REPORT: "review_report",
  ROLE_CHANGED: "role_changed",
};

const REPORTS_COLLECTION = "reports";
const MESSAGE_MODERATION_COLLECTION = "messageModeration";
const MODERATION_ACTIONS_COLLECTION = "moderationActions";
const HIDE_THRESHOLD = 3;

function normalizeReportStatus(status) {
  const allowed = Object.values(REPORT_STATUSES);
  return allowed.includes(status) ? status : REPORT_STATUSES.OPEN;
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return 0;
}

function uniqueList(list) {
  return Array.from(new Set(Array.isArray(list) ? list.filter(Boolean) : []));
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sortActionsDesc(actions = []) {
  return [...actions].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function getDefaultActionNote(type, fallback = "") {
  const cleanedFallback = cleanText(fallback);
  if (cleanedFallback) return cleanedFallback;

  switch (type) {
    case MOD_ACTION_TYPES.NOTE:
      return "";
    case MOD_ACTION_TYPES.WARN_USER:
      return "User warned by moderator.";
    case MOD_ACTION_TYPES.DELETE_MESSAGE:
      return "Message removed by moderation.";
    case MOD_ACTION_TYPES.HIDE_MESSAGE:
      return "Message hidden from regular users.";
    case MOD_ACTION_TYPES.UNHIDE_MESSAGE:
      return "Message restored for regular users.";
    case MOD_ACTION_TYPES.DISMISS_REPORT:
      return "Report dismissed by moderator.";
    case MOD_ACTION_TYPES.ESCALATE_REPORT:
      return "Report escalated for higher-priority review.";
    case MOD_ACTION_TYPES.REVIEW_REPORT:
      return "Report marked reviewed.";
    case MOD_ACTION_TYPES.ROLE_CHANGED:
      return "User role changed by admin.";
    default:
      return "";
  }
}

function resolveModeratorIdentity(input = {}) {
  if (typeof input === "string") {
    return {
      moderatorUid: input || "",
      moderatorDisplayName: input || "Moderator",
      note: "",
    };
  }

  return {
    moderatorUid: input?.moderatorUid || input?.moderatorId || input?.uid || "",
    moderatorDisplayName:
      input?.moderatorDisplayName ||
      input?.moderatorHandle ||
      input?.handle ||
      "Moderator",
    note: cleanText(input?.note || ""),
  };
}

function normalizeReportDoc(docSnap) {
  const data = docSnap.data() || {};

  return {
    id: docSnap.id,
    type: data.type === "user" ? "user" : "message",
    targetId: data.targetId || "",
    roomId: data.roomId || null,
    reportedUserId: data.reportedUserId || data.targetUserId || "",
    reporterUserId: data.reporterUserId || "",
    reason: data.reason || "other",
    notes: data.notes || "",
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
    status: normalizeReportStatus(data.status),
    reviewedAt: toMillis(data.reviewedAt),
    reviewedBy: data.reviewedBy || null,
    moderatorNotes: data.moderatorNotes || "",
    resolution: data.resolution || "",
    displayName: data.displayName || "",
    reportedHandle: data.reportedHandle || "",
    reporterHandle: data.reporterHandle || "",
    roomName: data.roomName || "",
    messageText: data.messageText || "",
    messageId: data.messageId || data.targetId || "",
  };
}

function normalizeMessageModerationDoc(docSnap) {
  const data = docSnap.data() || {};

  return {
    id: docSnap.id,
    messageId: data.messageId || docSnap.id,
    roomId: data.roomId || null,
    reportsCount: Number(data.reportsCount || 0),
    reportIds: Array.isArray(data.reportIds) ? data.reportIds : [],
    reporterIds: Array.isArray(data.reporterIds) ? data.reporterIds : [],
    hidden: Boolean(data.hidden),
    manualHidden: Boolean(data.manualHidden),
    flagged: Boolean(data.flagged),
    deleted: Boolean(data.deleted),
    reasons: Array.isArray(data.reasons) ? data.reasons : [],
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}

function normalizeModerationActionDoc(docSnap) {
  const data = docSnap.data() || {};

  return {
    id: docSnap.id,
    type: data.type || "",
    reportId: data.reportId || "",
    messageId: data.messageId || "",
    roomId: data.roomId || "",
    targetUserId: data.targetUserId || "",
    moderatorUid: data.moderatorUid || "",
    moderatorDisplayName: data.moderatorDisplayName || "",
    reason: data.reason || "",
    note: data.note || "",
    metadata:
      data.metadata && typeof data.metadata === "object" ? data.metadata : {},
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}

function normalizeUserDoc(docSnap) {
  const data = docSnap.data() || {};

  return {
    id: docSnap.id,
    uid: data.uid || docSnap.id,
    email: data.email || "",
    handle: data.handle || "Anonymous",
    avatar: data.avatar || "🌙",
    bio: data.bio || "",
    awakeReason: data.awakeReason || "",
    status: data.status || "Awake",
    role: data.role || "user",
    joinedAt: data.joinedAt || null,
    lastSeenAt: data.lastSeenAt || null,
    updatedAt: data.updatedAt || null,
  };
}

function messageModerationRef(messageId) {
  return doc(db, MESSAGE_MODERATION_COLLECTION, messageId);
}

function moderationActionsCollectionRef() {
  return collection(db, MODERATION_ACTIONS_COLLECTION);
}

function usersCollectionRef() {
  return collection(db, "users");
}

function userRef(userId) {
  return doc(db, "users", userId);
}

function messageRef(messageId) {
  return doc(db, "messages", messageId);
}

async function logModerationAction({
  type,
  reportId = "",
  messageId = "",
  roomId = "",
  targetUserId = "",
  moderatorUid = "",
  moderatorDisplayName = "",
  reason = "",
  note = "",
  metadata = {},
}) {
  await addDoc(moderationActionsCollectionRef(), {
    type,
    reportId,
    messageId,
    roomId,
    targetUserId,
    moderatorUid,
    moderatorDisplayName,
    reason: cleanText(reason),
    note: cleanText(note),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    metadata: metadata || {},
  });
}

export function getReportCountsFromList(reports = []) {
  return reports.reduce(
    (acc, report) => {
      const status = normalizeReportStatus(report?.status);
      acc.total += 1;

      if (status === REPORT_STATUSES.OPEN) acc.open += 1;
      if (status === REPORT_STATUSES.REVIEWED) acc.reviewed += 1;
      if (status === REPORT_STATUSES.DISMISSED) acc.dismissed += 1;
      if (status === REPORT_STATUSES.ESCALATED) acc.escalated += 1;

      return acc;
    },
    {
      total: 0,
      open: 0,
      reviewed: 0,
      dismissed: 0,
      escalated: 0,
    }
  );
}

export function subscribeToReports(callback) {
  const q = query(
    collection(db, REPORTS_COLLECTION),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const reports = snapshot.docs.map(normalizeReportDoc);
    callback(reports);
  });
}

export async function getReportById(reportId) {
  if (!reportId) return null;

  const ref = doc(db, REPORTS_COLLECTION, reportId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;
  return normalizeReportDoc(snap);
}

export async function getMessageModerationEntry(messageId) {
  if (!messageId) return null;

  const snap = await getDoc(messageModerationRef(messageId));
  if (!snap.exists()) return null;

  return normalizeMessageModerationDoc(snap);
}

export function subscribeToMessageModerationEntry(messageId, callback) {
  if (!messageId) {
    callback(null);
    return () => {};
  }

  return onSnapshot(messageModerationRef(messageId), (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }

    callback(normalizeMessageModerationDoc(snap));
  });
}

export function subscribeToRoomMessageModeration(roomId, callback) {
  if (!roomId) {
    callback({});
    return () => {};
  }

  const q = query(
    collection(db, MESSAGE_MODERATION_COLLECTION),
    where("roomId", "==", roomId)
  );

  return onSnapshot(q, (snapshot) => {
    const nextMap = {};

    snapshot.docs.forEach((docSnap) => {
      const entry = normalizeMessageModerationDoc(docSnap);
      nextMap[entry.messageId] = entry;
    });

    callback(nextMap);
  });
}

export async function getModerationActionsForReport(reportId) {
  if (!reportId) return [];

  const q = query(
    moderationActionsCollectionRef(),
    where("reportId", "==", reportId)
  );

  const snap = await getDocs(q);
  return sortActionsDesc(snap.docs.map(normalizeModerationActionDoc));
}

export function subscribeToModerationActionsForReport(reportId, callback) {
  if (!reportId) {
    callback([]);
    return () => {};
  }

  const q = query(
    moderationActionsCollectionRef(),
    where("reportId", "==", reportId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const actions = sortActionsDesc(
        snapshot.docs.map(normalizeModerationActionDoc)
      );
      callback(actions);
    },
    (error) => {
      console.error("Failed to subscribe to moderation actions:", error);
      callback([]);
    }
  );
}

export function subscribeToUsersForAdmin(callback) {
  if (typeof callback !== "function") {
    return () => {};
  }

  const q = query(usersCollectionRef(), orderBy("handle", "asc"));

  return onSnapshot(
    q,
    (snapshot) => {
      const users = snapshot.docs.map(normalizeUserDoc);
      callback(users);
    },
    (error) => {
      console.error("Failed to subscribe to admin users:", error);
      callback([]);
    }
  );
}

export async function getUserModerationHistory(userId) {
  if (!userId) {
    return {
      warnings: 0,
      hiddenMessages: 0,
      deletedMessages: 0,
      notes: 0,
      totalActions: 0,
    };
  }

  const q = query(
    moderationActionsCollectionRef(),
    where("targetUserId", "==", userId)
  );

  const snap = await getDocs(q);
  const actions = snap.docs.map(normalizeModerationActionDoc);

  let warnings = 0;
  let hiddenMessages = 0;
  let deletedMessages = 0;
  let notes = 0;

  actions.forEach((action) => {
    if (action.type === MOD_ACTION_TYPES.WARN_USER) warnings += 1;
    if (action.type === MOD_ACTION_TYPES.HIDE_MESSAGE) hiddenMessages += 1;
    if (action.type === MOD_ACTION_TYPES.DELETE_MESSAGE) deletedMessages += 1;
    if (action.type === MOD_ACTION_TYPES.NOTE) notes += 1;
  });

  return {
    warnings,
    hiddenMessages,
    deletedMessages,
    notes,
    totalActions: actions.length,
  };
}

export async function setFirestoreUserRole(
  userId,
  nextRole,
  {
    moderatorId = "admin",
    moderatorHandle = "admin",
    note = "",
  } = {}
) {
  if (!userId) throw new Error("Missing userId.");
  if (!nextRole) throw new Error("Missing nextRole.");

  const allowedRoles = ["user", "moderator", "admin"];
  if (!allowedRoles.includes(nextRole)) {
    throw new Error("Invalid nextRole.");
  }

  const ref = userRef(userId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error("Target user not found.");
  }

  const existing = normalizeUserDoc(snap);
  const previousRole = existing.role || "user";

  if (previousRole === nextRole) {
    return {
      userId,
      previousRole,
      nextRole,
      unchanged: true,
    };
  }

  await updateDoc(ref, {
    role: nextRole,
    updatedAt: serverTimestamp(),
  });

  await logModerationAction({
    type: MOD_ACTION_TYPES.ROLE_CHANGED,
    targetUserId: userId,
    moderatorUid: moderatorId,
    moderatorDisplayName: moderatorHandle,
    reason: `Role changed from ${previousRole} to ${nextRole}.`,
    note:
      cleanText(note) || `Role changed from ${previousRole} to ${nextRole}.`,
    metadata: {
      previousRole,
      nextRole,
      targetHandle: existing.handle || "",
      targetEmail: existing.email || "",
    },
  });

  return {
    userId,
    previousRole,
    nextRole,
    handle: existing.handle || "",
  };
}

export async function recomputeFirestoreMessageModeration(messageId) {
  if (!messageId) return null;

  const reportsQuery = query(
    collection(db, REPORTS_COLLECTION),
    where("messageId", "==", messageId)
  );

  const reportsSnapshot = await getDocs(reportsQuery);

  const messageReports = reportsSnapshot.docs
    .map(normalizeReportDoc)
    .filter(
      (report) => normalizeReportStatus(report.status) === REPORT_STATUSES.OPEN
    );

  const existingSnap = await getDoc(messageModerationRef(messageId));
  const existing = existingSnap.exists()
    ? normalizeMessageModerationDoc(existingSnap)
    : null;

  const reporterIds = uniqueList(
    messageReports.map((report) => report.reporterUserId).filter(Boolean)
  );
  const reportIds = uniqueList(
    messageReports.map((report) => report.id).filter(Boolean)
  );
  const reasons = uniqueList(
    messageReports.map((report) => report.reason).filter(Boolean)
  );

  const reportsCount = reporterIds.length;
  const roomId =
    existing?.roomId ||
    messageReports.find((report) => report.roomId)?.roomId ||
    null;
  const manualHidden = Boolean(existing?.manualHidden);
  const hidden = manualHidden || reportsCount >= HIDE_THRESHOLD;
  const flagged = reportsCount > 0 || manualHidden;

  const payload = {
    messageId,
    roomId,
    reportsCount,
    reportIds,
    reporterIds,
    hidden,
    manualHidden,
    flagged,
    deleted: Boolean(existing?.deleted),
    reasons,
    updatedAt: serverTimestamp(),
  };

  if (!existing) {
    payload.createdAt = serverTimestamp();
  }

  await setDoc(messageModerationRef(messageId), payload, { merge: true });

  return {
    messageId,
    roomId,
    reportsCount,
    reportIds,
    reporterIds,
    hidden,
    manualHidden,
    flagged,
    deleted: Boolean(existing?.deleted),
    reasons,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

export async function hideFirestoreMessage(
  messageId,
  {
    moderatorId = "admin",
    moderatorHandle = "admin",
    note = "",
    targetUserId = "",
    reportId = "",
    roomId = "",
  } = {}
) {
  if (!messageId) throw new Error("Missing messageId.");

  const existing = await getMessageModerationEntry(messageId);
  const actionNote = getDefaultActionNote(MOD_ACTION_TYPES.HIDE_MESSAGE, note);
  const resolvedRoomId = existing?.roomId || roomId || "";

  const payload = {
    messageId,
    roomId: resolvedRoomId,
    reportsCount: existing?.reportsCount || 0,
    reportIds: existing?.reportIds || [],
    reporterIds: existing?.reporterIds || [],
    hidden: true,
    manualHidden: true,
    flagged: true,
    deleted: Boolean(existing?.deleted),
    reasons: existing?.reasons || [],
    updatedAt: serverTimestamp(),
  };

  if (!existing) {
    payload.createdAt = serverTimestamp();
  }

  await setDoc(messageModerationRef(messageId), payload, { merge: true });

  await logModerationAction({
    type: MOD_ACTION_TYPES.HIDE_MESSAGE,
    reportId,
    messageId,
    roomId: resolvedRoomId,
    targetUserId,
    moderatorUid: moderatorId,
    moderatorDisplayName: moderatorHandle,
    note: actionNote,
    metadata: {
      roomId: resolvedRoomId,
    },
  });

  return true;
}

export async function unhideFirestoreMessage(
  messageId,
  {
    moderatorId = "admin",
    moderatorHandle = "admin",
    note = "",
    targetUserId = "",
    reportId = "",
    roomId = "",
  } = {}
) {
  if (!messageId) throw new Error("Missing messageId.");

  const existing = await getMessageModerationEntry(messageId);
  const actionNote = getDefaultActionNote(MOD_ACTION_TYPES.UNHIDE_MESSAGE, note);
  const resolvedRoomId = existing?.roomId || roomId || "";

  const reportsCount = existing?.reportsCount || 0;
  const hidden = reportsCount >= HIDE_THRESHOLD;

  const payload = {
    messageId,
    roomId: resolvedRoomId,
    reportsCount,
    reportIds: existing?.reportIds || [],
    reporterIds: existing?.reporterIds || [],
    hidden,
    manualHidden: false,
    flagged: Boolean(existing?.flagged || reportsCount > 0),
    deleted: Boolean(existing?.deleted),
    reasons: existing?.reasons || [],
    updatedAt: serverTimestamp(),
  };

  if (!existing) {
    payload.createdAt = serverTimestamp();
  }

  await setDoc(messageModerationRef(messageId), payload, { merge: true });

  await logModerationAction({
    type: MOD_ACTION_TYPES.UNHIDE_MESSAGE,
    reportId,
    messageId,
    roomId: resolvedRoomId,
    targetUserId,
    moderatorUid: moderatorId,
    moderatorDisplayName: moderatorHandle,
    note: actionNote,
    metadata: {
      roomId: resolvedRoomId,
    },
  });

  return true;
}

export async function createFirestoreReport(input = {}) {
  const messageId = cleanText(input.messageId || input.targetId || "");
  const type =
    cleanText(input.type) === "user" || !messageId ? "user" : "message";
  const targetId = cleanText(input.targetId || messageId || input.targetUserId || "");
  const reportedUserId = cleanText(
    input.reportedUserId || input.targetUserId || ""
  );
  const reporterUserId = cleanText(input.reporterUserId || "");
  const roomId = cleanText(input.roomId || "");
  const reason = cleanText(input.reason) || "other";
  const notes = cleanText(input.notes || "");
  const displayName = cleanText(input.displayName || "");
  const reportedHandle = cleanText(input.reportedHandle || "");
  const reporterHandle = cleanText(input.reporterHandle || "");
  const roomName = cleanText(input.roomName || "");
  const messageText = cleanText(input.messageText || "");
  

// TODO: Move to backend trigger (Cloud Function)
// Do NOT recompute moderation state from client (security-restricted collection)

  if (!targetId || !reportedUserId || !reporterUserId) {
    throw new Error("Missing required report fields.");
  }

  const payload = {
  messageId,
  roomId,
  targetUserId: reportedUserId,
  reporterUserId,
  reason,
  notes,
  status: "open", // ✅ REQUIRED BY RULES
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
};

  const result = await addDoc(collection(db, REPORTS_COLLECTION), payload);

  if (type === "message" && messageId) {
    await recomputeFirestoreMessageModeration(messageId);
  }

  return {
    id: result.id,
    ...payload,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export async function updateFirestoreReportStatus(
  reportId,
  status,
  { moderatorNotes = "", resolution = "" } = {}
) {
  if (!reportId) {
    throw new Error("Missing reportId.");
  }

  const normalizedStatus = normalizeReportStatus(status);
  const ref = doc(db, REPORTS_COLLECTION, reportId);
  const existing = await getReportById(reportId);

  if (!existing) {
    throw new Error("Report not found.");
  }

  await updateDoc(ref, {
    status: normalizedStatus,
    updatedAt: serverTimestamp(),
    moderatorNotes: cleanText(moderatorNotes),
    resolution: cleanText(resolution),
  });

  if (existing?.messageId) {
    await recomputeFirestoreMessageModeration(existing.messageId);
  }

  return true;
}

export async function markFirestoreReportReviewed(reportId, moderator = {}) {
  const existing = await getReportById(reportId);
  const actionNote = getDefaultActionNote(MOD_ACTION_TYPES.REVIEW_REPORT);

  if (!existing) throw new Error("Report not found.");

  const { moderatorUid, moderatorDisplayName } =
    resolveModeratorIdentity(moderator);

  if (!moderatorUid) {
    throw new Error("markFirestoreReportReviewed requires moderatorUid.");
  }

  await updateFirestoreReportStatus(reportId, REPORT_STATUSES.REVIEWED, {
    moderatorNotes: existing?.moderatorNotes || "",
    resolution: actionNote,
  });

  await logModerationAction({
    type: MOD_ACTION_TYPES.REVIEW_REPORT,
    reportId,
    messageId: existing?.messageId || "",
    roomId: existing?.roomId || "",
    targetUserId: existing?.reportedUserId || "",
    moderatorUid,
    moderatorDisplayName,
    reason: existing?.reason || "other",
    note: actionNote,
    metadata: {
      reportType: existing?.type || "message",
    },
  });

  return true;
}

export async function dismissFirestoreReport(reportId, moderator = {}) {
  const existing = await getReportById(reportId);
  if (!existing) throw new Error("Report not found.");

  const { moderatorUid, moderatorDisplayName, note } =
    resolveModeratorIdentity(moderator);

  if (!moderatorUid) {
    throw new Error("dismissFirestoreReport requires moderatorUid.");
  }

  const actionNote = getDefaultActionNote(
    MOD_ACTION_TYPES.DISMISS_REPORT,
    note
  );

  await updateFirestoreReportStatus(reportId, REPORT_STATUSES.DISMISSED, {
    moderatorNotes: existing?.moderatorNotes || "",
    resolution: actionNote,
  });

  await logModerationAction({
    type: MOD_ACTION_TYPES.DISMISS_REPORT,
    reportId,
    messageId: existing?.messageId || "",
    roomId: existing?.roomId || "",
    targetUserId: existing?.reportedUserId || "",
    moderatorUid,
    moderatorDisplayName,
    reason: existing?.reason || "other",
    note: actionNote,
    metadata: {
      reportType: existing?.type || "message",
    },
  });

  return true;
}

export async function escalateFirestoreReport(reportId, moderator = {}) {
  const existing = await getReportById(reportId);
  if (!existing) throw new Error("Report not found.");

  const { moderatorUid, moderatorDisplayName, note } =
    resolveModeratorIdentity(moderator);

  if (!moderatorUid) {
    throw new Error("escalateFirestoreReport requires moderatorUid.");
  }

  const actionNote = getDefaultActionNote(
    MOD_ACTION_TYPES.ESCALATE_REPORT,
    note
  );

  await updateFirestoreReportStatus(reportId, REPORT_STATUSES.ESCALATED, {
    moderatorNotes: existing?.moderatorNotes || "",
    resolution: actionNote,
  });

  await logModerationAction({
    type: MOD_ACTION_TYPES.ESCALATE_REPORT,
    reportId,
    messageId: existing?.messageId || "",
    roomId: existing?.roomId || "",
    targetUserId: existing?.reportedUserId || "",
    moderatorUid,
    moderatorDisplayName,
    reason: existing?.reason || "other",
    note: actionNote,
    metadata: {
      reportType: existing?.type || "message",
    },
  });

  return true;
}

export async function saveFirestoreModeratorNote(
  reportId,
  note,
  {
    moderatorId = "admin",
    moderatorHandle = "admin",
  } = {}
) {
  if (!reportId) throw new Error("Missing reportId.");
  if (!cleanText(note)) throw new Error("Missing moderator note.");

  const ref = doc(db, REPORTS_COLLECTION, reportId);
  const existing = await getReportById(reportId);
  const actionNote = cleanText(note);

  if (!existing) throw new Error("Report not found.");

  await updateDoc(ref, {
    moderatorNotes: actionNote,
    updatedAt: serverTimestamp(),
  });

  await logModerationAction({
    type: MOD_ACTION_TYPES.NOTE,
    reportId,
    messageId: existing.messageId || "",
    roomId: existing.roomId || "",
    targetUserId: existing.reportedUserId || "",
    moderatorUid: moderatorId,
    moderatorDisplayName: moderatorHandle,
    reason: existing?.reason || "other",
    note: actionNote,
    metadata: {
      reportType: existing?.type || "message",
    },
  });

  return true;
}

export async function warnFirestoreUserFromReport(
  reportId,
  {
    moderatorUid = "",
    moderatorDisplayName = "",
    moderatorId = "",
    moderatorHandle = "",
    note = "",
  } = {}
) {
  if (!reportId) throw new Error("Missing reportId.");

  const existing = await getReportById(reportId);
  if (!existing) throw new Error("Report not found.");
  if (!existing.reportedUserId) throw new Error("Missing reported user.");

  const actionNote = getDefaultActionNote(MOD_ACTION_TYPES.WARN_USER, note);

  const resolvedModeratorUid = moderatorUid || moderatorId || "";
  const resolvedModeratorDisplayName =
    moderatorDisplayName ||
    moderatorHandle ||
    resolvedModeratorUid ||
    "Moderator";

  if (!resolvedModeratorUid) {
    throw new Error("warnFirestoreUserFromReport requires moderatorUid.");
  }

  await recordUserWarningNotice({
    targetUserId: existing.reportedUserId,
    moderator: {
      uid: resolvedModeratorUid,
      handle: resolvedModeratorDisplayName,
    },
    reason: existing.reason || "You have received a moderator warning.",
    reportId,
    notes: actionNote,
  });

  await updateDoc(doc(db, REPORTS_COLLECTION, reportId), {
    status: REPORT_STATUSES.REVIEWED,
    updatedAt: serverTimestamp(),
    moderatorNotes: existing?.moderatorNotes || "",
    resolution: actionNote,
  });

  await logModerationAction({
    type: MOD_ACTION_TYPES.WARN_USER,
    reportId,
    messageId: existing.messageId || "",
    roomId: existing.roomId || "",
    targetUserId: existing.reportedUserId,
    moderatorUid: resolvedModeratorUid,
    moderatorDisplayName: resolvedModeratorDisplayName,
    reason: existing.reason || "other",
    note: actionNote,
    metadata: {
      reportType: existing?.type || "message",
    },
  });

  if (existing?.messageId) {
    await recomputeFirestoreMessageModeration(existing.messageId);
  }

  return true;
}

export async function deleteFirestoreMessageFromReport(
  reportId,
  {
    moderatorId = "admin",
    moderatorHandle = "admin",
    note = "",
    deleteReason = "Removed by moderation",
  } = {}
) {
  if (!reportId) throw new Error("Missing reportId.");

  const existing = await getReportById(reportId);
  if (!existing) throw new Error("Report not found.");
  if (!existing.messageId) throw new Error("Missing target message ID.");

  const actionNote = getDefaultActionNote(
    MOD_ACTION_TYPES.DELETE_MESSAGE,
    note || deleteReason
  );

  const msgRef = messageRef(existing.messageId);

  await setDoc(
    msgRef,
    {
      text: "[Message removed by moderation]",
      isDeleted: true,
      deletedAt: serverTimestamp(),
      deletedBy: moderatorHandle || moderatorId || "admin",
      deleteReason: cleanText(deleteReason) || "Removed by moderation",
    },
    { merge: true }
  );

  const existingMod = await getMessageModerationEntry(existing.messageId);

  await setDoc(
    messageModerationRef(existing.messageId),
    {
      messageId: existing.messageId,
      roomId: existing.roomId || existingMod?.roomId || null,
      reportsCount: existingMod?.reportsCount || 0,
      reportIds: existingMod?.reportIds || [],
      reporterIds: existingMod?.reporterIds || [],
      hidden: true,
      manualHidden: true,
      flagged: true,
      deleted: true,
      reasons: existingMod?.reasons || [],
      updatedAt: serverTimestamp(),
      ...(existingMod ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true }
  );

  await updateDoc(doc(db, REPORTS_COLLECTION, reportId), {
    status: REPORT_STATUSES.REVIEWED,
    updatedAt: serverTimestamp(),
    moderatorNotes: existing?.moderatorNotes || "",
    resolution: actionNote,
  });

  await logModerationAction({
    type: MOD_ACTION_TYPES.DELETE_MESSAGE,
    reportId,
    messageId: existing.messageId,
    roomId: existing.roomId || "",
    targetUserId: existing.reportedUserId || "",
    moderatorUid: moderatorId,
    moderatorDisplayName: moderatorHandle,
    reason: existing.reason || "other",
    note: actionNote,
    metadata: {
      deleteReason: cleanText(deleteReason) || "Removed by moderation",
      roomId: existing.roomId || "",
    },
  });

  await recomputeFirestoreMessageModeration(existing.messageId);

  return true;
}