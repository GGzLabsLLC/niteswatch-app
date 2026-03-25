import { useEffect, useMemo, useRef, useState } from "react";
import { addNotification } from "../../utils/notifications";
import { sendFirestoreMessage } from "../../utils/firestoreMessages";
import { clearTyping, setTyping } from "../../lib/typing";
import {
  getSuspensionDurationLabel,
  getSuspensionStatusLabel,
  isSuspensionActive,
  subscribeToUserModerationState,
} from "../../lib/suspensionsFirestore";

import {
  recordSuccessfulMessageSend,
  validateMessageBeforeSend,
} from "../../lib/antiSpam";

import { reserveMessageSendSlot } from "../../lib/rateLimitFirestore";

function resolveUserId(entity) {
  return entity?.uid || entity?.id || entity?.userId || null;
}

function RoomComposer({ user, room, members, onAfterSend }) {
  const [text, setText] = useState("");
  const [mentionQuery, setMentionQuery] = useState("");
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [moderationState, setModerationState] = useState(null);
  const [sendError, setSendError] = useState("");

  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const currentUserId = useMemo(() => resolveUserId(user), [user]);

  const normalizedUser = useMemo(() => {
    if (!user) return user;

    return {
      ...user,
      id: currentUserId,
      uid: currentUserId,
      userId: currentUserId,
    };
  }, [user, currentUserId]);

  const suspension = moderationState?.suspension || null;
  const isSuspended = isSuspensionActive(suspension);
  const suspensionStatusLabel = getSuspensionStatusLabel(suspension);
  const suspensionEndsLabel = getSuspensionDurationLabel(suspension);

  const mentionSuggestions = useMemo(() => {
    const pool = members.filter((member) => {
      const memberId = resolveUserId(member);
      return memberId !== currentUserId && member.handle;
    });

    if (!mentionQuery) return pool.slice(0, 6);

    const normalized = mentionQuery.toLowerCase();
    return pool
      .filter((member) => member.handle.toLowerCase().startsWith(normalized))
      .slice(0, 6);
  }, [members, mentionQuery, currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      setModerationState(null);
      return undefined;
    }

    const unsubscribe = subscribeToUserModerationState(
      currentUserId,
      (nextState) => {
        setModerationState(nextState || null);
      }
    );

    return unsubscribe;
  }, [currentUserId]);

  useEffect(() => {
    if (!isSuspended || !currentUserId) return;

    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    clearTyping(room.id, currentUserId).catch((error) => {
      console.error("[typing] suspended clear failed", error);
    });

    setShowMentionMenu(false);
    setMentionQuery("");
    setActiveMentionIndex(0);
  }, [isSuspended, room.id, currentUserId]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
      }

      if (!currentUserId) return;

      clearTyping(room.id, currentUserId).catch((error) => {
        console.error("[typing] cleanup failed", error);
      });
    };
  }, [room.id, currentUserId]);

  function extractMentionedMembers(messageText) {
    if (!messageText) return [];

    const matches = [...messageText.matchAll(/(^|\s)@([a-zA-Z0-9_-]+)/g)];
    if (!matches.length) return [];

    const mentionedHandles = [
      ...new Set(matches.map((match) => match[2].toLowerCase())),
    ];

    return members.filter((member) => {
      const memberId = resolveUserId(member);
      if (!member?.handle) return false;
      if (memberId === currentUserId) return false;
      return mentionedHandles.includes(member.handle.toLowerCase());
    });
  }

  function updateMentionState(value, cursorPosition = value.length) {
    const beforeCursor = value.slice(0, cursorPosition);
    const match = beforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_-]*)$/);

    if (match) {
      setMentionQuery(match[1] || "");
      setShowMentionMenu(true);
      setActiveMentionIndex(0);
    } else {
      setMentionQuery("");
      setShowMentionMenu(false);
      setActiveMentionIndex(0);
    }
  }

  function scheduleTypingHeartbeat(nextValue) {
    if (isSuspended || !currentUserId) return;

    if (!nextValue.trim()) {
      clearTyping(room.id, currentUserId).catch((error) => {
        console.error("[typing] clear failed", error);
      });
      return;
    }

    setTyping({ roomId: room.id, user: normalizedUser }).catch((error) => {
      console.error("[typing] set failed", error);
    });

    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = window.setTimeout(() => {
      clearTyping(room.id, currentUserId).catch((error) => {
        console.error("[typing] timeout clear failed", error);
      });
    }, 2500);
  }

  function insertMention(member) {
    if (isSuspended) return;
    if (!inputRef.current || !member?.handle) return;

    const input = inputRef.current;
    const cursorPosition = input.selectionStart ?? text.length;
    const beforeCursor = text.slice(0, cursorPosition);
    const afterCursor = text.slice(cursorPosition);

    const nextBeforeCursor = beforeCursor.replace(
      /(^|\s)@([a-zA-Z0-9_-]*)$/,
      (_, leadingSpace) => `${leadingSpace}@${member.handle} `
    );

    const nextValue = `${nextBeforeCursor}${afterCursor}`;

    setText(nextValue);
    setMentionQuery("");
    setShowMentionMenu(false);
    setActiveMentionIndex(0);
    setSendError("");

    scheduleTypingHeartbeat(nextValue);

    requestAnimationFrame(() => {
      const nextCursor = nextBeforeCursor.length;
      input.focus();
      input.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function handleInputChange(e) {
    if (isSuspended) return;

    const value = e.target.value;
    const cursorPosition = e.target.selectionStart ?? value.length;

    setText(value);
    setSendError("");
    updateMentionState(value, cursorPosition);
    scheduleTypingHeartbeat(value);
  }

  async function handleSend(e) {
    e.preventDefault();

    if (isSuspended) {
      setSendError(
        suspension?.reason || "Your account is suspended and cannot send messages."
      );
      return;
    }

    if (!currentUserId) {
      setSendError("Could not verify your account. Please refresh and try again.");
      return;
    }

    const clean = text.trim();
    if (!clean) return;

    const guard = validateMessageBeforeSend({
      userId: currentUserId,
      text: clean,
    });

    if (!guard.ok) {
      setSendError(guard.message);
      return;
    }

    const now = Date.now();

    const slot = await reserveMessageSendSlot({
      userId: currentUserId,
      text: clean,
    });

    if (!slot.ok) {
      setSendError(slot.message || "You're sending too fast.");
      return;
    }

    const result = await sendFirestoreMessage({
      roomId: room.id,
      text: clean,
      user: normalizedUser,
      type: "message",
    });

    if (!result?.ok) {
      setSendError(result?.error?.message || "Failed to send message.");
      return;
    }

    recordSuccessfulMessageSend({
      userId: currentUserId,
      text: clean,
    });

    const mentionedMembers = extractMentionedMembers(clean);
    mentionedMembers.forEach((member) => {
      const memberId = resolveUserId(member);
      if (!memberId) return;

      addNotification({
        id: `mention_${now}_${currentUserId}_${memberId}`,
        type: "mention",
        kind: "mention",
        from: normalizedUser?.handle || "Someone",
        fromHandle: normalizedUser?.handle || "Someone",
        fromUserId: currentUserId,
        to: member.handle,
        toHandle: member.handle,
        toUserId: memberId,
        targetUserId: memberId,
        roomId: room.id,
        roomName: room.name,
        messageId: result?.data?.id || "",
        message: `${normalizedUser?.handle || "Someone"} mentioned you in ${room.name}`,
        createdAt: now,
      });
    });

    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    await clearTyping(room.id, currentUserId).catch((error) => {
      console.error("[typing] send clear failed", error);
    });

    setText("");
    setMentionQuery("");
    setShowMentionMenu(false);
    setActiveMentionIndex(0);
    setSendError("");

    if (typeof onAfterSend === "function") {
      onAfterSend();
    }
  }

  function handleInputKeyDown(e) {
    if (isSuspended) return;

    if (showMentionMenu && mentionSuggestions.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveMentionIndex((prev) =>
          prev >= mentionSuggestions.length - 1 ? 0 : prev + 1
        );
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveMentionIndex((prev) =>
          prev <= 0 ? mentionSuggestions.length - 1 : prev - 1
        );
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        insertMention(mentionSuggestions[activeMentionIndex]);
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentionMenu(false);
        setMentionQuery("");
        setActiveMentionIndex(0);
        return;
      }
    }

    if (e.key === "Enter") {
      e.preventDefault();
      handleSend(e);
    }
  }

  return (
    <form className="chat-input-row" onSubmit={handleSend}>
      <div className="chat-input-wrap">
        {isSuspended && (
          <div className="chat-suspension-notice" role="status" aria-live="polite">
            <strong>{suspensionStatusLabel}.</strong>{" "}
            {suspension?.reason ? `Reason: ${suspension.reason}. ` : ""}
            {suspension?.type === "permanent"
              ? "Your account cannot send new messages."
              : suspensionEndsLabel
              ? `You cannot send messages until ${suspensionEndsLabel}.`
              : "You cannot send new messages right now."}
          </div>
        )}

        {!isSuspended && sendError && (
          <div className="chat-send-error" role="alert" aria-live="polite">
            {sendError}
          </div>
        )}

        {showMentionMenu && mentionSuggestions.length > 0 && !isSuspended && (
          <div className="mention-menu">
            {mentionSuggestions.map((member, index) => {
              const memberId = resolveUserId(member);

              return (
                <button
                  key={memberId || `${member.handle}-${index}`}
                  type="button"
                  className={
                    index === activeMentionIndex
                      ? "mention-option active"
                      : "mention-option"
                  }
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertMention(member)}
                >
                  <span className="mention-option-avatar">
                    {member.avatar || "🌙"}
                  </span>
                  <span className="mention-option-meta">
                    <strong>@{member.handle}</strong>
                    <small>{member.awakeReason || member.vibe || "Awake"}</small>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          placeholder={
            isSuspended
              ? "Messaging disabled while suspended"
              : "Type a message..."
          }
          value={text}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          disabled={isSuspended}
          aria-disabled={isSuspended}
        />
      </div>

      <button type="submit" disabled={isSuspended}>
        Send
      </button>
    </form>
  );
}

export default RoomComposer;