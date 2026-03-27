import { useMemo, useState, useEffect, useRef } from "react";
import { avatars } from "../utils/avatars";
import { awakeReasons } from "../utils/awakeReasons";
import { setSession } from "../utils/storage";
import { createAccount, loginAccount } from "../utils/auth";
import { POLICY_VERSION } from "../constants/policies";
import LegalAgreementFlowModal from "../components/LegalAgreementFlowModal";

const vibeChips = [
  "Can't Sleep",
  "Night Shift",
  "Overthinking",
  "Quiet Company",
  "3AM Thoughts",
];

function Login({ onLogin }) {
  const [mode, setMode] = useState("signup");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [avatar, setAvatar] = useState("🌙");
  const [awakeReason, setAwakeReason] = useState("Insomnia");
  const [bio, setBio] = useState("");
  const [error, setError] = useState("");

  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [showLegalFlow, setShowLegalFlow] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inputRef = useRef(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [mode]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    if (!showLegalFlow) return;

    const resetModalScroll = () => {
      const scrollEl = document.querySelector(".legal-flow-scroll");
      if (scrollEl) {
        scrollEl.scrollTop = 0;
      }
    };

    resetModalScroll();

    const raf = requestAnimationFrame(resetModalScroll);
    const timeout = window.setTimeout(resetModalScroll, 60);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
    };
  }, [showLegalFlow]);

  const cleanEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const cleanHandle = useMemo(() => handle.trim(), [handle]);
  const cleanBio = useMemo(() => bio.trim().slice(0, 120), [bio]);

  const isSignup = mode === "signup";

  const canSubmit = useMemo(() => {
    if (!cleanEmail || !password.trim() || isSubmitting) return false;

    if (isSignup) {
      return cleanHandle.length > 2 && ageConfirmed;
    }

    return true;
  }, [cleanEmail, password, cleanHandle, isSignup, ageConfirmed, isSubmitting]);

  function switchMode(nextMode) {
    setMode(nextMode);
    setError("");
    setShowLegalFlow(false);
  }

  function buildSessionUser(account) {
    const now = Date.now();

    return {
      id: account.id || account.uid,
      uid: account.uid || account.id,
      email: account.email || "",
      emailVerified: Boolean(account.emailVerified),
      handle: account.handle || account.username || "",
      avatar: account.avatar || "🌙",
      bio: account.bio || "",
      role: account.role || "user",
      awakeReason: account.awakeReason || awakeReason,
      joinedAt: account.joinedAt || account.createdAt || now,
      lastSeenAt: now,
      status: account.status || "Awake",
      vibe: account.awakeReason || awakeReason,
      policyAcceptance: account.policyAcceptance || null,
    };
  }

  async function finalizeSignup() {
    setError("");
    setIsSubmitting(true);

    try {
      await createAccount({
        email: cleanEmail,
        password: password.trim(),
        username: cleanHandle.slice(0, 24),
        avatar,
        bio: cleanBio,
        awakeReason,
        policyAcceptance: {
          version: POLICY_VERSION,
          acceptedAt: Date.now(),
          termsAccepted: true,
          privacyAccepted: true,
          guidelinesAccepted: true,
          ageConfirmed: true,
        },
      });

      setShowLegalFlow(false);
      setMode("signin");
      setPassword("");
      setError(
        "Account created. Please check your email and verify your account before signing in."
      );
    } catch (err) {
      setError(err?.message || "Something went wrong. Try again.");
      setShowLegalFlow(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    setError("");

    try {
      if (isSignup) {
        setShowLegalFlow(true);
        return;
      }

      setIsSubmitting(true);

      const account = await loginAccount(cleanEmail, password.trim());

      if (!account.emailVerified) {
        setError("Please verify your email before signing in.");
        return;
      }

      const sessionUser = buildSessionUser(account);

      setSession(sessionUser);
      onLogin(sessionUser);
    } catch (err) {
      setError(err?.message || "Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleDeclineLegalFlow() {
    setShowLegalFlow(false);
    setError(
      "You must accept the Terms, Privacy Policy, and Community Guidelines to create an account."
    );
  }

  return (
    <>
      <main className="login-screen">
        <div className="login-shell">
          <section className="login-hero">
            <div className="brand-group">
              <span className="login-eyebrow">Nite's Watch</span>
              <span className="brand-tagline">For Those Who Watch The Nite</span>
            </div>

            <h1 className="hero-title">
              We are the watchers of the nite.
              <br />
            </h1>

            <p className="login-subcopy">
              A social chatroom based place for everyone who can't sleep...
            </p>

            <div className="login-chip-row" aria-label="Nite's Watch room vibes">
              {vibeChips.map((chip) => (
                <span key={chip} className="login-chip">
                  {chip}
                </span>
              ))}
            </div>

            <div className="trust-signals">
              <div className="trust-item">
                <span className="icon">🛡️</span>
                <p>
                  <strong>Moderated 18+ space.</strong>
                </p>
              </div>

              <div className="trust-item">
                <span className="icon">🤝</span>
                <p>
                  <strong>Low pressure.</strong>
                </p>
              </div>
            </div>
          </section>

          <section className="login-card-container">
            <div className="login-card">
              <div className="auth-toggle" role="tablist" aria-label="Login mode">
                <button
                  type="button"
                  className={`auth-toggle-btn ${mode === "signup" ? "active" : ""}`}
                  onClick={() => switchMode("signup")}
                >
                  Create Account
                </button>

                <button
                  type="button"
                  className={`auth-toggle-btn ${mode === "signin" ? "active" : ""}`}
                  onClick={() => switchMode("signin")}
                >
                  Sign In
                </button>
              </div>

              <header className="login-card-header">
                <h2>{isSignup ? "Night Owl? Us too." : "Welcome back."}</h2>
                <p>
                  {isSignup
                    ? "Create your account and join the conversation."
                    : "Sign in and head back into the night."}
                </p>
              </header>

              <form className="login-form" onSubmit={submit}>
                <div className="login-field">
                  <label htmlFor="email">Email</label>
                  <input
                    ref={inputRef}
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>

                <div className="login-field">
                  <label htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    placeholder="Enter a password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={isSignup ? "new-password" : "current-password"}
                  />
                </div>

                {isSignup && (
                  <>
                    <div className="login-field">
                      <label htmlFor="handle">Username</label>
                      <input
                        id="handle"
                        type="text"
                        placeholder="e.g. MidnightOwl"
                        value={handle}
                        maxLength={24}
                        onChange={(e) => setHandle(e.target.value)}
                        autoComplete="off"
                      />
                    </div>

                    <div className="login-field">
                      <label htmlFor="bio">Short bio</label>
                      <input
                        id="bio"
                        type="text"
                        placeholder="Optional — what kind of night are you having?"
                        value={bio}
                        maxLength={120}
                        onChange={(e) => setBio(e.target.value)}
                      />
                    </div>

                    <div className="login-field">
                      <span>Choose an avatar</span>
                      <div className="avatar-picker">
                        {avatars.map((a) => (
                          <button
                            type="button"
                            key={a}
                            className={`avatar-btn ${avatar === a ? "active" : ""}`}
                            onClick={() => setAvatar(a)}
                            aria-label={`Choose avatar ${a}`}
                            aria-pressed={avatar === a}
                          >
                            {a}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div className="login-field">
                  <label htmlFor="awakeReason">Vibe</label>
                  <select
                    id="awakeReason"
                    value={awakeReason}
                    onChange={(e) => setAwakeReason(e.target.value)}
                  >
                    {awakeReasons.map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </div>

                {isSignup ? (
                  <div className="login-field legal-consent-group">
                    <label className="policy-check">
                      <input
                        type="checkbox"
                        checked={ageConfirmed}
                        onChange={(e) => setAgeConfirmed(e.target.checked)}
                      />
                      <span>I confirm that I am at least 18 years old.</span>
                    </label>

                    <p className="legal-flow-note">
                      By creating an account, you will be asked to review and accept
                      the Terms of Use, Privacy Policy, and Community Guidelines.
                    </p>
                  </div>
                ) : null}

                {error ? <p className="auth-error">{error}</p> : null}

                <button type="submit" className="submit-btn" disabled={!canSubmit}>
                  {isSubmitting
                    ? "Working..."
                    : isSignup
                    ? "Create Account"
                    : "Enter the Party"}
                </button>
              </form>

              <footer className="card-footer">
                Moderated 18+ space. Reports may be reviewed.
              </footer>
            </div>
          </section>
        </div>
      </main>

      {showLegalFlow ? (
        <LegalAgreementFlowModal
          onDecline={handleDeclineLegalFlow}
          onComplete={finalizeSignup}
        />
      ) : null}
    </>
  );
}

export default Login;
