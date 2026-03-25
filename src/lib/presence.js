import {
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";

const PRESENCE_STALE_MS = 90 * 1000;

function presenceRef(uid) {
  return doc(db, "presence", uid);
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return 0;
}

function isFreshPresence(data) {
  const lastSeen = toMillis(data?.lastSeenAt || data?.updatedAt);
  if (!lastSeen) return true;
  return Date.now() - lastSeen <= PRESENCE_STALE_MS;
}

export async function setPresenceOnline({
  uid,
  handle,
  avatar,
  status = "Awake",
  roomId = null,
  role = "user",
}) {

  if (!uid) throw new Error("setPresenceOnline requires uid");

  await setDoc(
    presenceRef(uid),
    {
      uid,
      userId: uid,
      handle: handle ?? "",
      avatar: avatar ?? "🌙",
      status,
      roomId,
      isOnline: true,
      lastSeenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      role,
    },
    { merge: true }
  );
}

export async function updatePresenceRoom(uid, roomId = null) {
  if (!uid) return;

  await setDoc(
    presenceRef(uid),
    {
      uid,
      userId: uid,
      roomId,
      isOnline: true,
      lastSeenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function touchPresence(uid) {
  if (!uid) return;

  await setDoc(
    presenceRef(uid),
    {
      uid,
      userId: uid,
      isOnline: true,
      lastSeenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function setPresenceOffline(uid) {
  if (!uid) return;

  await setDoc(
    presenceRef(uid),
    {
      uid,
      userId: uid,
      isOnline: false,
      roomId: null,
      lastSeenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function clearPresence(uid) {
  if (!uid) return;
  await deleteDoc(presenceRef(uid));
}

export function subscribeToRoomPresence(roomId, callback) {
  if (!roomId) return () => {};

  const q = query(
    collection(db, "presence"),
    where("isOnline", "==", true),
    where("roomId", "==", roomId)
  );

  return onSnapshot(q, (snapshot) => {
    const users = snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
      .filter(isFreshPresence);

    callback(users);
  });
}

export function subscribeToAwakeUsers(callback) {
  const q = query(collection(db, "presence"), where("isOnline", "==", true));

  return onSnapshot(q, (snapshot) => {
    const users = snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
      .filter(isFreshPresence);

    callback(users);
  });
}