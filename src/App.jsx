import { useEffect, useMemo, useRef, useState } from "react";
import {
  Routes,
  Route,
  useNavigate,
  useParams,
  Navigate,
  useLocation,
} from "react-router-dom";

import "./styles/globals/base.css";
import "./styles/globals/animations.css";
import "./styles/layout/responsive.css";
import "./styles/components/buttons.css";
import "./styles/components/forms.css";
import "./styles/components/header.css";
import "./styles/components/footer.css";
import "./styles/components/modal.css";
import "./styles/components/notifications.css";
import "./styles/components/mentions.css";
import "./styles/components/reactions.css";
import "./styles/pages/login.css";
import "./styles/pages/lobby.css";
import "./styles/pages/room.css";
import "./styles/pages/legal.css";
import "./styles/pages/admin-reports.css";

import Footer from "./components/Footer";
import Header from "./components/Header";
import NotificationsTray from "./components/NotificationsTray";
import Guidelines from "./pages/legal/Guidelines";
import Privacy from "./pages/legal/Privacy";
import Terms from "./pages/legal/Terms";
import Lobby from "./pages/Lobby";
import Login from "./pages/Login";
import Room from "./pages/Room";
import AdminReports from "./pages/admin/AdminReports";
import AdminStaff from "./pages/admin/AdminStaff";

import { clearSession } from "./utils/storage";

import { watchAuthState, logoutAccount } from "./utils/auth";
import { pushToast } from "./utils/notifications";
import {
  setPresenceOnline,
  setPresenceOffline,
  subscribeToAwakeUsers,
  touchPresence,
} from "./lib/presence";
import {
  acknowledgeSuspensionNotice,
  acknowledgeWarningNotice,
  getSuspensionDurationLabel,
  getSuspensionStatusLabel,
  isSuspensionActive,
  subscribeToUserModerationState,
} from "./lib/suspensionsFirestore";
import "./styles/components/badges.css";

import PolicyGate from "./components/PolicyGate";
import { POLICY_VERSION } from "./constants/policies";

import RoomProfileModal from "./components/room/RoomProfileModal";

import { DEFAULT_ROOMS } from "./constants/rooms";

import ToastContainer from "./components/ui/ToastContainer";

const ACTIVE_ROOM_KEY = "lanparty.activeRoom";

function ScrollToTop() {
  const location = useLocation();

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    const reset = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;

      const mainContent = document.querySelector(".main-content");
      if (mainContent) {
        mainContent.scrollTop = 0;
      }

      const legalScroll = document.querySelector(".legal-flow-scroll");
      if (legalScroll) {
        legalScroll.scrollTop = 0;
      }
    };

    reset();

    const raf = requestAnimationFrame(reset);
    const timeout = window.setTimeout(reset, 60);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
    };
  }, [location.pathname]);

  return null;
}

function canModerate(user) {
  return user?.role === "moderator" || user?.role === "admin";
}

function getUserId(user) {
  return user?.uid || user?.id || null;
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number(value) || 0;
}

