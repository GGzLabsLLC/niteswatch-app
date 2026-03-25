import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { subscribeToMessageModerationEntry } from "../../lib/moderationFirestore";

function formatDateTime(timestamp) {
  if (!timestamp) return "—";
  try {
    return new Date(timestamp).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatReason(reason) {
  if (!reason) return "Other";
  return reason.replace(/-/g, " ");
}

function CopyableBlock({ label, value }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    if (!value || value === "—") return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`admin-report-block is-copyable ${copied ? "was-copied" : ""}`}
      onClick={handleCopy}
    >
      <div className="admin-report-block-header">
        <span className="admin-report-label">{label}</span>
        <div className="admin-copy-status-area">
          {copied ? (
            <span className="admin-copy-toast">Copied!</span>
          ) : (
            <span className="admin-copy-hint-text">Click to copy</span>
          )}
        </div>
      </div>
      <p className="admin-id-text">{value || "—"}</p>
    </div>
  );
}

function StatusPill({ status }) {
  const currentStatus = status || "open";
  return (
    <div className="admin-status-indicator">
      <span className="admin-report-label">Status</span>
      <span className={`status-pill is-${currentStatus}`}>
        {currentStatus}
      </span>
    </div>
  );
}

function ModerationStatePill({ isDeleted, isHidden, reportsCount }) {
  if (isDeleted) {
    return <span className="admin-inline-state-pill is-deleted">Deleted</span>;
  }
  if (isHidden) {
    return (
      <span className="admin-inline-state-pill is-hidden">
        Hidden{reportsCount ? ` • ${reportsCount} reports` : ""}
      </span>
    );
  }
  return (
    <span className="admin-inline-state-pill is-visible">
      Visible{reportsCount ? ` • ${reportsCount} reports` : ""}
    </span>
  );
}

