import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

/**
 * Firestore shape:
 * users/{uid}
 */
function userRef(uid) {
  return doc(db, "users", uid);
}

/**
 * Creates or merges a user profile document.
 * Safe to call on login/signup every time.
 *
 * Important:
 * - On first create, we write the full profile with sensible defaults.
 * - On later logins/updates, we only overwrite fields that were explicitly provided,
 *   so we do NOT accidentally wipe handle/avatar/bio/etc with empty defaults.
 */
export async function upsertUserProfile({
  uid,
  email,
  handle,
  avatar,
  bio,
  awakeReason,
  status,
  role,
  policyAcceptance,
}) {
  if (!uid) throw new Error("upsertUserProfile requires uid");

  const ref = userRef(uid);
  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) {
    await setDoc(ref, {
      uid,
      email: email ?? "",
      handle: handle ?? "",
      avatar: avatar ?? "🌙",
      bio: bio ?? "",
      awakeReason: awakeReason ?? "Insomnia",
      status: status ?? "Awake",
      role: role ?? "user",
      policyAcceptance: policyAcceptance ?? null,
      joinedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  const updates = {
    lastSeenAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (email !== undefined) updates.email = email;
  if (handle !== undefined) updates.handle = handle;
  if (avatar !== undefined) updates.avatar = avatar;
  if (bio !== undefined) updates.bio = bio;
  if (awakeReason !== undefined) updates.awakeReason = awakeReason;
  if (status !== undefined) updates.status = status;
  if (role !== undefined) updates.role = role;
  if (policyAcceptance !== undefined) {
    updates.policyAcceptance = policyAcceptance;
  }

  await setDoc(ref, updates, { merge: true });
}

export async function getUserProfile(uid) {
  if (!uid) return null;

  const snapshot = await getDoc(userRef(uid));
  if (!snapshot.exists()) return null;

  return {
    id: snapshot.id, // compatibility for older app code
    ...snapshot.data(),
  };
}

export async function updateUserProfile(uid, updates = {}) {
  if (!uid) throw new Error("updateUserProfile requires uid");

  await updateDoc(userRef(uid), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function touchUserLastSeen(uid) {
  if (!uid) return;

  await updateDoc(userRef(uid), {
    lastSeenAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function subscribeToUserProfile(uid, callback) {
  if (!uid) return () => {};

  return onSnapshot(userRef(uid), (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }

    const data = snapshot.data();

    callback({
      id: snapshot.id, // compatibility for older app code
      uid: data.uid || snapshot.id,
      userId: data.userId || data.uid || snapshot.id,
      ...data,
    });
  });
}