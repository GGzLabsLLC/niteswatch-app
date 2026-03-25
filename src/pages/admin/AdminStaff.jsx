import { useEffect, useMemo, useRef, useState } from "react";
import {
  demoteModeratorToUser,
  promoteUserToModerator,
  subscribeToUsersForAdmin,
} from "../../lib/admin/adminRoleServices";
import { subscribeToAwakeUsers } from "../../lib/presence";
import {
  toMillis,
  getPresenceUI,
  formatRelativeLastSeen,
} from "../../lib/presenceUtils";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "user", label: "Users" },
  { key: "moderator", label: "Moderators" },
  { key: "admin", label: "Admins" },
];

function formatDate(value) {
  const ms = toMillis(value);
  if (!ms) return "—";

  try {
    return new Date(ms).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function AdminStaff({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [presenceMap, setPresenceMap] = useState({});
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [actionNotice, setActionNotice] = useState(null);
  const [pendingUserId, setPendingUserId] = useState(null);

  const noticeTimerRef = useRef(null);

  function showNotice(type, message) {
    setActionNotice({ type, message });

    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
    }

    noticeTimerRef.current = window.setTimeout(() => {
      setActionNotice(null);
      noticeTimerRef.current = null;
    }, 2500);
  }

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToUsersForAdmin((nextUsers) => {
      setUsers(nextUsers || []);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAwakeUsers((awakeUsers) => {
      const nextPresenceMap = {};

      (awakeUsers || []).forEach((presenceUser) => {
        const uid =
          presenceUser?.uid || presenceUser?.userId || presenceUser?.id;

        if (!uid) return;

        nextPresenceMap[uid] = presenceUser;
      });

      setPresenceMap(nextPresenceMap);
    });

    return unsubscribe;
  }, []);

  const counts = useMemo(() => {
    return users.reduce(
      (acc, user) => {
        acc.total += 1;
        if (user.role === "user") acc.users += 1;
        if (user.role === "moderator") acc.moderators += 1;
        if (user.role === "admin") acc.admins += 1;
        return acc;
      },
      {
        total: 0,
        users: 0,
        moderators: 0,
        admins: 0,
      }
    );
  }, [users]);

  const filteredUsers = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return users
      .filter((user) => {
        if (filter === "all") return true;
        return user.role === filter;
      })
      .filter((user) => {
        if (!needle) return true;

        return (
          user.handle?.toLowerCase().includes(needle) ||
          user.email?.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => {
        const roleWeight = {
          admin: 3,
          moderator: 2,
          user: 1,
        };

        const aWeight = roleWeight[a.role] || 0;
        const bWeight = roleWeight[b.role] || 0;

        if (aWeight !== bWeight) return bWeight - aWeight;

        const aPresence =
          presenceMap[a.id || a.uid || a.userId] || null;
        const bPresence =
          presenceMap[b.id || b.uid || b.userId] || null;

        const aSeen = toMillis(aPresence?.lastSeenAt || a.lastSeenAt);
        const bSeen = toMillis(bPresence?.lastSeenAt || b.lastSeenAt);

        return bSeen - aSeen;
      });
  }, [users, filter, search, presenceMap]);

  async function handlePromoteToModerator(user) {
    if (!user?.id) return;

    try {
      setPendingUserId(user.id);

      const result = await promoteUserToModerator({
        userId: user.id,
        moderatorId: currentUser?.uid || currentUser?.id || "admin",
        moderatorHandle: currentUser?.handle || "admin",
        note: "Promoted to moderator from Admin Staff.",
      });

      if (!result?.ok) {
        throw new Error(result?.error?.message || "Failed to promote user.");
      }

      showNotice("success", `${user.handle} promoted to moderator.`);
    } catch (error) {
      console.error("Failed to promote user:", error);
      showNotice("error", "Failed to promote user.");
    } finally {
      setPendingUserId(null);
    }
  }

  async function handleDemoteToUser(user) {
    if (!user?.id) return;

    const confirmed = window.confirm(
      `Remove moderator access from ${user.handle}?`
    );

    if (!confirmed) return;

    try {
      setPendingUserId(user.id);

      const result = await demoteModeratorToUser({
        userId: user.id,
        moderatorId: currentUser?.uid || currentUser?.id || "admin",
        moderatorHandle: currentUser?.handle || "admin",
        note: "Moderator access removed from Admin Staff.",
      });

      if (!result?.ok) {
        throw new Error(
          result?.error?.message || "Failed to remove moderator role."
        );
      }

      showNotice("success", `${user.handle} is now a regular user.`);
    } catch (error) {
      console.error("Failed to demote moderator:", error);
      showNotice("error", "Failed to remove moderator role.");
    } finally {
      setPendingUserId(null);
    }
  }

  return (
    <section className="admin-reports-page">
      {actionNotice && (
        <div
          className={`admin-action-notice is-${actionNotice.type}`}
          role="status"
          aria-live="polite"
        >
          {actionNotice.message}
        </div>
      )}

      <div className="admin-reports-shell">
        <div className="admin-reports-hero">
          <p className="admin-reports-eyebrow">Nite's Watch Admin</p>
          <h1>Staff & Roles</h1>
          <p className="admin-reports-subtext">
            Manage moderator access and keep lightweight staffing controls ready
            for launch.
          </p>
        </div>

        <div className="admin-reports-stats">
          <div className="admin-stat-card">
            <span className="admin-stat-label">Total Users</span>
            <strong>{counts.total}</strong>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-label">Users</span>
            <strong>{counts.users}</strong>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-label">Moderators</span>
            <strong>{counts.moderators}</strong>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-label">Admins</span>
            <strong>{counts.admins}</strong>
          </div>
        </div>

        <div
          className="admin-reports-filters"
          style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}
        >
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`admin-filter-chip ${
                filter === item.key ? "is-active" : ""
              }`}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
            </button>
          ))}

          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by handle or email"
            className="report-modal-input"
            style={{ minWidth: 240, maxWidth: 320 }}
          />
        </div>

        <div
          style={{
            display: "grid",
            gap: "0.9rem",
            marginTop: "1rem",
          }}
        >
          {filteredUsers.length ? (
            filteredUsers.map((staffUser) => {
              const isPending = pendingUserId === staffUser.id;
              const isSelf =
                (currentUser?.uid || currentUser?.id) === staffUser.id;

              const livePresence =
                presenceMap[staffUser.id || staffUser.uid || staffUser.userId] ||
                null;

              const lastSeenValue =
                livePresence?.lastSeenAt ||
                livePresence?.updatedAt ||
                staffUser.lastSeenAt;

              const presenceUI = getPresenceUI(
                lastSeenValue,
                Boolean(livePresence?.isOnline)
              );

              return (
                <article
                  key={staffUser.id}
                  className="admin-report-card"
                  style={{
                    display: "grid",
                    gap: "0.9rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "1rem",
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: "0.85rem",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 14,
                          display: "grid",
                          placeItems: "center",
                          fontSize: "1.35rem",
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        {staffUser.avatar || "🌙"}
                      </div>

                      <div>
                        <div
                          style={{
                            display: "flex",
                            gap: "0.6rem",
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <strong>{staffUser.handle}</strong>
                          <span className="admin-filter-chip is-active">
                            {staffUser.role}
                          </span>
                          <span
                            className={`admin-filter-chip ${presenceUI.tone}`}
                          >
                            {presenceUI.label}
                          </span>
                          {isSelf ? (
                            <span className="admin-filter-chip">You</span>
                          ) : null}
                        </div>

                        <p
                          style={{
                            margin: "0.25rem 0 0",
                            opacity: 0.8,
                            fontSize: "0.92rem",
                          }}
                        >
                          {staffUser.email || "No email"}
                        </p>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "0.55rem",
                        flexWrap: "wrap",
                      }}
                    >
                      {staffUser.role === "user" ? (
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => handlePromoteToModerator(staffUser)}
                          disabled={isPending}
                        >
                          {isPending ? "Updating..." : "Promote to Moderator"}
                        </button>
                      ) : null}

                      {staffUser.role === "moderator" ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => handleDemoteToUser(staffUser)}
                          disabled={isPending}
                        >
                          {isPending ? "Updating..." : "Remove Moderator"}
                        </button>
                      ) : null}

                      {staffUser.role === "admin" ? (
                        <button
                          type="button"
                          className="ghost-button"
                          disabled
                          title="Admins are managed cautiously for launch."
                        >
                          Admin Locked
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: "0.75rem",
                    }}
                  >
                    <div className="admin-stat-card">
                      <span className="admin-stat-label">Presence</span>
                      <strong>{presenceUI.label}</strong>
                    </div>

                    <div className="admin-stat-card">
                      <span className="admin-stat-label">Joined</span>
                      <strong>{formatDate(staffUser.joinedAt)}</strong>
                    </div>

                    <div className="admin-stat-card">
                      <span className="admin-stat-label">Last Seen</span>
                      <strong>{formatRelativeLastSeen(lastSeenValue)}</strong>
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="admin-report-card">
              <strong>No matching users.</strong>
              <p style={{ marginTop: "0.35rem", opacity: 0.8 }}>
                Try clearing the search or changing the role filter.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default AdminStaff;