import React, { useEffect } from "react";
import { Link } from "react-router-dom";

export default function LegalLayout({
  title,
  lastUpdated,
  children,
  backTo = "/lobby",
}) {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  return (
    <main className="legal-screen">
      <section className="legal-shell">
        <div className="legal-topbar">
          <Link to={backTo} className="legal-back-link">
            ← Back to Nite's Watch
          </Link>
        </div>

        <article className="legal-card">
          <div className="legal-header">
            <p className="legal-eyebrow">Nite's Watch</p>
            <h1>{title}</h1>

            {lastUpdated ? (
              <p className="legal-last-updated">Last updated: {lastUpdated}</p>
            ) : null}

            <nav className="legal-nav" aria-label="Legal pages">
              <Link to="/legal/terms">Terms</Link>
              <Link to="/legal/privacy">Privacy</Link>
              <Link to="/legal/guidelines">Guidelines</Link>
            </nav>
          </div>

          <div className="legal-content">{children}</div>
        </article>
      </section>
    </main>
  );
}