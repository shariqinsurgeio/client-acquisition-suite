import { useState, useEffect } from "react"

function IndexPopup() {
  const [status, setStatus] = useState("CHECKING...");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_STATUS" }, (res) => {
      if (chrome.runtime.lastError) {
        setStatus("ERROR");
        setError(chrome.runtime.lastError.message || "Unknown error");
        return;
      }
      if (res) {
        setStatus(res.status || "DISCONNECTED");
        setIsAuthenticated(res.isAuthenticated || false);
        if (res.error) setError(res.error);
      }
    });
  }, []);

  const openDashboard = () => {
    // Get the API URL from environment or use default
    const dashboardUrl = process.env.PLASMO_PUBLIC_API_URL || "http://localhost:3000";
    chrome.tabs.create({ url: dashboardUrl });
  };

  const handleReconnect = () => {
    setStatus("RECONNECTING...");
    setError("");
    chrome.runtime.sendMessage({ type: "FORCE_RECONNECT" }, (res) => {
      if (res?.success) {
        setStatus("CONNECTED");
      } else {
        setStatus("DISCONNECTED");
        setError(res?.error || "Reconnection failed");
      }
    });
  };

  const isConnected = status === "CONNECTED";

  return (
    <div style={{
      padding: 20,
      width: 300,
      fontFamily: "system-ui, -apple-system, sans-serif",
      background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
      color: "white",
      minHeight: 200
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 20
      }}>
        <div style={{
          width: 36,
          height: 36,
          background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18
        }}>
          🎯
        </div>
        <div>
          <h1 style={{
            fontSize: 16,
            fontWeight: 700,
            margin: 0,
            color: "#f8fafc"
          }}>
            Client Acquisition Suite
          </h1>
          <p style={{
            fontSize: 11,
            margin: 0,
            color: "#94a3b8"
          }}>
            Job Lead Aggregator
          </p>
        </div>
      </div>

      {/* Status Card */}
      <div style={{
        background: "rgba(255,255,255,0.05)",
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        border: `1px solid ${isConnected ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 8
        }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: isConnected ? "#22c55e" : "#ef4444",
            boxShadow: isConnected
              ? "0 0 10px rgba(34, 197, 94, 0.5)"
              : "0 0 10px rgba(239, 68, 68, 0.5)"
          }} />
          <span style={{
            fontSize: 14,
            fontWeight: 600,
            color: isConnected ? "#22c55e" : "#ef4444"
          }}>
            {status}
          </span>
        </div>

        {isAuthenticated && (
          <p style={{
            fontSize: 12,
            color: "#94a3b8",
            margin: 0
          }}>
            ✓ Signed in to dashboard
          </p>
        )}

        {!isAuthenticated && !error && (
          <p style={{
            fontSize: 12,
            color: "#f59e0b",
            margin: 0
          }}>
            ⚠ Sign in to dashboard to connect
          </p>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div style={{
          padding: 12,
          background: "rgba(239, 68, 68, 0.1)",
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 12,
          color: "#fca5a5",
          border: "1px solid rgba(239, 68, 68, 0.2)"
        }}>
          {error}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          onClick={openDashboard}
          style={{
            width: "100%",
            padding: "12px 16px",
            background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            transition: "transform 0.1s, box-shadow 0.1s"
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(124, 58, 237, 0.4)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          📊 Open Dashboard
        </button>

        {!isConnected && (
          <button
            onClick={handleReconnect}
            style={{
              width: "100%",
              padding: "10px 16px",
              background: "transparent",
              color: "#94a3b8",
              border: "1px solid rgba(148, 163, 184, 0.3)",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 500,
              fontSize: 13,
              transition: "all 0.1s"
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = "rgba(148, 163, 184, 0.6)";
              e.currentTarget.style.color = "#e2e8f0";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = "rgba(148, 163, 184, 0.3)";
              e.currentTarget.style.color = "#94a3b8";
            }}
          >
            🔄 Reconnect
          </button>
        )}
      </div>

      {/* Footer */}
      <p style={{
        fontSize: 10,
        color: "#475569",
        textAlign: "center",
        marginTop: 16,
        marginBottom: 0
      }}>
        Scraping is triggered from the dashboard
      </p>
    </div>
  )
}

export default IndexPopup
