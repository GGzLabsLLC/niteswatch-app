import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getSuspensionDurationLabel,
  getSuspensionStatusLabel,
  isSuspensionActive,
  subscribeToUserModerationState,
} from "../../lib/suspensionsFirestore";

/** * UTILS
 */
function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDateTime(timestamp) {
  const millis = toMillis(timestamp);
  if (!millis) return "—";
  try {
    return new Date(millis).toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatReason(reason) {
  if (!reason) return "Other";
  return String(reason).replace(/-/g, " ");
}

function formatActionType(type) {
  switch (type) {
    case "note":
    case "save-note":
      return "Saved moderator note";
    case "warn":
    case "warn_user":
      return "Warned user";
    case "delete":
    case "delete_message":
      return "Deleted message";
    case "hide":
    case "hide_message":
    case "auto_hide":
      return type === "auto_hide" ? "Auto-hidden message" : "Hidden message";
    case "unhide":
    case "unhide_message":
      return "Restored message";
    case "dismiss":
    case "dismiss_report":
      return "Dismissed report";
    case "escalate":
    case "escalate_report":
      return "Escalated report";
    case "review":
    case "review_report":
      return "Marked report reviewed";
    case "report_created":
      return "Report created";
    case "suspend_user":
      return "Suspended user";
    case "unsuspend_user":
      return "Lifted suspension";
    case "suspension_expired":
      return "Suspension expired";
    case "deny_message_send_suspended":
      return "Blocked suspended send attempt";
    default:
      return type ? String(type).replace(/_/g, " ") : "Moderation action";
  }
}

function StatusPill({ status }) {
  const currentStatus = status || "open";
  return (
    <span className={`admin-report-status is-${currentStatus}`}>
      {currentStatus}
    </span>
  );
}

/**
 * COMPONENT
 */
function ReportDetailModal({
  report,
  messageModeration,
  reportedUserHistory,
  reportActions,
  onClose,
  onReview,
  onDismiss,
  onEscalate,
  onHideMessage,
  onUnhideMessage,
  onSaveModeratorNote,
  onWarnUser,
  onDeleteMessage,
  onSuspendUser,
  onUnsuspendUser,
}) {
  const navigate = useNavigate();
  const [moderatorNote, setModeratorNote] = useState("");
  const [reportedUserModerationState, setReportedUserModerationState] =
    useState(null);
  const [busyAction, setBusyAction] = useState(null);

  useEffect(() => {
    setModeratorNote(report?.actionNotes || "");
    setBusyAction(null);
  }, [report?.id, report?.actionNotes]);

  useEffect(() => {
    if (!report?.reportedUserId) {
      setReportedUserModerationState(null);
      return;
    }

    const unsubscribe = subscribeToUserModerationState(
      report.reportedUserId,
      (nextState) => {
        setReportedUserModerationState(nextState || null);
      }
    );

    return unsubscribe;
  }, [report?.reportedUserId]);

  const history = useMemo(() => {
    const warningCount =
      reportedUserHistory?.warningCount ?? reportedUserHistory?.warnings ?? 0;
    const hiddenMessageCount =
      reportedUserHistory?.hiddenMessageCount ??
      reportedUserHistory?.hiddenMessages ??
      0;
    const deletedMessageCount =
      reportedUserHistory?.deletedMessageCount ??
      reportedUserHistory?.deletedMessages ??
      0;
    const moderatorNoteCount =
      reportedUserHistory?.noteCount ?? reportedUserHistory?.notes ?? 0;
    const escalationCount =
      reportedUserHistory?.escalationCount ??
      reportedUserHistory?.escalations ??
      0;

    const totalActions =
      reportedUserHistory?.totalActions ??
      (warningCount +
        hiddenMessageCount +
        deletedMessageCount +
        moderatorNoteCount);

    const isRepeatOffender =
      reportedUserHistory?.isRepeatOffender ??
      (warningCount >= 3 ||
        hiddenMessageCount >= 2 ||
        deletedMessageCount >= 1 ||
        escalationCount >= 1);

    return {
      warnings: warningCount,
      hiddenMessages: hiddenMessageCount,
      deletedMessages: deletedMessageCount,
      notes: moderatorNoteCount,
      totalActions,
      escalations: escalationCount,
      isRepeatOffender,
    };
  }, [reportedUserHistory]);

  if (!report) return null;

  const suspension = reportedUserModerationState?.suspension || null;
  const isUserSuspended = isSuspensionActive(suspension);
  const suspensionStatusLabel = getSuspensionStatusLabel(suspension);
  const suspensionEndsLabel = getSuspensionDurationLabel(suspension);

  const isOpen = !report.status || report.status === "open";
  const isClosed =
    report.status === "dismissed" || report.status === "escalated";
  const reportId = report.id || report.reportId || null;
  const messageId = report.targetId || report.messageId || null;
  const isMessageReport =
    (report.type === "message" || !!messageId) && !!messageId;

  const moderationVisibility =
    messageModeration?.visibility ||
    (messageModeration?.deleted
      ? "deleted"
      : messageModeration?.hidden
        ? "hidden"
        : "visible");

  const isMessageHidden =
    moderationVisibility === "hidden" ||
    !!messageModeration?.isHidden ||
    !!messageModeration?.hidden;
  const isDeleted =
    moderationVisibility === "deleted" ||
    !!messageModeration?.isDeleted ||
    !!messageModeration?.deleted;
  const activeReportCount =
    messageModeration?.openReportCount ?? messageModeration?.reportsCount ?? 0;
  const moderationReasons =
    messageModeration?.reasons ||
    (messageModeration?.reason ? [messageModeration.reason] : []);

  const hasModeratorNote = !!moderatorNote.trim();
  const isBusy = !!busyAction;
  const isWarning = busyAction === "warn";
  const isSavingNote = busyAction === "save-note";
  const isTogglingVisibility = busyAction === "toggle-visibility";
  const isDeleting = busyAction === "delete";
  const isSuspending = busyAction === "suspend";
  const isUnsuspending = busyAction === "unsuspend";
  const isReviewing = busyAction === "review";
  const isDismissing = busyAction === "dismiss";
  const isEscalating = busyAction === "escalate";

  const runBusyAction = async (actionKey, action) => {
    if (busyAction) return;
    try {
      setBusyAction(actionKey);
      await action();
    } finally {
      setBusyAction(null);
    }
  };

  const handleViewRoom = () => {
    if (report.roomId) {
      onClose();
      navigate(`/room/${report.roomId}`);
    }
  };

  const handleViewMessage = () => {
    if (report.roomId && messageId) {
      onClose();
      navigate(`/room/${report.roomId}`, {
        state: { highlightMessageId: messageId },
      });
    }
  };

  const handleToggleMessageVisibility = async () => {
  if (!messageId || isBusy) return;

  const actionText = isMessageHidden
    ? "Unhide this message?"
    : "Hide this message from regular users?";

  if (!window.confirm(actionText)) return;

  await runBusyAction("toggle-visibility", async () => {
    const actionPayload = {
      reportId,
      messageId,
      targetUserId: report.reportedUserId,
      roomId: report.roomId,
    };

    if (isMessageHidden) {
      await onUnhideMessage?.(actionPayload);
    } else {
      await onHideMessage?.(actionPayload);
    }
  });
};

  const handleSaveNote = async () => {
    if (!reportId || !hasModeratorNote || isBusy) return;

    await runBusyAction("save-note", async () => {
      await onSaveModeratorNote?.(reportId, moderatorNote.trim());
    });
  };

  const handleWarnUserClick = async () => {
    if (!reportId || isBusy) return;

    const confirmed = window.confirm(
      `Warn this user?${
        history.warnings
          ? ` They already have ${history.warnings} warning(s).`
          : ""
      }`
    );

    if (!confirmed) return;

    await runBusyAction("warn", async () => {
      await onWarnUser?.(reportId, moderatorNote.trim());
    });
  };

  const handleDeleteMessageClick = async () => {
    if (!reportId || isBusy) return;

    const confirmed = window.confirm("Delete message? (Serious violations only)");
    if (!confirmed) return;

    await runBusyAction("delete", async () => {
      await onDeleteMessage?.(reportId, moderatorNote.trim());
    });
  };

  const handleSuspendClick = async (durationHours, label) => {
    if (!reportId || !report.reportedUserId || isBusy) return;

    const reason =
      moderatorNote.trim() ||
      `Suspended from moderation panel (${label.toLowerCase()}).`;

    const confirmed = window.confirm(
      `Suspend this user for ${label}?${
        history.warnings
          ? ` They currently have ${history.warnings} warning(s).`
          : ""
      }`
    );

    if (!confirmed) return;

    await runBusyAction("suspend", async () => {
      await onSuspendUser?.({
        reportId,
        targetUserId: report.reportedUserId,
        durationHours,
        note: reason,
      });
    });
  };

  const handlePermanentSuspendClick = async () => {
    if (!reportId || !report.reportedUserId || isBusy) return;

    const reason =
      moderatorNote.trim() || "Permanent suspension issued from moderation panel.";

    const confirmed = window.confirm(
      "Permanently suspend this user? This should only be used for serious or repeated violations."
    );

    if (!confirmed) return;

    await runBusyAction("suspend", async () => {
      await onSuspendUser?.({
        reportId,
        targetUserId: report.reportedUserId,
        durationHours: null,
        note: reason,
        isPermanent: true,
      });
    });
  };

  const handleUnsuspendClick = async () => {
    if (!reportId || !report.reportedUserId || isBusy) return;

    const reason =
      moderatorNote.trim() || "Suspension lifted from moderation panel.";

    const confirmed = window.confirm("Lift this user's current suspension?");
    if (!confirmed) return;

    await runBusyAction("unsuspend", async () => {
      await onUnsuspendUser?.({
        reportId,
        targetUserId: report.reportedUserId,
        note: reason,
      });
    });
  };

  const handleDismissClick = async () => {
    if (!reportId || isClosed || isBusy) return;

    await runBusyAction("dismiss", async () => {
      await onDismiss?.(reportId);
    });
  };

  const handleReviewClick = async () => {
    if (!reportId || !isOpen || isBusy) return;

    await runBusyAction("review", async () => {
      await onReview?.(reportId);
    });
  };

  const handleEscalateClick = async () => {
    if (!reportId || isClosed || isBusy) return;

    await runBusyAction("escalate", async () => {
      await onEscalate?.(reportId);
    });
  };

  return (
    <div className="admin-report-modal-backdrop" onClick={isBusy ? undefined : onClose}>
      <div
        className="admin-report-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-busy={isBusy}
      >
        <div className="admin-report-modal-top">
          <div className="admin-header-main">
            <span className="admin-report-type-badge">
              {isMessageReport ? "MESSAGE_REPORT" : "USER_REPORT"}
            </span>
            <h2 id="admin-report-modal-title">{formatReason(report.reason)}</h2>
          </div>

          <div className="admin-report-modal-top-right">
            <StatusPill status={report.status} />
            <button
              type="button"
              className="admin-modal-close"
              onClick={onClose}
              disabled={isBusy}
            >
              ×
            </button>
          </div>
        </div>

        <div className="admin-report-modal-body">
          <div className="admin-report-content-scroll">
            <section className="admin-report-modal-section">
              <div className="admin-section-header">
                <h3>Investigation Details</h3>
              </div>
              <div className="admin-report-grid">
                <div className="admin-report-block">
                  <span className="admin-report-label">Target ID</span>
                  <p className="monospace-id">
                    {messageId || report.targetId || "—"}
                  </p>
                </div>
                <div className="admin-report-block">
                  <span className="admin-report-label">Room</span>
                  <p>{report.roomId || "—"}</p>
                </div>
                <div className="admin-report-block">
                  <span className="admin-report-label">Reported User</span>
                  <p className="monospace-id">{report.reportedUserId || "—"}</p>
                </div>
                <div className="admin-report-block">
                  <span className="admin-report-label">Created</span>
                  <p>{formatDateTime(report.createdAt)}</p>
                </div>
              </div>
            </section>

            {isMessageReport && (
              <section className="admin-report-modal-section">
                <h3>Evidence Status</h3>
                <div className="admin-report-notes admin-report-surface">
                  <p className={`status-text ${isDeleted ? "is-danger" : ""}`}>
                    {isDeleted
                      ? "⚠️ ● Deleted"
                      : isMessageHidden
                        ? "🚫 ● Hidden"
                        : "✅ ● Visible"}
                  </p>
                  {activeReportCount > 0 && (
                    <p className="active-count">
                      Current reports on this item:{" "}
                      <strong>{activeReportCount}</strong>
                    </p>
                  )}
                  {moderationReasons.length > 0 && (
                    <p className="reasons-list">
                      Flagged for: {moderationReasons.join(", ")}
                    </p>
                  )}
                </div>
              </section>
            )}

            <section className="admin-report-modal-section">
              <h3>Reporter Context</h3>
              <div className="admin-report-notes">
                <p>
                  "
                  {report.notes || "No additional context provided by reporter."}
                  "
                </p>
              </div>
            </section>

            <section className="admin-report-modal-section">
              <h3>Timeline & Logs</h3>
              <div className="admin-report-history-list">
                {reportActions?.length ? (
                  reportActions.map((action) => (
                    <div
                      key={action.id || action.actionId}
                      className="admin-report-history-item"
                    >
                      <div className="history-dot" />
                      <div className="admin-report-history-top">
                        <strong>
                          {formatActionType(action.type || action.actionType)}
                        </strong>
                        <span className="history-date">
                          {formatDateTime(action.createdAt)}
                        </span>
                      </div>
                      <div className="admin-report-history-meta">
                        <span>
                          Moderator:{" "}
                          {action.moderatorDisplayName ||
                            action.moderatorHandle ||
                            action.moderatorUid ||
                            action.moderatorId ||
                            "System"}
                        </span>
                      </div>
                      {action.note && (
                        <p className="admin-report-history-note">
                          {action.note}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="admin-report-history-item is-fallback">
                    <div className="history-dot" />
                    <p className="empty-text">
                      Initial report created {formatDateTime(report.createdAt)}
                    </p>
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside className="admin-report-sidebar">
            <div className="sidebar-group">
              <h4 className="sidebar-label">Reported User History</h4>
              {history.isRepeatOffender && (
                <div className="sidebar-alert-box admin-alert-danger admin-repeat-offender-badge critical">
                  ⚠️ REPEAT OFFENDER
                </div>
              )}
              <div className="sidebar-stats-grid">
                <div className="stat-item">
                  <span>Warnings</span>
                  <strong>{history.warnings}</strong>
                </div>
                <div className="stat-item">
                  <span>Total Actions</span>
                  <strong>{history.totalActions}</strong>
                </div>
              </div>
            </div>

            <div className="sidebar-group">
              <h4 className="sidebar-label">Suspension Status</h4>
              <div
                className={`admin-suspension-card ${
                  isUserSuspended ? "is-suspended" : "is-clear"
                }`}
              >
                <div className="admin-suspension-row">
                  <span>Status</span>
                  <strong>{suspensionStatusLabel}</strong>
                </div>

                <div className="admin-suspension-row">
                  <span>Type</span>
                  <strong>{suspension?.type || "clear"}</strong>
                </div>

                <div className="admin-suspension-row">
                  <span>Ends</span>
                  <strong>
                    {suspension?.type === "permanent"
                      ? "Never"
                      : suspensionEndsLabel || "—"}
                  </strong>
                </div>

                <div className="admin-suspension-row">
                  <span>Reason</span>
                  <strong className="admin-suspension-reason">
                    {suspension?.reason || "None"}
                  </strong>
                </div>
              </div>
            </div>

            <div className="sidebar-group">
              <h4 className="sidebar-label">Moderator Notebook</h4>
              <textarea
                className="admin-moderator-notes-input"
                value={moderatorNote}
                onChange={(e) => setModeratorNote(e.target.value)}
                placeholder="Internal notes (visible to other mods)..."
                rows={6}
                disabled={isBusy}
              />
              <button
                type="button"
                className="ghost-button"
                style={{ width: "100%", marginTop: "8px" }}
                onClick={handleSaveNote}
                disabled={!hasModeratorNote || isBusy}
              >
                {isSavingNote ? "Saving..." : "Save Internal Note"}
              </button>
            </div>

            <div className="sidebar-group">
              <h4 className="sidebar-label">Enforcement</h4>
              <div className="sidebar-v-stack">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={handleWarnUserClick}
                  disabled={isBusy}
                >
                  {isWarning ? "Issuing Warning..." : "Issue User Warning"}
                </button>

                <div className="admin-enforcement-divider" />

                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => handleSuspendClick(24, "24 hours")}
                  disabled={isBusy}
                >
                  {isSuspending ? "Working..." : "Suspend 24h"}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => handleSuspendClick(72, "72 hours")}
                  disabled={isBusy}
                >
                  {isSuspending ? "Working..." : "Suspend 72h"}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => handleSuspendClick(168, "7 days")}
                  disabled={isBusy}
                >
                  {isSuspending ? "Working..." : "Suspend 7d"}
                </button>
                <button
                  type="button"
                  className="ghost-button danger"
                  onClick={handlePermanentSuspendClick}
                  disabled={isBusy}
                >
                  {isSuspending ? "Working..." : "Permanent Suspension"}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={handleUnsuspendClick}
                  disabled={!isUserSuspended || isBusy}
                >
                  {isUnsuspending ? "Working..." : "Lift Suspension"}
                </button>

                {isMessageReport && !isDeleted && (
                  <>
                    <div className="admin-enforcement-divider" />
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={handleToggleMessageVisibility}
                      disabled={isBusy}
                    >
                      {isTogglingVisibility
                        ? "Working..."
                        : isMessageHidden
                          ? "Restore Visibility"
                          : "Hide Content"}
                    </button>
                    <button
                      type="button"
                      className="ghost-button danger"
                      onClick={handleDeleteMessageClick}
                      disabled={isBusy}
                    >
                      {isDeleting ? "Deleting..." : "Hard Delete Message"}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="sidebar-group">
              <h4 className="sidebar-label">Navigation</h4>
              <div className="sidebar-v-stack">
                <button
                  type="button"
                  className="sidebar-link-btn"
                  onClick={handleViewRoom}
                  disabled={isBusy}
                >
                  Jump to Room
                </button>
                {isMessageReport && (
                  <button
                    type="button"
                    className="sidebar-link-btn"
                    onClick={handleViewMessage}
                    disabled={isBusy}
                  >
                    Locate Message
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>

        <div className="admin-report-modal-actions">
          <div className="footer-left-group">
            <button
              type="button"
              className="ghost-button"
              onClick={onClose}
              disabled={isBusy}
            >
              Close Window
            </button>
          </div>

          <div className="footer-right-group">
            <button
              type="button"
              className="action-button-dismiss"
              onClick={handleDismissClick}
              disabled={isClosed || isBusy}
            >
              {isDismissing ? "Dismissing..." : "Dismiss Report"}
            </button>
            <button
              type="button"
              className="action-button-review"
              onClick={handleReviewClick}
              disabled={!isOpen || isBusy}
            >
              {isReviewing ? "Reviewing..." : "Mark Reviewed"}
            </button>
            <button
              type="button"
              className="primary-button-escalate"
              onClick={handleEscalateClick}
              disabled={isClosed || isBusy}
            >
              {isEscalating ? "Escalating..." : "Escalate to Senior Admin"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReportDetailModal;