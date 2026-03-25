import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RoomHeader from "../components/room/RoomHeader";
import RoomMessageList from "../components/room/RoomMessageList";
import RoomProfileModal from "../components/room/RoomProfileModal";
import RoomComposer from "../components/room/RoomComposer";
import RoomRightRail from "../components/room/RoomRightRail";
import ReportModal from "../components/room/ReportModal";
import { addNotification, pushToast } from "../utils/notifications";
import { submitReport } from "../utils/reporting";
import { useLocation, useNavigate } from "react-router-dom";
import {
  blockUserForViewer,
  muteUserForViewer,
} from "../utils/moderation";
import { clearTyping } from "../lib/typing";
import {
  subscribeToRoomReactions,
  groupReactionsByMessage,
  toggleFirestoreReaction,
} from "../lib/reactions";
import { subscribeToRoomTyping } from "../lib/typing";
import {
  sendFirestoreMessage,
  subscribeToRoomMessages,
} from "../utils/firestoreMessages";
import {
  subscribeToRoomPresence,
  updatePresenceRoom,
  touchPresence,
} from "../lib/presence";
import {
  createFirestoreReport,
  subscribeToRoomMessageModeration,
} from "../lib/moderationFirestore";
import { subscribeToUserModerationState } from "../lib/suspensionsFirestore";
import { subscribeToUserProfile } from "../lib/users";
import {
  recordSuccessfulWave,
  validateWaveBeforeSend,
} from "../lib/antiSpam";
import { reserveWaveSlot } from "../lib/rateLimitFirestore";
import { DEFAULT_ROOMS } from "../constants/rooms";
import {
  toMillis,
  getPresenceState,
  getPresenceUI,
  formatRelativeLastSeen,
} from "../lib/presenceUtils";

const MESSAGE_GROUP_WINDOW_MS = 5 * 60 * 1000;
const REACTION_EMOJIS = ["👍", "😂", "🌙"];
const REPORT_DEDUPE_WINDOW_MS = 5 * 60 * 1000;

function getReportDedupeKey(payload, roomId, reporterUserId) {
  return [
    "lanparty",
    "report",
    reporterUserId,
    roomId,
    payload.type,
    payload.targetId,
  ].join(":");
}

function hasRecentDuplicateReport(payload, roomId, reporterUserId) {
  try {
    const key = getReportDedupeKey(payload, roomId, reporterUserId);
    const raw = localStorage.getItem(key);
    if (!raw) return false;

    const timestamp = Number(raw);
    if (!timestamp) return false;

    return Date.now() - timestamp < REPORT_DEDUPE_WINDOW_MS;
  } catch {
    return false;
  }
}

function markRecentDuplicateReport(payload, roomId, reporterUserId) {
  try {
    const key = getReportDedupeKey(payload, roomId, reporterUserId);
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // ignore storage issues
  }
}

function normalizePresenceMember(member) {
  const id = member?.id || member?.uid || member?.userId || null;

  return {
    ...member,
    id,
    uid: member?.uid || id,
    userId: member?.userId || member?.uid || id,
    handle: member?.handle || "Night Owl",
    avatar: member?.avatar || "🌙",
    bio: member?.bio || "",
    awakeReason: member?.awakeReason || "",
    status: member?.status || "Awake",
    role: member?.role || "user",
    lastSeenAt: toMillis(member?.lastSeenAt || member?.updatedAt),
    joinedAt: toMillis(member?.joinedAt),
    updatedAt: toMillis(member?.updatedAt),
  };
}

function isDeletedProfile(profile) {
  return Boolean(profile?.deleted || profile?.accountState === "deleted");
}

