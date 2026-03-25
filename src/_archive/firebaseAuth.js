import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged
} from "firebase/auth";

import { auth } from "../lib/firebase";

export async function registerUser(email, password, handle) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);

  if (handle) {
    await updateProfile(cred.user, {
      displayName: handle
    });
  }

  return cred.user;
}

export async function loginUser(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logoutUser() {
  await signOut(auth);
}

export function subscribeToAuth(callback) {
  return onAuthStateChanged(auth, callback);
}