import { useEffect, useMemo, useState } from "react";

import { db } from "../lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import {
  subscribeToAwakeUsers,
  touchPresence,
  updatePresenceRoom,
} from "../lib/presence";

import { DEFAULT_ROOMS } from "../constants/rooms";

const RECENT_ACTIVITY_MS = 10 * 60 * 1000;
const VERY_RECENT_ACTIVITY_MS = 3 * 60 * 1000;
const NEW_ROOM_MS = 60 * 60 * 1000;
const ACTIVE_MEMBER_MS = 90 * 1000;

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number(value) || 0;
}

function Lobby({ user, onJoinRoom, onLogout }) {
  const rooms = DEFAULT_ROOMS;
  const [now, setNow] = useState(Date.now());

  const [presenceMap, setPresenceMap] = useState({});
  const [usersMap, setUsersMap] = useState({});
  const [awakeUsers, setAwakeUsers] = useState([]);
  const [messagesMap, setMessagesMap] = useState({});

  useEffect(() => {
    if (!user?.id) return;

    updatePresenceRoom(user.id, null).catch((error) => {
      console.error("Failed to set lobby presence:", error);
    });

    const interval = setInterval(() => {
      touchPresence(user.id).catch((error) => {
        console.error("Failed to touch lobby presence:", error);
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [user?.id]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAwakeUsers((users) => {
      const nextPresence = {};
      const nextAwakeUsers = [];

      (users || []).forEach((presence) => {
        const uid = presence?.uid || presence?.id;
        const roomId = presence?.roomId || null;
        const isOnline = Boolean(presence?.isOnline);

        if (!uid || !isOnline) return;

        const normalizedPresence = {
          uid,
          roomId,
          isOnline: true,
          handle: presence?.handle || "Night Owl",
          avatar: presence?.avatar || "🌙",
          status: presence?.status || "Awake",
          lastSeenAt: toMillis(presence?.lastSeenAt || presence?.updatedAt),
        };

        nextAwakeUsers.push(normalizedPresence);

        if (roomId) {
          nextPresence[uid] = normalizedPresence;
        }
      });

      setAwakeUsers(nextAwakeUsers);
      setPresenceMap(nextPresence);
      setNow(Date.now());
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snapshot) => {
      const nextUsers = {};

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() || {};
        nextUsers[docSnap.id] = {
          id: docSnap.id,
          uid: docSnap.id,
          handle: data.handle || "Night Owl",
          avatar: data.avatar || "🌙",
          bio: data.bio || "",
          awakeReason: data.awakeReason || "Awake",
          status: data.status || "Awake",
          role: data.role || "user",
          lastSeenAt: toMillis(data.lastSeenAt),
        };
      });

      setUsersMap(nextUsers);
      setNow(Date.now());
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "messages"), (snapshot) => {
      const next = {};

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const roomId = data.roomId;

        if (!roomId) return;

        if (!next[roomId]) next[roomId] = [];
        next[roomId].push({ id: docSnap.id, ...data });
      });

      Object.keys(next).forEach((roomId) => {
        next[roomId].sort(
          (a, b) => toMillis(a.createdAt) - toMillis(b.createdAt)
        );
      });

      setMessagesMap(next);
    });

    return () => unsub();
  }, []);

  const presenceByRoom = useMemo(() => {
    const grouped = {};

    Object.values(presenceMap).forEach((presence) => {
      if (!presence.roomId) return;

      const profile = usersMap[presence.uid] || {
        id: presence.uid,
        uid: presence.uid,
        handle: presence.handle || "Night Owl",
        avatar: presence.avatar || "🌙",
        bio: "",
        awakeReason: "Awake",
        status: presence.status || "Awake",
        role: "user",
        lastSeenAt: presence.lastSeenAt || 0,
      };

      if (!grouped[presence.roomId]) {
        grouped[presence.roomId] = [];
      }

      grouped[presence.roomId].push({
        ...profile,
        id: profile.id || presence.uid,
        uid: presence.uid,
        roomId: presence.roomId,
        lastSeenAt: toMillis(presence.lastSeenAt || profile.lastSeenAt),
        isOnline: true,
      });
    });

    Object.keys(grouped).forEach((roomId) => {
      grouped[roomId].sort(
        (a, b) => toMillis(b.lastSeenAt) - toMillis(a.lastSeenAt)
      );
    });

    return grouped;
  }, [presenceMap, usersMap]);

  const getRoomMessages = (roomId) => {
    return Array.isArray(messagesMap[roomId]) ? messagesMap[roomId] : [];
  };

  const getUnreadCountForRoom = () => {
    return 0;
  };

  const getLastRealMessage = (roomId) => {
    const roomMessages = getRoomMessages(roomId);
    const realMessages = roomMessages.filter((msg) => msg?.type !== "system");
    if (!realMessages.length) return null;
    return realMessages[realMessages.length - 1];
  };

  const getLastAnyMessage = (roomId) => {
    const roomMessages = getRoomMessages(roomId);
    if (!roomMessages.length) return null;
    return roomMessages[roomMessages.length - 1];
  };

  const getRoomMembers = (roomId) => {
    return presenceByRoom[roomId] || [];
  };

  const getRoomUserCount = (roomId) => {
    return getRoomMembers(roomId).length;
  };

  const getActiveMembers = (roomId) => {
    return getRoomMembers(roomId).filter(
      (member) => now - toMillis(member?.lastSeenAt) <= ACTIVE_MEMBER_MS
    );
  };

  const getLastActivityTime = (roomId) => {
    const lastRealMessage = getLastRealMessage(roomId);
    if (lastRealMessage?.createdAt) {
      return toMillis(lastRealMessage.createdAt);
    }

    const lastAnyMessage = getLastAnyMessage(roomId);
    if (lastAnyMessage?.createdAt) {
      return toMillis(lastAnyMessage.createdAt);
    }

    const members = getRoomMembers(roomId);
    const latestPresence = members[0]?.lastSeenAt || 0;

    return toMillis(latestPresence);
  };

  const isRoomActive = (roomId, userCount) => {
    if (userCount > 0) return true;

    const lastActivity = getLastActivityTime(roomId);
    if (!lastActivity) return false;

    return now - lastActivity <= RECENT_ACTIVITY_MS;
  };

  const formatPreview = (message) => {
    if (!message) return null;
    const text = (message.text || "").trim();
    if (!text) return null;
    return text.length > 72 ? `${text.slice(0, 72)}…` : text;
  };

  const formatRelativeActivity = (timestamp) => {
    const safeTimestamp = toMillis(timestamp);
    if (!safeTimestamp) return "No activity yet";

    const diff = Math.max(0, now - safeTimestamp);
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return "Just now";
    if (minutes === 1) return "1 min ago";
    if (minutes < 60) return `${minutes} mins ago`;

    const hours = Math.floor(minutes / 60);
    if (hours === 1) return "1 hr ago";
    if (hours < 24) return `${hours} hrs ago`;

    const days = Math.floor(hours / 24);
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;

    return new Date(safeTimestamp).toLocaleDateString([], {
      month: "numeric",
      day: "numeric",
      year: "numeric",
    });
  };

  const getActivityBadge = (room, userCount, activeNow, lastActivityAt) => {
    const isNewRoom =
      !room.isDefault && now - toMillis(room.createdAt) <= NEW_ROOM_MS;

    const safeLastActivityAt = toMillis(lastActivityAt);
    const veryRecent =
      safeLastActivityAt &&
      now - safeLastActivityAt <= VERY_RECENT_ACTIVITY_MS;

    if (userCount >= 4 || (userCount >= 2 && veryRecent)) {
      return { label: "Hot", className: "room-badge-hot" };
    }

    if (activeNow) {
      return { label: "Live", className: "room-badge-live" };
    }

    if (isNewRoom) {
      return { label: "New", className: "room-badge-new" };
    }

    return { label: "Quiet", className: "room-badge-quiet" };
  };

  const getRoomEnergyScore = (room) => {
    let score = 0;

    if (room.activeNow) score += 1000;
    score += room.userCount * 120;
    score += room.activeMemberCount * 160;
    score += room.unread * 20;

    if (room.badge.label === "Hot") score += 320;
    if (room.badge.label === "Live") score += 220;
    if (room.badge.label === "New") score += 120;

    if (room.lastActivityAt) {
      const freshnessBoost = Math.max(
        0,
        100 - Math.floor((now - toMillis(room.lastActivityAt)) / 60000)
      );
      score += freshnessBoost;
    }

    return score;
  };

  const roomCards = useMemo(() => {
    return rooms
      .map((room) => {
        const userCount = getRoomUserCount(room.id);
        const membersForRoom = getRoomMembers(room.id);
        const activeMembers = getActiveMembers(room.id);
        const lastRealMessage = getLastRealMessage(room.id);
        const lastAnyMessage = getLastAnyMessage(room.id);
        const lastMessage = lastRealMessage || lastAnyMessage;
        const activeNow = isRoomActive(room.id, userCount);
        const previewText = formatPreview(lastMessage);
        const derivedLastActivityAt = getLastActivityTime(room.id);
        const lastActivityAt =
          toMillis(lastMessage?.createdAt) ||
          toMillis(derivedLastActivityAt) ||
          toMillis(room.createdAt) ||
          0;

        const badge = getActivityBadge(
          room,
          userCount,
          activeNow,
          lastActivityAt
        );
        const unread = getUnreadCountForRoom(room.id);

        const card = {
          ...room,
          userCount,
          membersForRoom,
          activeMembers,
          activeMemberCount: activeMembers.length,
          lastMessage,
          activeNow,
          previewText,
          lastActivityAt,
          lastActivityLabel: formatRelativeActivity(lastActivityAt),
          badge,
          unread,
          avatarStack: membersForRoom.slice(0, 3),
        };

        return {
          ...card,
          energyScore: getRoomEnergyScore(card),
        };
      })
      .sort((a, b) => {
        if (a.energyScore !== b.energyScore) {
          return b.energyScore - a.energyScore;
        }

        if (a.lastActivityAt !== b.lastActivityAt) {
          return b.lastActivityAt - a.lastActivityAt;
        }

        return a.name.localeCompare(b.name);
      });
  }, [rooms, messagesMap, presenceByRoom, now]);

  const activeRoomCount = roomCards.filter((room) => room.activeNow).length;
  const totalAwakeNow = Math.max(1, awakeUsers.length);

  const owlLabel = totalAwakeNow === 1 ? "night owl" : "night owls";
  const roomLabel = activeRoomCount === 1 ? "active room" : "active rooms";

  const awakeHeadline =
    activeRoomCount > 0
      ? `${totalAwakeNow} ${owlLabel} awake right now • ${activeRoomCount} ${roomLabel}`
      : `${totalAwakeNow} ${owlLabel} awake right now`;

  return (
    <main className="lobby-screen">
      <section className="lobby-shell">
        <div className="lobby-topbar">
          <div>
            <p className="eyebrow">Welcome back</p>
            <h1>
              {user.avatar} {user.handle}
            </h1>

            <p className="subcopy">
              {user.awakeReason
                ? `${user.awakeReason} • Find a room that fits the night you're having.`
                : "Find a room that fits the night you're having."}
            </p>

            {user.bio ? <p className="lobby-bio">“{user.bio}”</p> : null}

            <div className="awake-counter">
              <span className="awake-counter-dot" />
              <span>{awakeHeadline}</span>
            </div>
          </div>
        </div>

        <div className="room-grid">
          {roomCards.map((room) => (
            <article
              key={room.id}
              className={[
                "room-card",
                room.activeNow ? "room-card-active" : "",
                room.badge.label === "Hot" ? "room-card-hot" : "",
                room.badge.label === "New" ? "room-card-new" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="room-card-top">
                <span className="room-tag">{room.topic}</span>

                <div className="room-header-right">
                  <span className="room-count">{room.userCount} awake now</span>

                  {room.unread > 0 && (
                    <div className="room-unread-badge">{room.unread}</div>
                  )}
                </div>
              </div>

              <div className="room-activity-row">
                <div className={`room-activity-badge ${room.badge.className}`}>
                  {room.badge.label}
                </div>

                <div className="room-last-activity">
                  {room.lastActivityLabel}
                </div>
              </div>

              <h2 className="room-title">{room.name}</h2>
              <p className="room-description">{room.description}</p>

              <div className="room-card-meta">
                <div className="room-avatar-stack">
                  {room.avatarStack.length > 0 ? (
                    room.avatarStack.map((member) => (
                      <span
                        key={member.uid || member.id}
                        className="room-avatar-stack-item"
                        title={member.handle}
                      >
                        {member.avatar || "🌙"}
                      </span>
                    ))
                  ) : (
                    <span className="room-avatar-stack-empty">🌙</span>
                  )}
                </div>

                <div className="room-meta-copy">
                  {room.activeMemberCount > 0
                    ? `${room.activeMemberCount} active right now`
                    : room.userCount > 0
                    ? `${room.userCount} hanging out`
                    : "Waiting for the first message"}
                </div>
              </div>

              {room.lastMessage && room.previewText ? (
                <div className="room-preview">
                  <div className="room-preview-label">Latest message</div>
                  <div className="room-preview-line">
                    <span className="preview-user">
                      {room.lastMessage.avatar ? `${room.lastMessage.avatar} ` : ""}
                      {room.lastMessage.user}
                    </span>
                    <span className="preview-separator">—</span>
                    <span className="preview-text">{room.previewText}</span>
                  </div>
                </div>
              ) : (
                <div className="room-preview room-preview-empty">
                  No one has said anything here yet.
                </div>
              )}

              <button
                type="button"
                className="room-enter-btn"
                onClick={() => onJoinRoom(room)}
              >
                Enter Room
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default Lobby;