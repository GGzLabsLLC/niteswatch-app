import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { POLICY_VERSION } from "../constants/policies";
import LegalAgreementFlowModal from "./LegalAgreementFlowModal";

function PolicyGate({ user, onAccepted }) {
  async function handleComplete() {
    if (!user?.uid) return;

    try {
      await updateDoc(doc(db, "users", user.uid), {
        policyAcceptance: {
          version: POLICY_VERSION,
          acceptedAt: serverTimestamp(),
          termsAccepted: true,
          privacyAccepted: true,
          guidelinesAccepted: true,
          ageConfirmed: true,
        },
      });

      onAccepted?.();
    } catch (error) {
      console.error("Failed to save policy acceptance:", error);
    }
  }

  function handleDecline() {
    // Keep them blocked. If they decline updated terms, they should not enter.
    // You could optionally log them out here later if you want.
  }

  return (
    <LegalAgreementFlowModal
      onDecline={handleDecline}
      onComplete={handleComplete}
      finalActionLabel="Agree & Enter"
      finalLoadingLabel="Saving..."
    />
  );
}

export default PolicyGate;