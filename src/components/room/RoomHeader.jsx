import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

function RoomHeader({
  room,
  user,
  members = [],
  activeNowCount = 0,
  onWave,
  onLeaveRoom,
  onLogout,
  onCopyInvite,
  onOpenProfile,
}) {
  const [inviteCopied, setInviteCopied] = useState(false);
  const navigate = useNavigate();

  const isModerator =
    user?.role === "admin" || user?.role === "moderator";

  useEffect(() => {
    if (!inviteCopied) return;

    const timer = setTimeout(() => {
      setInviteCopied(false);
    }, 1800);

    return () => clearTimeout(timer);
  }, [inviteCopied]);

  const presenceCopy = useMemo(() => {
    if (activeNowCount > 0) {
      return `${activeNowCount} active now`;
    }

    if (members.length > 0) {
      return `${members.length} here tonight`;
    }

    return "Quiet right now";
  }, [activeNowCount, members.length]);

  const visibleMembers = useMemo(() => {
    return members.slice(0, 4);
  }, [members]);

  const currentUserMember = useMemo(() => {
    const currentUserId = user?.id || user?.uid || user?.userId || null;

    return (
      members.find((member) => {
        const memberId = member?.id || member?.uid || member?.userId || null;
        return currentUserId && memberId === currentUserId;
      }) || user
    );
  }, [members, user]);

  function handleInviteClick() {
    if (typeof onCopyInvite === "function") {
      onCopyInvite();
      setInviteCopied(true);
    }
  }

  function handleOpenProfile(profile) {
    if (typeof onOpenProfile === "function" && profile) {
      onOpenProfile(profile);
    }
  }

  return (
    <header className="room-header">
      <div className="room-header-main">
        <div className="room-header-top">
          <div className="room-header-copy">
            <p className="room-eyebrow">{room.topic || "Late Night Room"}</p>
            <h1>{room.name}</h1>
            <p className="room-subcopy">
              {activeNowCount} awake • {members.length} in room
            </p>
          </div>

          <div className="room-header-presence">
            <div className="room-header-avatar-stack">
              {visibleMembers.length > 0 ? (
                visibleMembers.map((member) => {
                  const memberId = member.id || member.uid || member.userId;

                  return (
                    <button
                      key={memberId}
                      type="button"
                      className="room-header-avatar"
                      title={`Open ${member.handle || "Night Owl"}'s profile`}
                      aria-label={`Open ${member.handle || "Night Owl"}'s profile`}
                      onClick={() => handleOpenProfile(member)}
                    >
                      {member.avatar || "🌙"}
                    </button>
                  );
                })
              ) : (
                <span className="room-header-avatar empty">🌙</span>
              )}
            </div>

            <div className="room-header-presence-copy">
              {presenceCopy}
            </div>
          </div>
        </div>

        <div className="room-header-actions">
          <button
            type="button"
            className="room-action-btn"
            onClick={() => handleOpenProfile(currentUserMember)}
            title="Open your profile"
          >
            👤 My Profile
          </button>

          <button type="button" className="room-action-btn" onClick={onWave}>
            👋 Wave
          </button>

          <button
            type="button"
            className={`room-action-btn ${inviteCopied ? "is-success" : ""}`}
            onClick={handleInviteClick}
            title="Copy room invite link"
          >
            {inviteCopied ? "✅ Copied" : "🔗 Invite"}
          </button>

          {isModerator && (
            <button
              type="button"
              className="room-action-btn"
              onClick={() => navigate("/admin/reports")}
              title="Open moderation dashboard"
            >
              🛡️ Admin Reports
            </button>
          )}

          <button
            type="button"
            className="room-action-btn"
            onClick={onLeaveRoom}
          >
            ← Back to Lobby
          </button>
        </div>
      </div>
    </header>
  );
}

export default RoomHeader;