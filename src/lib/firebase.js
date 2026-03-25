import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC9dC-WbMowyYzlg-5Xt6CM1ClrxoPO5ZE",
  authDomain: "lan-party-6585a.firebaseapp.com",
  projectId: "lan-party-6585a",
  storageBucket: "lan-party-6585a.firebasestorage.app",
  messagingSenderId: "570778986004",
  appId: "1:570778986004:web:9f166634b013bb02ca6901",
  measurementId: "G-455BJ2WKLJ",
};

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;