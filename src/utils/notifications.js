const STORAGE_KEY = "lanparty.notifications";
const MAX_NOTIFICATIONS = 50;

function safeParse(value, fallback = []) {
  try {
    return JSON.parse(value) || fallback;
  } catch {
    return fallback;
  }
}

function getUserId(user) {
  return user?.uid || user?.id || null;
}

function getUserHandle(user) {
  return user?.handle || "";
}

function normalizeHandle(value) {
  return String(value || "").trim().toLowerCase();
}

export function getNotifications() {
  return safeParse(localStorage.getItem(STORAGE_KEY), []).sort(
    (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
  );
}

function saveNotifications(notifications) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  window.dispatchEvent(new CustomEvent("lanparty:notifications-updated"));
}

function buildNotification(notification = {}) {
  return {
    id:
      notification.id ||
      `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: notification.type || "info",
    kind: notification.kind || notification.type || "info",

    from: notification.from || notification.fromHandle || "",
    fromHandle: notification.fromHandle || notification.from || "",
    fromUserId:
      notification.fromUserId ||
      notification.senderUserId ||
      notification.userId ||
      "",

    to: notification.to || notification.toHandle || "",
    toHandle: notification.toHandle || notification.to || "",
    toUserId:
      notification.toUserId ||
      notification.recipientUserId ||
      "",

    targetUserId: notification.targetUserId || "",
    roomId: notification.roomId || "",
    roomName: notification.roomName || "",
    messageId: notification.messageId || "",
    message: notification.message || "",
    meta: notification.meta || "",
    icon: notification.icon || null,
    persistent: Boolean(notification.persistent),
    readBy: Array.isArray(notification.readBy) ? notification.readBy : [],
    createdAt: notification.createdAt || Date.now(),
  };
}

function isDuplicateNotification(existing, incoming) {
  if (!existing || !incoming) return false;
  if (existing.id && incoming.id && existing.id === incoming.id) return true;

  return (
    existing.type === incoming.type &&
    existing.kind === incoming.kind &&
    existing.roomId === incoming.roomId &&
    existing.messageId === incoming.messageId &&
    existing.fromUserId === incoming.fromUserId &&
    existing.toUserId === incoming.toUserId &&
    Math.abs((existing.createdAt || 0) - (incoming.createdAt || 0)) < 2500
  );
}

export function addNotification(notification) {
  const existing = getNotifications();
  const nextItem = buildNotification(notification);

  const deduped = existing.filter(
    (item) => !isDuplicateNotification(item, nextItem)
  );

  const next = [nextItem, ...deduped].slice(0, MAX_NOTIFICATIONS);

  saveNotifications(next);
  return nextItem;
}

export function pushToast({
  id,
  message,
  variant = "success",
  icon = null,
  meta = "",
  persistent = false,
}) {
  window.dispatchEvent(
    new CustomEvent("lanparty:toast", {
      detail: {
        id,
        message,
        variant,
        icon,
        meta,
        persistent,
      },
    })
  );
}

export function markNotificationRead(id, userId) {
  if (!id || !userId) return;

  const next = getNotifications().map((notification) => {
    if (notification.id !== id) return notification;

    const readBy = Array.isArray(notification.readBy) ? notification.readBy : [];
    if (readBy.includes(userId)) return notification;

    return {
      ...notification,
      readBy: [...readBy, userId],
    };
  });

  saveNotifications(next);
}

export function markAllNotificationsRead(userId) {
  if (!userId) return;

  const next = getNotifications().map((notification) => {
    const readBy = Array.isArray(notification.readBy) ? notification.readBy : [];
    if (readBy.includes(userId)) return notification;

    return {
      ...notification,
      readBy: [...readBy, userId],
    };
  });

  saveNotifications(next);
}

export function clearNotifications() {
  saveNotifications([]);
}

function isVisibleToUser(notification, user) {
  const userId = getUserId(user);
  const userHandle = getUserHandle(user);

  if (!userId) return false;

  const targetUserId = String(notification.toUserId || "").trim();
  if (targetUserId) {
    return targetUserId === String(userId);
  }

  const normalizedHandle = normalizeHandle(userHandle);
  const targetHandle = normalizeHandle(notification.toHandle || notification.to);

  if (notification.type === "mention") {
    return targetHandle === normalizedHandle;
  }

  if (notification.type === "wave" && targetHandle) {
    return targetHandle === normalizedHandle;
  }

  if (notification.type === "wave" && !targetHandle) {
    return true;
  }

  return true;
}

export function getUnreadNotifications(user) {
  const userId = getUserId(user);
  if (!userId) return [];

  return getNotifications().filter((notification) => {
    if (!isVisibleToUser(notification, user)) return false;

    const readBy = Array.isArray(notification.readBy) ? notification.readBy : [];
    return !readBy.includes(userId);
  });
}

export function subscribeToNotifications(callback) {
  const handleUpdate = () => {
    callback(getNotifications());
  };

  const handleStorage = (event) => {
    if (event.key === STORAGE_KEY) {
      callback(getNotifications());
    }
  };

  window.addEventListener("lanparty:notifications-updated", handleUpdate);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener("lanparty:notifications-updated", handleUpdate);
    window.removeEventListener("storage", handleStorage);
  };
}