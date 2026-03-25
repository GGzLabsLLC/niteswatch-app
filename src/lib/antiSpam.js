const MESSAGE_COOLDOWN_MS = 1500;
const MESSAGE_BURST_WINDOW_MS = 20000;
const MAX_MESSAGES_PER_WINDOW = 5;
const DUPLICATE_WINDOW_MS = 15000;
const MAX_MESSAGE_LENGTH = 320;
const MAX_MENTIONS_PER_MESSAGE = 5;
const WAVE_COOLDOWN_MS = 5000;

const messageHistoryByUser = new Map();
const lastMessageByUser = new Map();
const lastWaveAtByUser = new Map();

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function pruneOld(history, windowMs, now) {
  return history.filter((timestamp) => now - timestamp < windowMs);
}

export function validateMessageBeforeSend({ userId, text }) {
  const clean = String(text || "").trim();
  const normalized = normalizeText(clean);
  const now = Date.now();

  if (!userId) {
    return {
      ok: false,
      code: "missing-user",
      message: "Missing user identity.",
    };
  }

  if (!clean) {
    return {
      ok: false,
      code: "empty-message",
      message: "Type a message first.",
    };
  }

  if (clean.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      code: "message-too-long",
      message: `Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`,
    };
  }

  const mentionMatches = clean.match(/(^|\s)@([a-zA-Z0-9_-]+)/g) || [];
  if (mentionMatches.length > MAX_MENTIONS_PER_MESSAGE) {
    return {
      ok: false,
      code: "too-many-mentions",
      message: `You can mention up to ${MAX_MENTIONS_PER_MESSAGE} people in one message.`,
    };
  }

  const history = pruneOld(
    messageHistoryByUser.get(userId) || [],
    MESSAGE_BURST_WINDOW_MS,
    now
  );

  const mostRecentTimestamp = history[history.length - 1] || 0;
  if (mostRecentTimestamp && now - mostRecentTimestamp < MESSAGE_COOLDOWN_MS) {
    const secondsLeft = Math.ceil(
      (MESSAGE_COOLDOWN_MS - (now - mostRecentTimestamp)) / 1000
    );

    return {
      ok: false,
      code: "cooldown",
      message: `Slow down a bit. Try again in ${secondsLeft}s.`,
    };
  }

  if (history.length >= MAX_MESSAGES_PER_WINDOW) {
    return {
      ok: false,
      code: "burst-limit",
      message: `You're sending too fast. Wait a few seconds and try again.`,
    };
  }

  const lastMessage = lastMessageByUser.get(userId);
  if (
    lastMessage &&
    lastMessage.normalized === normalized &&
    now - lastMessage.timestamp < DUPLICATE_WINDOW_MS
  ) {
    return {
      ok: false,
      code: "duplicate-message",
      message: "You already sent that message recently.",
    };
  }

  return {
    ok: true,
  };
}

export function recordSuccessfulMessageSend({ userId, text }) {
  const clean = String(text || "").trim();
  const normalized = normalizeText(clean);
  const now = Date.now();

  const history = pruneOld(
    messageHistoryByUser.get(userId) || [],
    MESSAGE_BURST_WINDOW_MS,
    now
  );

  history.push(now);
  messageHistoryByUser.set(userId, history);
  lastMessageByUser.set(userId, {
    normalized,
    timestamp: now,
  });
}

export function validateWaveBeforeSend(userId) {
  const now = Date.now();
  const lastWaveAt = lastWaveAtByUser.get(userId) || 0;

  if (!userId) {
    return {
      ok: false,
      code: "missing-user",
      message: "Missing user identity.",
    };
  }

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

  return { ok: true };
}

export function recordSuccessfulWave(userId) {
  if (!userId) return;
  lastWaveAtByUser.set(userId, Date.now());
}