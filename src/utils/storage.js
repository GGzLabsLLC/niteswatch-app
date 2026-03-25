const KEYS = {
  session: "lanparty.session",
  roomReads: "lanparty.roomReads",
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

//
// SESSION (per-tab user)
//

export function getSession() {
  try {
    const raw = sessionStorage.getItem(KEYS.session);
    const parsed = raw ? JSON.parse(raw) : null;

    if (!parsed) return null;

    if (!parsed.id || !parsed.handle) {
      sessionStorage.removeItem(KEYS.session);
      return null;
    }

    return parsed;
  } catch {
    sessionStorage.removeItem(KEYS.session);
    return null;
  }
}

export function setSession(session) {
  sessionStorage.setItem(KEYS.session, JSON.stringify(session));
}

export function clearSession() {
  sessionStorage.removeItem(KEYS.session);
}

//
// LEGACY USERS / ROOMS / REACTIONS
// Deprecated compatibility exports so old imports do not crash.
// These no longer act as app source-of-truth.
//

export function getUsers() {
  return {};
}

export function setUsers() {
  // deprecated no-op
}

export function upsertUser(user) {
  return user || null;
}

export function getRooms() {
  return [];
}

export function setRooms() {
  // deprecated no-op
}

export function getReactions() {
  return {};
}

export function setReactions() {
  // deprecated no-op
}

export function getRoomReactions() {
  return {};
}

export function getMessageReactions() {
  return {};
}

export function toggleMessageReaction() {
  return {};
}

//
// TYPING
// Temporary compatibility bridge while remaining room-level cleanup lands.
// Canonical typing should live in Firestore via src/lib/typing.js.
//

export function getTypingState() {
  return read("lanparty.typing", {});
}

export function setTypingState(state) {
  write("lanparty.typing", state);
}

export function setUserTyping(roomId, user) {
  const typing = getTypingState();

  if (!typing[roomId]) typing[roomId] = {};

  typing[roomId][user.id] = {
    id: user.id,
    handle: user.handle,
    avatar: user.avatar,
    updatedAt: Date.now(),
  };

  setTypingState(typing);
  return typing;
}

export function clearUserTyping(roomId, userId) {
  const typing = getTypingState();

  if (!typing[roomId]) return typing;

  delete typing[roomId][userId];

  if (Object.keys(typing[roomId]).length === 0) {
    delete typing[roomId];
  }

  setTypingState(typing);
  return typing;
}

export function getRoomTypingUsers(roomId, currentUserId = null, timeoutMs = 5000) {
  const typing = getTypingState();
  const roomTyping = typing[roomId] || {};
  const now = Date.now();

  return Object.values(roomTyping).filter((entry) => {
    if (!entry?.id) return false;
    if (currentUserId && entry.id === currentUserId) return false;
    return now - Number(entry.updatedAt || 0) <= timeoutMs;
  });
}

export function cleanupTypingState(timeoutMs = 5000) {
  const typing = getTypingState();
  const now = Date.now();
  const cleaned = {};

  Object.entries(typing).forEach(([roomId, users]) => {
    const validUsers = Object.fromEntries(
      Object.entries(users || {}).filter(([, entry]) => {
        return now - Number(entry?.updatedAt || 0) <= timeoutMs;
      })
    );

    if (Object.keys(validUsers).length > 0) {
      cleaned[roomId] = validUsers;
    }
  });

  setTypingState(cleaned);
  return cleaned;
}

//
// ROOM READS
// Kept only as an optional local-only helper if needed later.
//

export function getRoomReads() {
  return read(KEYS.roomReads, {});
}

export function setRoomRead(roomId, userId) {
  if (!roomId || !userId) return;

  const reads = getRoomReads();

  if (!reads[userId]) {
    reads[userId] = {};
  }

  reads[userId][roomId] = Date.now();

  write(KEYS.roomReads, reads);
}