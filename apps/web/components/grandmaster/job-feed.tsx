"use client";

import { useEffect, useState, useCallback } from "react";
import {
  MoreHorizontal,
  BadgeCheck,
  Link as LinkIcon,
  RefreshCw,
  Filter,
  TrendingUp,
  Clock,
  ExternalLink,
  Sparkles,
  List,
  Table2,
  Maximize2,
  Minimize2,
  X,
  ChevronDown,
  Search,
  SlidersHorizontal,
  Star,
  Target,
  Users,
  Gauge,
} from "lucide-react";
import { useSocket } from "@/context/SocketContext";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

import type { Job, Platform, JobStatus } from "@/lib/types";

interface JobFeedV2Props {
  onSelectJob: (job: Job) => void;
  selectedJobId?: string;
}

// Convert legacy job data to new format
function convertLegacyJob(legacyJob: Record<string, unknown>): Job {
  // Use winLikelihood as primary score if available, fallback to fitScore
  const winLikelihood = legacyJob.scoreWinLikelihood as number | undefined;
  const fitScore = (winLikelihood ?? legacyJob.fitScore as number) || 50;

  return {
    id: legacyJob.id as string,
    userId: legacyJob.userId as string,
    platform: ((legacyJob.platform as string) || "UPWORK") as Platform,
    title: legacyJob.title as string,
    description: legacyJob.description as string,
    url: legacyJob.url as string,
    status: ((legacyJob.status as string) || "NEW") as JobStatus,
    createdAt: new Date(legacyJob.createdAt as string),
    updatedAt: new Date((legacyJob.updatedAt as string) || (legacyJob.createdAt as string)),
    client: {
      name: legacyJob.clientName as string | undefined,
      location: (legacyJob.clientLocation as string) || "Unknown",
      country: legacyJob.clientCountry as string | undefined,
      totalSpent: (legacyJob.clientTotalSpent as number) || 0,
      avgHourlyPaid: (legacyJob.clientAvgHourly as number) || 0,
      hireRate: (legacyJob.clientHireRate as number) || 0,
      isPaymentVerified: (legacyJob.clientPaymentVerified as boolean) || false,
      reviewCount: legacyJob.clientReviewCount as number | undefined,
    },
    meta: {
      fitScore,
      connectsCost: (legacyJob.connectsCost as number) || 0,
      hasExternalLinks: (legacyJob.hasExternalLinks as boolean) || false,
      keywordsFound: [],
      dealBreakers: [],
      postedAgo: legacyJob.postedAgo as string | undefined,
      // Multi-score breakdown (Phase 2)
      scoreRelevance: legacyJob.scoreRelevance as number | undefined,
      scoreClientQuality: legacyJob.scoreClientQuality as number | undefined,
      scoreCompetition: legacyJob.scoreCompetition as number | undefined,
      scoreWinLikelihood: winLikelihood,
      // Shortlist (Phase 3)
      isShortlisted: (legacyJob.isShortlisted as boolean) || false,
      shortlistedAt: legacyJob.shortlistedAt ? new Date(legacyJob.shortlistedAt as string) : undefined,
    },
  };
}

type SortOption = "fitScore" | "newest" | "oldest" | "connects" | "budget";
type ViewMode = "list" | "table";

interface Filters {
  search: string;
  status: JobStatus[];
  minFitScore: number;
  hasLinks: boolean | null;
  paymentVerified: boolean | null;
  platforms: Platform[];
  shortlistedOnly: boolean;
}

const defaultFilters: Filters = {
  search: "",
  status: [],
  minFitScore: 0,
  hasLinks: null,
  paymentVerified: null,
  platforms: [],
  shortlistedOnly: false,
};

