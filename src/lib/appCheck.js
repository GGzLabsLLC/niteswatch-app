import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { app } from "./firebase";

let appCheckInstance = null;

export function initAppCheck() {
  if (appCheckInstance) return appCheckInstance;

  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  const siteKey = import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY;

  if (!siteKey) {
    console.error("[AppCheck] Missing VITE_RECAPTCHA_V3_SITE_KEY");
    return null;
  }

  // ✅ Stable local debug token (must be registered in Firebase App Check)
  if (isLocalhost) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN =
      "8808b0d6-7cc0-4ba9-89d5-9dfb1f9c1199";
  }

  try {
    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });

    console.log("[AppCheck] initialized", {
      mode: isLocalhost ? "debug" : "recaptcha-v3",
    });

    return appCheckInstance;
  } catch (error) {
    console.error("[AppCheck] init failed", error);
    return null;
  }
}