function Room({ user, room, onLeaveRoom, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const routeHighlightMessageId = location.state?.highlightMessageId || null;

  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [selectedProfileModeration, setSelectedProfileModeration] = useState(null);
  const [typingUsers, setTypingUsers] = useState([]);
  const [nowTick, setNowTick] = useState(Date.now());
  const [messageHighlightId, setMessageHighlightId] = useState(null);
  const [showScrollJump, setShowScrollJump] = useState(false);
  const [pendingMessageCount, setPendingMessageCount] = useState(0);
  const [showMobileRail, setShowMobileRail] = useState(false);
  const [reportDraft, setReportDraft] = useState(null);
  const [reactionsByMessage, setReactionsByMessage] = useState({});
  const [messageModerationMap, setMessageModerationMap] = useState({});

  const chatMessagesRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const messageRefs = useRef({});
  const lastSeenMessageTsRef = useRef(0);
  const highlightTimerRef = useRef(null);

  const rooms = useMemo(() => DEFAULT_ROOMS, []);
  const normalizeHandle = (value) => (value || "").trim().toLowerCase();

  const isNearBottom = () => {
    const el = chatMessagesRef.current;
    if (!el) return true;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distanceFromBottom < 120;
  };

  const scrollToBottom = (behavior = "smooth") => {
    const el = chatMessagesRef.current;
    if (!el) return;

    el.scrollTo({
      top: el.scrollHeight,
      behavior,
    });
  };

  const getLatestMessageTimestamp = (list) => {
    if (!list?.length) return 0;
    return list[list.length - 1]?.createdAt || 0;
  };

  const getPendingMessageTotal = useCallback(
    (list) => {
      if (!list?.length) return 0;

      return list.filter((msg) => {
        if (!msg) return false;
        if ((msg.createdAt || 0) <= lastSeenMessageTsRef.current) return false;
        if (msg.type === "system") return false;
        if (msg.userId === user.id) return false;
        return true;
      }).length;
    },
    [user.id]
  );

  const markMessagesSeen = useCallback(
    (list = messages) => {
      lastSeenMessageTsRef.current = getLatestMessageTimestamp(list);
      setPendingMessageCount(0);
      setShowScrollJump(false);
    },
    [messages]
  );

  useEffect(() => {
    if (!user?.id || !room?.id) return;

    updatePresenceRoom(user.id, room.id).catch((error) => {
      console.error("Failed to update presence room:", error);
    });
  }, [user?.id, room?.id]);

  useEffect(() => {
    if (!room?.id) {
      setReactionsByMessage({});
      return;
    }

    const unsubscribe = subscribeToRoomReactions(room.id, (reactions) => {
      setReactionsByMessage(groupReactionsByMessage(reactions));
    });

    return unsubscribe;
  }, [room?.id]);

  const isStaffViewer =
    user?.role === "admin" || user?.role === "moderator";

  useEffect(() => {
  if (!room?.id) {
    setMessageModerationMap({});
    return;
  }

  const unsubscribe = subscribeToRoomMessageModeration(room.id, (nextMap) => {
    setMessageModerationMap(nextMap || {});
  });

  return () => {
    unsubscribe?.();
  };
}, [room?.id]);

  useEffect(() => {
    if (!room?.id) return;

    const unsubscribe = subscribeToRoomMessages(room.id, setMessages);
    return unsubscribe;
  }, [room?.id]);

  useEffect(() => {
    if (!room?.id) return;

    const unsubscribe = subscribeToRoomPresence(room.id, (presenceUsers) => {
      const normalized = presenceUsers.map(normalizePresenceMember);
      setMembers(normalized);
    });

    return unsubscribe;
  }, [room?.id]);

  useEffect(() => {
    if (!room?.id || !user?.id) return;

    const unsubscribe = subscribeToRoomTyping(room.id, user.id, setTypingUsers);
    return unsubscribe;
  }, [room?.id, user?.id]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 15000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      window.clearTimeout(highlightTimerRef.current);
    };
  }, []);

  useEffect(() => {
    scrollToBottom("auto");
    shouldStickToBottomRef.current = true;
    lastSeenMessageTsRef.current = 0;
    setPendingMessageCount(0);
    setShowScrollJump(false);
  }, [room.id, user.id]);

  useEffect(() => {
    if (!messages.length) {
      setPendingMessageCount(0);
      setShowScrollJump(false);
      return;
    }

    if (lastSeenMessageTsRef.current === 0) {
      lastSeenMessageTsRef.current = getLatestMessageTimestamp(messages);
      return;
    }

    if (shouldStickToBottomRef.current) {
      scrollToBottom("smooth");
      markMessagesSeen(messages);
      return;
    }

    const pending = getPendingMessageTotal(messages);
    setPendingMessageCount((prev) => (prev === pending ? prev : pending));
    setShowScrollJump((prev) => (prev === (pending > 0) ? prev : pending > 0));
  }, [messages, getPendingMessageTotal, markMessagesSeen]);

  const memberMap = useMemo(() => {
    const map = new Map();

    members.forEach((member) => {
      if (!member?.handle) return;
      map.set(normalizeHandle(member.handle), member);
    });

    return map;
  }, [members]);

  const memberById = useMemo(() => {
    const map = new Map();

    members.forEach((member) => {
      const memberId = member?.id || member?.uid || member?.userId;
      if (!memberId) return;
      map.set(memberId, member);
    });

    return map;
  }, [members]);

  useEffect(() => {
    if (shouldStickToBottomRef.current) {
      scrollToBottom("smooth");
    }
  }, [typingUsers]);

  useEffect(() => {
    const handleNotificationClick = (event) => {
      const notification = event.detail;
      if (!notification || notification.roomId !== room.id) return;

      const targetMessage = findNotificationTargetMessage(notification);
      if (!targetMessage?.id) return;

      requestAnimationFrame(() => {
        scrollToMessage(targetMessage.id);

        const profileTargetId =
          notification.fromUserId ||
          notification.targetUserId ||
          null;

        if (profileTargetId && memberById.has(profileTargetId)) {
          handleOpenProfile(memberById.get(profileTargetId));
        }
      });
    };

    window.addEventListener("lanparty:notification-click", handleNotificationClick);
    return () =>
      window.removeEventListener("lanparty:notification-click", handleNotificationClick);
  }, [room.id, messages, user.handle, memberById]);

  useEffect(() => {
    if (!routeHighlightMessageId || !messages.length) return;

    const targetExists = messages.some((message) => message?.id === routeHighlightMessageId);
    if (!targetExists) return;

    const timer = window.setTimeout(() => {
      scrollToMessage(routeHighlightMessageId);
      navigate(location.pathname, { replace: true, state: {} });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [routeHighlightMessageId, messages, navigate, location.pathname]);

  

  const selectedProfileId =
    selectedProfile?.id || selectedProfile?.userId || selectedProfile?.uid || null;

  const currentUserId =
    user?.id || user?.userId || user?.uid || null;

  const isViewingOwnProfile = Boolean(
    selectedProfileId && currentUserId && selectedProfileId === currentUserId
  );

  const canViewSelectedProfileModeration = Boolean(
    selectedProfileId && (isViewingOwnProfile || isStaffViewer)
  );

  useEffect(() => {
    if (!selectedProfileId) return;

    const unsubscribe = subscribeToUserProfile(selectedProfileId, (liveProfile) => {
      setSelectedProfile((prev) => {
        const prevId = prev?.id || prev?.userId || prev?.uid || null;

        if (!prevId || prevId !== selectedProfileId) {
          return prev;
        }

        if (!liveProfile) {
          return prev;
        }

        return {
          ...prev,
          ...liveProfile,
          id: liveProfile.id || prev.id || selectedProfileId,
          uid: liveProfile.uid || prev.uid || selectedProfileId,
          userId:
            liveProfile.userId ||
            liveProfile.uid ||
            prev.userId ||
            prev.uid ||
            selectedProfileId,
          lastSeenAt: toMillis(
            prev?.lastSeenAt ??
              liveProfile?.lastSeenAt ??
              liveProfile?.updatedAt
          ),
          joinedAt: toMillis(prev?.joinedAt ?? liveProfile?.joinedAt),
          updatedAt: toMillis(
            liveProfile?.updatedAt ?? prev?.updatedAt ?? liveProfile?.lastSeenAt
          ),
        };
      });
    });

    return unsubscribe;
  }, [selectedProfileId]);

  useEffect(() => {
    if (!selectedProfile || !selectedProfileId || !canViewSelectedProfileModeration) {
      setSelectedProfileModeration(null);
      return;
    }

    const unsubscribe = subscribeToUserModerationState(selectedProfileId, (nextState) => {
      setSelectedProfileModeration(nextState || null);
    });

    return unsubscribe;
  }, [selectedProfile, selectedProfileId, canViewSelectedProfileModeration]);

  const typingLabel = useMemo(() => {
    if (!typingUsers.length) return "";

    if (typingUsers.length === 1) {
      return `${typingUsers[0].handle} typing...`;
    }

    if (typingUsers.length === 2) {
      return `${typingUsers[0].handle} and ${typingUsers[1].handle} are typing...`;
    }

    return `${typingUsers.length} night owls are typing...`;
  }, [typingUsers]);

  const getPresenceData = useCallback(
    (member) => {
      const lastSeenAt = member?.lastSeenAt || 0;

      void nowTick;

      const state = getPresenceState(lastSeenAt);
      const ui = getPresenceUI(lastSeenAt);

      const sortWeightMap = {
        active: 3,
        recent: 2,
        away: 1,
        offline: 0,
      };

      return {
        tone: ui.dot || state,
        dot: ui.dot || state,
        label: ui.label,
        state,
        sortWeight: sortWeightMap[state] ?? 0,
      };
    },
    [nowTick]
  );

  const enhancedMembers = useMemo(() => {
    return members
      .map((member) => {
        const presence = getPresenceData(member);
        const isTyping = typingUsers.some(
          (typingUser) =>
            typingUser.id === member.id ||
            typingUser.id === member.userId ||
            typingUser.userId === member.id
        );
        const isYou = member.id === user.id || member.userId === user.id;

        return {
          ...member,
          presence,
          isTyping,
          isYou,
          lastSeenLabel: formatRelativeLastSeen(member.lastSeenAt),
        };
      })
      .sort((a, b) => {
        if (a.isYou && !b.isYou) return -1;
        if (!a.isYou && b.isYou) return 1;
        if (a.isTyping && !b.isTyping) return -1;
        if (!a.isTyping && b.isTyping) return 1;
        if (a.presence.sortWeight !== b.presence.sortWeight) {
          return b.presence.sortWeight - a.presence.sortWeight;
        }
        return (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
      });
  }, [members, typingUsers, getPresenceData, user.id]);

  const activeNowCount = useMemo(() => {
    return enhancedMembers.filter(
      (member) => member.presence.state === "active" || member.isTyping
    ).length;
  }, [enhancedMembers]);

  const decoratedMessages = useMemo(() => {
  return messages.map((msg) => ({
    ...msg,
    grouped: false,
    showMeta: true,
  }));
}, [messages]);

  const firstUnreadMessageId = useMemo(() => {
    return (
      decoratedMessages.find((msg) => {
        if (!msg) return false;
        if (msg.type === "system") return false;
        if (msg.userId === user.id) return false;
        return (msg.createdAt || 0) > lastSeenMessageTsRef.current;
      })?.id || null
    );
  }, [decoratedMessages, user.id, pendingMessageCount]);

  function handleOpenProfile(profile) {
    if (!profile) return;

    const profileId = profile?.id || profile?.userId || profile?.uid;
    if (!profileId) return;

    setSelectedProfile({
      ...profile,
      id: profile.id || profileId,
      uid: profile.uid || profileId,
      userId: profile.userId || profile.uid || profileId,
      lastSeenAt: toMillis(profile.lastSeenAt || profile.updatedAt),
      joinedAt: toMillis(profile.joinedAt),
      updatedAt: toMillis(profile.updatedAt),
    });
  }

  function closeSelectedProfile() {
    setSelectedProfile(null);
    setSelectedProfileModeration(null);
  }

  function openProfileByHandle(handle) {
    if (!handle) return;
    const match = memberMap.get(normalizeHandle(handle));
    if (match) {
      handleOpenProfile(match);
    }
  }

  function openProfileByMessage(profileLike) {
    if (!profileLike) return;
    handleOpenProfile(profileLike);
  }

  async function handleWave() {
    const guard = validateWaveBeforeSend(user.id);

    if (!guard.ok) {
      pushToast({
        message: guard.message,
        variant: "info",
      });
      return;
    }

    const now = Date.now();
    const displayName = user?.handle || "Someone";
    const roomName = room?.name || "this room";

    const slot = await reserveWaveSlot(user.id);

    if (!slot.ok) {
      pushToast({
        message: slot.message || "You're doing that too fast.",
        variant: "info",
      });
      return;
    }

    const result = await sendFirestoreMessage({
  roomId: room.id,
  text: `${displayName} waved at everyone 👋`,
  user,
  type: "wave",
});

    if (!result?.ok) {
      pushToast({
        message: result?.error?.message || "Could not send wave.",
        variant: "danger",
      });
      return;
    }

    recordSuccessfulWave(user.id);

    addNotification({
      id: `wave_notif_${now}_${user.id}`,
      type: "wave",
      kind: "wave",
      from: displayName,
      fromHandle: displayName,
      fromUserId: user.id,
      roomId: room.id,
      roomName,
      message: `${displayName} waved in ${roomName}`,
      createdAt: now,
    });

    touchPresence(user.id).catch((error) => {
      console.error("Failed to refresh presence after wave:", error);
    });

    shouldStickToBottomRef.current = true;
  }

  async function handleWaveTarget(member) {
    if (!member?.id || member.id === user.id || isDeletedProfile(member)) return;

    const guard = validateWaveBeforeSend(user.id);

    if (!guard.ok) {
      pushToast({
        message: guard.message,
        variant: "info",
      });
      return;
    }

    const now = Date.now();
    const fromName = user?.handle || "Someone";
    const targetName = member?.handle || "someone";
    const roomName = room?.name || "this room";
    const slot = await reserveWaveSlot(user.id);

    if (!slot.ok) {
      pushToast({
        message: slot.message || "You're doing that too fast.",
        variant: "info",
      });
      return;
    }

    const result = await sendFirestoreMessage({
  roomId: room.id,
  text: `${fromName} waved at ${targetName} 👋`,
  user,
  type: "wave",
});

    if (!result?.ok) {
      pushToast({
        message: result?.error?.message || "Could not send wave.",
        variant: "danger",
      });
      return;
    }

    recordSuccessfulWave(user.id);

    addNotification({
      id: `wave_target_notif_${now}_${user.id}_${member.id}`,
      type: "wave",
      kind: "wave",
      from: fromName,
      fromHandle: fromName,
      fromUserId: user.id,
      to: member.handle,
      toHandle: member.handle,
      toUserId: member.id,
      targetUserId: member.id,
      roomId: room.id,
      roomName,
      message: `${fromName} waved at you in ${roomName}`,
      createdAt: now,
    });

    touchPresence(user.id).catch((error) => {
      console.error("Failed to refresh presence after targeted wave:", error);
    });

    closeSelectedProfile();
    shouldStickToBottomRef.current = true;
  }

  function handleReportMessage(msg) {
    if (!user?.id || !msg?.id || !msg?.userId) return;

    setReportDraft({
      type: "message",
      targetId: msg.id,
      reportedUserId: msg.userId,
      subjectLabel: "message",
      displayName: msg.user || "User",
    });
  }

  function handleMuteUser(msg) {
    if (!user?.id || !msg?.userId) return;

    muteUserForViewer(msg.userId, user.id);

    pushToast({
      message: `${msg.user || "User"} muted.`,
      variant: "info",
    });
  }

  function handleBlockUser(msg) {
    if (!user?.id || !msg?.userId) return;

    const confirmed = window.confirm(
      `Block ${msg.user || "this user"}? You won't see their messages or interactions anymore.`
    );

    if (!confirmed) return;

    blockUserForViewer(msg.userId, user.id);

    pushToast({
      message: `${msg.user || "User"} blocked.`,
      variant: "danger",
    });

    if (
      selectedProfile &&
      (selectedProfile.id === msg.userId || selectedProfile.userId === msg.userId)
    ) {
      closeSelectedProfile();
    }
  }

  function handleReportUser(profile) {
    const profileId = profile?.id || profile?.userId;
    if (!user?.id || !profileId) return;

    setReportDraft({
      type: "user",
      targetId: profileId,
      reportedUserId: profileId,
      subjectLabel: profile.handle || "user",
      displayName: profile.handle || "User",
    });
  }

  function handleMuteProfile(profile) {
    const profileId = profile?.id || profile?.userId;
    if (!user?.id || !profileId) return;

    muteUserForViewer(profileId, user.id);

    pushToast({
      message: `${profile.handle || "User"} muted.`,
      variant: "info",
    });

    closeSelectedProfile();
  }

  function handleBlockProfile(profile) {
    const profileId = profile?.id || profile?.userId;
    if (!user?.id || !profileId) return;

    const confirmed = window.confirm(
      `Block ${profile.handle || "this user"}? You won't see their messages, mentions, or interactions anymore.`
    );

    if (!confirmed) return;

    blockUserForViewer(profileId, user.id);

    pushToast({
      message: `${profile.handle || "User"} blocked.`,
      variant: "danger",
    });

    closeSelectedProfile();
  }

  function getRecentReportContext() {
    return messages
      .filter((message) => message && message.type !== "system")
      .slice(-8)
      .map((message) => ({
        id: message.id,
        userId: message.userId,
        user: message.user,
        text: message.text,
        type: message.type || "message",
        createdAt: message.createdAt || null,
      }));
  }

  function getReportTargetData(payload) {
    if (payload.type === "message") {
      const targetMessage = messages.find((message) => message?.id === payload.targetId);
      const reportedMember =
        members.find((member) => member?.id === payload.reportedUserId) || null;

      return {
        id: payload.targetId,
        type: "message",
        displayName: payload.displayName || targetMessage?.user || "User",
        reportedUserId: payload.reportedUserId,
        reportedHandle: reportedMember?.handle || targetMessage?.user || "",
        messageText: targetMessage?.text || "",
        messageCreatedAt: targetMessage?.createdAt || null,
      };
    }

    const reportedMember =
      members.find((member) => member?.id === payload.reportedUserId) ||
      enhancedMembers.find((member) => member?.id === payload.reportedUserId) ||
      null;

    return {
      id: payload.targetId,
      type: "user",
      displayName: payload.displayName || reportedMember?.handle || "User",
      reportedUserId: payload.reportedUserId,
      reportedHandle: reportedMember?.handle || payload.displayName || "",
      messageText: "",
      messageCreatedAt: null,
    };
  }

  async function handleSubmitReport(payload) {
    if (!user?.id || !payload?.targetId || !payload?.reportedUserId || !payload?.reason) {
      return;
    }

    if (hasRecentDuplicateReport(payload, room.id, user.id)) {
      pushToast({
        message: "You already reported this recently.",
        variant: "info",
      });
      return;
    }

    try {
      const target = getReportTargetData(payload);

      const firestoreReport = await createFirestoreReport({
  messageId: payload.type === "message" ? payload.targetId : null,
  roomId: room.id,
  targetUserId: payload.reportedUserId,
  reporterUserId: user.id,
  reason: payload.reason,
  notes: payload.notes || "",
});

      const result = await submitReport({
        type: payload.type,
        reason: payload.reason,
        notes: payload.notes || "",
        room: {
          id: room.id,
          name: room.name,
        },
        reporter: {
          id: user.id,
          handle: user.handle,
          avatar: user.avatar,
          awakeReason: user.awakeReason,
        },
        target,
        context: {
          recentMessages: getRecentReportContext(),
        },
        reportId: firestoreReport.id,
        localReportId: firestoreReport.id,
      });

      if (result.ok) {
        markRecentDuplicateReport(payload, room.id, user.id);
      }

      console.log("submitReport result:", result);
      console.log("firestore moderation report:", firestoreReport);

      if (result.ok && result.delivered) {
        pushToast({
          message: `${payload.displayName || "Item"} reported. Mods have been notified.`,
          variant: "warning",
        });
      } else if (result.ok && !result.delivered) {
        pushToast({
          message: `${payload.displayName || "Item"} reported successfully.`,
          variant: "warning",
        });
      } else {
        pushToast({
          message: `${payload.displayName || "Item"} reported, but external delivery failed.`,
          variant: "warning",
        });

        console.error("External report delivery failed:", result.error);
      }
    } catch (error) {
      pushToast({
        message: `Could not submit report.`,
        variant: "danger",
      });

      console.error("Report submission error:", error);
    } finally {
      setReportDraft(null);
      closeSelectedProfile();
    }
  }

  async function handleLeaveCurrentRoom() {
    try {
      await clearTyping(room.id, user.id);
    } catch (error) {
      console.error("Failed to clear typing on leave:", error);
    }

    try {
      await updatePresenceRoom(user.id, null);
    } catch (error) {
      console.error("Failed to clear room presence on leave:", error);
    }

    onLeaveRoom();
  }

  async function handleSwitchRoom(nextRoom) {
    if (!nextRoom?.id || nextRoom.id === room.id) return;

    try {
      await clearTyping(room.id, user.id);
    } catch (error) {
      console.error("Failed to clear typing on switch:", error);
    }

    try {
      await updatePresenceRoom(user.id, nextRoom.id);
    } catch (error) {
      console.error("Failed to switch room presence:", error);
    }

    onLeaveRoom(nextRoom);
  }

  async function handleLogoutClick() {
    try {
      await clearTyping(room.id, user.id);
    } catch (error) {
      console.error("Failed to clear typing on logout:", error);
    }

    onLogout();
  }

  function handleChatScroll() {
    const nearBottom = isNearBottom();
    shouldStickToBottomRef.current = nearBottom;

    if (nearBottom) {
      markMessagesSeen(messages);
      return;
    }

    const pending = getPendingMessageTotal(messages);
    setPendingMessageCount((prev) => (prev === pending ? prev : pending));
    setShowScrollJump((prev) => (prev === (pending > 0) ? prev : pending > 0));
  }

  function handleJumpToLatest() {
    shouldStickToBottomRef.current = true;
    scrollToBottom("smooth");
    markMessagesSeen(messages);
  }

  function getReactionEntries(messageId, emoji) {
    return reactionsByMessage?.[messageId]?.[emoji] || [];
  }

  function hasReacted(messageId, emoji) {
    return getReactionEntries(messageId, emoji).some(
      (entry) => entry.id === user.id || entry.uid === user.id
    );
  }

  function getReactionCount(messageId, emoji) {
    return getReactionEntries(messageId, emoji).length;
  }

  async function handleToggleReaction(messageId, emoji) {
    const alreadyReacted = hasReacted(messageId, emoji);

    try {
      await toggleFirestoreReaction({
        roomId: room.id,
        messageId,
        emoji,
        user,
        hasReacted: alreadyReacted,
      });
    } catch (error) {
      console.error("Failed to toggle reaction:", error);
      pushToast({
        message: "Could not update reaction.",
        variant: "danger",
      });
    }
  }

  function scrollToMessage(messageId) {
    const node = messageRefs.current[messageId];
    if (!node) return;

    node.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    setMessageHighlightId(messageId);

    window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => {
      setMessageHighlightId(null);
    }, 2200);
  }

  function findNotificationTargetMessage(notification) {
    const reversedMessages = [...messages].reverse();

    if (notification.messageId) {
      const exactMessage = messages.find(
        (message) => message?.id === notification.messageId
      );
      if (exactMessage) return exactMessage;
    }

    if (notification.type === "mention") {
      return (
        reversedMessages.find((message) => {
          if (message.type === "system") return false;
          if (
            notification.fromUserId &&
            message.userId &&
            notification.fromUserId === message.userId
          ) {
            return true;
          }
          if (normalizeHandle(message.user) !== normalizeHandle(notification.fromHandle || notification.from)) {
            return false;
          }
          return message.text?.toLowerCase().includes(`@${user.handle.toLowerCase()}`);
        }) || null
      );
    }

    if (notification.type === "wave") {
      return (
        reversedMessages.find((message) => {
          if (message.type !== "system") return false;
          if (!message.text) return false;
          if (!message.text.toLowerCase().includes("waved")) return false;

          if (notification.fromUserId && message.userId) {
            return notification.fromUserId === message.userId;
          }

          return (
            normalizeHandle(notification.fromHandle || notification.from) ===
            normalizeHandle(message.text.split(" ")[1] || "")
          );
        }) || reversedMessages.find((message) => message.type === "system") || null
      );
    }

    return reversedMessages[0] || null;
  }

  function handleAfterSend() {
    shouldStickToBottomRef.current = true;

    touchPresence(user.id).catch((error) => {
      console.error("Failed to refresh presence after send:", error);
    });
  }

  async function handleCopyInvite() {
    const inviteUrl = `${window.location.origin}/room/${room.id}`;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      pushToast({
        message: "Invite link copied!",
        variant: "success",
      });
    } catch {
      window.prompt("Copy this room link:", inviteUrl);
    }
  }

  const selectedProfilePresence = useMemo(() => {
    if (!selectedProfile) return null;

    const selectedId =
      selectedProfile.id || selectedProfile.userId || selectedProfile.uid || null;

    if (!selectedId) return null;

    const liveMember =
      enhancedMembers.find(
        (member) =>
          member.id === selectedId ||
          member.userId === selectedId ||
          member.uid === selectedId
      ) || null;

    if (liveMember?.presence) {
      return liveMember.presence;
    }

    return getPresenceData(selectedProfile);
  }, [selectedProfile, enhancedMembers, getPresenceData]);

  return (
    <main className="room-screen">
      <section className="room-shell enhanced-room-shell">
        <div className="room-main">
          <RoomHeader
            room={room}
            user={user}
            members={members}
            activeNowCount={activeNowCount}
            onWave={handleWave}
            onLeaveRoom={handleLeaveCurrentRoom}
            onLogout={handleLogoutClick}
            onCopyInvite={handleCopyInvite}
            onOpenProfile={handleOpenProfile}
          />

          <div className="chat-container">
            <RoomMessageList
              decoratedMessages={decoratedMessages}
              firstUnreadMessageId={firstUnreadMessageId}
              messageRefs={messageRefs}
              messageHighlightId={messageHighlightId}
              openProfileByMessage={openProfileByMessage}
              openProfileByHandle={openProfileByHandle}
              memberMap={memberMap}
              memberById={memberById}
              REACTION_EMOJIS={REACTION_EMOJIS}
              getReactionCount={getReactionCount}
              hasReacted={hasReacted}
              handleToggleReaction={handleToggleReaction}
              typingLabel={typingLabel}
              showScrollJump={showScrollJump}
              pendingMessageCount={pendingMessageCount}
              handleJumpToLatest={handleJumpToLatest}
              chatMessagesRef={chatMessagesRef}
              handleChatScroll={handleChatScroll}
              currentUser={user}
              roomId={room.id}
              onReportMessage={handleReportMessage}
              onMuteUser={handleMuteUser}
              onBlockUser={handleBlockUser}
              messageModerationMap={messageModerationMap}
            />

            <div className="room-composer-mobile-wrap">
              <RoomComposer
                user={user}
                room={room}
                members={members}
                onAfterSend={handleAfterSend}
              />

              <button
                className="room-mobile-rail-toggle"
                type="button"
                onClick={() => setShowMobileRail(true)}
              >
                View people & rooms
              </button>
            </div>
          </div>
        </div>

        <div className="room-desktop-rail">
          <RoomRightRail
            enhancedMembers={enhancedMembers}
            activeNowCount={activeNowCount}
            rooms={rooms}
            currentRoomId={room.id}
            onSwitchRoom={handleSwitchRoom}
            onOpenProfile={handleOpenProfile}
          />
        </div>
      </section>

      {showMobileRail && (
        <div
          className="mobile-rail-sheet-backdrop"
          onClick={() => setShowMobileRail(false)}
        >
          <div
            className="mobile-rail-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-rail-sheet-header">
              <div>
                <p className="mobile-rail-sheet-eyebrow">Nite's Watch</p>
                <h3>People & rooms</h3>
              </div>

              <button
                type="button"
                className="mobile-rail-sheet-close"
                onClick={() => setShowMobileRail(false)}
              >
                Close
              </button>
            </div>

            <RoomRightRail
              enhancedMembers={enhancedMembers}
              activeNowCount={activeNowCount}
              rooms={rooms}
              currentRoomId={room.id}
              onSwitchRoom={(nextRoom) => {
                handleSwitchRoom(nextRoom);
                setShowMobileRail(false);
              }}
              onOpenProfile={(profile) => {
                handleOpenProfile(profile);
                setShowMobileRail(false);
              }}
            />
          </div>
        </div>
      )}

      <RoomProfileModal
        selectedProfile={selectedProfile}
        selectedProfilePresence={selectedProfilePresence}
        selectedProfileModeration={selectedProfileModeration}
        isViewingOwnProfile={isViewingOwnProfile}
        formatRelativeLastSeen={formatRelativeLastSeen}
        onClose={closeSelectedProfile}
        onWaveTarget={handleWaveTarget}
        currentUser={user}
        onReportUser={handleReportUser}
        onMuteProfile={handleMuteProfile}
        onBlockProfile={handleBlockProfile}
      />

      <ReportModal
        reportDraft={reportDraft}
        onClose={() => setReportDraft(null)}
        onSubmit={handleSubmitReport}
      />
    </main>
  );
}

export default Room;