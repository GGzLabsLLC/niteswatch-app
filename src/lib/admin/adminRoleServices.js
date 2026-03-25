import * as adminApi from "../moderationFirestore";

const USER_ROLE_VALUES = ["user", "moderator", "admin"];

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function trimOrNull(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed || null;
}

function buildResult(ok, action, data = null, error = null) {
  return {
    ok,
    action,
    data,
    error: error
      ? {
          message: error.message || "Unknown admin role service error.",
          name: error.name || "Error",
        }
      : null,
  };
}

function normalizeRole(value) {
  const role = typeof value === "string" ? value.trim().toLowerCase() : "";
  return USER_ROLE_VALUES.includes(role) ? role : "user";
}

function normalizeUserRecord(userDoc = {}) {
  return {
    id: userDoc.id || userDoc.uid || "",
    uid: userDoc.uid || userDoc.id || "",
    email: userDoc.email || "",
    handle: userDoc.handle || "Anonymous",
    avatar: userDoc.avatar || "🌙",
    bio: userDoc.bio || "",
    awakeReason: userDoc.awakeReason || "",
    status: userDoc.status || "Awake",
    role: normalizeRole(userDoc.role),
    joinedAt: userDoc.joinedAt || null,
    lastSeenAt: userDoc.lastSeenAt || null,
    updatedAt: userDoc.updatedAt || null,
  };
}

export function subscribeToUsersForAdmin(handler) {
  invariant(
    typeof handler === "function",
    "subscribeToUsersForAdmin requires a handler function."
  );

  const fn = adminApi.subscribeToUsersForAdmin;

  invariant(
    typeof fn === "function",
    "No admin user subscription helper found. Expected subscribeToUsersForAdmin in moderationFirestore.js."
  );

  return fn((users) => {
    const normalized = Array.isArray(users)
      ? users.map(normalizeUserRecord)
      : [];
    handler(normalized);
  });
}

export async function setUserRole(input = {}) {
  try {
    const userId = input.userId || input.uid || input.targetUserId || null;
    const nextRole = normalizeRole(input.nextRole);
    const moderatorId = input.moderatorId || input.actorId || "admin";
    const moderatorHandle =
      input.moderatorHandle || input.actorHandle || moderatorId;
    const note = trimOrNull(input.note) || "";

    invariant(userId, "setUserRole requires a userId.");
    invariant(
      USER_ROLE_VALUES.includes(nextRole),
      "setUserRole requires a valid nextRole."
    );

    const fn = adminApi.setFirestoreUserRole;

    invariant(
      typeof fn === "function",
      "No role mutation helper found. Expected setFirestoreUserRole in moderationFirestore.js."
    );

    const result = await fn(userId, nextRole, {
      moderatorId,
      moderatorHandle,
      note,
    });

    return buildResult(true, "role_changed", result);
  } catch (error) {
    return buildResult(false, "role_changed", null, error);
  }
}

export async function promoteUserToModerator(input = {}) {
  return setUserRole({
    ...input,
    nextRole: "moderator",
  });
}

export async function demoteModeratorToUser(input = {}) {
  return setUserRole({
    ...input,
    nextRole: "user",
  });
}

export async function promoteUserToAdmin(input = {}) {
  return setUserRole({
    ...input,
    nextRole: "admin",
  });
}

const adminRoleServices = {
  subscribeToUsersForAdmin,
  setUserRole,
  promoteUserToModerator,
  demoteModeratorToUser,
  promoteUserToAdmin,
};

export default adminRoleServices;