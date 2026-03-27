import React from "react";
import LegalLayout from "./LegalLayout";

function PrivacyContent() {
  return (
    <>
      <section>
        <h2>1. Overview</h2>
        <p>
          Nite's Watch is an 18+ social chat app designed to let adults connect
          using pseudonymous profiles such as handles, avatars, bios, and awake
          reasons.
        </p>
      </section>

      <section>
        <h2>2. Information we collect</h2>
        <p>
          We may collect account information, profile information, messages,
          room activity, reports, moderation history, and technical usage data
          needed to operate and secure the app.
        </p>
      </section>

      <section>
        <h2>3. How we use information</h2>
        <p>
          We use information to create and maintain accounts, operate rooms and
          chat features, review reports, enforce our rules, detect abuse, and
          improve the service.
        </p>
      </section>

      <section>
        <h2>4. Moderation and safety review</h2>
        <p>
          We may review user-generated content such as messages, reports, and
          profile details when investigating abuse, enforcing rules, or
          responding to safety issues.
        </p>
      </section>

      <section>
        <h2>5. Storage and providers</h2>
        <p>
          Nite's Watch uses third-party infrastructure and service providers for
          authentication, hosting, and database functionality.
        </p>
      </section>

      <section>
        <h2>6. Pseudonymity, not invisibility</h2>
        <p>
          Nite's Watch is built around pseudonymous participation, but information
          you submit may still be stored and associated with your account.
        </p>
      </section>

      <section>
        <h2>7. Retention</h2>
        <p>
          We may retain account, moderation, and safety-related records as
          reasonably necessary to operate the service, investigate abuse,
          resolve disputes, and comply with legal obligations.
        </p>
      </section>

      <section>
        <h2>8. Security</h2>
        <p>
          We take reasonable steps to protect information we maintain, but no
          method of transmission or storage is completely secure.
        </p>
      </section>

      <section>
        <h2>9. Adults only</h2>
        <p>
          Nite's Watch is intended only for users 18 years of age or older.
        </p>
      </section>

      <section>
        <h2>10. Contact</h2>
        <p>
          For privacy questions, contact: theniteswatch@gmail.com
        </p>
      </section>
    </>
  );
}

export default function Privacy({ embedded = false }) {
  if (embedded) {
    return <div className="legal-embedded-content"><PrivacyContent /></div>;
  }

  return (
    <LegalLayout title="Privacy Policy" lastUpdated="March 19, 2026">
      <PrivacyContent />
    </LegalLayout>
  );
}
