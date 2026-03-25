import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import RoleBadge from "./ui/RoleBadge";

export default function Header({
  user,
  onLogout,
  onOpenFeedback,
  onOpenOwnProfile,
}) {
  const homeHref = user ? "/lobby" : "/";
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isModerator = user?.role === "admin" || user?.role === "moderator";
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.classList.add("mobile-menu-open");

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("mobile-menu-open");
    };
  }, [mobileMenuOpen]);

  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }

  function handleOpenProfile() {
    closeMobileMenu();
    onOpenOwnProfile?.();
  }

  function handleOpenFeedback() {
    closeMobileMenu();
    onOpenFeedback?.();
  }

  function handleOpenAdminReports() {
    closeMobileMenu();
    navigate("/admin/reports");
  }

  function handleOpenStaffRoles() {
    closeMobileMenu();
    navigate("/admin/staff");
  }

  function handleLogoutClick() {
    closeMobileMenu();
    onLogout?.();
  }

  return (
    <>
      <header className="app-header">
        <div className="header-mobile-left">
          <button
            type="button"
            className={`mobile-menu-toggle ${mobileMenuOpen ? "is-open" : ""}`}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav-drawer"
          >
            <span />
            <span />
            <span />
          </button>
        </div>

        <Link
          to={homeHref}
          className="header-brand header-brand-link"
          aria-label="Go to Nite's Watch home"
        >
          <h1>Nite's Watch</h1>
          <span className="vibe-tag">For those who watch the nite</span>
        </Link>

        <div className="header-actions">
          {user && (
            <button
              type="button"
              className="user-status-pill user-status-pill-button"
              onClick={onOpenOwnProfile}
              title="Open your profile"
              aria-label="Open your profile"
            >
              <span className="status-indicator online" />
              <span className="anonymous-label user-pill-name-wrap">
                <span>{user.handle}</span>
                <RoleBadge role={user.role} />
              </span>
            </button>
          )}

          {isModerator && (
            <button
              type="button"
              className="feedback-trigger"
              onClick={() => navigate("/admin/reports")}
              title="Open moderation dashboard"
            >
              🛡️ Admin Reports
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              className="feedback-trigger"
              onClick={() => navigate("/admin/staff")}
              title="Open staff and role management"
            >
              👥 Staff & Roles
            </button>
          )}

          <button
            type="button"
            className="feedback-trigger"
            onClick={onOpenFeedback}
            title="Help us improve"
          >
            💬 Feedback
          </button>

          {user && (
            <button
              type="button"
              className="logout-button"
              onClick={onLogout}
            >
              End Watch
            </button>
          )}
        </div>

        <div className="header-mobile-right">
          {user ? (
            <button
              type="button"
              className="mobile-profile-trigger"
              onClick={handleOpenProfile}
              title="Open your profile"
              aria-label="Open your profile"
            >
              <span className="status-indicator online" />
              <span className="mobile-profile-avatar">{user.avatar || "🌙"}</span>
            </button>
          ) : (
            <span className="header-mobile-spacer" aria-hidden="true" />
          )}
        </div>
      </header>

      <div
        className={`mobile-nav-backdrop ${mobileMenuOpen ? "is-open" : ""}`}
        onClick={closeMobileMenu}
        aria-hidden={!mobileMenuOpen}
      />

      <aside
  id="mobile-nav-drawer"
  className={`mobile-nav-drawer ${mobileMenuOpen ? "is-open" : ""}`}
  aria-hidden={!mobileMenuOpen}
>
  <div className="mobile-nav-inner">
    <div className="mobile-nav-drawer-header">
      <div className="mobile-nav-brand">
        <h2>Nite's Watch</h2>
        <p>For Those Who Watch The Nite</p>
      </div>

      <button
        type="button"
        className="mobile-nav-close"
        onClick={closeMobileMenu}
        aria-label="Close navigation menu"
      >
        ✕
      </button>
    </div>

    {user ? (
      <div className="mobile-nav-user-card">
        <div className="mobile-nav-user-main">
          <span className="mobile-nav-user-avatar">{user.avatar || "🌙"}</span>
          <div className="mobile-nav-user-copy">
            <div className="mobile-nav-user-topline">
              <strong>{user.handle}</strong>
              <RoleBadge role={user.role} />
            </div>
            <p>{user.awakeReason || "Still awake tonight"}</p>
          </div>
        </div>
      </div>
    ) : null}

    <nav className="mobile-nav-groups" aria-label="Mobile navigation">
      <section className="mobile-nav-section">
        <p className="mobile-nav-label">Account</p>

        {user ? (
          <button
            type="button"
            className="mobile-nav-link"
            onClick={handleOpenProfile}
          >
            <span className="mobile-nav-icon">👤</span>
            <span>My Profile</span>
          </button>
        ) : null}

        <button
          type="button"
          className="mobile-nav-link"
          onClick={handleOpenFeedback}
        >
          <span className="mobile-nav-icon">💬</span>
          <span>Feedback</span>
        </button>

        {user ? (
          <button
            type="button"
            className="mobile-nav-link danger"
            onClick={handleLogoutClick}
          >
            <span className="mobile-nav-icon">🚪</span>
            <span>End Watch</span>
          </button>
        ) : null}
      </section>

      {isModerator ? (
        <section className="mobile-nav-section">
          <p className="mobile-nav-label">Staff</p>

          <button
            type="button"
            className="mobile-nav-link"
            onClick={handleOpenAdminReports}
          >
            <span className="mobile-nav-icon">🛡️</span>
            <span>Admin Reports</span>
          </button>

          {isAdmin ? (
            <button
              type="button"
              className="mobile-nav-link"
              onClick={handleOpenStaffRoles}
            >
              <span className="mobile-nav-icon">👥</span>
              <span>Staff &amp; Roles</span>
            </button>
          ) : null}
        </section>
      ) : null}

      <section className="mobile-nav-section">
        <p className="mobile-nav-label">Navigate</p>

        <Link to={homeHref} className="mobile-nav-link" onClick={closeMobileMenu}>
          <span className="mobile-nav-icon">🏠</span>
          <span>Home</span>
        </Link>

        <Link
          to="/legal/terms"
          className="mobile-nav-link"
          onClick={closeMobileMenu}
        >
          <span className="mobile-nav-icon">📜</span>
          <span>Terms</span>
        </Link>

        <Link
          to="/legal/privacy"
          className="mobile-nav-link"
          onClick={closeMobileMenu}
        >
          <span className="mobile-nav-icon">🔒</span>
          <span>Privacy</span>
        </Link>

        <Link
          to="/legal/guidelines"
          className="mobile-nav-link"
          onClick={closeMobileMenu}
        >
          <span className="mobile-nav-icon">✅</span>
          <span>Guidelines</span>
        </Link>
      </section>
    </nav>
  </div>
</aside>
    </>
  );
}