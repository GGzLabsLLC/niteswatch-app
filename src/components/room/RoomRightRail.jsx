import { useEffect, useMemo, useState } from "react";
import RoleBadge from "../ui/RoleBadge";
import { subscribeToAwakeUsers } from "../../lib/presence";

function isDeletedMember(member) {
  return Boolean(member?.deleted || member?.accountState === "deleted");
}

export default function RoomRightRail({
  enhancedMembers = [],
  activeNowCount = 0,
  rooms = [],
  currentRoomId,
  onSwitchRoom,
  onOpenProfile,
}) {
  const [roomPresenceCounts, setRoomPresenceCounts] = useState({});

  useEffect(() => {
    const unsubscribe = subscribeToAwakeUsers((users) => {
      const nextCounts = {};

      (users || []).forEach((presence) => {
        const roomId = presence?.roomId || null;
        const isOnline = Boolean(presence?.isOnline);

        if (!roomId || !isOnline) return;

        nextCounts[roomId] = (nextCounts[roomId] || 0) + 1;
      });

      setRoomPresenceCounts(nextCounts);
    });

    return () => unsubscribe();
  }, []);

  const otherRooms = useMemo(() => {
    return rooms
      .filter((room) => room.id !== currentRoomId)
      .map((room) => ({
        ...room,
        liveCount: roomPresenceCounts[room.id] || 0,
      }));
  }, [rooms, currentRoomId, roomPresenceCounts]);

  return (
    <aside className="room-right-rail">
      <div className="rail-card">
        <div className="rail-card-header">
          <h3>Still Awake Here</h3>
          <span className="rail-sub">
            {activeNowCount} active · {enhancedMembers.length} night owls
          </span>
        </div>

        <div className="rail-members">
          {enhancedMembers.map((member) => {
            const deleted = isDeletedMember(member);
            const memberLabel = deleted ? "[deleted]" : member.handle;
            const statusLabel = deleted
              ? "Account deleted"
              : member.isTyping
              ? "Typing now..."
              : member.presence.label;

            const vibeLabel = deleted
              ? "Profile unavailable"
              : member.awakeReason || member.vibe || "Awake";

            const title = deleted
              ? "Deleted account"
              : `Open ${member.handle}'s profile`;

            return (
              <button
                key={member.id}
                type="button"
                className={[
                  "rail-member",
                  deleted ? "is-deleted-member" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  if (!deleted) {
                    onOpenProfile?.(member);
                  }
                }}
                title={title}
                disabled={deleted}
                aria-disabled={deleted}
              >
                <div className="rail-member-avatar">
                  {member.avatar || "🌙"}
                  <span
                    className={`presence-dot ${
                      !deleted && member.isTyping ? "typing" : member.presence.dot
                    }`}
                  />
                </div>

                <div className="rail-member-meta">
                  <div className="rail-member-name">
                    <span className="rail-member-name-wrap">
                      <span>{memberLabel}</span>
                      <RoleBadge role={member.role} />
                    </span>
                    {member.isYou && !deleted ? (
                      <span className="you-pill">(You)</span>
                    ) : null}
                  </div>

                  <div className="rail-member-status">{statusLabel}</div>

                  <div className="rail-member-status rail-member-subtle">
                    {vibeLabel}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rail-card">
        <div className="rail-card-header">
          <h3>Hop Rooms</h3>
          <span className="rail-sub">See where people are chatting</span>
        </div>

        <div className="rail-room-list">
          {otherRooms.length === 0 ? (
            <p className="rail-empty">
              No other rooms yet. Start the next late-night rabbit hole.
            </p>
          ) : (
            otherRooms.map((room) => (
              <button
                key={room.id}
                type="button"
                className="rail-room"
                onClick={() => onSwitchRoom(room)}
              >
                <div className="rail-room-name">{room.name}</div>
                <div className="rail-room-meta">
                  {room.liveCount > 0
                    ? `🌙 ${room.liveCount} awake now`
                    : "Jump into the conversation"}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}