function ReportCard({
  report,
  onOpenReport,
  onReview,
  onDismiss,
  onEscalate,
  onHideMessage,
  onUnhideMessage,
  pendingActions = {},
}) {
  const navigate = useNavigate();
  const [messageModeration, setMessageModeration] = useState(null);

  const isOpen = !report.status || report.status === "open";
  const isClosed =
    report.status === "dismissed" || report.status === "escalated";
  const isMessageReport =
    (report.type === "message" || !!report.messageId || !!report.targetId) &&
    !!(report.messageId || report.targetId);

  const messageId = report.messageId || report.targetId || null;

  useEffect(() => {
    if (!isMessageReport || !messageId) {
      setMessageModeration(null);
      return;
    }

    const unsubscribe = subscribeToMessageModerationEntry(messageId, (entry) => {
      setMessageModeration(entry || null);
    });

    return unsubscribe;
  }, [isMessageReport, messageId]);

  const isMessageHidden =
  messageModeration?.visibility === "hidden" ||
  !!messageModeration?.hidden ||
  !!messageModeration?.isHidden ||
  !!messageModeration?.manualHidden;
  const isMessageDeleted = !!messageModeration?.deleted;
  const reportCount = messageModeration?.reportsCount || 0;

  const isReviewPending = Boolean(pendingActions[`report:${report.id}:review`]);
  const isDismissPending = Boolean(
    pendingActions[`report:${report.id}:dismiss`]
  );
  const isEscalatePending = Boolean(
    pendingActions[`report:${report.id}:escalate`]
  );
  const isHidePending = Boolean(pendingActions[`message:${messageId}:hide`]);
  const isUnhidePending = Boolean(
    pendingActions[`message:${messageId}:unhide`]
  );

  const handleJumpToRoom = () => {
    if (!report.roomId) return;
    navigate(`/room/${report.roomId}`);
  };

  const handleViewMessage = () => {
    if (!report.roomId || !messageId) return;
    navigate(`/room/${report.roomId}`, {
      state: { highlightMessageId: messageId },
    });
  };

  const handleToggleMessageVisibility = () => {
  if (!messageId || isMessageDeleted) return;

  const actionPayload = {
    reportId: report.id,
    messageId,
    targetUserId: report.reportedUserId || report.targetUserId || "",
    roomId: report.roomId || "",
  };

  if (isMessageHidden) {
    if (isUnhidePending) return;
    onUnhideMessage?.(actionPayload);
    return;
  }

  if (isHidePending) return;
  onHideMessage?.(actionPayload);
};

  return (
    <article
      className={[
        "admin-report-card",
        isOpen ? "is-open" : "is-handled",
        isMessageDeleted ? "has-deleted-message" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="admin-report-card-top">
        <div className="header-main-group">
          <p className="admin-report-type">
            {isMessageReport ? "Message report" : "User report"}
          </p>
          <div className="admin-report-reason-row">
            <h3>{formatReason(report.reason)}</h3>
          </div>
        </div>
        <StatusPill status={report.status} />
      </div>

      <div className="admin-grid-container">
        <div className="admin-grid-instruction">
          Click any block below to copy ID
        </div>
        <div className="admin-report-grid">
          <CopyableBlock label="Target" value={messageId || report.targetId} />
          <CopyableBlock
            label="Reported user"
            value={report.reportedUserId || report.targetUserId}
          />
          <CopyableBlock label="Reporter" value={report.reporterUserId} />
          <CopyableBlock label="Room" value={report.roomId} />

          <div className="admin-report-block">
            <span className="admin-report-label">Created</span>
            <p>{formatDateTime(report.createdAt)}</p>
          </div>

          <div className="admin-report-block">
            <span className="admin-report-label">Reviewed</span>
            <p>{formatDateTime(report.reviewedAt)}</p>
          </div>
        </div>
      </div>

      <div className="admin-report-notes">
        <span className="admin-report-label">Reporter notes</span>
        <p>{report.notes || "No notes provided."}</p>
      </div>

      {report.moderatorNotes && (
        <div className="admin-report-notes admin-report-notes-action">
          <span className="admin-report-label">Moderator notes</span>
          <p>{report.moderatorNotes}</p>
        </div>
      )}

      {isMessageReport && (
        <div className="admin-report-notes">
          <span className="admin-report-label">Message moderation</span>
          <div className="admin-report-inline-state">
            <ModerationStatePill
              isDeleted={isMessageDeleted}
              isHidden={isMessageHidden}
              reportsCount={reportCount}
            />
          </div>
          <p>
            {isMessageDeleted
              ? "This message has been removed by moderation."
              : isMessageHidden
              ? "This message is currently hidden from regular users."
              : "This message is currently visible to regular users."}
          </p>
        </div>
      )}

      <div className="admin-report-actions">
        <button
          type="button"
          className="ghost-button"
          onClick={() => onOpenReport(report)}
        >
          Open details
        </button>

        {isMessageReport && (
          <>
            <button
              type="button"
              className="ghost-button admin-jump-message"
              onClick={handleViewMessage}
            >
              View message
            </button>

            {!isMessageDeleted && (
              <button
                type="button"
                className={
                  isMessageHidden ? "ghost-button" : "ghost-button danger"
                }
                onClick={handleToggleMessageVisibility}
                disabled={isMessageHidden ? isUnhidePending : isHidePending}
              >
                {isMessageHidden
                  ? isUnhidePending
                    ? "Unhiding..."
                    : "Unhide message"
                  : isHidePending
                  ? "Hiding..."
                  : "Hide message"}
              </button>
            )}
          </>
        )}

        {report.roomId && (
          <button
            type="button"
            className="ghost-button admin-jump-room"
            onClick={handleJumpToRoom}
          >
            View room
          </button>
        )}

        <button
          type="button"
          className="ghost-button"
          onClick={() => onReview(report.id)}
          disabled={!isOpen || isReviewPending}
        >
          {isReviewPending ? "Reviewing..." : "Mark reviewed"}
        </button>

        <button
          type="button"
          className="ghost-button"
          onClick={() => onDismiss(report.id)}
          disabled={isClosed || isDismissPending}
        >
          {isDismissPending ? "Dismissing..." : "Dismiss"}
        </button>

        <button
          type="button"
          className="primary-button"
          onClick={() => onEscalate(report.id)}
          disabled={isClosed || isEscalatePending}
        >
          {isEscalatePending ? "Escalating..." : "Escalate"}
        </button>
      </div>
    </article>
  );
}

export default ReportCard;