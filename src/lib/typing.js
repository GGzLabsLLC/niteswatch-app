import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

function typingRef(roomId, uid) {
  return doc(db, "typing", `${roomId}_${uid}`);
}

export async function setTyping({ roomId, user }) {
  const userId = user?.id || user?.uid || user?.userId || null;
  if (!roomId || !userId) return;

  await setDoc(
    typingRef(roomId, userId),
    {
      roomId,
      uid: userId,
      userId,
      handle: user?.handle || "Anonymous",
      avatar: user?.avatar || "🌙",
      awakeReason: user?.awakeReason || "Awake",
      isTyping: true,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function clearTyping(roomId, uid) {
  if (!roomId || !uid) return;

  try {
    await deleteDoc(typingRef(roomId, uid));
  } catch (error) {
    if (error?.code === "permission-denied") {
      return;
    }
    throw error;
  }
}

export function subscribeToRoomTyping(roomId, currentUserId, callback) {
  if (!roomId) return () => {};

  const q = query(
    collection(db, "typing"),
    where("roomId", "==", roomId),
    where("isTyping", "==", true)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const now = Date.now();

      const users = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data();
          const updatedAt =
            typeof data.updatedAt?.toMillis === "function"
              ? data.updatedAt.toMillis()
              : 0;

          return {
            id: data.uid || data.userId || docSnap.id,
            ...data,
            updatedAt,
          };
        })
        .filter((entry) => entry.id !== currentUserId)
        .filter((entry) => now - (entry.updatedAt || 0) < 6000);

      callback(users);
    },
    (error) => {
      console.error("[typing] subscribe failed", error);
      callback([]);
    }
  );
}