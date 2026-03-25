import { useEffect, useState } from "react";

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    function handleToast(event) {
      const {
        id,
        message,
        variant = "success",
        icon = null,
        meta = "",
        persistent = false,
      } = event.detail || {};

      const toastId = id || `toast_${Date.now()}_${Math.random()}`;

      const newToast = {
        id: toastId,
        message,
        variant,
        icon,
        meta,
        persistent,
      };

      setToasts((prev) => [...prev, newToast]);

      if (!persistent) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== toastId));
        }, 3000);
      }
    }

    window.addEventListener("lanparty:toast", handleToast);

    return () => {
      window.removeEventListener("lanparty:toast", handleToast);
    };
  }, []);

  function removeToast(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
  <div className="toast-container">
    {toasts.map((toast) => (
      <div key={toast.id} className={`toast ${toast.variant}`}>
        <div className="toast-content">
          {/* Wrapped icon for better styling */}
          {toast.icon && <div className="toast-icon">{toast.icon}</div>}

          <div className="toast-text">
            <div className="toast-message">{toast.message}</div>
            {/* Conditional meta text */}
            {toast.meta && <div className="toast-meta">{toast.meta}</div>}
          </div>
        </div>

        <button
          className="toast-close"
          onClick={() => removeToast(toast.id)}
          aria-label="Close notification"
        >
          ✕
        </button>
      </div>
    ))}
  </div>
);
}