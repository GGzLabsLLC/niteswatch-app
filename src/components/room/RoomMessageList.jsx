import React, { useEffect, useRef, useState } from "react";
import {
  isUserBlockedForViewer,
  isUserMutedForViewer,
} from "../../utils/moderation";
import RoleBadge from "../ui/RoleBadge";

function RoomMessageList({
  decoratedMessages,
  firstUnreadMessageId,
  messageRefs,
  messageHighlightId,
  openProfileByMessage,
  openProfileByHandle,
  memberMap,
  memberById,
  REACTION_EMOJIS,
  getReactionCount,
  hasReacted,
  handleToggleReaction,
  typingLabel,
  showScrollJump,
  pendingMessageCount,
  handleJumpToLatest,
  chatMessagesRef,
  handleChatScroll,
  currentUser,
  roomId,
  onReportMessage,
  onMuteUser,
  onBlockUser,
  messageModerationMap = {},
}) {
  const [openMenuId, setOpenMenuId] = useState(null);
  const [, setModVersion] = useState(0);
  const [revealedMessages, setRevealedMessages] = useState({});
  const actionMenuRef = useRef(null);

  useEffect(() => {
    function handleModerationUpdated() {
      setModVersion((value) => value + 1);
    }

    function handlePointerDown(event) {
      if (!actionMenuRef.current) return;
      if (!actionMenuRef.current.contains(event.target)) {
        setOpenMenuId(null);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpenMenuId(null);
      }
    }

    window.addEventListener(
      "lanparty:moderation-updated",
      handleModerationUpdated
    );
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener(
        "lanparty:moderation-updated",
        handleModerationUpdated
      );
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!actionMenuRef.current || !openMenuId) return;

    const menu = actionMenuRef.current.querySelector(".message-actions-menu");
    if (!menu) return;

    menu.classList.remove("flip-left");

    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    if (rect.right > viewportWidth - 16) {
      menu.classList.add("flip-left");
    }
  }, [openMenuId]);

  function normalizeHandle(value) {
    return (value || "").trim().toLowerCase();
  }

  function getAuthorId(msg) {
    return msg?.userId || msg?.uid || msg?.id || null;
  }

  function getLiveAuthorFromMessage(msg) {
    const authorId = getAuthorId(msg);
    return authorId ? memberById?.get?.(authorId) || null : null;
  }

  function isDeletedAuthor(msg) {
    if (!msg || msg.type === "system") return false;

    const liveAuthor = getLiveAuthorFromMessage(msg);

    return Boolean(msg.deletedUser || msg.userDeleted || liveAuthor?.deleted);
  }

  function buildNormalizedProfileFromMessage(msg) {
    const authorId = getAuthorId(msg);
    const liveAuthor = getLiveAuthorFromMessage(msg);

    if (liveAuthor) {
      return {
        ...liveAuthor,
        id: liveAuthor.id || liveAuthor.uid || liveAuthor.userId || authorId,
        uid: liveAuthor.uid || liveAuthor.id || liveAuthor.userId || authorId,
        userId:
          liveAuthor.userId || liveAuthor.uid || liveAuthor.id || authorId,
      };
    }

    return {
      id: authorId || "",
      uid: authorId || "",
      userId: authorId || "",
      handle: msg.user || msg.handle || "Night Owl",
      avatar: msg.avatar || "🌙",
      bio: msg.bio || "",
      vibe: msg.vibe || msg.awakeReason || "",
      awakeReason: msg.awakeReason || msg.vibe || "",
      status: msg.status || "Awake",
      lastSeenAt: msg.lastSeenAt || msg.createdAt || Date.now(),
      joinedAt: msg.joinedAt || null,
      role: msg.role || "user",
      deleted: false,
    };
  }

  function handleOpenProfileFromMessage(msg) {
    if (!msg || typeof openProfileByMessage !== "function") return;
    if (isDeletedAuthor(msg)) return;

    openProfileByMessage(buildNormalizedProfileFromMessage(msg));
  }

  function handleOpenMentionProfile(handle) {
    if (!handle) return;

    const mentionedMember = memberMap?.get?.(normalizeHandle(handle));
    if (mentionedMember && !mentionedMember.deleted) {
      openProfileByMessage?.(mentionedMember);
      return;
    }

    if (typeof openProfileByHandle === "function") {
      openProfileByHandle(handle);
    }
  }

  function renderMessageText(messageText) {
    if (!messageText) return null;

    const tokenRegex = /((?:https?:\/\/[^\s]+)|(^|\s)@([a-zA-Z0-9_-]+))/g;

    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = tokenRegex.exec(messageText)) !== null) {
      const fullMatch = match[0];
      const url = match[1]?.startsWith("http") ? match[1] : null;
      const leadingSpace = match[2] || "";
      const handle = match[3];
      const startIndex = match.index;

      if (startIndex > lastIndex) {
        parts.push(messageText.slice(lastIndex, startIndex));
      }

      if (url) {
        parts.push(
          <a
            key={`url_${startIndex}`}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="chat-link"
            title={url}
          >
            {url}
          </a>
        );
      } else {
        if (leadingSpace) {
          parts.push(leadingSpace);
        }

        const mentionWithAt = `@${handle}`;
        const mentionedMember = memberMap?.get?.(normalizeHandle(handle));

        if (mentionedMember && !mentionedMember.deleted) {
          parts.push(
            <button
              key={`mention_${startIndex}_${handle}`}
              type="button"
              className="mention mention-button"
              onClick={() => handleOpenMentionProfile(handle)}
              title={`Open ${handle}'s profile`}
              aria-label={`Open ${handle}'s profile`}
            >
              {mentionWithAt}
            </button>
          );
        } else {
          parts.push(
            <span key={`mention_${startIndex}_${handle}`} className="mention">
              {mentionWithAt}
            </span>
          );
        }
      }

      lastIndex = startIndex + fullMatch.length;
    }

    if (lastIndex < messageText.length) {
      parts.push(messageText.slice(lastIndex));
    }

    return parts.map((part, index) =>
      typeof part === "string" ? <span key={`text_${index}`}>{part}</span> : part
    );
  }

  function handleToggleMenu(event, messageId) {
    event.stopPropagation();
    setOpenMenuId((current) => (current === messageId ? null : messageId));
  }

  function handleReportMessageClick(msg) {
    setOpenMenuId(null);
    if (typeof onReportMessage === "function") {
      onReportMessage(msg);
    }
  }

  function handleMuteUserClick(msg) {
    setOpenMenuId(null);
    if (typeof onMuteUser === "function") {
      onMuteUser(msg);
    }
  }

  function handleBlockUserClick(msg) {
    setOpenMenuId(null);
    if (typeof onBlockUser === "function") {
      onBlockUser(msg);
    }
  }

  function toggleRevealMessage(messageId) {
    setRevealedMessages((current) => ({
      ...current,
      [messageId]: !current[messageId],
    }));
  }

  return (
    <div className="chat-feed-wrap">
      <div
        ref={chatMessagesRef}
        className="chat-messages"
        onScroll={handleChatScroll}
      >
        {decoratedMessages.length === 0 && (
          <p className="empty-chat">No messages yet. Start the chaos.</p>
        )}

        {decoratedMessages.map((msg) => {
          const isSystem = msg.type === "system";
          const viewerId = currentUser?.uid || currentUser?.id || null;
          const authorId =
            msg.userId || msg.uid || msg.user?.uid || msg.user?.id || null;
          const viewerRole = currentUser?.role || "user";
          const isStaff = viewerRole === "admin" || viewerRole === "moderator";
          const isDeletedUser = isDeletedAuthor(msg);

          const messageModeration = !isSystem
            ? messageModerationMap?.[msg.id] || null
            : null;

          const isBlocked =
            !isSystem && viewerId && authorId
              ? isUserBlockedForViewer(authorId, viewerId)
              : false;

          const isMuted =
            !isSystem && viewerId && authorId
              ? isUserMutedForViewer(authorId, viewerId)
              : false;

          const isModerationDeleted =
            !isSystem &&
            Boolean(messageModeration?.deleted || msg.isDeleted);

          const isModerationHidden =
            !isSystem &&
            (
              messageModeration?.visibility === "hidden" ||
              Boolean(messageModeration?.hidden) ||
              Boolean(messageModeration?.isHidden) ||
              Boolean(messageModeration?.manualHidden)
            ) &&
            !isModerationDeleted;

          const shouldMaskDeleted = isModerationDeleted && !isStaff;
          const shouldMaskHidden = isModerationHidden && !isStaff;

          const isRevealed = !!revealedMessages[msg.id];
          const isHighlighted = messageHighlightId === msg.id;

          if (isBlocked) {
            return null;
          }

          return (
            <React.Fragment key={msg.id}>
              {firstUnreadMessageId === msg.id && (
                <div className="new-messages-divider">
                  <span>New messages</span>
                </div>
              )}

              <div
                ref={(node) => {
                  if (node) {
                    messageRefs.current[msg.id] = node;
                  } else {
                    delete messageRefs.current[msg.id];
                  }
                }}
                data-message-id={msg.id}
                className={[
                  isSystem ? "chat-message system" : "chat-message",
                  msg.grouped ? "grouped" : "",
                  isHighlighted ? "is-highlighted" : "",
                  shouldMaskDeleted ? "is-deleted-message" : "",
                  shouldMaskHidden && !isRevealed ? "is-hidden-message" : "",
                  isMuted && !isRevealed ? "is-muted-message" : "",
                  isDeletedUser ? "is-deleted-user-message" : "",
                  isModerationHidden && isStaff ? "is-staff-hidden-message" : "",
                  isModerationDeleted && isStaff ? "is-staff-deleted-message" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {msg.showMeta ? (
                  <div className="chat-meta">
                    {isSystem ? (
                      <>
                        <span className="chat-avatar">{msg.avatar || "🌙"}</span>
                        <strong>{msg.user}</strong>
                      </>
                    ) : isDeletedUser ? (
                      <>
                        <span className="chat-avatar">{msg.avatar || "🌙"}</span>
                        <span className="chat-user-name-wrap is-readonly">
                          <strong>{msg.user || "[deleted]"}</strong>
                          <RoleBadge role={msg.role} />
                        </span>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="chat-user-trigger"
                        onClick={() => handleOpenProfileFromMessage(msg)}
                        title={`Open ${
                          msg.user || msg.handle || "user"
                        }'s profile`}
                        aria-label={`Open ${
                          msg.user || msg.handle || "user"
                        }'s profile`}
                      >
                        <span className="chat-avatar">{msg.avatar || "🌙"}</span>
                        <span className="chat-user-name-wrap">
                          <strong>{msg.user || msg.handle}</strong>
                          <RoleBadge role={msg.role} />
                        </span>
                      </button>
                    )}

                    {msg.awakeReason ? (
                      <span className="chat-tag">{msg.awakeReason}</span>
                    ) : null}

                    <span>{msg.time}</span>

                    {!isSystem && !shouldMaskDeleted && !isDeletedUser && (
                      <div
                        className={`message-actions ${
                          openMenuId === msg.id ? "menu-open" : ""
                        }`}
                        ref={openMenuId === msg.id ? actionMenuRef : null}
                      >
                        <button
                          type="button"
                          className="message-actions-trigger"
                          onClick={(event) => handleToggleMenu(event, msg.id)}
                          aria-label="Open message actions"
                          title="Message actions"
                        >
                          •••
                        </button>

                        {openMenuId === msg.id && (
                          <div className="message-actions-menu" role="menu">
                            <button
                              type="button"
                              className="message-actions-item"
                              onClick={() => handleReportMessageClick(msg)}
                            >
                              Report message
                            </button>
                            <button
                              type="button"
                              className="message-actions-item"
                              onClick={() => handleMuteUserClick(msg)}
                            >
                              Mute user
                            </button>
                            <button
                              type="button"
                              className="message-actions-item danger"
                              onClick={() => handleBlockUserClick(msg)}
                            >
                              Block user
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="chat-meta chat-meta-grouped">
                    <span className="chat-message-time">{msg.time}</span>

                    {!isSystem && !shouldMaskDeleted && !isDeletedUser && (
                      <div
                        className={`message-actions ${
                          openMenuId === msg.id ? "menu-open" : ""
                        }`}
                        ref={openMenuId === msg.id ? actionMenuRef : null}
                      >
                        <button
                          type="button"
                          className="message-actions-trigger"
                          onClick={(event) => handleToggleMenu(event, msg.id)}
                          aria-label="Open message actions"
                          title="Message actions"
                        >
                          •••
                        </button>

                        {openMenuId === msg.id && (
                          <div className="message-actions-menu" role="menu">
                            <button
                              type="button"
                              className="message-actions-item"
                              onClick={() => handleReportMessageClick(msg)}
                            >
                              Report message
                            </button>
                            <button
                              type="button"
                              className="message-actions-item"
                              onClick={() => handleMuteUserClick(msg)}
                            >
                              Mute user
                            </button>
                            <button
                              type="button"
                              className="message-actions-item danger"
                              onClick={() => handleBlockUserClick(msg)}
                            >
                              Block user
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {shouldMaskDeleted ? (
                  <div className="chat-message-placeholder deleted">
                    <span>Message removed by moderation.</span>
                  </div>
                ) : shouldMaskHidden && !isRevealed ? (
                  <div className="chat-message-placeholder hidden">
                    <span>This message was hidden after multiple reports.</span>
                    {messageModeration?.reportsCount ? (
                      <small>{messageModeration.reportsCount} reports</small>
                    ) : null}
                    <button
                      type="button"
                      className="chat-message-reveal-btn"
                      onClick={() => toggleRevealMessage(msg.id)}
                    >
                      Show message
                    </button>
                  </div>
                ) : isMuted && !isRevealed ? (
                  <div className="chat-message-placeholder muted">
                    <span>
                      Muted message from {isDeletedUser ? "[deleted]" : `@${msg.user}`}
                    </span>
                    <button
                      type="button"
                      className="chat-message-reveal-btn"
                      onClick={() => toggleRevealMessage(msg.id)}
                    >
                      Show message
                    </button>
                  </div>
                ) : (
                  <>
                    {(isModerationHidden || isModerationDeleted) && isStaff ? (
                      <div className="chat-message-staff-note">
                        {isModerationDeleted
                          ? "Moderator view: this message is deleted for regular users."
                          : "Moderator view: this message is hidden for regular users."}
                      </div>
                    ) : null}

                    <p className="chat-message-text">
                      {renderMessageText(msg.text)}
                    </p>

                    {(shouldMaskHidden || isMuted) && isRevealed && (
                      <div className="chat-message-revealed-note">
                        <button
                          type="button"
                          className="chat-message-reveal-btn subtle"
                          onClick={() => toggleRevealMessage(msg.id)}
                        >
                          Hide message
                        </button>
                      </div>
                    )}
                  </>
                )}

                {!isSystem && !shouldMaskDeleted && !(shouldMaskHidden && !isRevealed) && (
                  <div className="message-reactions">
                    {REACTION_EMOJIS.map((emoji) => {
                      const count = getReactionCount(msg.id, emoji);
                      const active = hasReacted(msg.id, emoji);

                      return (
                        <button
                          key={`${msg.id}_${emoji}`}
                          type="button"
                          className={[
                            "reaction-chip",
                            active ? "active" : "",
                            count > 0 ? "has-count" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => handleToggleReaction(msg.id, emoji)}
                        >
                          <span>{emoji}</span>
                          {count > 0 ? (
                            <span className="reaction-count">{count}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}

        {typingLabel && (
          <div className="typing-indicator">
            <span className="typing-dots">
              <span />
              <span />
              <span />
            </span>
            <span>{typingLabel}</span>
          </div>
        )}
      </div>

      {showScrollJump && (
        <button
          type="button"
          className="scroll-jump"
          onClick={handleJumpToLatest}
        >
          ⬇{" "}
          {pendingMessageCount > 0
            ? `${pendingMessageCount} new message${
                pendingMessageCount === 1 ? "" : "s"
              }`
            : "Jump to latest"}
          {pendingMessageCount > 0 ? (
            <span className="scroll-jump-badge">{pendingMessageCount}</span>
          ) : null}
        </button>
      )}
    </div>
  );
}

export default RoomMessageList;