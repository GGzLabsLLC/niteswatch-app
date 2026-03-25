import RoleBadge from "../ui/RoleBadge";

function isDeletedMember(member) {
  return Boolean(member?.deleted || member?.accountState === "deleted");
}

function RoomMembersPanel({
  members,
  enhancedMembers,
  activeNowCount,
  onSelectMember,
}) {
  return (
    <aside className="room-members-panel">
      <div className="room-members-header">
        <div>
          <p className="room-members-eyebrow">Still awake here</p>
          <h3>
            {members.length} {members.length === 1 ? "night owl" : "night owls"}
          </h3>
          <p className="room-members-subcopy">
            {activeNowCount} active right now
          </p>
        </div>
      </div>

      <div className="room-members-list">
        {enhancedMembers.length === 0 ? (
          <p className="room-members-empty">Nobody here yet. Start the chaos.</p>
        ) : (
          enhancedMembers.map((member) => {
            const deleted = isDeletedMember(member);
            const presenceLabel = deleted
              ? "Deleted"
              : member.isTyping
              ? "Typing…"
              : member.presence.label;

            const vibeLabel = deleted
              ? "This account is no longer available."
              : member.awakeReason || member.vibe || "Awake";

            const lastSeenLabel = deleted
              ? "Unavailable"
              : member.lastSeenLabel;

            return (
              <button
                key={member.id}
                type="button"
                className={[
                  "room-member-card",
                  member.isYou && !deleted ? "is-you" : "",
                  member.isTyping && !deleted ? "is-typing" : "",
                  `presence-${member.presence.tone}`,
                  deleted ? "is-deleted-member" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  if (!deleted) {
                    onSelectMember(member);
                  }
                }}
                disabled={deleted}
                aria-disabled={deleted}
                title={deleted ? "Deleted account" : `Open ${member.handle}'s profile`}
              >
                <span className="room-member-avatar-wrap">
                  <span className="room-member-avatar">
                    {member.avatar || "🌙"}
                  </span>
                  <span
                    className={`presence-dot ${
                      !deleted && member.isTyping ? "typing" : member.presence.dot
                    }`}
                    aria-hidden="true"
                  />
                </span>

                <span className="room-member-meta">
                  <span className="room-member-topline">
                    <span className="room-member-name-wrap">
                      <strong>
                        {deleted
                          ? "[deleted]"
                          : `${member.handle}${member.isYou ? " (You)" : ""}`}
                      </strong>
                      <RoleBadge role={member.role} />
                    </span>

                    <span
                      className={[
                        "room-member-presence-pill",
                        !deleted && member.isTyping
                          ? "typing"
                          : member.presence.tone,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {presenceLabel}
                    </span>
                  </span>

                  <small className="room-member-vibe">{vibeLabel}</small>

                  <small className="room-member-last-seen">
                    {deleted ? "Last seen unavailable" : `Last seen ${lastSeenLabel}`}
                  </small>
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

export default RoomMembersPanel;