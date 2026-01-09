import { useState, useEffect } from "react"

function IndexPopup() {
  const [status, setStatus] = useState("CHECKING...");
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Check socket status from background
    chrome.runtime.sendMessage({ type: "GET_STATUS" }, (res) => {
      if (chrome.runtime.lastError) {
        setStatus("ERROR");
        setMessage(chrome.runtime.lastError.message || "Unknown error");
        return;
      }
      if (res && res.status) {
        setStatus(res.status);
        if (res.error) setMessage(res.error);
      }
    });
  }, []);

  const handleSimulateScrape = () => {
    setMessage("Sending...");
    chrome.runtime.sendMessage({ type: "SIMULATE_SCRAPE" }, (res) => {
      if (chrome.runtime.lastError) {
        setMessage("Error: " + chrome.runtime.lastError.message);
        return;
      }
      if (res && res.success) {
        setMessage("SUCCESS! Job sent to Dashboard.");
      } else {
        setMessage("Failed: " + (res?.error || "Unknown"));
      }
    });
  };

  const handleTestHTTP = async () => {
    setMessage("Testing HTTP...");
    try {
      const res = await fetch("http://127.0.0.1:3000/api/jobs");
      if (res.ok) {
        setMessage("HTTP OK - Server is reachable!");
      } else {
        setMessage("HTTP Error: " + res.status);
      }
    } catch (e: any) {
      setMessage("HTTP Failed: " + e.message);
    }
  };

  return (
    <div style={{
      padding: 20,
      width: 280,
      fontFamily: "system-ui, sans-serif",
      background: "#1a1a2e",
      color: "white"
    }}>
      {/* VERSION INDICATOR - SHOULD BE VERY VISIBLE */}
      <div style={{
        background: "#e94560",
        color: "white",
        padding: "4px 8px",
        borderRadius: 4,
        fontSize: 10,
        marginBottom: 12,
        textAlign: "center",
        fontWeight: "bold"
      }}>
        🔴 VERSION 2.0 - FRESH BUILD 🔴
      </div>

      <h2 style={{ fontSize: 18, marginBottom: 16, color: "#eee" }}>
        Agency OS Link
      </h2>

      {/* Status Badge */}
      <div style={{
        padding: 10,
        backgroundColor: status === "CONNECTED" ? "#16a34a" : "#dc2626",
        borderRadius: 6,
        marginBottom: 16,
        textAlign: "center",
        fontWeight: "bold"
      }}>
        {status}
      </div>

      {/* Message Display */}
      {message && (
        <div style={{
          padding: 8,
          background: "#2a2a4e",
          borderRadius: 4,
          marginBottom: 12,
          fontSize: 12,
          wordBreak: "break-word"
        }}>
          {message}
        </div>
      )}

      {/* Buttons */}
      <button
        onClick={handleSimulateScrape}
        style={{
          width: "100%",
          padding: "10px 16px",
          backgroundColor: "#7c3aed",
          color: "white",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          fontWeight: "600",
          marginBottom: 8,
          fontSize: 14
        }}
      >
        🚀 Simulate Scrape
      </button>

      <button
        onClick={handleTestHTTP}
        style={{
          width: "100%",
          padding: "10px 16px",
          backgroundColor: "#0ea5e9",
          color: "white",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          fontWeight: "600",
          fontSize: 14
        }}
      >
        🔗 Test HTTP Connection
      </button>
    </div>
  )
}

export default IndexPopup
