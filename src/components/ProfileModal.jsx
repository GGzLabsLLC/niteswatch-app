import React, { useState } from "react";
import { deleteAccount } from "../utils/auth";

export default function ProfileModal({ user, open, onClose, currentUser }) {
  if (!open || !user) return null;

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [error, setError] = useState("");

  const isOwnProfile = currentUser?.uid === user?.uid;

  const lastSeen = user.lastSeenAt
    ? new Date(user.lastSeenAt).toLocaleString()
    : "Unknown";

  async function handleDelete() {
    setError("");

    if (deleteText !== "DELETE") {
      setError("Type DELETE to confirm.");
      return;
    }

    try {
      await deleteAccount();
      window.location.reload(); // simple + reliable for v1
    } catch (err) {
      setError(err?.message || "Failed to delete account.");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close profile"
        >
          ×
        </button>

        <div className="profile-modal-header">
          <div className="profile-avatar-large">{user.avatar}</div>
          <div>
            <h3>{user.handle}</h3>
            <p className="profile-tagline">
              {user.bio || "Late-night chatter. Still awake. Still online."}
            </p>
          </div>
        </div>

        <div className="profile-modal-body">
          <div className="profile-stat">
            <span className="profile-stat-label">Status</span>
            <strong>{user.status || "Awake"}</strong>
          </div>

          <div className="profile-stat">
            <span className="profile-stat-label">Favorite vibe</span>
            <strong>{user.vibe || "Night Owl"}</strong>
          </div>

          <div className="profile-stat">
            <span className="profile-stat-label">Last seen</span>
            <strong>{lastSeen}</strong>
          </div>

          {/* 🔥 DELETE ACCOUNT (ONLY FOR OWN PROFILE) */}
          {isOwnProfile && (
            <>
              <hr className="profile-divider" />

              <div className="danger-zone">
                {!confirmingDelete ? (
                  <button
                    className="danger-btn"
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Delete Account
                  </button>
                ) : (
                  <div className="delete-confirm">
                    <p>This action cannot be undone.</p>
                    <p>
                      Type <strong>DELETE</strong> to confirm.
                    </p>

                    <input
                      type="text"
                      value={deleteText}
                      onChange={(e) => setDeleteText(e.target.value)}
                      placeholder="Type DELETE"
                    />

                    {error && <p className="auth-error">{error}</p>}

                    <div className="delete-actions">
                      <button
                        className="secondary-btn"
                        onClick={() => {
                          setConfirmingDelete(false);
                          setDeleteText("");
                          setError("");
                        }}
                      >
                        Cancel
                      </button>

                      <button
                        className="danger-btn confirm"
                        onClick={handleDelete}
                      >
                        Permanently Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}