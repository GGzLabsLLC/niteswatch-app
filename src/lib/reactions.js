import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";

function buildReactionId(messageId, uid, emoji) {
  return `${messageId}__${uid}__${encodeURIComponent(emoji)}`;
}

export async function addReaction({ roomId, messageId, user, emoji }) {
  const uid = user?.id || user?.uid;

  if (!roomId || !messageId || !uid || !emoji) {
    throw new Error("Missing required reaction fields.");
  }

  const reactionId = buildReactionId(messageId, uid, emoji);
  const reactionRef = doc(db, "messageReactions", reactionId);

  await setDoc(reactionRef, {
    roomId,
    messageId,
    uid,
    handle: user?.handle || "Night Owl",
    avatar: user?.avatar || "🌙",
    emoji,
    createdAt: serverTimestamp(),
  });
}

export async function removeReaction({ messageId, userId, emoji }) {
  if (!messageId || !userId || !emoji) {
    throw new Error("Missing required reaction fields.");
  }

  const reactionId = buildReactionId(messageId, userId, emoji);
  const reactionRef = doc(db, "messageReactions", reactionId);

  await deleteDoc(reactionRef);
}

export async function toggleFirestoreReaction({ roomId, messageId, emoji, user, hasReacted }) {
  const userId = user?.id || user?.uid;

  if (!roomId || !messageId || !emoji || !userId) {
    return;
  }

  if (hasReacted) {
    await removeReaction({
      messageId,
      userId,
      emoji,
    });
    return;
  }

  await addReaction({
    roomId,
    messageId,
    emoji,
    user,
  });
}

export function subscribeToRoomReactions(roomId, callback) {
  if (!roomId) return () => {};

  const q = query(
    collection(db, "messageReactions"),
    where("roomId", "==", roomId)
  );

  return onSnapshot(q, (snapshot) => {
    const reactions = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    callback(reactions);
  });
}

export function groupReactionsByMessage(reactions = []) {
  return reactions.reduce((acc, reaction) => {
    const messageId = reaction?.messageId;
    const emoji = reaction?.emoji;
    const uid = reaction?.uid;

    if (!messageId || !emoji || !uid) return acc;

    if (!acc[messageId]) acc[messageId] = {};
    if (!acc[messageId][emoji]) {
      acc[messageId][emoji] = [];
    }

    acc[messageId][emoji].push({
      id: uid,
      uid,
      handle: reaction?.handle || "Night Owl",
      avatar: reaction?.avatar || "🌙",
      createdAt:
        typeof reaction?.createdAt?.toMillis === "function"
          ? reaction.createdAt.toMillis()
          : Date.now(),
    });

    return acc;
  }, {});
}