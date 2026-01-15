"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@clerk/nextjs";

interface ScrapeProgress {
    progress: number;
    message: string;
    jobsFound?: number;
}

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
    extensionStatus: "ONLINE" | "OFFLINE";
    extensionInstalled: boolean;
    scrapeProgress: ScrapeProgress | null;
}

const SocketContext = createContext<SocketContextType>({
    socket: null,
    isConnected: false,
    extensionStatus: "OFFLINE",
    extensionInstalled: false,
    scrapeProgress: null,
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
    const { isSignedIn, getToken } = useAuth();
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [extensionStatus, setExtensionStatus] = useState<"ONLINE" | "OFFLINE">("OFFLINE");
    const [extensionInstalled, setExtensionInstalled] = useState(false);
    const [scrapeProgress, setScrapeProgress] = useState<ScrapeProgress | null>(null);
    const tokenSentRef = useRef(false);
    const socketRef = useRef<Socket | null>(null);
    const isConnectingRef = useRef(false);

    // Socket connection effect
    useEffect(() => {
        // Skip if not signed in or already connecting
        if (!isSignedIn || isConnectingRef.current) {
            return;
        }

        let isMounted = true;
        isConnectingRef.current = true;

        const connectSocket = async () => {
            try {
                const token = await getToken();

                if (!isMounted) return;

                const socketInstance = io(
                    process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3000",
                    {
                        auth: { token },
                        reconnection: true,
                        reconnectionAttempts: 10,
                        reconnectionDelay: 1000,
                    }
                );

                socketInstance.on("connect", () => {
                    console.log("[Socket] Connected to server:", socketInstance.id);
                    if (isMounted) {
                        setIsConnected(true);
                    }
                });

                socketInstance.on("disconnect", (reason) => {
                    console.log("[Socket] Disconnected:", reason);
                    if (isMounted) {
                        setIsConnected(false);
                        setExtensionStatus("OFFLINE");
                    }
                });

                socketInstance.on("STATUS_UPDATE", (data: { status: string }) => {
                    console.log("[Socket] Status update:", data);
                    if (!isMounted) return;

                    switch (data.status) {
                        case "CONNECTED":
                        case "EXTENSION_ONLINE":
                            setExtensionStatus("ONLINE");
                            break;
                        case "EXTENSION_OFFLINE":
                            setExtensionStatus("OFFLINE");
                            break;
                    }
                });

                // Listen for scrape progress
                socketInstance.on("SCRAPE_PROGRESS", (data: ScrapeProgress) => {
                    console.log("[Socket] Scrape progress:", data);
                    if (!isMounted) return;
                    setScrapeProgress(data);

                    // Clear progress after completion
                    if (data.progress >= 100) {
                        setTimeout(() => {
                            setScrapeProgress(null);
                        }, 3000);
                    }
                });

                socketInstance.on("connect_error", async (err) => {
                    console.error("[Socket] Connection error:", err.message);

                    // If auth error, try to refresh token
                    if (err.message.includes("token") || err.message.includes("auth")) {
                        console.log("[Socket] Auth error, refreshing token...");
                        const newToken = await getToken();
                        if (newToken && socketInstance && isMounted) {
                            socketInstance.auth = { token: newToken };
                            socketInstance.connect();
                        }
                    }
                });

                socketRef.current = socketInstance;
                if (isMounted) {
                    setSocket(socketInstance);
                }
            } catch (err) {
                console.error("[Socket] Failed to connect:", err);
            } finally {
                isConnectingRef.current = false;
            }
        };

        connectSocket();

        return () => {
            isMounted = false;
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [isSignedIn, getToken]);

    // Handle sign out - disconnect socket and notify extension
    useEffect(() => {
        if (!isSignedIn && socket) {
            console.log("[Socket] Signed out, disconnecting...");
            socket.disconnect();
            setSocket(null);
            socketRef.current = null;
            setIsConnected(false);
            setExtensionStatus("OFFLINE");
            tokenSentRef.current = false;

            // Notify extension of logout
            if (typeof window !== "undefined") {
                window.postMessage({ type: "CAS_LOGOUT" }, window.location.origin);
            }
        }
    }, [isSignedIn, socket]);

    // Listen for extension presence and send auth token
    useEffect(() => {
        if (typeof window === "undefined") return;

        const handleMessage = async (event: MessageEvent) => {
            // Only accept messages from same origin
            if (event.origin !== window.location.origin) return;

            const message = event.data;

            // Extension announced its presence
            if (message?.type === "CAS_EXTENSION_PRESENT") {
                console.log("[Socket] Extension detected:", message.extensionId);
                setExtensionInstalled(true);

                // Send auth token if signed in and not already sent
                if (isSignedIn && !tokenSentRef.current) {
                    try {
                        const token = await getToken();
                        if (token) {
                            console.log("[Socket] Sending auth token to extension...");
                            window.postMessage({
                                type: "CAS_AUTH_TOKEN",
                                token,
                            }, window.location.origin);
                            tokenSentRef.current = true;
                        }
                    } catch (err) {
                        console.error("[Socket] Failed to get token for extension:", err);
                    }
                }
            }

            // Extension status response
            if (message?.type === "CAS_EXTENSION_STATUS") {
                setExtensionInstalled(message.installed ?? false);
                if (message.status === "CONNECTED") {
                    setExtensionStatus("ONLINE");
                }
            }

            // Auth response from extension
            if (message?.type === "CAS_AUTH_RESPONSE") {
                console.log("[Socket] Extension auth response:", message);
            }

            // Extension requesting fresh token (for reconnection)
            if (message?.type === "CAS_REQUEST_FRESH_TOKEN") {
                console.log("[Socket] Extension requesting fresh token...");
                if (isSignedIn) {
                    try {
                        const token = await getToken();
                        if (token) {
                            console.log("[Socket] Sending fresh token to extension...");
                            window.postMessage({
                                type: "CAS_AUTH_TOKEN",
                                token,
                            }, window.location.origin);
                        }
                    } catch (err) {
                        console.error("[Socket] Failed to get fresh token:", err);
                    }
                }
            }
        };

        window.addEventListener("message", handleMessage);

        // Check for extension presence
        window.postMessage({ type: "CAS_CHECK_EXTENSION" }, window.location.origin);

        return () => {
            window.removeEventListener("message", handleMessage);
        };
    }, [isSignedIn, getToken]);

    // Re-send token when user signs in (if extension is installed)
    useEffect(() => {
        if (!isSignedIn || !extensionInstalled || tokenSentRef.current || typeof window === "undefined") {
            return;
        }

        const sendTokenToExtension = async () => {
            try {
                const token = await getToken();
                if (token) {
                    console.log("[Socket] Sending auth token to extension (on sign in)...");
                    window.postMessage({
                        type: "CAS_AUTH_TOKEN",
                        token,
                    }, window.location.origin);
                    tokenSentRef.current = true;
                }
            } catch (err) {
                console.error("[Socket] Failed to send token to extension:", err);
            }
        };

        sendTokenToExtension();
    }, [isSignedIn, extensionInstalled, getToken]);

    return (
        <SocketContext.Provider value={{ socket, isConnected, extensionStatus, extensionInstalled, scrapeProgress }}>
            {children}
        </SocketContext.Provider>
    );
};
