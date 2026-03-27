import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
} from "firebase/auth";
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { auth, db } from "../lib/firebase";
import { upsertUserProfile, getUserProfile } from "../lib/users";

function normalizeAuthProfile(profile, firebaseUser) {
  const now = Date.now();
  const uid = firebaseUser?.uid || profile?.uid || profile?.id || null;

  if (!uid) {
    throw new Error("Missing Firebase user ID.");
  }

  return {
    ...profile,
    id: uid,
    uid,
    email: profile?.email || firebaseUser?.email || "",
    emailVerified: Boolean(firebaseUser?.emailVerified),
    handle: profile?.handle || profile?.username || "",
    avatar: profile?.avatar || "🌙",
    bio: profile?.bio || "",
    role: profile?.role || "user",
    awakeReason: profile?.awakeReason || "Insomnia",
    joinedAt: profile?.joinedAt || profile?.createdAt || now,
    lastSeenAt: profile?.lastSeenAt || now,
    status: profile?.status || "Awake",
    vibe: profile?.awakeReason || "Insomnia",
    policyAcceptance: profile?.policyAcceptance || null,
    deleted: Boolean(profile?.deleted),
  };
}

export async function createAccount({
  email,
  password,
  username,
  avatar,
  bio,
  awakeReason = "Insomnia",
  policyAcceptance = null,
}) {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const firebaseUser = result.user;

    // ✅ send verification email
    await sendEmailVerification(firebaseUser);

    // ✅ create user profile
    await upsertUserProfile({
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      handle: username,
      avatar,
      bio,
      awakeReason,
      status: "Awake",
      role: "user",
      policyAcceptance,
    });

    const profile = await getUserProfile(firebaseUser.uid);
    const normalized = normalizeAuthProfile(profile, firebaseUser);

    // 🔥🔥🔥 CRITICAL FIX
    await signOut(auth);

    return normalized;
  } catch (error) {
    console.error("[createAccount] failed:", error);
    throw error;
  }
}

export async function loginAccount(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  const firebaseUser = result.user;

  await firebaseUser.reload();

  try {
    await upsertUserProfile({
      uid: firebaseUser.uid,
      email: firebaseUser.email,
    });
  } catch (error) {
    console.warn("[loginAccount] profile sync skipped:", error);
  }

  const profile = await getUserProfile(firebaseUser.uid);
  return normalizeAuthProfile(profile, auth.currentUser || firebaseUser);
}

export async function resendVerificationEmail() {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("No user is currently signed in.");
  }

  if (user.emailVerified) {
    return { ok: true, alreadyVerified: true };
  }

  await sendEmailVerification(user);
  return { ok: true };
}

export async function logoutAccount() {
  await signOut(auth);
}

export async function resetPassword(email) {
  if (!email?.trim()) {
    throw new Error("Enter your email first.");
  }

  await sendPasswordResetEmail(auth, email.trim().toLowerCase());
}

async function anonymizeUserProfile(user) {
  const userRef = doc(db, "users", user.uid);
  const existingSnap = await getDoc(userRef);
  const existing = existingSnap.exists() ? existingSnap.data() : {};

  await setDoc(
    userRef,
    {
      uid: user.uid,
      id: user.uid,
      deleted: true,
      deletedAt: serverTimestamp(),
      email: "",
      handle: "[deleted]",
      avatar: "🌙",
      bio: "",
      awakeReason: "",
      vibe: "",
      status: "Deleted",
      role: existing?.role || "user",
      joinedAt: existing?.joinedAt || existing?.createdAt || Date.now(),
      lastSeenAt: Date.now(),
      policyAcceptance: existing?.policyAcceptance || null,
    },
    { merge: true }
  );
}

async function cleanupLivePresence(user) {
  const ops = [
    deleteDoc(doc(db, "presence", user.uid)).catch(() => null),
    deleteDoc(doc(db, "typing", user.uid)).catch(() => null),
  ];

  await Promise.all(ops);
}

async function markModerationStateDeleted(user) {
  const moderationRef = doc(db, "userModeration", user.uid);

  await setDoc(
    moderationRef,
    {
      uid: user.uid,
      deleted: true,
      deletedAt: serverTimestamp(),
      accountState: "deleted",
      suspension: {
        active: false,
      },
      warningCount: 0,
    },
    { merge: true }
  ).catch(() => null);
}

async function reauthenticateForDelete(user, password) {
  if (!user.email) {
    throw new Error("This account does not have an email address.");
  }

  if (!password?.trim()) {
    const error = new Error("Password is required to confirm account deletion.");
    error.code = "auth/missing-password-for-delete";
    throw error;
  }

  const credential = EmailAuthProvider.credential(user.email, password.trim());
  await reauthenticateWithCredential(user, credential);
}

export async function deleteAccount({ password }) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("No user is currently logged in.");
  }

  await reauthenticateForDelete(user, password);

  try {
    await anonymizeUserProfile(user);
    await cleanupLivePresence(user);
    await markModerationStateDeleted(user);
    await deleteUser(user);
  } catch (error) {
    console.error("[deleteAccount] failed:", error);
    throw error;
  }
}

export function watchAuthState(callback) {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      callback(null);
      return;
    }

    try {
      await firebaseUser.reload();
      const profile = await getUserProfile(firebaseUser.uid);
      callback(normalizeAuthProfile(profile, auth.currentUser || firebaseUser));
    } catch (error) {
      console.warn("[watchAuthState] profile read fallback:", error);
      callback(normalizeAuthProfile(null, auth.currentUser || firebaseUser));
    }
  });
}
