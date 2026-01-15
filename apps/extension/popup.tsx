import { useState, useEffect, useCallback } from "react"

interface ExtensionStatus {
  status: string;
  error?: string;
  connectsBalance?: number;
  activeProposals?: number;
  lastSyncedAt?: string;
  jobsScrapedToday?: number;
}

function IndexPopup() {
  const [extStatus, setExtStatus] = useState<ExtensionStatus>({ status: "CHECKING..." });
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("");

  // Fetch status from background
  const fetchStatus = useCallback(() => {
    chrome.runtime.sendMessage({ type: "GET_STATUS" }, (res) => {
      if (chrome.runtime.lastError) {
        setExtStatus({
          status: "ERROR",
          error: chrome.runtime.lastError.message || "Unknown error",
        });
        return;
      }
      if (res) {
        setExtStatus(res);
      }
    });
  }, []);

  // Get current tab URL
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url) {
        setCurrentUrl(tabs[0].url);
      }
    });
  }, []);

  useEffect(() => {
    fetchStatus();
    // Refresh status every 5 seconds
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleScrapeCurrentPage = async () => {
    setIsLoading(true);
    setMessage("Scraping current page...");

    chrome.runtime.sendMessage({ type: "SCRAPE_CURRENT_PAGE" }, (res) => {
      setIsLoading(false);
      if (chrome.runtime.lastError) {
        setMessage("Error: " + chrome.runtime.lastError.message);
        return;
      }
      if (res?.success) {
        setMessage(`Found ${res.jobCount || 0} jobs!`);
        // Refresh status after scrape
        setTimeout(fetchStatus, 1000);
      } else {
        setMessage("Failed: " + (res?.error || "Unknown error"));
      }
    });
  };

  const handleSimulateScrape = () => {
    setMessage("Sending test job...");
    chrome.runtime.sendMessage({ type: "SIMULATE_SCRAPE" }, (res) => {
      if (chrome.runtime.lastError) {
        setMessage("Error: " + chrome.runtime.lastError.message);
        return;
      }
      if (res?.success) {
        setMessage("Test job sent to dashboard!");
      } else {
        setMessage("Failed: " + (res?.error || "Unknown"));
      }
    });
  };

  const handleSyncProfile = () => {
    setMessage("Syncing profile...");
    chrome.runtime.sendMessage({ type: "SYNC_PROFILE" }, (res) => {
      if (chrome.runtime.lastError) {
        setMessage("Error: " + chrome.runtime.lastError.message);
        return;
      }
      if (res?.success) {
        setMessage("Profile synced!");
        setTimeout(fetchStatus, 1000);
      } else {
        setMessage("Sync failed: " + (res?.error || "Unknown"));
      }
    });
  };

  const handleCaptureDom = () => {
    setIsLoading(true);
    setMessage("Capturing page structure...");
    chrome.runtime.sendMessage({ type: "CAPTURE_DOM" }, (res) => {
      setIsLoading(false);
      if (chrome.runtime.lastError) {
        setMessage("Error: " + chrome.runtime.lastError.message);
        return;
      }
      if (res?.success) {
        setMessage(`DOM captured! Type: ${res.pageType} (${res.dataAttributeCount} data attrs)`);
      } else {
        setMessage("Capture failed: " + (res?.error || "Unknown"));
      }
    });
  };

  const handleReconnect = () => {
    setMessage("Reconnecting...");
    chrome.runtime.sendMessage({ type: "FORCE_RECONNECT" }, (res) => {
      if (chrome.runtime.lastError) {
        setMessage("Error: " + chrome.runtime.lastError.message);
        return;
      }
      if (res?.success) {
        setMessage("Reconnection initiated!");
        setTimeout(fetchStatus, 2000);
      } else {
        setMessage("Reconnect failed: " + (res?.error || "No auth token - open Dashboard first"));
      }
    });
  };

  const handleOpenDashboard = () => {
    chrome.tabs.create({ url: "http://localhost:3000/v2" });
  };

  const isUpworkPage = currentUrl.includes("upwork.com");
  const isConnected = extStatus.status === "CONNECTED";

  // Format last synced time
  const formatLastSync = (isoString?: string) => {
    if (!isoString) return "Never";
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div style={{
      padding: 16,
      width: 320,
      fontFamily: "system-ui, -apple-system, sans-serif",
      background: "linear-gradient(180deg, #0f0f1a 0%, #1a1a2e 100%)",
      color: "white",
      minHeight: 400,
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
          }}>
            🎯
          </div>
          <div>
            <h1 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "#fff" }}>
              Client Acquisition
            </h1>
            <span style={{ fontSize: 10, color: "#888" }}>Grandmaster Edition</span>
          </div>
        </div>
        <div style={{
          padding: "4px 8px",
          borderRadius: 12,
          fontSize: 10,
          fontWeight: 600,
          background: isConnected ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)",
          color: isConnected ? "#22c55e" : "#ef4444",
          border: `1px solid ${isConnected ? "#22c55e" : "#ef4444"}`,
        }}>
          {isConnected ? "● Online" : "● Offline"}
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
        marginBottom: 16,
      }}>
        {/* Connects Balance */}
        <div style={{
          background: "rgba(124, 58, 237, 0.15)",
          border: "1px solid rgba(124, 58, 237, 0.3)",
          borderRadius: 12,
          padding: 12,
        }}>
          <div style={{ fontSize: 10, color: "#a78bfa", marginBottom: 4 }}>Connects</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>
            {extStatus.connectsBalance ?? "—"}
          </div>
        </div>

        {/* Active Proposals */}
        <div style={{
          background: "rgba(59, 130, 246, 0.15)",
          border: "1px solid rgba(59, 130, 246, 0.3)",
          borderRadius: 12,
          padding: 12,
        }}>
          <div style={{ fontSize: 10, color: "#60a5fa", marginBottom: 4 }}>Active Proposals</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>
            {extStatus.activeProposals ?? "—"}
          </div>
        </div>

        {/* Jobs Today */}
        <div style={{
          background: "rgba(34, 197, 94, 0.15)",
          border: "1px solid rgba(34, 197, 94, 0.3)",
          borderRadius: 12,
          padding: 12,
        }}>
          <div style={{ fontSize: 10, color: "#4ade80", marginBottom: 4 }}>Scraped Today</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>
            {extStatus.jobsScrapedToday ?? 0}
          </div>
        </div>

        {/* Last Sync */}
        <div style={{
          background: "rgba(251, 191, 36, 0.15)",
          border: "1px solid rgba(251, 191, 36, 0.3)",
          borderRadius: 12,
          padding: 12,
        }}>
          <div style={{ fontSize: 10, color: "#fbbf24", marginBottom: 4 }}>Last Sync</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>
            {formatLastSync(extStatus.lastSyncedAt)}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#888", marginBottom: 8, fontWeight: 600 }}>
          QUICK ACTIONS
        </div>

        {/* Primary Action - Scrape Current Page */}
        <button
          onClick={handleScrapeCurrentPage}
          disabled={!isConnected || !isUpworkPage || isLoading}
          style={{
            width: "100%",
            padding: "12px 16px",
            background: isUpworkPage && isConnected
              ? "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)"
              : "rgba(255, 255, 255, 0.1)",
            color: isUpworkPage && isConnected ? "white" : "#666",
            border: "none",
            borderRadius: 10,
            cursor: isUpworkPage && isConnected ? "pointer" : "not-allowed",
            fontWeight: 600,
            marginBottom: 8,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            transition: "all 0.2s",
          }}
        >
          {isLoading ? (
            <>
              <span style={{ animation: "spin 1s linear infinite" }}>⟳</span>
              Scraping...
            </>
          ) : (
            <>
              🔍 Scrape This Page
            </>
          )}
        </button>

        {!isUpworkPage && (
          <div style={{
            fontSize: 11,
            color: "#888",
            textAlign: "center",
            marginBottom: 8,
          }}>
            Navigate to Upwork to scrape jobs
          </div>
        )}

        {/* Secondary Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleSyncProfile}
            disabled={!isConnected}
            style={{
              flex: 1,
              padding: "10px 12px",
              background: "rgba(59, 130, 246, 0.2)",
              color: isConnected ? "#60a5fa" : "#666",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              borderRadius: 8,
              cursor: isConnected ? "pointer" : "not-allowed",
              fontWeight: 600,
              fontSize: 11,
            }}
          >
            🔄 Sync Profile
          </button>

          <button
            onClick={handleSimulateScrape}
            disabled={!isConnected}
            style={{
              flex: 1,
              padding: "10px 12px",
              background: "rgba(251, 191, 36, 0.2)",
              color: isConnected ? "#fbbf24" : "#666",
              border: "1px solid rgba(251, 191, 36, 0.3)",
              borderRadius: 8,
              cursor: isConnected ? "pointer" : "not-allowed",
              fontWeight: 600,
              fontSize: 11,
            }}
          >
            🧪 Test Send
          </button>
        </div>

        {/* Dev Tools - Capture DOM */}
        {isUpworkPage && (
          <button
            onClick={handleCaptureDom}
            disabled={!isConnected || isLoading}
            style={{
              width: "100%",
              marginTop: 8,
              padding: "10px 12px",
              background: "rgba(168, 85, 247, 0.2)",
              color: isConnected ? "#c084fc" : "#666",
              border: "1px solid rgba(168, 85, 247, 0.3)",
              borderRadius: 8,
              cursor: isConnected ? "pointer" : "not-allowed",
              fontWeight: 600,
              fontSize: 11,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            🔬 Capture DOM Structure
          </button>
        )}
      </div>

      {/* Message Display */}
      {message && (
        <div style={{
          padding: 10,
          background: message.includes("Error") || message.includes("Failed")
            ? "rgba(239, 68, 68, 0.2)"
            : "rgba(34, 197, 94, 0.2)",
          border: `1px solid ${message.includes("Error") || message.includes("Failed") ? "rgba(239, 68, 68, 0.3)" : "rgba(34, 197, 94, 0.3)"}`,
          borderRadius: 8,
          marginBottom: 12,
          fontSize: 12,
          color: message.includes("Error") || message.includes("Failed") ? "#fca5a5" : "#86efac",
        }}>
          {message}
        </div>
      )}

      {/* Connection Issue - Show Reconnect */}
      {(!isConnected || extStatus.error) && (
        <div style={{
          padding: 12,
          background: "rgba(239, 68, 68, 0.15)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: 10,
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 11, color: "#fca5a5", marginBottom: 8 }}>
            ⚠️ {extStatus.error || "Not connected to server"}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleReconnect}
              style={{
                flex: 1,
                padding: "8px 12px",
                background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 11,
              }}
            >
              🔄 Reconnect
            </button>
            <button
              onClick={handleOpenDashboard}
              style={{
                flex: 1,
                padding: "8px 12px",
                background: "rgba(124, 58, 237, 0.3)",
                color: "#a78bfa",
                border: "1px solid rgba(124, 58, 237, 0.5)",
                borderRadius: 6,
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 11,
              }}
            >
              Open Dashboard
            </button>
          </div>
          <div style={{ fontSize: 10, color: "#888", marginTop: 8, textAlign: "center" }}>
            Make sure you're signed in on the Dashboard first
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        marginTop: 16,
        paddingTop: 12,
        borderTop: "1px solid rgba(255, 255, 255, 0.1)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <span style={{ fontSize: 10, color: "#666" }}>
          v3.0 Grandmaster
        </span>
        <a
          href="http://localhost:3000/v2"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 11,
            color: "#7c3aed",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Open Dashboard →
        </a>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default IndexPopup
