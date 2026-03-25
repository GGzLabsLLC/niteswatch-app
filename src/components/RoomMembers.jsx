import React from "react";

export default function RoomMembers({ members = [], onOpenProfile }) {
  return (
    <aside className="room-members">
      <div className="room-members-header">
        <h4>In the room</h4>
        <span>{members.length}</span>
      </div>

      <div className="room-members-list">
        {members.length === 0 ? (
          <p className="room-members-empty">Nobody here yet. Start the chaos.</p>
        ) : (
          members.map((member) => (
            <button
              key={member.id}
              className="room-member-card"
              onClick={() => onOpenProfile(member)}
              type="button"
            >
              <span className="room-member-avatar">{member.avatar}</span>
              <span className="room-member-meta">
                <strong>{member.handle}</strong>
                <small>{member.status || "Awake"}</small>
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}