import React from "react";

function getToastIcon(notification) {
  if (notification.icon) return notification.icon;

  if (notification.uiKind === "action-toast") {
    switch (notification.variant) {
      case "success":
        return "✅";
      case "warning":
        return "⚠️";
      case "danger":
        return "⛔";
      case "info":
      default:
        return "ℹ️";
    }
  }

  if (notification.type === "wave") return "👋";
  if (notification.type === "mention") return "💬";

  return "🔔";
}

function getMetaCopy(notification) {
  if (notification.meta) return notification.meta;
  if (notification.roomName) return `Room: ${notification.roomName}`;
  return "";
}

export default function NotificationToast({ notification, onDismiss }) {
  if (!notification) return null;

  const variantClass =
    notification.uiKind === "action-toast"
      ? `is-${notification.variant || "success"}`
      : "is-notification";

  const metaCopy = getMetaCopy(notification);

  return (
    <div
      className={`notification-toast ${variantClass}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="notification-toast__icon">
        {getToastIcon(notification)}
      </div>

      <div className="notification-toast__content">
        <p className="notification-toast__message">{notification.message}</p>

        {metaCopy ? (
          <div className="notification-toast__meta">
            <span>{metaCopy}</span>
          </div>
        ) : null}
      </div>

      <button
        className="notification-toast__close"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDismiss(notification.id);
        }}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}