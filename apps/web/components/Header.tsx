"use client";

import { Activity, Wifi, WifiOff, RefreshCw, Loader2 } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { useSocket } from "@/context/SocketContext";
import { useState, useEffect } from "react";

interface ScrapeProgress {
    current: number;
    status: string;
}

export const Header = () => {
    const { isConnected, extensionStatus, socket } = useSocket();
    const [scraping, setScraping] = useState(false);
    const [progress, setProgress] = useState<ScrapeProgress | null>(null);
    const [notification, setNotification] = useState<string | null>(null);

    useEffect(() => {
        if (!socket) return;

        // Handle real-time scrape progress
        const handleProgress = (data: ScrapeProgress) => {
            setProgress(data);
        };

        // Handle task completion
        const handleTaskUpdate = (data: {
            status: string;
            message?: string;
            scraped?: number;
            error?: string;
        }) => {
            console.log("Task update:", data);
            setScraping(false);
            setProgress(null);

            if (data.status === "COMPLETED") {
                setNotification(`Scraped ${data.scraped || 0} jobs`);
            } else if (data.status === "ERROR") {
                setNotification(`Error: ${data.error}`);
            }

            // Clear notification after 5 seconds
            setTimeout(() => setNotification(null), 5000);
        };

        socket.on("SCRAPE_PROGRESS", handleProgress);
        socket.on("TASK_UPDATE", handleTaskUpdate);

        return () => {
            socket.off("SCRAPE_PROGRESS", handleProgress);
            socket.off("TASK_UPDATE", handleTaskUpdate);
        };
    }, [socket]);

    const handleScrapeUpwork = () => {
        if (!socket || !isConnected) {
            setNotification("Extension not connected!");
            setTimeout(() => setNotification(null), 3000);
            return;
        }

        setScraping(true);
        setProgress({ current: 0, status: "Starting..." });

        socket.emit("CMD_EXECUTE", {
            action: "SCRAPE",
            platform: "UPWORK",
            targetUrl: "https://www.upwork.com/nx/find-work/best-matches",
        });

        // Safety timeout (scraping can take up to 60s with scroll)
        setTimeout(() => {
            if (scraping) {
                setScraping(false);
                setProgress(null);
            }
        }, 60000);
    };

    return (
        <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
            <div className="flex items-center gap-2">
                <Activity className="w-6 h-6 text-indigo-600" />
                <h1 className="text-xl font-bold text-gray-900">Client Acquisition Suite</h1>
            </div>

            <div className="flex items-center gap-4">
                {/* Scrape Progress */}
                {scraping && progress && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="font-medium">{progress.current} jobs</span>
                        <span className="text-indigo-500">| {progress.status}</span>
                    </div>
                )}

                {/* Notification Toast */}
                {notification && !scraping && (
                    <div className="px-3 py-1.5 bg-gray-800 text-white text-sm rounded-lg">
                        {notification}
                    </div>
                )}

                {/* Scrape Button */}
                <button
                    onClick={handleScrapeUpwork}
                    disabled={!isConnected || scraping}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isConnected && !scraping
                            ? "bg-indigo-600 text-white hover:bg-indigo-700"
                            : "bg-gray-300 text-gray-500 cursor-not-allowed"
                    }`}
                >
                    <RefreshCw className={`w-4 h-4 ${scraping ? "animate-spin" : ""}`} />
                    {scraping ? "Scraping..." : "Scrape Upwork"}
                </button>

                {/* Extension Status Badge */}
                <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                        extensionStatus === "ONLINE"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                    }`}
                >
                    {extensionStatus === "ONLINE" ? (
                        <Wifi className="w-4 h-4" />
                    ) : (
                        <WifiOff className="w-4 h-4" />
                    )}
                    Extension: {extensionStatus}
                </div>

                {/* User Profile */}
                <UserButton
                    appearance={{
                        elements: {
                            avatarBox: "w-9 h-9",
                        },
                    }}
                />
            </div>
        </header>
    );
};
