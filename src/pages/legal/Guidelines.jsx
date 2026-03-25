import React from "react";
import LegalLayout from "./LegalLayout";

function GuidelinesContent() {
  return (
    <>
      <section>
        <h2>1. Respect other people</h2>
        <p>
          Treat people like real humans on the other side of the screen. Debate
          is fine. Cruelty is not.
        </p>
      </section>

      <section>
        <h2>2. No harassment or hate</h2>
        <p>
          Nite's Watch has zero tolerance for harassment, bullying, dogpiling,
          threats, intimidation, racism, hate speech, slurs, or degrading
          language targeting protected groups.
        </p>
      </section>

      <section>
        <h2>3. Respect anonymity and privacy</h2>
        <p>
          Do not pressure others to reveal personal information, and do not post
          identifying details about yourself or anyone else.
        </p>
      </section>

      <section>
        <h2>4. Keep it safe</h2>
        <p>
          No threats, glorification of violence, encouragement of self-harm,
          exploitation, predatory behavior, or unlawful content.
        </p>
      </section>

      <section>
        <h2>5. No spam or manipulation</h2>
        <p>
          Do not spam rooms, flood chats, run scams, impersonate staff, or
          manipulate other users.
        </p>
      </section>

      <section>
        <h2>6. Moderation actions</h2>
        <p>
          Violations may lead to message removal, warnings, restrictions,
          temporary suspension, or permanent suspension.
        </p>
      </section>

      <section>
        <h2>7. Reporting</h2>
        <p>
          Reports are reviewed to help protect the community and enforce
          platform rules.
        </p>
      </section>

      <section>
        <h2>8. Immediate danger</h2>
        <p>
          Nite's Watch is not a crisis or emergency service. If someone is in
          immediate danger, contact local emergency services.
        </p>
      </section>
    </>
  );
}

export default function Guidelines({ embedded = false }) {
  if (embedded) {
    return <div className="legal-embedded-content"><GuidelinesContent /></div>;
  }

  return (
    <LegalLayout title="Community Guidelines" lastUpdated="March 19, 2026">
      <GuidelinesContent />
    </LegalLayout>
  );
}