import * as moderationApi from "../moderationFirestore";

/**
 * LAN Party Moderation Service
 *
 * Purpose:
 * - provide one stable contract for admin/report actions
 * - normalize payload shapes
 * - keep UI components thin
 * - isolate UI from lower-level Firestore helper signatures
 *
 * UI should call THIS file, not raw moderationFirestore helpers directly.
 */

export const REPORT_STATUSES = moderationApi.REPORT_STATUSES || {
  OPEN: "open",
  REVIEWED: "reviewed",
  DISMISSED: "dismissed",
  ESCALATED: "escalated",
};

export const MESSAGE_VISIBILITY = {
  VISIBLE: "visible",
  HIDDEN: "hidden",
  DELETED: "deleted",
};

export const MODERATION_ACTIONS = {
  REPORT_CREATED: "report_created",
  REVIEW: "review",
  DISMISS: "dismiss",
  WARN: "warn",
  HIDE: "hide",
  UNHIDE: "unhide",
  DELETE: "delete",
  NOTE: "note",
  ESCALATE: "escalate",
  AUTO_HIDE: "auto_hide",
};

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function trimOrNull(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeNote(note) {
  return trimOrNull(note);
}

function normalizeReason(reason) {
  return trimOrNull(reason) || "other";
}

function normalizeSource(source) {
  return trimOrNull(source) || "manual";
}

function normalizeReportId(input) {
  return (
    firstDefined(
      input?.reportId,
      input?.id,
      input?.report?.reportId,
      input?.report?.id
    ) || null
  );
}

function normalizeMessageId(input) {
  return (
    firstDefined(
      input?.messageId,
      input?.targetId,
      input?.message?.id,
      input?.message?.messageId,
      input?.report?.messageId,
      input?.report?.targetId
    ) || null
  );
}

function normalizeUserId(input) {
  return (
    firstDefined(
      input?.targetUserId,
      input?.userId,
      input?.reportedUserId,
      input?.report?.reportedUserId,
      input?.message?.userId
    ) || null
  );
}

function normalizeModeratorUid(input) {
  return (
    firstDefined(
      input?.moderatorUid,
      input?.moderatorId,
      input?.actorUid,
      input?.actorId,
      input?.currentUser?.uid
    ) || ""
  );
}

function normalizeModeratorDisplayName(input) {
  return (
    firstDefined(
      input?.moderatorDisplayName,
      input?.moderatorHandle,
      input?.moderatorName,
      input?.actorDisplayName,
      input?.actorHandle,
      input?.currentUser?.handle,
      input?.currentUser?.displayName,
      input?.currentUser?.email
    ) || "Moderator"
  );
}

function normalizeRoomId(input) {
  return (
    firstDefined(
      input?.roomId,
      input?.report?.roomId,
      input?.message?.roomId
    ) || null
  );
}

function normalizeTargetType(input) {
  const explicit = firstDefined(input?.type, input?.report?.type, null);
  if (explicit === "user") return "user";
  if (explicit === "message") return "message";

  const targetId = normalizeMessageId(input);
  return targetId ? "message" : "user";
}

function normalizeActionContext(input = {}) {
  const moderatorUid = normalizeModeratorUid(input);
  const moderatorDisplayName = normalizeModeratorDisplayName(input);

  return {
    reportId: normalizeReportId(input),
    messageId: normalizeMessageId(input),
    targetUserId: normalizeUserId(input),
    moderatorUid,
    moderatorDisplayName,
    // legacy aliases preserved so older helpers still work
    moderatorId: moderatorUid,
    moderatorHandle: moderatorDisplayName,
    roomId: normalizeRoomId(input),
    reason: normalizeReason(input.reason),
    note: normalizeNote(input.note),
    source: normalizeSource(input.source),
    type: normalizeTargetType(input),
    metadata: input.metadata || {},
    report: input.report || null,
    message: input.message || null,
    raw: input,
  };
}

function assertHasReportId(ctx, fnName) {
  invariant(ctx.reportId, `${fnName} requires a reportId.`);
}

function assertHasMessageId(ctx, fnName) {
  invariant(ctx.messageId, `${fnName} requires a messageId.`);
}

function assertHasTargetUserId(ctx, fnName) {
  invariant(
    ctx.targetUserId,
    `${fnName} requires a targetUserId/reportedUserId.`
  );
}

function callIfExists(fnName, ...args) {
  const fn = moderationApi?.[fnName];
  if (typeof fn !== "function") return null;
  return fn(...args);
}

function buildResult(ok, action, data = null, error = null) {
  return {
    ok,
    action,
    data,
    error: error
      ? {
          message: error.message || "Unknown moderation service error.",
          name: error.name || "Error",
        }
      : null,
  };
}

export async function createReport(input = {}) {
  try {
    const targetId = normalizeMessageId(input);
    const targetUserId = normalizeUserId(input);
    const type = normalizeTargetType(input);

    const payload = {
      type,
      targetId: targetId || targetUserId,
      roomId: normalizeRoomId(input),
      reportedUserId: targetUserId,
      reporterUserId: firstDefined(input.reporterUserId, input.userId, null),
      reason: normalizeReason(input.reason),
      notes: trimOrNull(input.notes) || "",
      displayName: trimOrNull(input.displayName) || "",
      reportedHandle: trimOrNull(input.reportedHandle) || "",
      reporterHandle: trimOrNull(input.reporterHandle) || "",
      roomName: trimOrNull(input.roomName) || "",
      messageText:
        trimOrNull(input.messageText) ||
        trimOrNull(input?.messageSnapshot?.text) ||
        trimOrNull(input?.message?.text) ||
        "",
    };

    invariant(payload.type, "createReport requires a type.");
    invariant(payload.targetId, "createReport requires a targetId.");
    invariant(
      payload.reportedUserId,
      "createReport requires a reportedUserId."
    );
    invariant(
      payload.reporterUserId,
      "createReport requires a reporterUserId."
    );

    const result =
      (await callIfExists("createFirestoreReport", payload)) ||
      (await callIfExists("submitFirestoreReport", payload)) ||
      (await callIfExists("createReport", payload));

    if (!result) {
      throw new Error(
        "No lower-level report creation helper was found. Expected createFirestoreReport, submitFirestoreReport, or createReport in moderationFirestore.js."
      );
    }

    return buildResult(true, MODERATION_ACTIONS.REPORT_CREATED, result);
  } catch (error) {
    return buildResult(false, MODERATION_ACTIONS.REPORT_CREATED, null, error);
  }
}

export async function markReportReviewed(input = {}) {
  try {
    const ctx = normalizeActionContext(input);
    assertHasReportId(ctx, "markReportReviewed");
    invariant(ctx.moderatorUid, "markReportReviewed requires moderatorUid.");

    const moderator = {
      moderatorUid: ctx.moderatorUid,
      moderatorDisplayName: ctx.moderatorDisplayName,
    };

    const result =
      (await callIfExists(
        "markFirestoreReportReviewed",
        ctx.reportId,
        moderator
      )) ||
      (await callIfExists("markReportReviewed", ctx.reportId, moderator));

    if (!result) {
      throw new Error(
        "No lower-level reviewed helper was found. Expected markFirestoreReportReviewed or markReportReviewed."
      );
    }

    return buildResult(true, MODERATION_ACTIONS.REVIEW, result);
  } catch (error) {
    return buildResult(false, MODERATION_ACTIONS.REVIEW, null, error);
  }
}

export async function dismissReport(input = {}) {
  try {
    const ctx = normalizeActionContext(input);
    assertHasReportId(ctx, "dismissReport");
    invariant(ctx.moderatorUid, "dismissReport requires moderatorUid.");

    const moderator = {
      moderatorUid: ctx.moderatorUid,
      moderatorDisplayName: ctx.moderatorDisplayName,
      note: ctx.note || "",
    };

    const result =
      (await callIfExists(
        "dismissFirestoreReport",
        ctx.reportId,
        moderator
      )) ||
      (await callIfExists("dismissReport", ctx.reportId, moderator));

    if (!result) {
      throw new Error(
        "No lower-level dismiss helper was found. Expected dismissFirestoreReport or dismissReport."
      );
    }

    return buildResult(true, MODERATION_ACTIONS.DISMISS, result);
  } catch (error) {
    return buildResult(false, MODERATION_ACTIONS.DISMISS, null, error);
  }
}

export async function escalateReport(input = {}) {
  try {
    const ctx = normalizeActionContext(input);
    assertHasReportId(ctx, "escalateReport");
    invariant(ctx.moderatorUid, "escalateReport requires moderatorUid.");

    const moderator = {
      moderatorUid: ctx.moderatorUid,
      moderatorDisplayName: ctx.moderatorDisplayName,
      note: ctx.note || "",
    };

    const result =
      (await callIfExists(
        "escalateFirestoreReport",
        ctx.reportId,
        moderator
      )) ||
      (await callIfExists("escalateReport", ctx.reportId, moderator));

    if (!result) {
      throw new Error(
        "No lower-level escalate helper was found. Expected escalateFirestoreReport or escalateReport."
      );
    }

    return buildResult(true, MODERATION_ACTIONS.ESCALATE, result);
  } catch (error) {
    return buildResult(false, MODERATION_ACTIONS.ESCALATE, null, error);
  }
}

export async function warnUserFromReport(input = {}) {
  try {
    const ctx = normalizeActionContext(input);
    assertHasReportId(ctx, "warnUserFromReport");
    assertHasTargetUserId(ctx, "warnUserFromReport");
    invariant(ctx.moderatorUid, "warnUserFromReport requires moderatorUid.");

    const payload = {
      moderatorUid: ctx.moderatorUid,
      moderatorDisplayName: ctx.moderatorDisplayName,
      targetUserId: ctx.targetUserId,
      messageId: ctx.messageId,
      roomId: ctx.roomId,
      reportId: ctx.reportId,
      reason: ctx.reason || "warning_issued",
      note: ctx.note || "",
      metadata: ctx.metadata || {},
    };

    const result =
      (await callIfExists(
        "warnFirestoreUserFromReport",
        ctx.reportId,
        payload
      )) ||
      (await callIfExists("warnUserFromReport", ctx.reportId, payload)) ||
      (await callIfExists("warnFirestoreUser", payload));

    if (!result) {
      throw new Error(
        "No lower-level warn helper was found. Expected warnFirestoreUserFromReport, warnUserFromReport, or warnFirestoreUser."
      );
    }

    return buildResult(true, MODERATION_ACTIONS.WARN, result);
  } catch (error) {
    return buildResult(false, MODERATION_ACTIONS.WARN, null, error);
  }
}

export async function hideMessageFromReport(input = {}) {
  try {
    const ctx = normalizeActionContext(input);
    assertHasReportId(ctx, "hideMessageFromReport");
    assertHasMessageId(ctx, "hideMessageFromReport");

    const payload = {
      moderatorId: ctx.moderatorId,
      moderatorHandle: ctx.moderatorHandle,
      note: ctx.note || "",
      targetUserId: ctx.targetUserId,
      reportId: ctx.reportId,
      roomId: ctx.roomId || "",
    };

    const result =
      (await callIfExists("hideFirestoreMessage", ctx.messageId, payload)) ||
      (await callIfExists("hideMessageFromReport", ctx.reportId, payload)) ||
      (await callIfExists(
        "hideFirestoreMessageFromReport",
        ctx.reportId,
        payload
      ));

    if (!result) {
      throw new Error(
        "No lower-level hide helper was found. Expected hideFirestoreMessage, hideMessageFromReport, or hideFirestoreMessageFromReport."
      );
    }

    return buildResult(true, MODERATION_ACTIONS.HIDE, result);
  } catch (error) {
    return buildResult(false, MODERATION_ACTIONS.HIDE, null, error);
  }
}

export async function unhideMessageFromReport(input = {}) {
  try {
    const ctx = normalizeActionContext(input);
    assertHasReportId(ctx, "unhideMessageFromReport");
    assertHasMessageId(ctx, "unhideMessageFromReport");

    const payload = {
      moderatorId: ctx.moderatorId,
      moderatorHandle: ctx.moderatorHandle,
      note: ctx.note || "",
      targetUserId: ctx.targetUserId,
      reportId: ctx.reportId,
      roomId: ctx.roomId || "",
    };

    const result =
      (await callIfExists("unhideFirestoreMessage", ctx.messageId, payload)) ||
      (await callIfExists("unhideMessageFromReport", ctx.reportId, payload)) ||
      (await callIfExists(
        "unhideFirestoreMessageFromReport",
        ctx.reportId,
        payload
      ));

    if (!result) {
      throw new Error(
        "No lower-level unhide helper was found. Expected unhideFirestoreMessage, unhideMessageFromReport, or unhideFirestoreMessageFromReport."
      );
    }

    return buildResult(true, MODERATION_ACTIONS.UNHIDE, result);
  } catch (error) {
    return buildResult(false, MODERATION_ACTIONS.UNHIDE, null, error);
  }
}

export async function deleteMessageFromReport(input = {}) {
  try {
    const ctx = normalizeActionContext(input);
    assertHasReportId(ctx, "deleteMessageFromReport");
    assertHasMessageId(ctx, "deleteMessageFromReport");

    const payload = {
      moderatorId: ctx.moderatorId,
      moderatorHandle: ctx.moderatorHandle,
      moderatorUid: ctx.moderatorUid,
      moderatorDisplayName: ctx.moderatorDisplayName,
      targetUserId: ctx.targetUserId,
      messageId: ctx.messageId,
      roomId: ctx.roomId || "",
      reportId: ctx.reportId,
      note: ctx.note || "",
      deleteReason:
        trimOrNull(ctx.metadata?.deleteReason) ||
        "Message removed by moderation",
      metadata: ctx.metadata || {},
    };

    const result =
      (await callIfExists(
        "deleteFirestoreMessageFromReport",
        ctx.reportId,
        payload
      )) ||
      (await callIfExists("deleteMessageFromReport", ctx.reportId, payload)) ||
      (await callIfExists("deleteFirestoreMessage", ctx.messageId, payload));

    if (!result) {
      throw new Error(
        "No lower-level delete helper was found. Expected deleteFirestoreMessageFromReport, deleteMessageFromReport, or deleteFirestoreMessage."
      );
    }

    return buildResult(true, MODERATION_ACTIONS.DELETE, result);
  } catch (error) {
    return buildResult(false, MODERATION_ACTIONS.DELETE, null, error);
  }
}

export async function saveModeratorNote(input = {}) {
  try {
    const ctx = normalizeActionContext(input);
    assertHasReportId(ctx, "saveModeratorNote");

    const note = normalizeNote(ctx.note);
    invariant(note, "saveModeratorNote requires a non-empty note.");

    const result =
      (await callIfExists("saveFirestoreModeratorNote", ctx.reportId, note, {
        moderatorId: ctx.moderatorId,
        moderatorHandle: ctx.moderatorHandle,
      })) ||
      (await callIfExists("saveModeratorNote", ctx.reportId, note, {
        moderatorId: ctx.moderatorId,
        moderatorHandle: ctx.moderatorHandle,
      }));

    if (!result) {
      throw new Error(
        "No lower-level note helper was found. Expected saveFirestoreModeratorNote or saveModeratorNote."
      );
    }

    return buildResult(true, MODERATION_ACTIONS.NOTE, result);
  } catch (error) {
    return buildResult(false, MODERATION_ACTIONS.NOTE, null, error);
  }
}

export async function getUserModerationHistory(input = {}) {
  try {
    const userId = normalizeUserId(input);
    invariant(
      userId,
      "getUserModerationHistory requires a targetUserId, reportedUserId, or userId."
    );

    const result =
      (await callIfExists("getUserModerationHistory", userId)) ||
      (await callIfExists("getFirestoreUserModerationHistory", userId)) ||
      null;

    if (!result) {
      throw new Error(
        "No lower-level user moderation history helper was found. Expected getUserModerationHistory or getFirestoreUserModerationHistory."
      );
    }

    return buildResult(true, "user_history", {
      warningCount: result.warningCount ?? result.warnings ?? 0,
      warnings: result.warningCount ?? result.warnings ?? 0,
      hiddenMessageCount:
        result.hiddenMessageCount ?? result.hiddenMessages ?? 0,
      hiddenMessages: result.hiddenMessageCount ?? result.hiddenMessages ?? 0,
      deletedMessageCount:
        result.deletedMessageCount ?? result.deletedMessages ?? 0,
      deletedMessages: result.deletedMessageCount ?? result.deletedMessages ?? 0,
      noteCount: result.noteCount ?? result.notes ?? 0,
      notes: result.noteCount ?? result.notes ?? 0,
      escalationCount: result.escalationCount ?? result.escalations ?? 0,
      escalations: result.escalationCount ?? result.escalations ?? 0,
      totalActions: result.totalActions ?? 0,
      isRepeatOffender:
        (result.warningCount ?? result.warnings ?? 0) >= 3 ||
        (result.hiddenMessageCount ?? result.hiddenMessages ?? 0) >= 2 ||
        (result.deletedMessageCount ?? result.deletedMessages ?? 0) >= 1 ||
        (result.escalationCount ?? result.escalations ?? 0) >= 1,
    });
  } catch (error) {
    return buildResult(false, "user_history", null, error);
  }
}

export function subscribeToReports(handler) {
  invariant(
    typeof handler === "function",
    "subscribeToReports requires a handler function."
  );

  const fn =
    moderationApi.subscribeToReports || moderationApi.subscribeFirestoreReports;

  invariant(
    typeof fn === "function",
    "No reports subscription helper found. Expected subscribeToReports or subscribeFirestoreReports."
  );

  return fn(handler);
}

export function subscribeToMessageModeration(messageId, handler) {
  invariant(messageId, "subscribeToMessageModeration requires a messageId.");
  invariant(
    typeof handler === "function",
    "subscribeToMessageModeration requires a handler function."
  );

  const fn =
    moderationApi.subscribeToMessageModerationEntry ||
    moderationApi.subscribeMessageModerationEntry;

  invariant(
    typeof fn === "function",
    "No message moderation subscription helper found. Expected subscribeToMessageModerationEntry or subscribeMessageModerationEntry."
  );

  return fn(messageId, handler);
}

export function subscribeToModerationActionsForReport(reportId, handler) {
  invariant(
    reportId,
    "subscribeToModerationActionsForReport requires a reportId."
  );
  invariant(
    typeof handler === "function",
    "subscribeToModerationActionsForReport requires a handler function."
  );

  const fn =
    moderationApi.subscribeToModerationActionsForReport ||
    moderationApi.subscribeModerationActionsForReport;

  invariant(
    typeof fn === "function",
    "No moderation actions subscription helper found. Expected subscribeToModerationActionsForReport or subscribeModerationActionsForReport."
  );

  return fn(reportId, handler);
}

export async function runModerationAction(actionType, input = {}) {
  switch (actionType) {
    case MODERATION_ACTIONS.REVIEW:
      return markReportReviewed(input);
    case MODERATION_ACTIONS.DISMISS:
      return dismissReport(input);
    case MODERATION_ACTIONS.WARN:
      return warnUserFromReport(input);
    case MODERATION_ACTIONS.HIDE:
      return hideMessageFromReport(input);
    case MODERATION_ACTIONS.UNHIDE:
      return unhideMessageFromReport(input);
    case MODERATION_ACTIONS.DELETE:
      return deleteMessageFromReport(input);
    case MODERATION_ACTIONS.NOTE:
      return saveModeratorNote(input);
    case MODERATION_ACTIONS.ESCALATE:
      return escalateReport(input);
    case MODERATION_ACTIONS.REPORT_CREATED:
      return createReport(input);
    default:
      return buildResult(
        false,
        actionType,
        null,
        new Error(`Unsupported moderation action: ${actionType}`)
      );
  }
}

export function getQueueCountsFromReports(reports = []) {
  if (typeof moderationApi.getReportCountsFromList === "function") {
    const raw = moderationApi.getReportCountsFromList(reports);
    return {
      all: raw?.all ?? raw?.total ?? 0,
      total: raw?.total ?? raw?.all ?? 0,
      open: raw?.open ?? 0,
      reviewed: raw?.reviewed ?? 0,
      dismissed: raw?.dismissed ?? 0,
      escalated: raw?.escalated ?? 0,
    };
  }

  return reports.reduce(
    (acc, report) => {
      const status = report?.status || REPORT_STATUSES.OPEN;

      acc.all += 1;
      acc.total += 1;

      if (status === REPORT_STATUSES.OPEN) acc.open += 1;
      if (status === REPORT_STATUSES.REVIEWED) acc.reviewed += 1;
      if (status === REPORT_STATUSES.DISMISSED) acc.dismissed += 1;
      if (status === REPORT_STATUSES.ESCALATED) acc.escalated += 1;

      return acc;
    },
    {
      all: 0,
      total: 0,
      open: 0,
      reviewed: 0,
      dismissed: 0,
      escalated: 0,
    }
  );
}

const moderationService = {
  REPORT_STATUSES,
  MESSAGE_VISIBILITY,
  MODERATION_ACTIONS,
  createReport,
  markReportReviewed,
  dismissReport,
  escalateReport,
  warnUserFromReport,
  hideMessageFromReport,
  unhideMessageFromReport,
  deleteMessageFromReport,
  saveModeratorNote,
  getUserModerationHistory,
  subscribeToReports,
  subscribeToMessageModeration,
  subscribeToModerationActionsForReport,
  runModerationAction,
  getQueueCountsFromReports,
};

export default moderationService;