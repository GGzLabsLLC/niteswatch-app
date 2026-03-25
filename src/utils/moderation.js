const USER_MOD_KEY = "lanparty.userModeration";

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function emitModerationUpdated() {
  window.dispatchEvent(new Event("lanparty:moderation-updated"));
}

function uniqueList(list) {
  return Array.from(new Set(Array.isArray(list) ? list.filter(Boolean) : []));
}

function ensureUserModerationEntry(userMod, targetUserId) {
  const existing = userMod[targetUserId] || {};

  return {
    userId: targetUserId,
    mutedBy: uniqueList(existing.mutedBy),
    blockedBy: uniqueList(existing.blockedBy),
    modStatus: existing.modStatus || "clear",
    updatedAt: existing.updatedAt || Date.now(),
  };
}

export function getUserModeration() {
  return readJSON(USER_MOD_KEY, {});
}

export function saveUserModeration(data) {
  writeJSON(USER_MOD_KEY, data);
}

export function getUserModerationEntry(targetUserId) {
  if (!targetUserId) return null;
  const userMod = getUserModeration();
  return userMod[targetUserId] || null;
}

export function muteUserForViewer(targetUserId, viewerUserId) {
  if (!targetUserId || !viewerUserId) return false;

  const userMod = getUserModeration();
  const entry = ensureUserModerationEntry(userMod, targetUserId);

  if (!entry.mutedBy.includes(viewerUserId)) {
    entry.mutedBy.push(viewerUserId);
  }

  entry.mutedBy = uniqueList(entry.mutedBy);
  entry.updatedAt = Date.now();
  userMod[targetUserId] = entry;

  saveUserModeration(userMod);
  emitModerationUpdated();
  return true;
}

export function unmuteUserForViewer(targetUserId, viewerUserId) {
  if (!targetUserId || !viewerUserId) return false;

  const userMod = getUserModeration();
  const entry = ensureUserModerationEntry(userMod, targetUserId);

  entry.mutedBy = entry.mutedBy.filter((id) => id !== viewerUserId);
  entry.updatedAt = Date.now();
  userMod[targetUserId] = entry;

  saveUserModeration(userMod);
  emitModerationUpdated();
  return true;
}

export function blockUserForViewer(targetUserId, viewerUserId) {
  if (!targetUserId || !viewerUserId) return false;

  const userMod = getUserModeration();
  const entry = ensureUserModerationEntry(userMod, targetUserId);

  if (!entry.blockedBy.includes(viewerUserId)) {
    entry.blockedBy.push(viewerUserId);
  }

  entry.blockedBy = uniqueList(entry.blockedBy);
  entry.updatedAt = Date.now();
  userMod[targetUserId] = entry;

  saveUserModeration(userMod);
  emitModerationUpdated();
  return true;
}

export function unblockUserForViewer(targetUserId, viewerUserId) {
  if (!targetUserId || !viewerUserId) return false;

  const userMod = getUserModeration();
  const entry = ensureUserModerationEntry(userMod, targetUserId);

  entry.blockedBy = entry.blockedBy.filter((id) => id !== viewerUserId);
  entry.updatedAt = Date.now();
  userMod[targetUserId] = entry;

  saveUserModeration(userMod);
  emitModerationUpdated();
  return true;
}

export function isUserMutedForViewer(targetUserId, viewerUserId) {
  if (!targetUserId || !viewerUserId) return false;
  const userMod = getUserModeration();
  return !!userMod[targetUserId]?.mutedBy?.includes(viewerUserId);
}

export function isUserBlockedForViewer(targetUserId, viewerUserId) {
  if (!targetUserId || !viewerUserId) return false;
  const userMod = getUserModeration();
  return !!userMod[targetUserId]?.blockedBy?.includes(viewerUserId);
}

export function setUserModStatus(targetUserId, modStatus = "clear") {
  if (!targetUserId) return false;

  const userMod = getUserModeration();
  const entry = ensureUserModerationEntry(userMod, targetUserId);

  entry.modStatus = modStatus;
  entry.updatedAt = Date.now();
  userMod[targetUserId] = entry;

  saveUserModeration(userMod);
  emitModerationUpdated();
  return true;
}

export function clearViewerModerationData() {
  saveUserModeration({});
  emitModerationUpdated();
  return true;
}