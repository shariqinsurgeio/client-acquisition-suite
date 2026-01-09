"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
    extensionStatus: "ONLINE" | "OFFLINE";
}

const SocketContext = createContext<SocketContextType>({
    socket: null,
    isConnected: false,
    extensionStatus: "OFFLINE",
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [extensionStatus, setExtensionStatus] = useState<"ONLINE" | "OFFLINE">("OFFLINE");

    useEffect(() => {
        const socketInstance = io("http://localhost:3000", {
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
        });

        socketInstance.on("connect", () => {
            console.log("[Socket] Connected to server:", socketInstance.id);
            setIsConnected(true);
        });

        socketInstance.on("disconnect", (reason) => {
            console.log("[Socket] Disconnected:", reason);
            setIsConnected(false);
            setExtensionStatus("OFFLINE");
        });

        socketInstance.on("STATUS_UPDATE", (data: { status: string }) => {
            console.log("[Socket] Status update:", data);

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

        socketInstance.on("connect_error", (err) => {
            console.error("[Socket] Connection error:", err.message);
        });

        setSocket(socketInstance);

        return () => {
            socketInstance.disconnect();
        };
    }, []);

    return (
        <SocketContext.Provider value={{ socket, isConnected, extensionStatus }}>
            {children}
        </SocketContext.Provider>
    );
};
