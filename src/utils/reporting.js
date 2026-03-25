const REPORTING_TIMEOUT_MS = 8000;

function generateReportId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `report_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function getReportingConfig() {
  return {
    endpoint: safeTrim(import.meta.env.VITE_REPORTING_ENDPOINT || ""),
    provider: safeTrim(
      import.meta.env.VITE_REPORTING_PROVIDER || "formspree"
    ).toLowerCase(),
    token: safeTrim(import.meta.env.VITE_REPORTING_TOKEN || ""),
  };
}

export function buildReportPayload(input = {}) {
  const createdAt = input.createdAt || Date.now();

  return {
    reportId: input.reportId || generateReportId(),
    createdAt,
    source: "lanparty-web",
    appVersion: "phase1-moderation",
    type: input.type || "message",
    reason: safeTrim(input.reason),
    notes: safeTrim(input.notes),
    room: {
      id: input.room?.id || "",
      name: input.room?.name || "",
    },
    reporter: {
      id: input.reporter?.id || "",
      handle: input.reporter?.handle || "unknown",
      avatar: input.reporter?.avatar || "",
      awakeReason: input.reporter?.awakeReason || "",
    },
    target: {
      id: input.target?.id || "",
      type: input.target?.type || input.type || "message",
      displayName: input.target?.displayName || "Unknown",
      reportedUserId: input.target?.reportedUserId || "",
      reportedHandle: input.target?.reportedHandle || "",
      messageText: input.target?.messageText || "",
      messageCreatedAt: input.target?.messageCreatedAt || null,
    },
    context: {
      recentMessages: toArray(input.context?.recentMessages).map((message) => ({
        id: message?.id || "",
        userId: message?.userId || "",
        user: message?.user || "",
        text: message?.text || "",
        type: message?.type || "message",
        createdAt: message?.createdAt || null,
      })),
    },
    meta: {
      url:
        typeof window !== "undefined"
          ? `${window.location.origin}${window.location.pathname}`
          : "",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    },
  };
}

function validatePayload(payload) {
  if (!payload?.reportId) {
    return { ok: false, error: "Missing reportId." };
  }

  if (!payload?.reason) {
    return { ok: false, error: "Missing report reason." };
  }

  if (!payload?.reporter?.id) {
    return { ok: false, error: "Missing reporter." };
  }

  if (!payload?.target?.id) {
    return { ok: false, error: "Missing report target." };
  }

  if (!payload?.room?.id) {
    return { ok: false, error: "Missing room." };
  }

  return { ok: true };
}

async function postJson(url, body, token, extraHeaders = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REPORTING_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...extraHeaders,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);
    const text = !data ? await response.text().catch(() => "") : "";

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error:
          data?.errors?.map((entry) => entry.message).join(", ") ||
          text ||
          `Request failed with status ${response.status}.`,
      };
    }

    return {
      ok: true,
      status: response.status,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error?.name === "AbortError"
          ? "Reporting request timed out."
          : error?.message || "Reporting request failed.",
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

async function submitToWebhook(payload, config) {
  return postJson(config.endpoint, payload, config.token);
}

async function submitToFormspree(payload, config) {
  const recentMessages = (payload.context?.recentMessages || [])
    .slice(-6)
    .map((msg) => {
      const name = msg.user || "Unknown";
      const text = msg.text || "";
      return `${name}: ${text}`;
    })
    .join("\n");

  const formspreeBody = {
    subject: `[Nite's Watch Report] ${payload.reason} • ${payload.target.displayName}`,
    message: [
      `Nite's Watchmoderation report`,
      ``,
      `Report ID: ${payload.reportId}`,
      `Created: ${new Date(payload.createdAt).toISOString()}`,
      `Type: ${payload.type}`,
      `Reason: ${payload.reason}`,
      `Notes: ${payload.notes || "(none)"}`,
      ``,
      `Room: ${payload.room.name} (${payload.room.id})`,
      ``,
      `Reporter`,
      `- ID: ${payload.reporter.id}`,
      `- Handle: ${payload.reporter.handle}`,
      `- Avatar: ${payload.reporter.avatar || "(none)"}`,
      `- Awake Reason: ${payload.reporter.awakeReason || "(none)"}`,
      ``,
      `Target`,
      `- ID: ${payload.target.id}`,
      `- Type: ${payload.target.type}`,
      `- Display Name: ${payload.target.displayName}`,
      `- Reported User ID: ${payload.target.reportedUserId}`,
      `- Reported Handle: ${payload.target.reportedHandle || "(none)"}`,
      `- Message Text: ${payload.target.messageText || "(none)"}`,
      `- Message Created At: ${payload.target.messageCreatedAt || "(none)"}`,
      ``,
      `Recent Chat Context`,
      recentMessages || "(no recent messages)",
      ``,
      `Meta`,
      `- URL: ${payload.meta?.url || "(none)"}`,
      `- User Agent: ${payload.meta?.userAgent || "(none)"}`,
      `- Timezone: ${payload.meta?.timezone || "(none)"}`,
    ].join("\n"),
  };

  return postJson(config.endpoint, formspreeBody, config.token);
}

export async function submitReport(input = {}) {
  const payload = buildReportPayload(input);
  const validation = validatePayload(payload);
  const config = getReportingConfig();

  console.log("REPORTING CONFIG", config);

  if (!validation.ok) {
    return {
      ok: false,
      delivered: false,
      delivery: "invalid",
      reportId: payload.reportId,
      error: validation.error,
    };
  }

  if (!config.endpoint) {
    return {
      ok: true,
      delivered: false,
      delivery: "skipped",
      reportId: payload.reportId,
    };
  }

  let result;

  if (config.provider === "formspree") {
    result = await submitToFormspree(payload, config);
  } else {
    result = await submitToWebhook(payload, config);
  }

  console.log("REPORTING RESULT", result);

  if (!result.ok) {
    return {
      ok: false,
      delivered: false,
      delivery: "failed",
      reportId: payload.reportId,
      error: result.error || "External reporting failed.",
      status: result.status || null,
    };
  }

  return {
    ok: true,
    delivered: true,
    delivery: config.provider,
    reportId: payload.reportId,
    status: result.status || null,
  };
}