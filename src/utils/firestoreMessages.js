import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase";

import {
  canUserSendMessage,
  logSuspendedMessageAttempt,
} from "../lib/suspensionsFirestore";

const messagesRef = collection(db, "messages");

function formatMessageTime(value) {
  if (!value) return "";

  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : new Date(value);

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolveCanonicalUserId(user) {
  return (
    auth.currentUser?.uid ||
    user?.uid ||
    user?.id ||
    user?.userId ||
    null
  );
}

/**
 * SEND MESSAGE (WITH SUSPENSION ENFORCEMENT)
 */
export async function sendFirestoreMessage({
  roomId,
  text,
  user,
  type = "message",
  userLabel,
  avatar,
  awakeReason,
}) {
  const cleanText = text?.trim();
  const authUid = auth.currentUser?.uid || null;
  const canonicalUserId = resolveCanonicalUserId(user);

  if (!roomId || !cleanText || !canonicalUserId) {
    return {
      ok: false,
      error: { message: "Missing required message fields." },
    };
  }

  if (!authUid) {
    return {
      ok: false,
      error: { message: "You must be signed in to send messages." },
    };
  }

  if (user?.id && authUid && user.id !== authUid) {
    console.warn("[sendFirestoreMessage] user.id/auth UID mismatch", {
      passedUserId: user.id,
      passedUserUid: user?.uid,
      authUid,
      user,
    });
  }

  try {
    // Use canonical auth-backed id for moderation checks too
    const check = await canUserSendMessage(authUid);

    if (!check.allowed) {
      await logSuspendedMessageAttempt({
        userId: authUid,
        moderatorState: check.moderationState,
        roomId,
        text: cleanText,
      });

      return {
        ok: false,
        error: {
          code: "USER_SUSPENDED",
          message:
            check.reason ||
            "You are currently suspended and cannot send messages.",
        },
        suspension: check.suspension || null,
      };
    }

    const messageData = {
      roomId,
      text: cleanText,
      userId: authUid,
      user: userLabel || user?.handle || "Anonymous",
      avatar: avatar || user?.avatar || "🌙",
      awakeReason: awakeReason ?? user?.awakeReason ?? "",
      role: user?.role || "user",
      type,
      createdAt: serverTimestamp(),
    };

    console.log("[sendFirestoreMessage] write payload", {
      authUid,
      messageData,
    });

    const docRef = await addDoc(messagesRef, messageData);

    return {
      ok: true,
      data: {
        id: docRef.id,
      },
    };
  } catch (error) {
    console.error("sendFirestoreMessage failed:", error, {
      authUid,
      passedUser: user,
      roomId,
      text: cleanText,
      type,
    });

    return {
      ok: false,
      error: {
        message: error?.message || "Failed to send message.",
      },
    };
    
  }
}

/**
 * SUBSCRIBE TO ROOM MESSAGES
 */
export function subscribeToRoomMessages(roomId, callback) {
  if (!roomId) return () => {};

  const q = query(
    messagesRef,
    where("roomId", "==", roomId),
    orderBy("createdAt", "asc")
  );

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map((doc) => {
      const data = doc.data();
      const createdAtMs = data.createdAt?.toMillis?.() || Date.now();

      return {
        id: doc.id,
        ...data,
        createdAt: createdAtMs,
        time: formatMessageTime(data.createdAt),
      };
    });

    callback(messages);
  });
}