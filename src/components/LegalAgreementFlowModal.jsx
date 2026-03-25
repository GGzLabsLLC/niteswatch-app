import { useEffect, useMemo, useRef, useState } from "react";
import Terms from "../pages/legal/Terms";
import Privacy from "../pages/legal/Privacy";
import Guidelines from "../pages/legal/Guidelines";

const LEGAL_STEPS = ["terms", "privacy", "guidelines"];

const STEP_META = {
  terms: {
    title: "Terms of Use",
    eyebrow: "Step 1 of 3",
  },
  privacy: {
    title: "Privacy Policy",
    eyebrow: "Step 2 of 3",
  },
  guidelines: {
    title: "Community Guidelines",
    eyebrow: "Step 3 of 3",
  },
};

function LegalAgreementFlowModal({
  onDecline,
  onComplete,
  finalActionLabel = "Agree & Continue",
  finalLoadingLabel = "Working...",
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [hasReachedBottom, setHasReachedBottom] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  const scrollRef = useRef(null);

  const currentStep = LEGAL_STEPS[stepIndex];
  const isLastStep = stepIndex === LEGAL_STEPS.length - 1;

  const meta = useMemo(() => STEP_META[currentStep], [currentStep]);

  useEffect(() => {
    setHasReachedBottom(false);

    const node = scrollRef.current;
    if (!node) return;

    node.scrollTop = 0;
  }, [currentStep]);

  function handleScroll(e) {
    const el = e.currentTarget;
    const threshold = 12;
    const atBottom =
      el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;

    if (atBottom) {
      setHasReachedBottom(true);
    }
  }

  async function handleAgree() {
    if (!hasReachedBottom || isFinishing) return;

    if (!isLastStep) {
      setStepIndex((prev) => prev + 1);
      return;
    }

    try {
      setIsFinishing(true);
      await onComplete?.();
    } finally {
      setIsFinishing(false);
    }
  }

  function renderStepContent() {
    if (currentStep === "terms") return <Terms embedded />;
    if (currentStep === "privacy") return <Privacy embedded />;
    if (currentStep === "guidelines") return <Guidelines embedded />;
    return null;
  }

  return (
    <div className="legal-flow-backdrop">
      <div
        className="legal-flow-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-flow-title"
      >
        <div className="legal-flow-header">
          <div>
            <p className="legal-flow-eyebrow">{meta.eyebrow}</p>
            <h2 id="legal-flow-title">{meta.title}</h2>
            <p className="legal-flow-subcopy">
              Please review this document fully before continuing.
            </p>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="legal-flow-scroll"
          onScroll={handleScroll}
        >
          {renderStepContent()}
        </div>

        <div className="legal-flow-footer">
          <div className="legal-flow-status">
            {hasReachedBottom ? (
              <span className="legal-flow-status-ready">
                ✓ You’ve reached the end. You can continue.
              </span>
            ) : (
              <span className="legal-flow-status-pending">
                Scroll to the bottom to unlock the next step.
              </span>
            )}
          </div>

          <div className="legal-flow-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onDecline}
              disabled={isFinishing}
            >
              Decline
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={handleAgree}
              disabled={!hasReachedBottom || isFinishing}
            >
              {isFinishing
                ? finalLoadingLabel
                : isLastStep
                ? finalActionLabel
                : "Agree & Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LegalAgreementFlowModal;