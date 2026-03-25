import React, { useEffect, useMemo, useState } from "react";
import NotificationToast from "./NotificationToast";
import {
  getUnreadNotifications,
  markNotificationRead,
  subscribeToNotifications,
} from "../utils/notifications";

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 4500;

function getUserId(user) {
  return user?.uid || user?.id || null;
}

export default function NotificationsTray({ user }) {
  const userId = getUserId(user);

  const [notifications, setNotifications] = useState(
    userId ? getUnreadNotifications(user) : []
  );

  useEffect(() => {
    setNotifications(userId ? getUnreadNotifications(user) : []);
  }, [user, userId]);

  useEffect(() => {
    const unsubscribe = subscribeToNotifications(() => {
      setNotifications(userId ? getUnreadNotifications(user) : []);
    });

    return unsubscribe;
  }, [user, userId]);

  const visibleItems = useMemo(() => {
    return [...notifications]
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, MAX_VISIBLE);
  }, [notifications]);

  useEffect(() => {
    if (!visibleItems.length || !userId) return undefined;

    const timers = visibleItems.map((item) => {
      if (item.persistent) return null;

      return window.setTimeout(() => {
        markNotificationRead(item.id, userId);
      }, AUTO_DISMISS_MS);
    });

    return () => {
      timers.forEach((timer) => {
        if (timer) window.clearTimeout(timer);
      });
    };
  }, [visibleItems, userId]);

  function handleDismiss(id) {
    if (!userId) return;
    markNotificationRead(id, userId);
  }

  function handleNotificationClick(item) {
    window.dispatchEvent(
      new CustomEvent("lanparty:notification-click", {
        detail: item,
      })
    );

    if (userId) {
      markNotificationRead(item.id, userId);
    }
  }

  if (!visibleItems.length) return null;

  return (
    <div className="notifications-tray" aria-label="Notifications">
      {visibleItems.map((item) => (
        <div
          key={item.id}
          className="notification-toast-wrapper"
          onClick={() => handleNotificationClick(item)}
          style={{ cursor: "pointer" }}
        >
          <NotificationToast
            notification={item}
            onDismiss={handleDismiss}
          />
        </div>
      ))}
    </div>
  );
}