import React from "react";
import Terms from "../pages/legal/Terms";
import Privacy from "../pages/legal/Privacy";
import Guidelines from "../pages/legal/Guidelines";

function LegalDocModal({ type, onClose }) {
  function renderContent() {
    if (type === "terms") return <Terms embedded />;
    if (type === "privacy") return <Privacy embedded />;
    if (type === "guidelines") return <Guidelines embedded />;
    return null;
  }

  const titleMap = {
    terms: "Terms of Use",
    privacy: "Privacy Policy",
    guidelines: "Community Guidelines",
  };

  return (
    <div className="legal-modal-backdrop" onClick={onClose}>
      <div
        className="legal-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-modal-title"
      >
        <div className="legal-modal-header">
          <div>
            <p className="legal-modal-eyebrow">Nite's Watch</p>
            <h2 id="legal-modal-title">{titleMap[type]}</h2>
          </div>

          <button
            type="button"
            className="legal-modal-close"
            onClick={onClose}
            aria-label="Close legal document"
          >
            ×
          </button>
        </div>

        <div className="legal-modal-body">{renderContent()}</div>

        <div className="legal-modal-footer">
          <button type="button" className="primary-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default LegalDocModal;