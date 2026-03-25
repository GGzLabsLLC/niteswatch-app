import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  Timestamp,
  increment,
} from "firebase/firestore";
import { db } from "./firebase";

export const USER_MODERATION_COLLECTION = "userModeration";
export const MODERATION_ACTIONS_COLLECTION = "moderationActions";

export const SUSPENSION_TYPES = {
  TEMPORARY: "temporary",
  PERMANENT: "permanent",
};

export const SUSPENSION_ACTION_TYPES = {
  SUSPEND_USER: "suspend_user",
  UNSUSPEND_USER: "unsuspend_user",
  SUSPENSION_EXPIRED: "suspension_expired",
  DENY_MESSAGE_SEND_SUSPENDED: "deny_message_send_suspended",
  ACKNOWLEDGE_SUSPENSION: "acknowledge_suspension",
  ACKNOWLEDGE_WARNING: "acknowledge_warning",
};

function userModerationRef(userId) {
  return doc(db, USER_MODERATION_COLLECTION, userId);
}

function moderationActionsRef() {
  return collection(db, MODERATION_ACTIONS_COLLECTION);
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function hoursFromNow(hours) {
  const safeHours = Number(hours || 0);
  return Timestamp.fromMillis(Date.now() + safeHours * 60 * 60 * 1000);
}

function normalizeSuspensionType(type) {
  return type === SUSPENSION_TYPES.PERMANENT
    ? SUSPENSION_TYPES.PERMANENT
    : SUSPENSION_TYPES.TEMPORARY;
}

function normalizeIssuedBy(value) {
  if (!value || typeof value !== "object") {
    return {
      uid: "",
      handle: "",
    };
  }

  return {
    uid: value.uid || "",
    handle: value.handle || "",
  };
}

function normalizeLiftedBy(value) {
  if (!value || typeof value !== "object") return null;

  return {
    uid: value.uid || "",
    handle: value.handle || "",
    reason: value.reason || "",
  };
}

function normalizeLatestWarning(value) {
  if (!value || typeof value !== "object") return null;

  return {
    active: Boolean(value.active),
    reason: value.reason || "",
    notes: value.notes || "",
    issuedAt: toMillis(value.issuedAt),
    issuedBy: normalizeIssuedBy(value.issuedBy),
    reportId: value.reportId || "",
    acknowledgedAt: toMillis(value.acknowledgedAt),
    acknowledgedByUser: Boolean(value.acknowledgedByUser),
  };
}

function normalizeModeratorIdentity(moderator = {}) {
  if (!moderator || typeof moderator !== "object") {
    return {
      uid: "",
      handle: "",
    };
  }

  const uid =
    moderator.uid ||
    moderator.moderatorUid ||
    moderator.moderatorId ||
    "";

  const handle =
    moderator.handle ||
    moderator.moderatorDisplayName ||
    moderator.moderatorHandle ||
    uid ||
    "Moderator";

  return { uid, handle };
}

export function normalizeUserModerationDoc(docSnapOrData, docId = "") {
  const raw =
    typeof docSnapOrData?.data === "function"
      ? docSnapOrData.data() || {}
      : docSnapOrData || {};

  const suspensionRaw =
    raw?.suspension && typeof raw.suspension === "object"
      ? raw.suspension
      : null;

  const suspension = suspensionRaw
    ? {
        active: Boolean(suspensionRaw.active),
        type: normalizeSuspensionType(suspensionRaw.type),
        reason: suspensionRaw.reason || "",
        startedAt: toMillis(suspensionRaw.startedAt),
        endsAt: toMillis(suspensionRaw.endsAt),
        issuedBy: normalizeIssuedBy(suspensionRaw.issuedBy),
        reportId: suspensionRaw.reportId || "",
        notes: suspensionRaw.notes || "",
        liftedAt: toMillis(suspensionRaw.liftedAt),
        liftedBy: normalizeLiftedBy(suspensionRaw.liftedBy),
        acknowledgedAt: toMillis(suspensionRaw.acknowledgedAt),
        acknowledgedByUser: Boolean(suspensionRaw.acknowledgedByUser),
      }
    : null;

  return {
    id:
      typeof docSnapOrData?.id === "string"
        ? docSnapOrData.id
        : raw.userId || docId || "",
    userId: raw.userId || docId || "",
    warningCount: Number(raw.warningCount || 0),
    latestWarning: normalizeLatestWarning(raw.latestWarning),
    suspension,
    updatedAt: toMillis(raw.updatedAt),
  };
}

export function isSuspensionExpired(suspension) {
  if (!suspension) return false;
  if (normalizeSuspensionType(suspension.type) === SUSPENSION_TYPES.PERMANENT) {
    return false;
  }

  const endsAt = toMillis(suspension.endsAt);
  if (!endsAt) return false;

  return Date.now() >= endsAt;
}

export function isSuspensionActive(suspension) {
  if (!suspension?.active) return false;
  if (toMillis(suspension?.liftedAt)) return false;

  const type = normalizeSuspensionType(suspension.type);

  if (type === SUSPENSION_TYPES.PERMANENT) {
    return true;
  }

  const endsAt = toMillis(suspension.endsAt);
  if (!endsAt) return false;

  return Date.now() < endsAt;
}

export function getSuspensionStatusLabel(suspension) {
  if (!suspension) return "Clear";
  if (toMillis(suspension.liftedAt)) return "Lifted";
  if (!suspension.active) return "Inactive";

  const type = normalizeSuspensionType(suspension.type);

  if (type === SUSPENSION_TYPES.PERMANENT) {
    return "Permanent suspension";
  }

  if (isSuspensionExpired(suspension)) {
    return "Expired suspension";
  }

  if (isSuspensionActive(suspension)) {
    return "Temporary suspension";
  }

  return "Inactive";
}

export function getSuspensionDurationLabel(suspension) {
  if (!suspension) return "";
  const type = normalizeSuspensionType(suspension.type);

  if (type === SUSPENSION_TYPES.PERMANENT) {
    return "Permanent";
  }

  const endsAt = toMillis(suspension.endsAt);
  if (!endsAt) return "";

  return new Date(endsAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function logSuspensionAction({
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
  await addDoc(moderationActionsRef(), {
    type,
    reportId: reportId || "",
    messageId: messageId || "",
    roomId: roomId || "",
    targetUserId: targetUserId || "",
    moderatorUid: moderatorUid || "",
    moderatorDisplayName: moderatorDisplayName || "",
    reason: cleanText(reason),
    note: cleanText(note),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    metadata: metadata && typeof metadata === "object" ? metadata : {},
  });
}

export async function getUserModerationState(userId) {
  if (!userId) return null;

  const snap = await getDoc(userModerationRef(userId));
  if (!snap.exists()) return null;

  return normalizeUserModerationDoc(snap, userId);
}

export function subscribeToUserModerationState(userId, callback) {
  if (!userId) {
    callback(null);
    return () => {};
  }

  return onSnapshot(
    userModerationRef(userId),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }

      callback(normalizeUserModerationDoc(snap, userId));
    },
    (error) => {
      console.error("Failed to subscribe to user moderation state:", error);
      callback(null);
    }
  );
}

export async function recordUserWarningNotice({
  targetUserId,
  moderator,
  reason,
  reportId = null,
  notes = "",
}) {
  const cleanedReason = cleanText(reason);
  const cleanedNotes = cleanText(notes);
  const normalizedModerator = normalizeModeratorIdentity(moderator);

  if (!targetUserId) {
    throw new Error("targetUserId is required.");
  }

  if (!normalizedModerator.uid) {
    throw new Error("moderator.uid is required.");
  }

  await setDoc(
    userModerationRef(targetUserId),
    {
      userId: targetUserId,
      warningCount: increment(1),
      latestWarning: {
        active: true,
        reason: cleanedReason || "You have received a moderator warning.",
        notes: cleanedNotes,
        issuedAt: serverTimestamp(),
        issuedBy: {
          uid: normalizedModerator.uid,
          handle: normalizedModerator.handle,
        },
        reportId: reportId || "",
        acknowledgedAt: null,
        acknowledgedByUser: false,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return {
    ok: true,
    data: {
      userId: targetUserId,
    },
  };
}

export async function acknowledgeWarningNotice(userId) {
  if (!userId) {
    throw new Error("userId is required.");
  }

  await updateDoc(userModerationRef(userId), {
    "latestWarning.active": false,
    "latestWarning.acknowledgedAt": serverTimestamp(),
    "latestWarning.acknowledgedByUser": true,
    updatedAt: serverTimestamp(),
  });

  return { ok: true };
}

export async function suspendUser({
  targetUserId,
  moderator,
  reason,
  suspensionType = SUSPENSION_TYPES.TEMPORARY,
  durationHours = 24,
  reportId = null,
  notes = "",
}) {
  const cleanedReason = cleanText(reason);
  const cleanedNotes = cleanText(notes);
  const normalizedType = normalizeSuspensionType(suspensionType);
  const normalizedModerator = normalizeModeratorIdentity(moderator);

  if (!targetUserId) {
    throw new Error("targetUserId is required.");
  }

  if (!normalizedModerator.uid) {
    throw new Error("moderator.uid is required.");
  }

  if (!cleanedReason) {
    throw new Error("Suspension reason is required.");
  }

  const currentState = await getUserModerationState(targetUserId);
  const resolvedWarningCount = Number(currentState?.warningCount || 0);

  const suspension = {
    active: true,
    type: normalizedType,
    reason: cleanedReason,
    startedAt: serverTimestamp(),
    endsAt:
      normalizedType === SUSPENSION_TYPES.TEMPORARY
        ? hoursFromNow(durationHours)
        : null,
    issuedBy: {
      uid: normalizedModerator.uid,
      handle: normalizedModerator.handle,
    },
    reportId: reportId || "",
    notes: cleanedNotes,
    liftedAt: null,
    liftedBy: null,
    acknowledgedAt: null,
    acknowledgedByUser: false,
  };

  await setDoc(
    userModerationRef(targetUserId),
    {
      userId: targetUserId,
      warningCount: resolvedWarningCount,
      suspension,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await logSuspensionAction({
    type: SUSPENSION_ACTION_TYPES.SUSPEND_USER,
    reportId: reportId || "",
    targetUserId,
    moderatorUid: normalizedModerator.uid,
    moderatorDisplayName: normalizedModerator.handle,
    reason: cleanedReason,
    note:
      cleanedNotes ||
      `${
        normalizedType === SUSPENSION_TYPES.PERMANENT ? "Permanent" : "Temporary"
      } suspension issued.`,
    metadata: {
      suspensionType: normalizedType,
      durationHours:
        normalizedType === SUSPENSION_TYPES.TEMPORARY
          ? Number(durationHours || 0)
          : null,
    },
  });

  return {
    ok: true,
    data: {
      userId: targetUserId,
      suspensionType: normalizedType,
      durationHours:
        normalizedType === SUSPENSION_TYPES.TEMPORARY
          ? Number(durationHours || 0)
          : null,
      reason: cleanedReason,
    },
  };
}

export async function acknowledgeSuspensionNotice(userId) {
  if (!userId) {
    throw new Error("userId is required.");
  }

  await updateDoc(userModerationRef(userId), {
    "suspension.acknowledgedAt": serverTimestamp(),
    "suspension.acknowledgedByUser": true,
    updatedAt: serverTimestamp(),
  });

  return { ok: true };
}

export async function unsuspendUser({
  targetUserId,
  moderator,
  reason = "Suspension lifted by moderator",
  reportId = null,
}) {
  const cleanedReason = cleanText(reason) || "Suspension lifted by moderator";
  const normalizedModerator = normalizeModeratorIdentity(moderator);

  if (!targetUserId) {
    throw new Error("targetUserId is required.");
  }

  if (!normalizedModerator.uid) {
    throw new Error("moderator.uid is required.");
  }

  const existing = await getUserModerationState(targetUserId);

  if (!existing?.suspension) {
    await setDoc(
      userModerationRef(targetUserId),
      {
        userId: targetUserId,
        warningCount: Number(existing?.warningCount || 0),
        suspension: {
          active: false,
          type: SUSPENSION_TYPES.TEMPORARY,
          reason: "",
          startedAt: null,
          endsAt: null,
          issuedBy: {
            uid: "",
            handle: "",
          },
          reportId: reportId || "",
          notes: "",
          liftedAt: serverTimestamp(),
          liftedBy: {
            uid: normalizedModerator.uid,
            handle: normalizedModerator.handle,
            reason: cleanedReason,
          },
          acknowledgedAt: null,
          acknowledgedByUser: false,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } else {
    await updateDoc(userModerationRef(targetUserId), {
      "suspension.active": false,
      "suspension.liftedAt": serverTimestamp(),
      "suspension.liftedBy": {
        uid: normalizedModerator.uid,
        handle: normalizedModerator.handle,
        reason: cleanedReason,
      },
      updatedAt: serverTimestamp(),
    });
  }

  await logSuspensionAction({
    type: SUSPENSION_ACTION_TYPES.UNSUSPEND_USER,
    reportId: reportId || "",
    targetUserId,
    moderatorUid: normalizedModerator.uid,
    moderatorDisplayName: normalizedModerator.handle,
    reason: cleanedReason,
    note: cleanedReason,
    metadata: {},
  });

  return {
    ok: true,
    data: {
      userId: targetUserId,
      reason: cleanedReason,
    },
  };
}

export async function markSuspensionExpiredIfNeeded(userId) {
  if (!userId) return null;

  const current = await getUserModerationState(userId);
  const suspension = current?.suspension;

  if (!suspension) {
    return current;
  }

  if (!suspension.active || !isSuspensionExpired(suspension)) {
    return current;
  }

  return {
    ...current,
    suspension: {
      ...suspension,
      active: false,
    },
  };
}

export async function canUserSendMessage(userId) {
  if (!userId) {
    return {
      allowed: false,
      reason: "Missing user ID.",
      moderationState: null,
      suspension: null,
    };
  }

  const moderationState = await markSuspensionExpiredIfNeeded(userId);
  const suspension = moderationState?.suspension || null;
  const active = isSuspensionActive(suspension);

  return {
    allowed: !active,
    reason: active ? suspension?.reason || "Account suspended." : "",
    moderationState,
    suspension,
  };
}

export async function logSuspendedMessageAttempt({
  userId,
  moderatorState = null,
  roomId = "",
  text = "",
}) {
  if (!userId) return false;

  const suspension = moderatorState?.suspension || null;

  await logSuspensionAction({
    type: SUSPENSION_ACTION_TYPES.DENY_MESSAGE_SEND_SUSPENDED,
    reportId: suspension?.reportId || "",
    roomId: roomId || "",
    targetUserId: userId,
    moderatorUid: "system",
    moderatorDisplayName: "system",
    reason: suspension?.reason || "Account suspended.",
    note: "Suspended user was blocked from sending a message.",
    metadata: {
      textPreview: cleanText(text).slice(0, 120),
      suspensionType: suspension?.type || "",
    },
  });

  return true;
}