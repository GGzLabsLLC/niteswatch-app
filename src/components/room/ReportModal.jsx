import { useEffect, useState } from "react";

const REPORT_REASONS = [
  { value: "harassment", label: "Harassment" },
  { value: "spam", label: "Spam" },
  { value: "sexual-content", label: "Sexual content" },
  { value: "hate-abusive", label: "Hate / abusive content" },
  { value: "self-harm-concern", label: "Self-harm concern" },
  { value: "impersonation", label: "Impersonation" },
  { value: "other", label: "Other" },
];

function ReportModal({ reportDraft, onClose, onSubmit }) {
  const [reason, setReason] = useState("harassment");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!reportDraft) return;

    setReason("harassment");
    setNotes("");
  }, [reportDraft?.targetId, reportDraft?.type]);

  useEffect(() => {
    if (!reportDraft) return;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [reportDraft, onClose]);

  if (!reportDraft) return null;

  const targetLabel =
    reportDraft.displayName ||
    reportDraft.subjectLabel ||
    (reportDraft.type === "message" ? "this message" : "this user");

  const isMessageReport = reportDraft.type === "message";
  const title = isMessageReport ? "Report message" : "Report user";

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      onClose?.();
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!reason || !reportDraft?.targetId || !reportDraft?.reportedUserId) {
      return;
    }

    await onSubmit?.({
      ...reportDraft,
      reason,
      notes: notes.trim(),
    });
  }

  return (
    <div
      className="report-modal-backdrop"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className="report-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
      >
        <div className="report-modal-header">
          <div>
            <p className="report-modal-eyebrow">Safety tools</p>
            <h2 id="report-modal-title">{title}</h2>
            <p className="report-modal-subtext">
              You’re reporting <strong>{targetLabel}</strong>. Mods will review
              this report.
            </p>
          </div>

          <button
            type="button"
            className="report-modal-close"
            onClick={onClose}
            aria-label="Close report modal"
          >
            ×
          </button>
        </div>

        <form className="report-modal-form" onSubmit={handleSubmit}>
          <div className="report-modal-section">
            <label htmlFor="report-reason" className="report-modal-label">
              Reason
            </label>
            <select
              id="report-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="report-modal-select"
            >
              {REPORT_REASONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="report-modal-section">
            <label htmlFor="report-notes" className="report-modal-label">
              Additional context
            </label>
            <textarea
              id="report-notes"
              className="report-modal-textarea"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional: add any context that would help moderators review this."
              rows={5}
              maxLength={500}
            />
            <div className="report-modal-helper">
              {notes.length}/500 characters
            </div>
          </div>

          <div className="report-modal-warning">
            Please report behavior, not disagreements. False or abusive reports
            can also be reviewed by moderators.
          </div>

          <div className="report-modal-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={onClose}
            >
              Cancel
            </button>

            <button type="submit" className="primary-button">
              Submit report
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ReportModal;