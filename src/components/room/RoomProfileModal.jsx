import { useEffect, useState } from "react";
import RoleBadge from "../ui/RoleBadge";
import { deleteAccount } from "../../utils/auth";
import {
  isSuspensionActive,
  isSuspensionExpired,
} from "../../lib/suspensionsFirestore";
import {
  toMillis,
  getPresenceUI,
  formatRelativeLastSeen,
} from "../../lib/presenceUtils";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";

function formatDateTime(value) {
  const raw = toMillis(value);
  if (!raw) return "—";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatJoinedDate(value) {
  const raw = toMillis(value);
  if (!raw) return "Tonight";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "Tonight";

  return date.toLocaleDateString();
}

function getAccountStatusCopy(moderationState) {
  const suspension = moderationState?.suspension;

  if (!suspension || !isSuspensionActive(suspension)) {
    if (suspension && isSuspensionExpired(suspension)) {
      return {
        label: "Suspension expired",
        tone: "is-active",
        detail: "This temporary suspension has expired.",
      };
    }

    return {
      label: "Active",
      tone: "is-active",
      detail: "This account is currently in good standing.",
    };
  }

  if (suspension.type === "permanent") {
    return {
      label: "Permanently suspended",
      tone: "is-suspended",
      detail:
        suspension.reason || "This account has been permanently suspended.",
    };
  }

  return {
    label: "Temporarily suspended",
    tone: "is-suspended",
    detail: suspension.reason || "This account is temporarily suspended.",
  };
}

function RoomProfileModal({
  selectedProfile,
  selectedProfilePresence,
  selectedProfileModeration = null,
  isViewingOwnProfile: isViewingOwnProfileProp,
  formatRelativeLastSeen: formatRelativeLastSeenProp,
  onClose,
  onWaveTarget,
  currentUser,
  onReportUser,
  onMuteProfile,
  onBlockProfile,
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [isEditingBio, setIsEditingBio] = useState(false);
  const [editedBio, setEditedBio] = useState("");
  const [savedBio, setSavedBio] = useState("");
  const [isSavingBio, setIsSavingBio] = useState(false);
  const [bioError, setBioError] = useState("");

  const selectedProfileId =
    selectedProfile?.id || selectedProfile?.uid || selectedProfile?.userId || null;

  const currentUserId =
    currentUser?.id || currentUser?.uid || currentUser?.userId || null;

  const isViewingOwnProfile =
    typeof isViewingOwnProfileProp === "boolean"
      ? isViewingOwnProfileProp
      : Boolean(
          selectedProfileId &&
            currentUserId &&
            selectedProfileId === currentUserId
        );

  const safeFormatRelativeLastSeen =
    typeof formatRelativeLastSeenProp === "function"
      ? formatRelativeLastSeenProp
      : (value) => formatRelativeLastSeen(value);

  useEffect(() => {
    const nextBio = selectedProfile?.bio || "";
    setEditedBio(nextBio);
    setSavedBio(nextBio);
    setIsEditingBio(false);
    setBioError("");
  }, [selectedProfileId, selectedProfile?.bio]);

  if (!selectedProfile) return null;

  const accountStatus = getAccountStatusCopy(selectedProfileModeration);
  const suspension = selectedProfileModeration?.suspension || null;
  const isSuspended = isSuspensionActive(suspension);

  const isStaffViewer =
    currentUser?.role === "admin" || currentUser?.role === "moderator";

  const shouldShowActiveSuspension = isSuspensionActive(suspension);

  const canViewAccountStatus = Boolean(
    shouldShowActiveSuspension && (isViewingOwnProfile || isStaffViewer)
  );

  const shouldShowModerationHistory = Boolean(
    isStaffViewer && suspension && !isSuspensionActive(suspension)
  );

  const isSelf = isViewingOwnProfile;

const rawPresenceUI =
  selectedProfilePresence || getPresenceUI(selectedProfile.lastSeenAt);

const normalizedPresenceDot =
  rawPresenceUI?.dot ||
  (rawPresenceUI?.label?.toLowerCase().includes("online")
    ? "online"
    : rawPresenceUI?.label?.toLowerCase().includes("active")
    ? "online"
    : rawPresenceUI?.label?.toLowerCase().includes("recent")
    ? "recent"
    : "away");

const presenceUI = {
  ...rawPresenceUI,
  dot: normalizedPresenceDot,
  label: rawPresenceUI?.label || "Away",
};

  const displayBio = savedBio || selectedProfile.bio || "";

  async function handleSaveBio() {
    if (!isViewingOwnProfile || !currentUserId) return;

    setIsSavingBio(true);
    setBioError("");

    const normalizedBio = editedBio.trim();

    try {
      const userDocRef = doc(db, "users", currentUserId);

      await updateDoc(userDocRef, {
        bio: normalizedBio,
      });

      setSavedBio(normalizedBio);
      setEditedBio(normalizedBio);
      setIsEditingBio(false);
    } catch (err) {
      console.error("Error saving bio:", err);
      setBioError(err?.message || "Failed to save your nightly note.");
    } finally {
      setIsSavingBio(false);
    }
  }

  function handleCancelBioEdit() {
    setEditedBio(savedBio || selectedProfile.bio || "");
    setIsEditingBio(false);
    setBioError("");
  }

  function handleReportUser() {
    if (typeof onReportUser === "function") {
      onReportUser(selectedProfile);
    }
  }

  function handleMuteProfile() {
    if (typeof onMuteProfile === "function") {
      onMuteProfile(selectedProfile);
    }
  }

  function handleBlockProfile() {
    if (typeof onBlockProfile === "function") {
      onBlockProfile(selectedProfile);
    }
  }

  function handleWaveProfile() {
    if (typeof onWaveTarget === "function") {
      onWaveTarget(selectedProfile);
    }
  }

  async function handleDeleteAccount() {
    setDeleteError("");

    if (deleteConfirmText !== "DELETE") {
      setDeleteError("Type DELETE to confirm.");
      return;
    }

    if (!deletePassword.trim()) {
      setDeleteError("Enter your password to confirm account deletion.");
      return;
    }

    try {
      setIsDeleting(true);

      await deleteAccount({
        password: deletePassword,
      });

      window.location.href = "/";
    } catch (err) {
      console.error("Delete failed:", err);

      if (err?.code === "auth/wrong-password") {
        setDeleteError("That password is incorrect.");
      } else if (err?.code === "auth/missing-password-for-delete") {
        setDeleteError("Enter your password to delete your account.");
      } else if (err?.code === "auth/requires-recent-login") {
        setDeleteError(
          "For security, please sign in again before deleting your account."
        );
      } else {
        setDeleteError(err?.message || "Failed to delete account.");
      }

      setIsDeleting(false);
    }
  }

  function handleCancelDelete() {
    setShowDeleteConfirm(false);
    setDeleteConfirmText("");
    setDeletePassword("");
    setDeleteError("");
    setIsDeleting(false);
  }

  return (
    <div className="profile-modal-backdrop" onClick={onClose}>
      <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
        <button
          className="profile-modal-close"
          type="button"
          onClick={onClose}
          aria-label="Close profile"
        >
          ×
        </button>

        <div className="profile-modal-header">
          <div className="profile-avatar-large-wrap">
            <div className="profile-avatar-large">
              {selectedProfile.avatar || "🌙"}
            </div>
            <span
              className={`presence-dot large ${presenceUI.dot || "away"}`}
              aria-hidden="true"
            />
          </div>

          <div>
            <h3 className="profile-user-name-row">
              <span>{selectedProfile.handle || "Anonymous"}</span>
              <RoleBadge role={selectedProfile.role} />
            </h3>
            <p className="profile-subline">
              {selectedProfile.awakeReason || selectedProfile.vibe || "Awake"}
            </p>
            <p className="profile-presence-line">
              {presenceUI.label} • Last seen{" "}
              {safeFormatRelativeLastSeen(selectedProfile.lastSeenAt)}
            </p>
          </div>
        </div>

        <div className="profile-modal-body">
          <div className="profile-stat-block bio-section">
            <div className="profile-stat-header">
              <span className="profile-stat-label">Nightly Note</span>
              {isViewingOwnProfile && !isEditingBio && (
                <button
                  className="edit-link-btn"
                  type="button"
                  onClick={() => {
                    setEditedBio(displayBio);
                    setBioError("");
                    setIsEditingBio(true);
                  }}
                >
                  Edit
                </button>
              )}
            </div>

            {isEditingBio ? (
              <div className="bio-edit-container">
                <textarea
                  className="bio-textarea"
                  value={editedBio}
                  onChange={(e) => setEditedBio(e.target.value)}
                  placeholder="What's on your mind tonight?"
                  maxLength={160}
                  autoFocus
                />

                <div className="bio-edit-actions">
                  <button
                    className="secondary-btn"
                    type="button"
                    onClick={handleCancelBioEdit}
                    disabled={isSavingBio}
                  >
                    Cancel
                  </button>

                  <button
                    className="primary-btn-sm"
                    type="button"
                    disabled={isSavingBio}
                    onClick={handleSaveBio}
                  >
                    {isSavingBio ? "Saving..." : "Save"}
                  </button>
                </div>

                {bioError ? <p className="auth-error">{bioError}</p> : null}
              </div>
            ) : (
              <p
                className={`profile-bio-text ${isViewingOwnProfile ? "editable" : ""}`}
                onClick={() => {
                  if (!isViewingOwnProfile) return;
                  setEditedBio(displayBio);
                  setBioError("");
                  setIsEditingBio(true);
                }}
              >
                {displayBio || "No bio yet. Just vibes."}
              </p>
            )}
          </div>

          <div className="profile-stat-grid">
            <div className="profile-stat-card">
              <span className="profile-stat-label">Member Since</span>
              <strong>{formatJoinedDate(selectedProfile.joinedAt)}</strong>
            </div>

            <div className="profile-stat-card">
              <span className="profile-stat-label">Community Role</span>
              <strong>{selectedProfile.role || "Member"}</strong>
            </div>

            <div className="profile-stat-card">
              <span className="profile-stat-label">Energy</span>
              <strong>
                {selectedProfile.messageCount > 100 ? "Chatty" : "Lurking"}
              </strong>
            </div>
          </div>

          {canViewAccountStatus ? (
            <div className="profile-stat-block">
              <span className="profile-stat-label">
                {isViewingOwnProfile ? "Account Status" : "Moderation Status"}
              </span>

              <div className={`profile-account-status ${accountStatus.tone}`}>
                <strong>{accountStatus.label}</strong>
                <p>{accountStatus.detail}</p>

                {isSuspended && suspension?.endsAt ? (
                  <p className="profile-account-status-meta">
                    Lift date: {formatDateTime(suspension.endsAt)}
                  </p>
                ) : null}

                {isViewingOwnProfile &&
                isSuspended &&
                suspension?.acknowledgedByUser ? (
                  <p className="profile-account-status-meta">
                    Suspension notice acknowledged.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {shouldShowModerationHistory ? (
            <div className="profile-stat-block">
              <span className="profile-stat-label">Moderation History</span>

              <div className="profile-account-status is-muted">
                <strong>
                  {isSuspensionExpired(suspension)
                    ? "Previous suspension expired"
                    : "Previous suspension lifted"}
                </strong>

                {suspension?.reason ? <p>{suspension.reason}</p> : null}

                {suspension?.endsAt ? (
                  <p className="profile-account-status-meta">
                    Ended: {formatDateTime(suspension.endsAt)}
                  </p>
                ) : null}

                {suspension?.liftedAt ? (
                  <p className="profile-account-status-meta">
                    Lifted: {formatDateTime(suspension.liftedAt)}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {!isViewingOwnProfile ? (
            <div className="profile-modal-actions">
              <button
                className="ghost-button"
                type="button"
                onClick={handleWaveProfile}
              >
                👋 Wave {selectedProfile.handle}
              </button>

              <button
                className="ghost-button"
                type="button"
                onClick={handleMuteProfile}
              >
                🔇 Mute
              </button>

              <button
                className="ghost-button danger-button"
                type="button"
                onClick={handleBlockProfile}
              >
                ⛔ Block
              </button>

              <button
                className="ghost-button subtle-danger-button"
                type="button"
                onClick={handleReportUser}
              >
                🚩 Report user
              </button>
            </div>
          ) : null}

          {isViewingOwnProfile ? (
            <>
              <hr className="profile-divider" />

              <div className="profile-stat-block danger-zone">
                <span className="profile-stat-label">Danger Zone</span>

                {!showDeleteConfirm ? (
                  <button
                    className="danger-btn"
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    🗑 Delete Account
                  </button>
                ) : (
                  <div className="delete-confirm">
                    <p>
                      This will permanently delete your account. Type{" "}
                      <strong>DELETE</strong> and enter your password to
                      confirm.
                    </p>

                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="Type DELETE to confirm"
                      disabled={isDeleting}
                    />

                    <input
                      type="password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      disabled={isDeleting}
                    />

                    {deleteError ? (
                      <p className="auth-error">{deleteError}</p>
                    ) : null}

                    <div className="delete-actions">
                      <button
                        className="secondary-btn"
                        type="button"
                        onClick={handleCancelDelete}
                        disabled={isDeleting}
                      >
                        Cancel
                      </button>

                      <button
                        className="danger-btn confirm"
                        type="button"
                        disabled={
                          deleteConfirmText !== "DELETE" ||
                          !deletePassword.trim() ||
                          isDeleting
                        }
                        onClick={handleDeleteAccount}
                      >
                        {isDeleting ? "Deleting..." : "Confirm Delete"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default RoomProfileModal;