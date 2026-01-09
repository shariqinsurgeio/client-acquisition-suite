"use client";

import {
    Briefcase,
    Calendar,
    ExternalLink,
    Bookmark,
    BookmarkCheck,
    Archive,
    ChevronDown,
    ChevronUp,
    TrendingUp,
    Filter,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSocket } from "@/context/SocketContext";

interface Job {
    id: string;
    title: string;
    platform: string;
    description: string;
    url: string;
    status: string;
    fitScore: number | null;
    createdAt: string;
}

type SortBy = "fitScore" | "createdAt";
type FilterStatus = "ALL" | "NEW" | "SAVED" | "APPLIED";

export const JobFeed = () => {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<SortBy>("fitScore");
    const [filterStatus, setFilterStatus] = useState<FilterStatus>("ALL");
    const { socket } = useSocket();

    // Fetch initial jobs
    useEffect(() => {
        fetch("/api/jobs")
            .then((res) => res.json())
            .then((data) => {
                if (Array.isArray(data)) setJobs(data);
            })
            .catch((err) => console.error("Failed to fetch jobs:", err));
    }, []);

    // Listen for real-time job updates
    useEffect(() => {
        if (!socket) return;

        const handleJobUpdate = (newJob: Job) => {
            setJobs((prev) => {
                // Check if job already exists
                const exists = prev.some((j) => j.id === newJob.id);
                if (exists) {
                    return prev.map((j) => (j.id === newJob.id ? newJob : j));
                }
                return [newJob, ...prev];
            });
        };

        socket.on("JOB_UPDATE", handleJobUpdate);

        return () => {
            socket.off("JOB_UPDATE", handleJobUpdate);
        };
    }, [socket]);

    // Update job status
    const updateJobStatus = async (jobId: string, status: string) => {
        try {
            await fetch(`/api/jobs/${jobId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });

            setJobs((prev) =>
                prev.map((j) => (j.id === jobId ? { ...j, status } : j))
            );
        } catch (err) {
            console.error("Failed to update job status:", err);
        }
    };

    // Sort and filter jobs
    const processedJobs = jobs
        .filter((job) => {
            if (filterStatus === "ALL") return true;
            return job.status === filterStatus;
        })
        .sort((a, b) => {
            if (sortBy === "fitScore") {
                return (b.fitScore ?? 0) - (a.fitScore ?? 0);
            }
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

    // Get fit score color
    const getFitScoreColor = (score: number | null) => {
        if (score === null) return "bg-gray-100 text-gray-600";
        if (score >= 70) return "bg-green-100 text-green-700";
        if (score >= 50) return "bg-yellow-100 text-yellow-700";
        return "bg-red-100 text-red-600";
    };

    // Get platform badge color
    const getPlatformColor = (platform: string) => {
        switch (platform) {
            case "UPWORK":
                return "bg-green-100 text-green-700";
            case "LINKEDIN":
                return "bg-blue-100 text-blue-700";
            case "FIVERR":
                return "bg-teal-100 text-teal-700";
            case "FREELANCER":
                return "bg-orange-100 text-orange-700";
            default:
                return "bg-gray-100 text-gray-600";
        }
    };

    return (
        <div className="h-full flex flex-col bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            {/* Header with controls */}
            <div className="p-4 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                        <Briefcase className="w-4 h-4" /> Live Job Feed
                        <span className="text-sm font-normal text-gray-500">
                            ({processedJobs.length} jobs)
                        </span>
                    </h2>
                </div>

                {/* Sort & Filter Controls */}
                <div className="flex items-center gap-3">
                    {/* Sort */}
                    <div className="flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4 text-gray-400" />
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as SortBy)}
                            className="text-sm border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="fitScore">Best Fit</option>
                            <option value="createdAt">Most Recent</option>
                        </select>
                    </div>

                    {/* Filter */}
                    <div className="flex items-center gap-1.5">
                        <Filter className="w-4 h-4 text-gray-400" />
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                            className="text-sm border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="ALL">All Jobs</option>
                            <option value="NEW">New</option>
                            <option value="SAVED">Saved</option>
                            <option value="APPLIED">Applied</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Job List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {processedJobs.length === 0 && (
                    <div className="text-center text-gray-500 py-10">
                        <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p className="font-medium">No jobs found</p>
                        <p className="text-sm mt-1">
                            {filterStatus !== "ALL"
                                ? "Try changing the filter"
                                : "Click 'Scrape Upwork' to fetch jobs"}
                        </p>
                    </div>
                )}

                {processedJobs.map((job) => (
                    <div
                        key={job.id}
                        className={`border rounded-lg transition-all ${
                            expandedId === job.id
                                ? "border-indigo-300 shadow-md"
                                : "border-gray-100 hover:border-indigo-200 hover:shadow-sm"
                        }`}
                    >
                        {/* Job Card Header */}
                        <div className="p-4">
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    {/* Platform Badge */}
                                    <span
                                        className={`text-xs font-bold px-2 py-0.5 rounded ${getPlatformColor(
                                            job.platform
                                        )}`}
                                    >
                                        {job.platform}
                                    </span>

                                    {/* Fit Score Badge */}
                                    <span
                                        className={`text-xs font-bold px-2 py-0.5 rounded ${getFitScoreColor(
                                            job.fitScore
                                        )}`}
                                    >
                                        {job.fitScore ?? "?"} Fit
                                    </span>

                                    {/* Status Badge */}
                                    {job.status !== "NEW" && (
                                        <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">
                                            {job.status}
                                        </span>
                                    )}
                                </div>

                                {/* Timestamp */}
                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(job.createdAt).toLocaleTimeString()}
                                </span>
                            </div>

                            {/* Title */}
                            <h3 className="font-medium text-gray-900 mb-1 line-clamp-2">
                                {job.title}
                            </h3>

                            {/* Description Preview */}
                            <p
                                className={`text-sm text-gray-500 ${
                                    expandedId === job.id ? "" : "line-clamp-2"
                                }`}
                            >
                                {job.description}
                            </p>

                            {/* Action Buttons */}
                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                                <div className="flex items-center gap-2">
                                    {/* Save/Unsave */}
                                    <button
                                        onClick={() =>
                                            updateJobStatus(
                                                job.id,
                                                job.status === "SAVED" ? "NEW" : "SAVED"
                                            )
                                        }
                                        className={`p-1.5 rounded-md transition-colors ${
                                            job.status === "SAVED"
                                                ? "bg-indigo-100 text-indigo-600"
                                                : "hover:bg-gray-100 text-gray-500"
                                        }`}
                                        title={job.status === "SAVED" ? "Unsave" : "Save"}
                                    >
                                        {job.status === "SAVED" ? (
                                            <BookmarkCheck className="w-4 h-4" />
                                        ) : (
                                            <Bookmark className="w-4 h-4" />
                                        )}
                                    </button>

                                    {/* Archive */}
                                    <button
                                        onClick={() => updateJobStatus(job.id, "ARCHIVED")}
                                        className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
                                        title="Archive"
                                    >
                                        <Archive className="w-4 h-4" />
                                    </button>

                                    {/* Open on Platform */}
                                    <a
                                        href={job.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
                                        title="Open on platform"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                    </a>
                                </div>

                                {/* Expand/Collapse */}
                                <button
                                    onClick={() =>
                                        setExpandedId(expandedId === job.id ? null : job.id)
                                    }
                                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-600 transition-colors"
                                >
                                    {expandedId === job.id ? (
                                        <>
                                            <ChevronUp className="w-4 h-4" /> Less
                                        </>
                                    ) : (
                                        <>
                                            <ChevronDown className="w-4 h-4" /> More
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
