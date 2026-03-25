import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "./firebase";

const RATE_LIMITS_COLLECTION = "rateLimits";

const MESSAGE_COOLDOWN_MS = 1500;
const MESSAGE_BURST_WINDOW_MS = 20000;
const MAX_MESSAGES_PER_WINDOW = 5;
const DUPLICATE_WINDOW_MS = 15000;
const WAVE_COOLDOWN_MS = 5000;

function rateLimitRef(userId) {
  return doc(db, RATE_LIMITS_COLLECTION, userId);
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function pruneRecentTimes(times, windowMs, now) {
  return (Array.isArray(times) ? times : []).filter(
    (timestamp) => Number(timestamp) && now - Number(timestamp) < windowMs
  );
}

export async function reserveMessageSendSlot({ userId, text }) {
  const authUid = auth.currentUser?.uid || null;
  const canonicalUserId = authUid || userId || null;
  const cleanText = String(text || "").trim();
  const normalized = normalizeText(cleanText);

  console.log("[reserveMessageSendSlot] ids", {
    passedUserId: userId,
    authUid,
    canonicalUserId,
  });

  if (!canonicalUserId || !authUid || canonicalUserId !== authUid) {
    return {
      ok: false,
      code: "auth-mismatch",
      message: "You must be signed in to send messages.",
    };
  }

  if (!cleanText) {
    return {
      ok: false,
      code: "empty-message",
      message: "Type a message first.",
    };
  }

  try {
    const result = await runTransaction(db, async (transaction) => {
      const ref = rateLimitRef(canonicalUserId);
      const snap = await transaction.get(ref);
      const now = Date.now();

      const current = snap.exists() ? snap.data() : {};
      const recentMessageTimes = pruneRecentTimes(
        current.recentMessageTimes,
        MESSAGE_BURST_WINDOW_MS,
        now
      );

      const lastMessageAt = Number(current.lastMessageAt || 0);
      const lastMessageHash = current.lastMessageHash || "";
      const lastMessageHashAt = Number(current.lastMessageHashAt || 0);

      if (lastMessageAt && now - lastMessageAt < MESSAGE_COOLDOWN_MS) {
        const secondsLeft = Math.ceil(
          (MESSAGE_COOLDOWN_MS - (now - lastMessageAt)) / 1000
        );

        return {
          ok: false,
          code: "cooldown",
          message: `Slow down a bit. Try again in ${secondsLeft}s.`,
        };
      }

      if (recentMessageTimes.length >= MAX_MESSAGES_PER_WINDOW) {
        return {
          ok: false,
          code: "burst-limit",
          message: "You're sending too fast. Wait a few seconds and try again.",
        };
      }

      if (
        lastMessageHash &&
        lastMessageHash === normalized &&
        lastMessageHashAt &&
        now - lastMessageHashAt < DUPLICATE_WINDOW_MS
      ) {
        return {
          ok: false,
          code: "duplicate-message",
          message: "You already sent that message recently.",
        };
      }

      const nextRecentMessageTimes = [...recentMessageTimes, now];

      transaction.set(
        ref,
        {
          userId: canonicalUserId,
          lastMessageAt: now,
          recentMessageTimes: nextRecentMessageTimes,
          lastMessageHash: normalized,
          lastMessageHashAt: now,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      return {
        ok: true,
      };
    });

    return result;
  } catch (error) {
    console.error("[rateLimit] reserveMessageSendSlot failed", error, {
      passedUserId: userId,
      authUid,
      canonicalUserId,
    });

    return {
      ok: false,
      code: "rate-limit-check-failed",
      message: "Could not verify send rate. Please try again.",
    };
  }
}

export async function reserveWaveSlot(userId) {
  const authUid = auth.currentUser?.uid || null;
  const canonicalUserId = authUid || userId || null;

  console.log("[reserveWaveSlot] ids", {
    passedUserId: userId,
    authUid,
    canonicalUserId,
  });

  if (!canonicalUserId || !authUid || canonicalUserId !== authUid) {
    return {
      ok: false,
      code: "auth-mismatch",
      message: "You must be signed in to wave.",
    };
  }

  try {
    const result = await runTransaction(db, async (transaction) => {
      const ref = rateLimitRef(canonicalUserId);
      const snap = await transaction.get(ref);
      const now = Date.now();

      const current = snap.exists() ? snap.data() : {};
      const lastWaveAt = Number(current.lastWaveAt || 0);

      if (lastWaveAt && now - lastWaveAt < WAVE_COOLDOWN_MS) {
        const secondsLeft = Math.ceil(
          (WAVE_COOLDOWN_MS - (now - lastWaveAt)) / 1000
        );

        return {
          ok: false,
          code: "wave-cooldown",
          message: `Wait ${secondsLeft}s before waving again.`,
        };
      }

      transaction.set(
        ref,
        {
          userId: canonicalUserId,
          lastWaveAt: now,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      return {
        ok: true,
      };
    });

    return result;
  } catch (error) {
    console.error("[rateLimit] reserveWaveSlot failed", error, {
      passedUserId: userId,
      authUid,
      canonicalUserId,
    });

    return {
      ok: false,
      code: "wave-rate-limit-check-failed",
      message: "Could not verify wave cooldown. Please try again.",
    };
  }
}