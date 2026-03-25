export function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return 0;
}

export function getPresenceState(lastSeenAt) {
  const now = Date.now();
  const lastSeen = toMillis(lastSeenAt);
  const diff = now - lastSeen;

  if (diff < 60_000) return "active";
  if (diff < 5 * 60_000) return "recent";
  if (diff < 15 * 60_000) return "away";
  return "offline";
}

export function getPresenceUI(lastSeenAt) {
  const state = getPresenceState(lastSeenAt);

  switch (state) {
    case "active":
      return { label: "Active now", dot: "active" };
    case "recent":
      return { label: "Here tonight", dot: "recent" };
    case "away":
      return { label: "Away a bit", dot: "away" };
    default:
      return { label: "Quiet now", dot: "offline" };
  }
}

export function formatRelativeLastSeen(value) {
  const ts = toMillis(value);
  if (!ts) return "just now";

  const diff = Date.now() - ts;

  if (diff < 60_000) return "just now";
  if (diff < 5 * 60_000) return "a few minutes ago";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60000)} min ago`;

  return new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}