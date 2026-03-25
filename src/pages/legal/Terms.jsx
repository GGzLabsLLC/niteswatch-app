import React from "react";
import LegalLayout from "./LegalLayout";

function TermsContent() {
  return (
    <>
      <section>
        <h2>1. Acceptance of these terms</h2>
        <p>
          By creating an account, accessing, or using Nite's Watch, you agree to
          these Terms of Use, our Privacy Policy, and our Community Guidelines.
          If you do not agree, do not use the service.
        </p>
      </section>

      <section>
        <h2>2. Adults only</h2>
        <p>
          Nite's Watch is an 18+ service intended for adults. You must be at least
          18 years old to create an account or use Nite's Watch.
        </p>
      </section>

      <section>
        <h2>3. Nature of the service</h2>
        <p>
          Nite's Watch is a moderated late-night social chat platform where users
          can join rooms and communicate using pseudonymous profiles.
        </p>
      </section>

      <section>
        <h2>4. Acceptable use</h2>
        <p>
          You may not use Nite's Watch to harass, threaten, bully, impersonate,
          spam, scam, spread hate speech, or post unlawful or abusive content.
        </p>
      </section>

      <section>
        <h2>5. User content</h2>
        <p>
          You are responsible for the content you post. By posting content on
          Nite's Watch, you grant Nite's Watch a limited right to host, store,
          display, process, and review that content solely to operate, secure,
          moderate, and improve the service.
        </p>
      </section>

      <section>
        <h2>6. Moderation and enforcement</h2>
        <p>
          Nite's Watch is a moderated space. We may review reports, remove content,
          restrict features, issue warnings, suspend accounts, or permanently
          ban users to protect users and enforce platform rules.
        </p>
      </section>

      <section>
        <h2>7. Availability and changes</h2>
        <p>
          We may update, change, suspend, or discontinue parts of the service at
          any time. We do not guarantee uninterrupted availability.
        </p>
      </section>

      <section>
        <h2>8. Disclaimers</h2>
        <p>
          Nite's Watch is provided on an “as is” and “as available” basis, without
          warranties of any kind to the maximum extent permitted by law.
        </p>
      </section>

      <section>
        <h2>9. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, Nite's Watch and its operators
          are not liable for indirect, incidental, consequential, or punitive
          damages arising from your use of the service.
        </p>
      </section>

      <section>
        <h2>10. Contact</h2>
        <p>
          For questions about these Terms, contact: support@lanparty.app
        </p>
      </section>
    </>
  );
}

export default function Terms({ embedded = false }) {
  if (embedded) {
    return <div className="legal-embedded-content"><TermsContent /></div>;
  }

  return (
    <LegalLayout title="Terms of Use" lastUpdated="March 19, 2026">
      <TermsContent />
    </LegalLayout>
  );
}