function formatDateTime(value) {
  if (!value) return "—";

  try {
    const safeValue = toMillis(value);
    if (!safeValue) return "—";

    return new Date(safeValue).toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatRelativeLastSeen(value) {
  if (!value) return "just now";

  const millis = new Date(value).getTime();
  if (Number.isNaN(millis)) return "recently";

  const diff = Date.now() - millis;

  if (diff < 60 * 1000) return "just now";
  if (diff < 60 * 60 * 1000) {
    const mins = Math.max(1, Math.floor(diff / (60 * 1000)));
    return `${mins}m ago`;
  }
  if (diff < 24 * 60 * 60 * 1000) {
    const hrs = Math.max(1, Math.floor(diff / (60 * 60 * 1000)));
    return `${hrs}h ago`;
  }
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.max(1, Math.floor(diff / (24 * 60 * 60 * 1000)));
    return `${days}d ago`;
  }

  return new Date(millis).toLocaleDateString();
}

function getPresenceFromUser(user) {
  if (!user) {
    return {
      label: "Quiet now",
      dot: "away",
    };
  }

  return {
    label: "Online now",
    dot: "online",
  };
}

function SuspensionAcknowledgeModal({
  moderationState,
  userId,
  onClose,
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const suspension = moderationState?.suspension || null;
  const isActive = isSuspensionActive(suspension);

  if (!suspension || !isActive || suspension?.acknowledgedByUser) return null;

  const statusLabel = getSuspensionStatusLabel(suspension);
  const endsLabel = getSuspensionDurationLabel(suspension);

  async function handleAcknowledge() {
    if (!userId) return;

    try {
      setIsSubmitting(true);
      await acknowledgeSuspensionNotice(userId);
      onClose?.();
    } catch (error) {
      console.error("Failed to acknowledge suspension:", error);
      pushToast({
        message: "Could not confirm suspension notice.",
        variant: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="report-modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          // intentional no-close on backdrop
        }
      }}
    >
      <div
        className="report-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="suspension-modal-title"
      >
        <div className="report-modal-header">
          <div>
            <p className="report-modal-eyebrow">Account enforcement</p>
            <h2 id="suspension-modal-title">{statusLabel}</h2>
            <p className="report-modal-subtext">
              A moderator has taken action on your account. Please review this
              notice carefully.
            </p>
          </div>
        </div>

        <div className="report-modal-form">
          <div className="report-modal-section">
            <label className="report-modal-label">Reason</label>
            <div className="admin-report-notes is-modal">
              <p>{suspension?.reason || "No reason provided."}</p>
            </div>
          </div>

          <div className="report-modal-section">
            <label className="report-modal-label">Started</label>
            <div className="admin-report-notes is-modal">
              <p>{formatDateTime(suspension?.startedAt)}</p>
            </div>
          </div>

          <div className="report-modal-section">
            <label className="report-modal-label">Ends</label>
            <div className="admin-report-notes is-modal">
              <p>
                {suspension?.type === "permanent"
                  ? "Never (permanent suspension)"
                  : endsLabel || "—"}
              </p>
            </div>
          </div>

          {suspension?.notes ? (
            <div className="report-modal-section">
              <label className="report-modal-label">Moderator summary</label>
              <div className="admin-report-notes is-modal">
                <p>{suspension.notes}</p>
              </div>
            </div>
          ) : null}

          <div className="report-modal-warning">
            You must acknowledge this notice. This does not lift the suspension.
          </div>

          <div className="report-modal-actions">
            <button
              type="button"
              className="primary-button"
              onClick={handleAcknowledge}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Confirming..." : "I understand"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const pendingRoomId = location.state?.pendingRoomId ?? null;

  useEffect(() => {
    const unsubscribe = watchAuthState((profile) => {
      setUser(profile || null);
      setAuthReady(true);
    });

    return unsubscribe;
  }, []);

  const handleLogin = () => {
    if (pendingRoomId) {
      navigate(`/room/${pendingRoomId}`, { replace: true });
      return;
    }

    navigate("/lobby", { replace: true });
  };

  if (!authReady) {
    return <div className="app-shell" />;
  }

  if (user) {
    return <Navigate to="/lobby" replace />;
  }

  return (
    <div className="app-shell">
      <Login onLogin={handleLogin} />
      <NotificationsTray user={null} />
    </div>
  );
}

function MainAppShell({ legalPage = null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomId } = useParams();

  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeRoom, setActiveRoom] = useState(null);
  const [rooms] = useState(DEFAULT_ROOMS);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [awakeUsers, setAwakeUsers] = useState([]);
  const [userModerationState, setUserModerationState] = useState(null);
  const [showSuspensionModal, setShowSuspensionModal] = useState(false);
  const [showOwnProfileModal, setShowOwnProfileModal] = useState(false);

  const lastWarningIssuedAtRef = useRef(0);
  const policyAcceptance = user?.policyAcceptance || null;
  const hasAcceptedCurrentPolicies =
    policyAcceptance?.version === POLICY_VERSION &&
    policyAcceptance?.termsAccepted &&
    policyAcceptance?.privacyAccepted &&
    policyAcceptance?.guidelinesAccepted &&
    policyAcceptance?.ageConfirmed;

  useEffect(() => {
    const unsubscribe = watchAuthState((profile) => {
      setUser(profile || null);
      setAuthReady(true);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAwakeUsers(setAwakeUsers);
    return unsubscribe;
  }, []);

  const roomFromUrl = useMemo(() => {
    if (!roomId) return null;
    return rooms.find((room) => room.id === roomId) || null;
  }, [rooms, roomId]);

  const isAdminReportsRoute = location.pathname === "/admin/reports";
  const isAdminStaffRoute = location.pathname === "/admin/staff";
  const isAdminRoute = isAdminReportsRoute || isAdminStaffRoute;
  const isLegalRoute = location.pathname.startsWith("/legal/");

  const userCanModerate = canModerate(user);
  const userIsAdmin = user?.role === "admin";
  const userId = getUserId(user);

  useEffect(() => {
    if (!userId) {
      setUserModerationState(null);
      setShowSuspensionModal(false);
      setShowOwnProfileModal(false);
      return;
    }

    const unsubscribe = subscribeToUserModerationState(userId, (nextState) => {
      setUserModerationState(nextState || null);
    });

    return unsubscribe;
  }, [userId]);

  useEffect(() => {
    const warning = userModerationState?.latestWarning || null;

    if (!warning?.active || warning?.acknowledgedByUser) return;
    if (!warning?.issuedAt) return;
    if (warning.issuedAt <= lastWarningIssuedAtRef.current) return;

    lastWarningIssuedAtRef.current = warning.issuedAt;

    pushToast({
      message: warning.reason
        ? `Moderator warning: ${warning.reason}`
        : "You received a moderator warning.",
      variant: "warning",
    });

    acknowledgeWarningNotice(userId).catch((error) => {
      console.error("Failed to acknowledge warning notice:", error);
    });
  }, [userModerationState, userId]);

  useEffect(() => {
    const suspension = userModerationState?.suspension || null;
    const shouldShow =
      Boolean(suspension) &&
      isSuspensionActive(suspension) &&
      !suspension?.acknowledgedByUser;

    setShowSuspensionModal(shouldShow);
  }, [userModerationState]);

  useEffect(() => {
    if (!authReady || !user) return;

    if (isAdminRoute || isLegalRoute) {
      setActiveRoom(null);
      sessionStorage.removeItem(ACTIVE_ROOM_KEY);
      return;
    }

    if (!roomId) {
      setActiveRoom(null);
      sessionStorage.removeItem(ACTIVE_ROOM_KEY);
      return;
    }

    if (!roomFromUrl) {
      setActiveRoom(null);
      sessionStorage.removeItem(ACTIVE_ROOM_KEY);
      navigate("/lobby", { replace: true });
      return;
    }

    setActiveRoom(roomFromUrl);
    sessionStorage.setItem(ACTIVE_ROOM_KEY, JSON.stringify(roomFromUrl));
  }, [authReady, user, userId, roomId, roomFromUrl, navigate, isAdminRoute, isLegalRoute]);

  useEffect(() => {
    if (!authReady || !user || !userId) return;
    if (!isAdminRoute && !isLegalRoute && roomId && !roomFromUrl) return;

    const presenceRoomId =
      isAdminRoute || isLegalRoute ? null : roomFromUrl?.id || null;

    async function syncPresence() {
      try {
        await setPresenceOnline({
          uid: userId,
          handle: user.handle,
          avatar: user.avatar,
          status: user.status || "Awake",
          roomId: presenceRoomId,
          role: user.role || "user",
        });
      } catch (error) {
        console.error("[presence] sync failed", error);
      }
    }

    syncPresence();
  }, [authReady, user, userId, isAdminRoute, isLegalRoute, roomFromUrl?.id, roomId]);

  useEffect(() => {
    if (!userId) return;

    const interval = setInterval(() => {
      touchPresence(userId).catch(() => {});
    }, 30000);

    return () => clearInterval(interval);
  }, [userId]);

  useEffect(() => {
    if (!authReady || !user) return;

    const handleNotificationClick = (event) => {
      const notification = event.detail;
      const targetRoomId = notification?.roomId;

      if (!targetRoomId) return;

      const matchedRoom =
        DEFAULT_ROOMS.find((room) => room.id === targetRoomId) || null;

      if (!matchedRoom) return;

      setActiveRoom(matchedRoom);
      sessionStorage.setItem(ACTIVE_ROOM_KEY, JSON.stringify(matchedRoom));
      navigate(`/room/${matchedRoom.id}`);
    };

    window.addEventListener("lanparty:notification-click", handleNotificationClick);

    return () => {
      window.removeEventListener(
        "lanparty:notification-click",
        handleNotificationClick
      );
    };
  }, [authReady, user, userId, navigate]);

  const handleJoinRoom = (room) => {
    setActiveRoom(room);
    sessionStorage.setItem(ACTIVE_ROOM_KEY, JSON.stringify(room));
    navigate(`/room/${room.id}`);
  };

  const handleLeaveRoom = (nextRoom = null) => {
    if (nextRoom) {
      setActiveRoom(nextRoom);
      sessionStorage.setItem(ACTIVE_ROOM_KEY, JSON.stringify(nextRoom));
      navigate(`/room/${nextRoom.id}`);
      return;
    }

    setActiveRoom(null);
    sessionStorage.removeItem(ACTIVE_ROOM_KEY);
    navigate("/lobby", { replace: true });
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);

      if (userId) {
        await setPresenceOffline(userId);
      }

      setUser(null);
      setActiveRoom(null);
      clearSession();
      sessionStorage.removeItem(ACTIVE_ROOM_KEY);

      await logoutAccount();
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Failed to log out:", error);
      setIsLoggingOut(false);
    }
  };

  const handleOpenFeedback = () => {
    window.open("https://docs.google.com/forms/d/e/1FAIpQLSdKvgINSXOFelFt09HeQbhbC8_vKjWtvshj9A2OCHDlNWQ4Pg/viewform?usp=publish-editor", "_blank");
  };

  const handleOpenOwnProfile = () => {
    setShowOwnProfileModal(true);
  };

  const handleCloseOwnProfile = () => {
    setShowOwnProfileModal(false);
  };

  if (!authReady) {
    return <div className="app-shell" />;
  }

  if (!user) {
    if (isLoggingOut) {
      return <Navigate to="/" replace />;
    }

    if (roomId) {
      return <Navigate to="/" replace state={{ pendingRoomId: roomId }} />;
    }

    return <Navigate to="/" replace />;
  }

  if (isAdminReportsRoute && !userCanModerate) {
    return <Navigate to="/lobby" replace />;
  }

  if (isAdminStaffRoute && !userIsAdmin) {
    return <Navigate to="/lobby" replace />;
  }

  let pageContent = null;

  if (legalPage) {
    pageContent = legalPage;
  } else if (isAdminReportsRoute) {
    pageContent = <AdminReports currentUser={user} />;
  } else if (isAdminStaffRoute) {
    pageContent = <AdminStaff currentUser={user} />;
  } else if (activeRoom) {
    pageContent = (
      <Room
        user={user}
        room={activeRoom}
        onLeaveRoom={handleLeaveRoom}
        onLogout={handleLogout}
      />
    );
  } else {
    pageContent = (
      <Lobby
        user={user}
        onJoinRoom={handleJoinRoom}
        onLogout={handleLogout}
        awakeCount={awakeUsers.length}
      />
    );
  }

  return (
    <div className="app-shell">
      <Header
        user={user}
        onLogout={handleLogout}
        onOpenFeedback={handleOpenFeedback}
        onOpenOwnProfile={handleOpenOwnProfile}
        awakeCount={awakeUsers.length}
      />

      <main className="main-content">{pageContent}</main>

      <Footer />
      <NotificationsTray user={user} />
      <ToastContainer />

      <SuspensionAcknowledgeModal
        moderationState={showSuspensionModal ? userModerationState : null}
        userId={userId}
        onClose={() => setShowSuspensionModal(false)}
      />

      {showOwnProfileModal ? (
        <RoomProfileModal
          selectedProfile={user}
          selectedProfilePresence={getPresenceFromUser(user)}
          selectedProfileModeration={userModerationState}
          isViewingOwnProfile={true}
          formatRelativeLastSeen={formatRelativeLastSeen}
          onClose={handleCloseOwnProfile}
          onWaveTarget={() => {}}
          currentUser={user}
          onReportUser={() => {}}
          onMuteProfile={() => {}}
          onBlockProfile={() => {}}
        />
      ) : null}

      {user && !hasAcceptedCurrentPolicies ? (
        <PolicyGate
          user={user}
          onAccepted={() => window.location.reload()}
        />
      ) : null}
    </div>
  );
}

function App() {
  return (
    <>
      <ScrollToTop />

      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/lobby" element={<MainAppShell />} />
        <Route path="/room/:roomId" element={<MainAppShell />} />
        <Route path="/admin/reports" element={<MainAppShell />} />
        <Route path="/admin/staff" element={<MainAppShell />} />
        <Route
          path="/legal/privacy"
          element={<MainAppShell legalPage={<Privacy />} />}
        />
        <Route
          path="/legal/terms"
          element={<MainAppShell legalPage={<Terms />} />}
        />
        <Route
          path="/legal/guidelines"
          element={<MainAppShell legalPage={<Guidelines />} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;