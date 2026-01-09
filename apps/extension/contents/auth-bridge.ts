import type { PlasmoCSConfig } from "plasmo";

// Content script that bridges auth between web dashboard and extension background

export const config: PlasmoCSConfig = {
  matches: ["http://localhost:3000/*", "http://127.0.0.1:3000/*", "https://*.onrender.com/*"],
  run_at: "document_start",
};

console.log("[AgencyOS Auth Bridge] Loaded on:", window.location.href);

// Listen for auth token messages from the web app
window.addEventListener("message", async (event) => {
  // Only accept messages from same origin
  if (event.origin !== window.location.origin) {
    return;
  }

  const message = event.data;

  // Handle auth token from dashboard
  if (message?.type === "AGENCYOS_AUTH_TOKEN") {
    console.log("[AgencyOS Auth Bridge] Received auth token from dashboard");

    try {
      const response = await chrome.runtime.sendMessage({
        type: "AUTH_TOKEN_FROM_DASHBOARD",
        token: message.token,
      });

      console.log("[AgencyOS Auth Bridge] Token forwarded to background:", response);

      // Notify the dashboard of success
      window.postMessage({
        type: "AGENCYOS_AUTH_RESPONSE",
        success: response?.success ?? false,
        status: response?.status,
      }, window.location.origin);
    } catch (err) {
      console.error("[AgencyOS Auth Bridge] Failed to forward token:", err);
      window.postMessage({
        type: "AGENCYOS_AUTH_RESPONSE",
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }, window.location.origin);
    }
  }

  // Handle logout from dashboard
  if (message?.type === "AGENCYOS_LOGOUT") {
    console.log("[AgencyOS Auth Bridge] Received logout from dashboard");

    try {
      const response = await chrome.runtime.sendMessage({
        type: "LOGOUT_FROM_DASHBOARD",
      });

      console.log("[AgencyOS Auth Bridge] Logout forwarded to background:", response);
    } catch (err) {
      console.error("[AgencyOS Auth Bridge] Failed to forward logout:", err);
    }
  }

  // Handle extension status check
  if (message?.type === "AGENCYOS_CHECK_EXTENSION") {
    console.log("[AgencyOS Auth Bridge] Extension check requested");

    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_STATUS",
      });

      window.postMessage({
        type: "AGENCYOS_EXTENSION_STATUS",
        installed: true,
        ...response,
      }, window.location.origin);
    } catch (err) {
      // Extension might not be responding
      window.postMessage({
        type: "AGENCYOS_EXTENSION_STATUS",
        installed: false,
        error: err instanceof Error ? err.message : String(err),
      }, window.location.origin);
    }
  }
});

// Announce extension presence to the page
window.postMessage({
  type: "AGENCYOS_EXTENSION_PRESENT",
  extensionId: chrome.runtime.id,
}, window.location.origin);