export function JobFeedV2({ onSelectJob, selectedJobId }: JobFeedV2Props) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("fitScore");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [isExpanded, setIsExpanded] = useState(false);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [updatingJobIds, setUpdatingJobIds] = useState<Set<string>>(new Set());
  const { socket, scrapeProgress, extensionStatus } = useSocket();
  const extensionConnected = extensionStatus === "ONLINE";

  // Fetch jobs
  const fetchJobs = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      console.log("[JobFeed] API response:", data?.length, "jobs");
      if (Array.isArray(data)) {
        const converted = data.map(convertLegacyJob);
        console.log("[JobFeed] Converted jobs:", converted.length, converted[0]?.title);
        setJobs(converted);
        setLastUpdate(new Date());
      } else {
        console.error("[JobFeed] API did not return array:", data);
      }
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Listen for real-time updates
  useEffect(() => {
    if (!socket) return;

    const handleJobUpdate = (newJob: Record<string, unknown>) => {
      console.log("[JobFeed] Received JOB_UPDATE:", newJob.id, newJob.title);
      const job = convertLegacyJob(newJob);
      setJobs((prev) => {
        const exists = prev.some((j) => j.id === job.id);
        if (exists) {
          return prev.map((j) => (j.id === job.id ? job : j));
        }
        return [job, ...prev];
      });
      setLastUpdate(new Date());
    };

    const handleTaskUpdate = (data: { status?: string; scraped?: number }) => {
      if (data.status === "COMPLETED" && data.scraped && data.scraped > 0) {
        setTimeout(() => fetchJobs(), 1500);
      }
    };

    // Handle enriched job updates (for single job update)
    const handleJobEnriched = (data: { jobId: string; url: string }) => {
      console.log("[JobFeed] Received JOB_ENRICHED:", data.jobId);
      // Remove from updating set
      setUpdatingJobIds((prev) => {
        const next = new Set(prev);
        next.delete(data.jobId);
        return next;
      });
      // Refetch to get updated job data
      fetchJobs();
    };

    // Handle task updates for individual job enrichment
    const handleEnrichmentTaskUpdate = (data: { status?: string; jobId?: string }) => {
      if (data.status === "COMPLETED" && data.jobId) {
        const jobId = data.jobId; // Capture for closure
        setUpdatingJobIds((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
      }
    };

    socket.on("JOB_UPDATE", handleJobUpdate);
    socket.on("TASK_UPDATE", handleTaskUpdate);
    socket.on("JOB_ENRICHED", handleJobEnriched);
    socket.on("TASK_UPDATE", handleEnrichmentTaskUpdate);
    return () => {
      socket.off("JOB_UPDATE", handleJobUpdate);
      socket.off("TASK_UPDATE", handleTaskUpdate);
      socket.off("JOB_ENRICHED", handleJobEnriched);
      socket.off("TASK_UPDATE", handleEnrichmentTaskUpdate);
    };
  }, [socket, fetchJobs]);

  useEffect(() => {
    if (scrapeProgress?.progress === 100) {
      setTimeout(() => fetchJobs(), 2000);
    }
  }, [scrapeProgress?.progress, fetchJobs]);

  // Filter and sort jobs
  const filteredAndSortedJobs = [...jobs]
    .filter((job) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        if (
          !job.title.toLowerCase().includes(searchLower) &&
          !job.description.toLowerCase().includes(searchLower)
        ) {
          return false;
        }
      }
      // Fit score filter
      if (job.meta.fitScore < filters.minFitScore) return false;
      // Has links filter
      if (filters.hasLinks !== null && job.meta.hasExternalLinks !== filters.hasLinks) return false;
      // Payment verified filter
      if (filters.paymentVerified !== null && job.client.isPaymentVerified !== filters.paymentVerified) return false;
      // Shortlist filter (Phase 3)
      if (filters.shortlistedOnly && !job.meta.isShortlisted) return false;
      // Status filter
      if (filters.status.length > 0 && !filters.status.includes(job.status)) return false;
      // Platform filter
      if (filters.platforms.length > 0 && !filters.platforms.includes(job.platform)) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "fitScore":
          return b.meta.fitScore - a.meta.fitScore;
        case "newest":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "connects":
          return (a.meta.connectsCost || 0) - (b.meta.connectsCost || 0);
        case "budget":
          return (b.client.totalSpent || 0) - (a.client.totalSpent || 0);
        default:
          return b.meta.fitScore - a.meta.fitScore;
      }
    });

  const activeFilterCount = [
    filters.search ? 1 : 0,
    filters.minFitScore > 0 ? 1 : 0,
    filters.hasLinks !== null ? 1 : 0,
    filters.shortlistedOnly ? 1 : 0,
    filters.paymentVerified !== null ? 1 : 0,
    filters.status.length > 0 ? 1 : 0,
    filters.platforms.length > 0 ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const clearFilters = () => setFilters(defaultFilters);

  const getFitScoreColor = (score: number) => {
    if (score >= 80) return "from-emerald-500 to-emerald-600 text-emerald-100";
    if (score >= 60) return "from-amber-500 to-amber-600 text-amber-100";
    return "from-zinc-500 to-zinc-600 text-zinc-100";
  };

  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Handle single job update (enrichment)
  const handleUpdateJob = useCallback((job: Job) => {
    if (!socket || !extensionConnected) {
      console.warn("[JobFeed] Cannot update job: socket or extension not connected");
      return;
    }

    if (updatingJobIds.has(job.id)) {
      console.warn("[JobFeed] Job is already being updated:", job.id);
      return;
    }

    console.log("[JobFeed] Triggering enrichment for job:", job.id);
    console.log("[JobFeed] Job URL:", job.url);
    console.log("[JobFeed] URL valid?", job.url?.startsWith("http"));

    // Validate URL before sending
    if (!job.url || !job.url.startsWith("http")) {
      console.error("[JobFeed] Invalid URL - cannot update job:", job.url);
      return;
    }

    // Add to updating set
    setUpdatingJobIds((prev) => new Set(prev).add(job.id));

    // Emit command to enrich this single job
    socket.emit("CMD_EXECUTE", {
      action: "ENRICH_JOBS",
      platform: "UPWORK",
      jobUrls: [job.url],
      singleJobId: job.id, // Include job ID for tracking
    });

    // Timeout to clear stuck state after 60 seconds
    setTimeout(() => {
      setUpdatingJobIds((prev) => {
        if (prev.has(job.id)) {
          console.warn("[JobFeed] Update job timed out:", job.id);
          const next = new Set(prev);
          next.delete(job.id);
          return next;
        }
        return prev;
      });
    }, 60000);
  }, [socket, extensionConnected, updatingJobIds]);

  // Render job card (list view)
  const renderJobCard = (job: Job, index: number) => (
    <div
      key={job.id}
      onClick={() => onSelectJob(job)}
      style={{ animationDelay: `${index * 30}ms` }}
      className={cn(
        "group relative p-4 rounded-xl cursor-pointer",
        "transition-all duration-200 ease-out",
        "border border-zinc-800/50",
        "hover:border-zinc-700/80 hover:bg-zinc-800/30",
        "hover:shadow-lg hover:shadow-black/20",
        "animate-in fade-in slide-in-from-bottom-1",
        selectedJobId === job.id && "bg-indigo-500/10 border-indigo-500/40 shadow-lg shadow-indigo-500/5"
      )}
    >
      {selectedJobId === job.id && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-indigo-500 rounded-r-full" />
      )}

      {/* Title Row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <h3 className="text-sm font-medium text-zinc-100 line-clamp-2 flex-1 group-hover:text-white transition-colors">
            {job.title}
          </h3>
          {updatingJobIds.has(job.id) && (
            <Badge className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30 text-[10px] px-2 py-0.5 font-medium shrink-0 animate-pulse">
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              Updating
            </Badge>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-700 text-zinc-100">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                window.open(job.url, "_blank");
              }}
              className="cursor-pointer text-zinc-100 focus:text-zinc-100 focus:bg-zinc-800"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open in Upwork
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-zinc-700" />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleUpdateJob(job);
              }}
              disabled={!extensionConnected || updatingJobIds.has(job.id)}
              className={cn(
                "cursor-pointer focus:bg-zinc-800",
                updatingJobIds.has(job.id)
                  ? "text-indigo-400"
                  : "text-zinc-100 focus:text-zinc-100"
              )}
            >
              <RefreshCw className={cn(
                "h-4 w-4 mr-2",
                updatingJobIds.has(job.id) && "animate-spin"
              )} />
              {updatingJobIds.has(job.id) ? "Updating..." : "Update Job"}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-zinc-700" />
            <DropdownMenuItem className="cursor-pointer text-red-400 focus:text-red-400 focus:bg-zinc-800">
              Dismiss
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Badges Row */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {/* Score Badge with Tooltip Breakdown */}
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold cursor-help",
                "bg-gradient-to-r shadow-sm",
                getFitScoreColor(job.meta.fitScore)
              )}>
                <TrendingUp className="h-3 w-3 mr-1" />
                {job.meta.fitScore}% Match
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-zinc-900/95 backdrop-blur-sm border-zinc-700/50 p-3 max-w-[200px]">
              <div className="space-y-2">
                <div className="text-xs font-semibold text-zinc-200 mb-2">Score Breakdown</div>
                {job.meta.scoreRelevance !== undefined && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center text-zinc-400">
                      <Target className="h-3 w-3 mr-1.5 text-indigo-400" />
                      Relevance
                    </span>
                    <span className="text-zinc-100 font-medium">{job.meta.scoreRelevance}%</span>
                  </div>
                )}
                {job.meta.scoreClientQuality !== undefined && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center text-zinc-400">
                      <Users className="h-3 w-3 mr-1.5 text-emerald-400" />
                      Client Quality
                    </span>
                    <span className="text-zinc-100 font-medium">{job.meta.scoreClientQuality}%</span>
                  </div>
                )}
                {job.meta.scoreCompetition !== undefined && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center text-zinc-400">
                      <Gauge className="h-3 w-3 mr-1.5 text-amber-400" />
                      Competition
                    </span>
                    <span className="text-zinc-100 font-medium">{job.meta.scoreCompetition}%</span>
                  </div>
                )}
                {job.meta.scoreWinLikelihood === undefined && (
                  <div className="text-[10px] text-zinc-500 italic">
                    Detailed scores available for newly scraped jobs
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Shortlist Badge */}
        {job.meta.isShortlisted && (
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] px-2 py-0.5 font-medium">
            <Star className="h-3 w-3 mr-1 fill-current" />
            Shortlisted
          </Badge>
        )}

        {job.meta.hasExternalLinks && (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] px-2 py-0.5 font-medium">
            <LinkIcon className="h-3 w-3 mr-1" />
            Has Link
          </Badge>
        )}

        {job.client.isPaymentVerified && (
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] px-2 py-0.5 font-medium">
            <BadgeCheck className="h-3 w-3 mr-1" />
            Verified
          </Badge>
        )}

        <Badge className="bg-purple-500/15 text-purple-400 border-purple-500/30 text-[10px] px-2 py-0.5 font-medium">
          {job.meta.connectsCost || 16} Connects
        </Badge>
      </div>

      {/* Sherlock Row - Client Name */}
      {job.client.name && (
        <div className="flex items-center gap-2 text-xs mb-3 p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
          <span className="text-amber-400 text-base">👋</span>
          <span className="text-zinc-300">
            Client: <span className="text-amber-300 font-medium">&quot;{job.client.name}&quot;</span>
          </span>
        </div>
      )}

      {/* Vitals Grid */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div className="flex flex-col">
          <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Avg Rate</span>
          <span className="text-zinc-100 font-medium">${job.client.avgHourlyPaid || 55}/hr</span>
        </div>
        <div className="flex flex-col">
          <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Hire Rate</span>
          <span className="text-zinc-100 font-medium">{job.client.hireRate || 42}%</span>
        </div>
        <div className="flex flex-col">
          <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Total Spent</span>
          <span className="text-zinc-100 font-medium">${(job.client.totalSpent || 0).toLocaleString()}</span>
        </div>
      </div>

      {/* Footer: Location & Timestamps */}
      <div className="mt-3 pt-2 border-t border-zinc-800/50 space-y-1.5">
        {/* Location Row */}
        {(job.client.location !== "Unknown" || job.client.country) && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-500">📍</span>
            <span className="text-zinc-400">
              {job.client.location !== "Unknown" ? job.client.location : job.client.country}
            </span>
          </div>
        )}

        {/* Timestamps Row */}
        <div className="flex items-center justify-between text-[10px]">
          {/* Posted on Upwork */}
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-600 uppercase tracking-wider">Posted:</span>
            <span className="text-zinc-400">{job.meta.postedAgo || "Unknown"}</span>
          </div>

          {/* When we scraped it */}
          <div
            className="flex items-center gap-1.5"
            title={`Scraped on ${job.createdAt.toLocaleString()}`}
          >
            <span className="text-zinc-600 uppercase tracking-wider">Scraped:</span>
            <span className="text-zinc-500">{formatTimeAgo(job.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );

  // Render table view
  const renderTableView = () => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-zinc-800/50 sticky top-0 z-10">
          <tr className="text-left text-xs text-zinc-400 uppercase tracking-wider">
            <th className="px-3 py-2 font-medium">Fit</th>
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium">Client</th>
            <th className="px-3 py-2 font-medium">Spent</th>
            <th className="px-3 py-2 font-medium">Rate</th>
            <th className="px-3 py-2 font-medium">Connects</th>
            <th className="px-3 py-2 font-medium">Links</th>
            <th className="px-3 py-2 font-medium">Posted</th>
            <th className="px-3 py-2 font-medium">Scraped</th>
            <th className="px-3 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {filteredAndSortedJobs.map((job) => (
            <tr
              key={job.id}
              onClick={() => onSelectJob(job)}
              className={cn(
                "cursor-pointer transition-colors hover:bg-zinc-800/30",
                selectedJobId === job.id && "bg-indigo-500/10"
              )}
            >
              <td className="px-3 py-2">
                <div className={cn(
                  "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold",
                  "bg-gradient-to-r",
                  getFitScoreColor(job.meta.fitScore)
                )}>
                  {job.meta.fitScore}
                </div>
              </td>
              <td className="px-3 py-2">
                <div className="max-w-[200px] truncate text-zinc-100 font-medium">{job.title}</div>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  {job.client.isPaymentVerified && (
                    <BadgeCheck className="h-3 w-3 text-blue-400" />
                  )}
                  <span className="text-zinc-400 text-xs truncate max-w-[100px]">
                    {job.client.country || job.client.location || "Unknown"}
                  </span>
                </div>
              </td>
              <td className="px-3 py-2 text-zinc-300">${(job.client.totalSpent || 0).toLocaleString()}</td>
              <td className="px-3 py-2 text-zinc-300">${job.client.avgHourlyPaid || 0}/hr</td>
              <td className="px-3 py-2 text-purple-400">{job.meta.connectsCost || 16}</td>
              <td className="px-3 py-2">
                {job.meta.hasExternalLinks ? (
                  <LinkIcon className="h-4 w-4 text-emerald-400" />
                ) : (
                  <span className="text-zinc-600">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-zinc-500 text-xs">{job.meta.postedAgo || "—"}</td>
              <td className="px-3 py-2 text-zinc-600 text-xs" title={job.createdAt.toLocaleString()}>
                {formatTimeAgo(job.createdAt)}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-6 w-6",
                      updatingJobIds.has(job.id)
                        ? "text-indigo-400"
                        : "text-zinc-500 hover:text-zinc-100"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUpdateJob(job);
                    }}
                    disabled={!extensionConnected || updatingJobIds.has(job.id)}
                    title="Update Job"
                  >
                    <RefreshCw className={cn("h-3 w-3", updatingJobIds.has(job.id) && "animate-spin")} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-zinc-500 hover:text-zinc-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(job.url, "_blank");
                    }}
                    title="Open in Upwork"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const MainContent = () => (
    <div className={cn(
      "h-full flex flex-col bg-zinc-900/50 backdrop-blur-sm",
      !isExpanded && "border-r border-zinc-800/50"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/80">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Scraped Jobs</h2>
          <Badge variant="outline" className="text-[10px] bg-zinc-800/50 border-zinc-700/50 text-zinc-400">
            {filteredAndSortedJobs.length}/{jobs.length}
          </Badge>
          {/* Active Filter Badges */}
          {filters.minFitScore > 0 && (
            <Badge className="text-[9px] bg-indigo-500/20 text-indigo-300 border-indigo-500/30">
              Fit {filters.minFitScore}+
            </Badge>
          )}
          {filters.hasLinks === true && (
            <Badge className="text-[9px] bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
              Has Links
            </Badge>
          )}
          {filters.paymentVerified === true && (
            <Badge className="text-[9px] bg-blue-500/20 text-blue-300 border-blue-500/30">
              Verified
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-zinc-800/50 rounded-lg p-0.5 mr-1">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-6 w-6 rounded",
                viewMode === "list" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-100"
              )}
              onClick={() => setViewMode("list")}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-6 w-6 rounded",
                viewMode === "table" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-100"
              )}
              onClick={() => setViewMode("table")}
            >
              <Table2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-7 w-7 text-zinc-400 hover:text-zinc-100",
              isRefreshing && "animate-spin"
            )}
            onClick={fetchJobs}
            disabled={isRefreshing}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>

          {/* Sort Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-zinc-100">
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-700 text-zinc-100 w-48">
              <DropdownMenuLabel className="text-zinc-400 text-xs">Sort By</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => setSortBy("fitScore")}
                className={cn("cursor-pointer text-zinc-100 focus:bg-zinc-800", sortBy === "fitScore" && "bg-indigo-500/20")}
              >
                <TrendingUp className="h-4 w-4 mr-2" />
                Best Fit First
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setSortBy("newest")}
                className={cn("cursor-pointer text-zinc-100 focus:bg-zinc-800", sortBy === "newest" && "bg-indigo-500/20")}
              >
                <Clock className="h-4 w-4 mr-2" />
                Newest First
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setSortBy("oldest")}
                className={cn("cursor-pointer text-zinc-100 focus:bg-zinc-800", sortBy === "oldest" && "bg-indigo-500/20")}
              >
                <Clock className="h-4 w-4 mr-2 rotate-180" />
                Oldest First
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setSortBy("connects")}
                className={cn("cursor-pointer text-zinc-100 focus:bg-zinc-800", sortBy === "connects" && "bg-indigo-500/20")}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Lowest Connects
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setSortBy("budget")}
                className={cn("cursor-pointer text-zinc-100 focus:bg-zinc-800", sortBy === "budget" && "bg-indigo-500/20")}
              >
                <TrendingUp className="h-4 w-4 mr-2" />
                Highest Spender
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Filter Button */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-7 w-7 relative",
              activeFilterCount > 0 ? "text-indigo-400" : "text-zinc-400 hover:text-zinc-100"
            )}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 bg-indigo-500 rounded-full text-[9px] flex items-center justify-center text-white font-medium">
                {activeFilterCount}
              </span>
            )}
          </Button>

          {/* Expand Button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/60 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              placeholder="Search jobs..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="pl-9 bg-zinc-800/50 border-zinc-700/50 text-zinc-100 placeholder:text-zinc-500 h-8 text-sm"
            />
          </div>

          {/* Filter Options */}
          <div className="flex flex-wrap gap-2">
            {/* Shortlist Only Toggle */}
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-7 text-xs border-zinc-700/50",
                filters.shortlistedOnly
                  ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30"
                  : "bg-zinc-800/50 text-zinc-300 hover:bg-zinc-700/50"
              )}
              onClick={() => setFilters({ ...filters, shortlistedOnly: !filters.shortlistedOnly })}
            >
              <Star className={cn("h-3 w-3 mr-1", filters.shortlistedOnly && "fill-current")} />
              Shortlisted Only
            </Button>

            {/* Min Fit Score */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs bg-zinc-800/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-700/50">
                  Fit Score: {filters.minFitScore}+
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-zinc-900 border-zinc-700 text-zinc-100">
                {[0, 50, 60, 70, 80, 90].map((score) => (
                  <DropdownMenuItem
                    key={score}
                    onClick={() => setFilters({ ...filters, minFitScore: score })}
                    className={cn("cursor-pointer text-zinc-100 focus:bg-zinc-800", filters.minFitScore === score && "bg-indigo-500/20")}
                  >
                    {score === 0 ? "Any" : `${score}+`}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Has Links */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs bg-zinc-800/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-700/50">
                  Has Links: {filters.hasLinks === null ? "Any" : filters.hasLinks ? "Yes" : "No"}
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-zinc-900 border-zinc-700 text-zinc-100">
                <DropdownMenuItem onClick={() => setFilters({ ...filters, hasLinks: null })} className="cursor-pointer text-zinc-100 focus:bg-zinc-800">Any</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilters({ ...filters, hasLinks: true })} className="cursor-pointer text-zinc-100 focus:bg-zinc-800">Has Links</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilters({ ...filters, hasLinks: false })} className="cursor-pointer text-zinc-100 focus:bg-zinc-800">No Links</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Payment Verified */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs bg-zinc-800/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-700/50">
                  Verified: {filters.paymentVerified === null ? "Any" : filters.paymentVerified ? "Yes" : "No"}
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-zinc-900 border-zinc-700 text-zinc-100">
                <DropdownMenuItem onClick={() => setFilters({ ...filters, paymentVerified: null })} className="cursor-pointer text-zinc-100 focus:bg-zinc-800">Any</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilters({ ...filters, paymentVerified: true })} className="cursor-pointer text-zinc-100 focus:bg-zinc-800">Verified Only</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilters({ ...filters, paymentVerified: false })} className="cursor-pointer text-zinc-100 focus:bg-zinc-800">Unverified</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Clear Filters */}
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-zinc-400 hover:text-zinc-100"
                onClick={clearFilters}
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Last Update Info */}
      {lastUpdate && (
        <div className="px-4 py-1.5 text-[10px] text-zinc-500 bg-zinc-900/40 border-b border-zinc-800/30">
          Last updated: {formatTimeAgo(lastUpdate)}
        </div>
      )}

      {/* Job List/Table */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          {viewMode === "list" ? (
            <div className="p-3 space-y-2">
            {filteredAndSortedJobs.map((job, index) => renderJobCard(job, index))}

            {filteredAndSortedJobs.length === 0 && !isRefreshing && (
              <div className="text-center py-16 px-4">
                <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-zinc-800/50 mb-4">
                  <Sparkles className="h-8 w-8 text-zinc-500" />
                </div>
                <p className="text-sm text-zinc-400 font-medium">No jobs found</p>
                <p className="text-xs text-zinc-500 mt-1">
                  {activeFilterCount > 0 ? "Try adjusting your filters" : "Try scraping or adjusting filters"}
                </p>
                {activeFilterCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 text-xs bg-zinc-800/50 border-zinc-700 hover:bg-zinc-700"
                    onClick={clearFilters}
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            )}

            {isRefreshing && filteredAndSortedJobs.length === 0 && (
              <div className="text-center py-16">
                <RefreshCw className="h-8 w-8 text-indigo-400 animate-spin mx-auto mb-4" />
                <p className="text-sm text-zinc-400">Loading jobs...</p>
              </div>
            )}
          </div>
          ) : (
            renderTableView()
          )}
        </ScrollArea>
      </div>
    </div>
  );

  // Expanded mode renders in a dialog
  if (isExpanded) {
    return (
      <>
        {/* Placeholder when expanded */}
        <div className="h-full flex items-center justify-center bg-zinc-900/50 border-r border-zinc-800/50">
          <div className="text-center">
            <Maximize2 className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">Job feed expanded</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 text-xs"
              onClick={() => setIsExpanded(false)}
            >
              <Minimize2 className="h-3 w-3 mr-1" />
              Collapse
            </Button>
          </div>
        </div>

        {/* Expanded Dialog */}
        <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
          <DialogContent className="max-w-6xl h-[90vh] p-0 bg-zinc-950 border-zinc-800 flex flex-col overflow-hidden">
            <DialogHeader className="sr-only">
              <DialogTitle>Scraped Jobs</DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-hidden">
              <MainContent />
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return <MainContent />;
}
