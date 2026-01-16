"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  History,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  FileStack,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  List,
  Table,
  Search,
  Filter,
  SortAsc,
  Briefcase,
  DollarSign,
  Link as LinkIcon,
  BadgeCheck,
  X,
  CalendarDays,
  ClipboardList,
  Database,
  Archive,
  Send,
  Copy,
  MapPin,
  Star,
  CreditCard,
  AlertCircle,
  Check,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Types
interface LogEntry {
  timestamp: string;
  message: string;
}

interface ScrapeOperation {
  id: string;
  userId: string;
  platform: string;
  targetUrl: string | null;
  status: string;
  jobsFound: number;
  jobsNew: number;
  jobsUpdated: number;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  logs: LogEntry[];
  errorMessage: string | null;
  jobIds: string[];
}

interface Job {
  id: string;
  platform: string;
  title: string;
  description: string;
  url: string;
  fitScore: number;
  status: string;
  createdAt: string;
  budget?: string;
  clientName?: string;
  clientLocation?: string;
  clientSpend?: string;
  clientHireRate?: number;
  clientRating?: number;
  clientReviewCount?: number;
  clientPaymentVerified?: boolean;
  connectsCost?: number;
  hasExternalLinks?: boolean;
  postedTime?: string;
  experienceLevel?: string;
  projectType?: string;
}

interface ApiResponse {
  operations: ScrapeOperation[];
  total: number;
  limit: number;
  offset: number;
}

// Primary view type - Operations or All Jobs
type PrimaryView = "operations" | "allJobs";

// View mode type
type ViewMode = "list" | "table";
type SortOption = "newest" | "oldest" | "jobsFound" | "duration" | "status";
type JobSortOption = "newest" | "oldest" | "fitScore" | "budget";
type StatusFilter = "ALL" | "COMPLETED" | "FAILED" | "RUNNING";
type PlatformFilter = "ALL" | "UPWORK" | "LINKEDIN" | "FIVERR" | "FREELANCER";
type DateRangeFilter = "7d" | "30d" | "90d" | "all";

export default function ScrapeHistoryPage() {
  // Primary view toggle
  const [primaryView, setPrimaryView] = useState<PrimaryView>("operations");

  // Operations state
  const [operations, setOperations] = useState<ScrapeOperation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  // Operations view state
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("ALL");

  // Jobs state (for expanded operations)
  const [operationJobs, setOperationJobs] = useState<Record<string, Job[]>>({});
  const [loadingJobs, setLoadingJobs] = useState<Record<string, boolean>>({});

  // ALL JOBS view state
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [allJobsLoading, setAllJobsLoading] = useState(false);
  const [allJobsViewMode, setAllJobsViewMode] = useState<ViewMode>("list");
  const [allJobsSearch, setAllJobsSearch] = useState("");
  const [allJobsSort, setAllJobsSort] = useState<JobSortOption>("newest");
  const [allJobsPlatform, setAllJobsPlatform] = useState<PlatformFilter>("ALL");
  const [allJobsDateRange, setAllJobsDateRange] = useState<DateRangeFilter>("30d");

  // Job detail modal
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isUpdatingJob, setIsUpdatingJob] = useState(false);
  const [jobUpdateError, setJobUpdateError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/scrape-history?limit=100");
      const data: ApiResponse = await res.json();
      if (data.operations) {
        setOperations(data.operations);
        setTotal(data.total);
      }
    } catch (err) {
      console.error("Failed to fetch scrape history:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchJobsForOperation = useCallback(async (operationId: string, jobIds: string[]) => {
    if (operationJobs[operationId] || loadingJobs[operationId]) return;
    if (jobIds.length === 0) return;

    setLoadingJobs((prev) => ({ ...prev, [operationId]: true }));

    try {
      // Fetch all jobs and filter by IDs client-side
      const res = await fetch("/api/jobs?limit=500");
      const jobs: Job[] = await res.json();
      const filteredJobs = jobs.filter((job) => jobIds.includes(job.id));
      setOperationJobs((prev) => ({ ...prev, [operationId]: filteredJobs }));
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
    } finally {
      setLoadingJobs((prev) => ({ ...prev, [operationId]: false }));
    }
  }, [operationJobs, loadingJobs]);

  // Fetch ALL jobs for the All Jobs view
  const fetchAllJobs = useCallback(async () => {
    setAllJobsLoading(true);
    try {
      const res = await fetch("/api/jobs?limit=1000");
      const jobs: Job[] = await res.json();
      setAllJobs(jobs);
    } catch (err) {
      console.error("Failed to fetch all jobs:", err);
    } finally {
      setAllJobsLoading(false);
    }
  }, []);

  // Update job status (for quick actions)
  const updateJobStatus = useCallback(async (jobId: string, newStatus: string) => {
    setIsUpdatingJob(true);
    setJobUpdateError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        throw new Error(`Failed to update status (${res.status})`);
      }
      // Update in allJobs
      setAllJobs((prev) =>
        prev.map((job) => (job.id === jobId ? { ...job, status: newStatus } : job))
      );
      // Update in operationJobs
      setOperationJobs((prev) => {
        const updated = { ...prev };
        for (const opId in updated) {
          updated[opId] = updated[opId].map((job) =>
            job.id === jobId ? { ...job, status: newStatus } : job
          );
        }
        return updated;
      });
      // Update selected job if open
      setSelectedJob((prev) =>
        prev && prev.id === jobId ? { ...prev, status: newStatus } : prev
      );
    } catch (err) {
      console.error("[History] Failed to update job status:", err);
      setJobUpdateError("Failed to update job status");
      setTimeout(() => setJobUpdateError(null), 4000);
    } finally {
      setIsUpdatingJob(false);
    }
  }, []);

  // Copy job description to clipboard
  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setCopyError(false);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("[History] Failed to copy:", err);
      setCopyError(true);
      setTimeout(() => setCopyError(false), 3000);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 10000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  // Fetch all jobs when switching to All Jobs view
  useEffect(() => {
    if (primaryView === "allJobs" && allJobs.length === 0) {
      fetchAllJobs();
    }
  }, [primaryView, allJobs.length, fetchAllJobs]);

  // Handle expand with job fetching
  const handleExpand = (op: ScrapeOperation) => {
    if (expandedId === op.id) {
      setExpandedId(null);
    } else {
      setExpandedId(op.id);
      fetchJobsForOperation(op.id, op.jobIds);
    }
  };

  // Filtered and sorted operations
  const filteredOperations = useMemo(() => {
    let result = [...operations];

    // Status filter
    if (statusFilter !== "ALL") {
      result = result.filter((op) => op.status === statusFilter);
    }

    // Platform filter
    if (platformFilter !== "ALL") {
      result = result.filter((op) => op.platform === platformFilter);
    }

    // Search (by target URL or platform)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (op) =>
          op.platform.toLowerCase().includes(query) ||
          op.targetUrl?.toLowerCase().includes(query) ||
          op.status.toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
        case "oldest":
          return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
        case "jobsFound":
          return b.jobsFound - a.jobsFound;
        case "duration":
          return (b.durationMs || 0) - (a.durationMs || 0);
        case "status":
          return a.status.localeCompare(b.status);
        default:
          return 0;
      }
    });

    return result;
  }, [operations, searchQuery, sortBy, statusFilter, platformFilter]);

  const activeFilterCount =
    (statusFilter !== "ALL" ? 1 : 0) + (platformFilter !== "ALL" ? 1 : 0);

  // Filtered and sorted ALL JOBS
  const filteredAllJobs = useMemo(() => {
    let result = [...allJobs];

    // Date range filter
    if (allJobsDateRange !== "all") {
      const now = new Date();
      const cutoff = new Date();
      switch (allJobsDateRange) {
        case "7d":
          cutoff.setDate(now.getDate() - 7);
          break;
        case "30d":
          cutoff.setDate(now.getDate() - 30);
          break;
        case "90d":
          cutoff.setDate(now.getDate() - 90);
          break;
      }
      result = result.filter((job) => new Date(job.createdAt) >= cutoff);
    }

    // Platform filter
    if (allJobsPlatform !== "ALL") {
      result = result.filter((job) => job.platform === allJobsPlatform);
    }

    // Search
    if (allJobsSearch.trim()) {
      const query = allJobsSearch.toLowerCase();
      result = result.filter(
        (job) =>
          job.title.toLowerCase().includes(query) ||
          job.description?.toLowerCase().includes(query) ||
          job.clientName?.toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (allJobsSort) {
        case "newest":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "fitScore":
          return b.fitScore - a.fitScore;
        case "budget":
          // Try to extract numeric budget for comparison
          const getBudgetNum = (b?: string) => {
            if (!b) return 0;
            const match = b.match(/\d+/);
            return match ? parseInt(match[0]) : 0;
          };
          return getBudgetNum(b.budget) - getBudgetNum(a.budget);
        default:
          return 0;
      }
    });

    return result;
  }, [allJobs, allJobsSearch, allJobsSort, allJobsPlatform, allJobsDateRange]);

  const allJobsActiveFilterCount =
    (allJobsPlatform !== "ALL" ? 1 : 0) + (allJobsDateRange !== "all" ? 1 : 0);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
      case "FAILED":
        return <XCircle className="h-4 w-4 text-red-400" />;
      case "RUNNING":
        return <Loader2 className="h-4 w-4 text-amber-400 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-zinc-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
      case "FAILED":
        return "bg-red-500/10 text-red-400 border-red-500/30";
      case "RUNNING":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      default:
        return "bg-zinc-500/10 text-zinc-400 border-zinc-500/30";
    }
  };

  const getFitScoreColor = (score: number) => {
    if (score >= 70) return "text-emerald-400";
    if (score >= 40) return "text-amber-400";
    return "text-zinc-400";
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return "—";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  const formatRelativeTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const clearFilters = () => {
    setStatusFilter("ALL");
    setPlatformFilter("ALL");
    setSearchQuery("");
  };

  // Job card component
  const JobCard = ({ job, compact = false }: { job: Job; compact?: boolean }) => (
    <button
      onClick={() => setSelectedJob(job)}
      className={cn(
        "text-left w-full rounded-lg border border-zinc-700/50 hover:border-zinc-600 transition-colors",
        compact ? "p-2" : "p-3"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className={cn("font-medium text-zinc-100 truncate", compact ? "text-xs" : "text-sm")}>
            {job.title}
          </h4>
          {!compact && job.description && (
            <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{job.description}</p>
          )}
        </div>
        <div
          className={cn(
            "font-bold shrink-0",
            compact ? "text-sm" : "text-lg",
            getFitScoreColor(job.fitScore)
          )}
        >
          {job.fitScore}
        </div>
      </div>
      {!compact && (
        <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
          {job.hasExternalLinks && (
            <span className="flex items-center gap-1 text-indigo-400">
              <LinkIcon className="h-3 w-3" /> Links
            </span>
          )}
          {job.clientPaymentVerified && (
            <span className="flex items-center gap-1 text-emerald-400">
              <BadgeCheck className="h-3 w-3" /> Verified
            </span>
          )}
          {job.budget && (
            <span className="flex items-center gap-1">
              <DollarSign className="h-3 w-3" /> {job.budget}
            </span>
          )}
          {job.connectsCost && (
            <span>{job.connectsCost} connects</span>
          )}
        </div>
      )}
    </button>
  );

  // Table row for operations
  const OperationTableRow = ({ op }: { op: ScrapeOperation }) => (
    <tr
      className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer"
      onClick={() => handleExpand(op)}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {getStatusIcon(op.status)}
          <Badge variant="outline" className={cn("text-[10px]", getStatusColor(op.status))}>
            {op.status}
          </Badge>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-zinc-100">{op.platform}</td>
      <td className="px-4 py-3 text-sm text-zinc-400">{formatRelativeTime(op.startedAt)}</td>
      <td className="px-4 py-3 text-sm text-zinc-100">{op.jobsFound}</td>
      <td className="px-4 py-3 text-sm text-emerald-400">{op.jobsNew}</td>
      <td className="px-4 py-3 text-sm text-amber-400">{op.jobsUpdated}</td>
      <td className="px-4 py-3 text-sm text-zinc-400">{formatDuration(op.durationMs)}</td>
      <td className="px-4 py-3">
        {expandedId === op.id ? (
          <ChevronDown className="h-4 w-4 text-zinc-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-zinc-400" />
        )}
      </td>
    </tr>
  );

  return (
    <div className="h-full flex flex-col bg-zinc-950 p-6 min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10">
            <History className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">Scrape History</h1>
            <p className="text-sm text-zinc-500">
              {primaryView === "operations"
                ? `${filteredOperations.length} of ${total} operations`
                : `${filteredAllJobs.length} of ${allJobs.length} jobs`}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={primaryView === "operations" ? fetchHistory : fetchAllJobs}
          disabled={isLoading || allJobsLoading}
          className="bg-zinc-800/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-700/50"
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", (isLoading || allJobsLoading) && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* PRIMARY VIEW TOGGLE */}
      <div className="flex-shrink-0 mb-4">
        <div className="inline-flex items-center rounded-xl bg-zinc-800/50 p-1 border border-zinc-700/50">
          <button
            onClick={() => setPrimaryView("operations")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              primaryView === "operations"
                ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                : "text-zinc-400 hover:text-zinc-300 border border-transparent"
            )}
          >
            <ClipboardList className="h-4 w-4" />
            Operations
          </button>
          <button
            onClick={() => setPrimaryView("allJobs")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              primaryView === "allJobs"
                ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                : "text-zinc-400 hover:text-zinc-300 border border-transparent"
            )}
          >
            <Database className="h-4 w-4" />
            All Jobs
          </button>
        </div>
      </div>

      {/* OPERATIONS VIEW */}
      {primaryView === "operations" && (
        <>
          {/* Operations Filters Bar */}
          <div className="flex-shrink-0 flex items-center gap-2 mb-4">
            {/* View Toggle */}
            <div className="flex items-center rounded-lg bg-zinc-800/50 p-1">
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  viewMode === "list" ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-300"
                )}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  viewMode === "table" ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-300"
                )}
              >
                <Table className="h-4 w-4" />
              </button>
            </div>

            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Search operations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-zinc-800/50 border-zinc-700/50 text-zinc-100 placeholder:text-zinc-500"
              />
            </div>

            {/* Status Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "bg-zinc-800/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-700/50",
                statusFilter !== "ALL" && "border-indigo-500/50 text-indigo-400"
              )}
            >
              <Filter className="h-4 w-4 mr-2" />
              Status
              {statusFilter !== "ALL" && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                  {statusFilter}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="bg-zinc-900 border-zinc-700 text-zinc-100">
            <DropdownMenuLabel className="text-zinc-400">Filter by Status</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-zinc-700" />
            {["ALL", "COMPLETED", "RUNNING", "FAILED"].map((status) => (
              <DropdownMenuItem
                key={status}
                onClick={() => setStatusFilter(status as StatusFilter)}
                className={cn(
                  "cursor-pointer text-zinc-100 focus:text-zinc-100 focus:bg-zinc-800",
                  statusFilter === status && "bg-zinc-800"
                )}
              >
                {status === "ALL" ? "All Statuses" : status}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Platform Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "bg-zinc-800/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-700/50",
                platformFilter !== "ALL" && "border-indigo-500/50 text-indigo-400"
              )}
            >
              <Briefcase className="h-4 w-4 mr-2" />
              Platform
              {platformFilter !== "ALL" && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                  {platformFilter}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="bg-zinc-900 border-zinc-700 text-zinc-100">
            <DropdownMenuLabel className="text-zinc-400">Filter by Platform</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-zinc-700" />
            {["ALL", "UPWORK", "LINKEDIN", "FIVERR", "FREELANCER"].map((platform) => (
              <DropdownMenuItem
                key={platform}
                onClick={() => setPlatformFilter(platform as PlatformFilter)}
                className={cn(
                  "cursor-pointer text-zinc-100 focus:text-zinc-100 focus:bg-zinc-800",
                  platformFilter === platform && "bg-zinc-800"
                )}
              >
                {platform === "ALL" ? "All Platforms" : platform}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Sort */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="bg-zinc-800/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-700/50"
            >
              <SortAsc className="h-4 w-4 mr-2" />
              Sort
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="bg-zinc-900 border-zinc-700 text-zinc-100">
            <DropdownMenuLabel className="text-zinc-400">Sort by</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-zinc-700" />
            {[
              { value: "newest", label: "Newest First" },
              { value: "oldest", label: "Oldest First" },
              { value: "jobsFound", label: "Most Jobs Found" },
              { value: "duration", label: "Longest Duration" },
              { value: "status", label: "Status" },
            ].map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => setSortBy(option.value as SortOption)}
                className={cn(
                  "cursor-pointer text-zinc-100 focus:text-zinc-100 focus:bg-zinc-800",
                  sortBy === option.value && "bg-zinc-800"
                )}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

            {/* Clear Filters */}
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="h-4 w-4 mr-1" />
                Clear ({activeFilterCount})
              </Button>
            )}
          </div>

          {/* Operations Content */}
          <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading && operations.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 text-zinc-400 animate-spin" />
          </div>
        ) : filteredOperations.length === 0 ? (
          <div className="text-center py-12">
            <FileStack className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400">
              {operations.length === 0 ? "No scrape operations yet" : "No operations match your filters"}
            </p>
            <p className="text-sm text-zinc-500 mt-1">
              {operations.length === 0
                ? "Scrape jobs from the Hunt page to see history here"
                : "Try adjusting your filters"}
            </p>
          </div>
        ) : viewMode === "table" ? (
          // Table View
          <div className="rounded-xl border border-zinc-800/50 overflow-hidden">
            <table className="w-full">
              <thead className="bg-zinc-900/50">
                <tr className="text-xs text-zinc-400 uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Platform</th>
                  <th className="px-4 py-3 text-left">Time</th>
                  <th className="px-4 py-3 text-left">Found</th>
                  <th className="px-4 py-3 text-left">New</th>
                  <th className="px-4 py-3 text-left">Updated</th>
                  <th className="px-4 py-3 text-left">Duration</th>
                  <th className="px-4 py-3 text-left"></th>
                </tr>
              </thead>
              <tbody>
                {filteredOperations.map((op) => (
                  <>
                    <OperationTableRow key={op.id} op={op} />
                    {expandedId === op.id && (
                      <tr key={`${op.id}-expanded`}>
                        <td colSpan={8} className="bg-zinc-900/30 p-4">
                          <ExpandedContent
                            op={op}
                            jobs={operationJobs[op.id]}
                            isLoadingJobs={loadingJobs[op.id]}
                            formatTime={formatTime}
                            JobCard={JobCard}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          // List View
          <div className="space-y-3">
            {filteredOperations.map((op) => (
              <div
                key={op.id}
                className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden"
              >
                {/* Operation Header */}
                <button
                  onClick={() => handleExpand(op)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-800/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(op.status)}
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-100">{op.platform}</span>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px]", getStatusColor(op.status))}
                        >
                          {op.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-zinc-500">
                        {formatRelativeTime(op.startedAt)} • Duration: {formatDuration(op.durationMs)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Stats */}
                    <div className="flex items-center gap-3 text-xs">
                      <div className="text-center">
                        <div className="text-zinc-100 font-medium">{op.jobsFound}</div>
                        <div className="text-zinc-500">Found</div>
                      </div>
                      <div className="text-center">
                        <div className="text-emerald-400 font-medium">{op.jobsNew}</div>
                        <div className="text-zinc-500">New</div>
                      </div>
                      <div className="text-center">
                        <div className="text-amber-400 font-medium">{op.jobsUpdated}</div>
                        <div className="text-zinc-500">Updated</div>
                      </div>
                    </div>

                    {/* Expand Icon */}
                    {expandedId === op.id ? (
                      <ChevronDown className="h-4 w-4 text-zinc-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-zinc-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Details */}
                {expandedId === op.id && (
                  <div className="px-4 pb-4 border-t border-zinc-800/50">
                    <ExpandedContent
                      op={op}
                      jobs={operationJobs[op.id]}
                      isLoadingJobs={loadingJobs[op.id]}
                      formatTime={formatTime}
                      JobCard={JobCard}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
          </div>
        </>
      )}

      {/* ALL JOBS VIEW */}
      {primaryView === "allJobs" && (
        <>
          {/* All Jobs Filters Bar */}
          <div className="flex-shrink-0 flex items-center gap-2 mb-4 flex-wrap">
            {/* View Toggle */}
            <div className="flex items-center rounded-lg bg-zinc-800/50 p-1">
              <button
                onClick={() => setAllJobsViewMode("list")}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  allJobsViewMode === "list" ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-300"
                )}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setAllJobsViewMode("table")}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  allJobsViewMode === "table" ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-300"
                )}
              >
                <Table className="h-4 w-4" />
              </button>
            </div>

            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Search jobs..."
                value={allJobsSearch}
                onChange={(e) => setAllJobsSearch(e.target.value)}
                className="pl-9 bg-zinc-800/50 border-zinc-700/50 text-zinc-100 placeholder:text-zinc-500"
              />
            </div>

            {/* Date Range Filter */}
            <Select value={allJobsDateRange} onValueChange={(v) => setAllJobsDateRange(v as DateRangeFilter)}>
              <SelectTrigger className="w-[140px] bg-zinc-800/50 border-zinc-700/50 text-zinc-100">
                <CalendarDays className="h-4 w-4 mr-2 text-zinc-400" />
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                <SelectItem value="7d" className="text-zinc-100 focus:text-zinc-100 focus:bg-zinc-800">Last 7 days</SelectItem>
                <SelectItem value="30d" className="text-zinc-100 focus:text-zinc-100 focus:bg-zinc-800">Last 30 days</SelectItem>
                <SelectItem value="90d" className="text-zinc-100 focus:text-zinc-100 focus:bg-zinc-800">Last 90 days</SelectItem>
                <SelectItem value="all" className="text-zinc-100 focus:text-zinc-100 focus:bg-zinc-800">All time</SelectItem>
              </SelectContent>
            </Select>

            {/* Platform Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "bg-zinc-800/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-700/50",
                    allJobsPlatform !== "ALL" && "border-indigo-500/50 text-indigo-400"
                  )}
                >
                  <Briefcase className="h-4 w-4 mr-2" />
                  Platform
                  {allJobsPlatform !== "ALL" && (
                    <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                      {allJobsPlatform}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="bg-zinc-900 border-zinc-700 text-zinc-100">
                <DropdownMenuLabel className="text-zinc-400">Filter by Platform</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-zinc-700" />
                {["ALL", "UPWORK", "LINKEDIN", "FIVERR", "FREELANCER"].map((platform) => (
                  <DropdownMenuItem
                    key={platform}
                    onClick={() => setAllJobsPlatform(platform as PlatformFilter)}
                    className={cn(
                      "cursor-pointer text-zinc-100 focus:text-zinc-100 focus:bg-zinc-800",
                      allJobsPlatform === platform && "bg-zinc-800"
                    )}
                  >
                    {platform === "ALL" ? "All Platforms" : platform}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Sort */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-zinc-800/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-700/50"
                >
                  <SortAsc className="h-4 w-4 mr-2" />
                  Sort
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="bg-zinc-900 border-zinc-700 text-zinc-100">
                <DropdownMenuLabel className="text-zinc-400">Sort by</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-zinc-700" />
                {[
                  { value: "newest", label: "Newest First" },
                  { value: "oldest", label: "Oldest First" },
                  { value: "fitScore", label: "Highest Fit Score" },
                  { value: "budget", label: "Highest Budget" },
                ].map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => setAllJobsSort(option.value as JobSortOption)}
                    className={cn(
                      "cursor-pointer text-zinc-100 focus:text-zinc-100 focus:bg-zinc-800",
                      allJobsSort === option.value && "bg-zinc-800"
                    )}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Clear Filters */}
            {allJobsActiveFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAllJobsPlatform("ALL");
                  setAllJobsDateRange("30d");
                  setAllJobsSearch("");
                }}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="h-4 w-4 mr-1" />
                Clear ({allJobsActiveFilterCount})
              </Button>
            )}
          </div>

          {/* All Jobs Content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {allJobsLoading && allJobs.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 text-zinc-400 animate-spin" />
              </div>
            ) : filteredAllJobs.length === 0 ? (
              <div className="text-center py-12">
                <FileStack className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
                <p className="text-zinc-400">
                  {allJobs.length === 0 ? "No jobs scraped yet" : "No jobs match your filters"}
                </p>
                <p className="text-sm text-zinc-500 mt-1">
                  {allJobs.length === 0
                    ? "Scrape jobs from the Hunt page to see them here"
                    : "Try adjusting your date range or filters"}
                </p>
              </div>
            ) : allJobsViewMode === "table" ? (
              // Table View
              <div className="rounded-xl border border-zinc-800/50 overflow-hidden overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead className="bg-zinc-900/50">
                    <tr className="text-xs text-zinc-400 uppercase tracking-wider">
                      <th className="px-4 py-3 text-left w-16">Fit</th>
                      <th className="px-4 py-3 text-left">Title</th>
                      <th className="px-4 py-3 text-left">Platform</th>
                      <th className="px-4 py-3 text-left">Client</th>
                      <th className="px-4 py-3 text-left">Budget</th>
                      <th className="px-4 py-3 text-left">When</th>
                      <th className="px-4 py-3 text-left">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAllJobs.map((job) => (
                      <tr
                        key={job.id}
                        className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer"
                        onClick={() => setSelectedJob(job)}
                      >
                        <td className="px-4 py-3">
                          <span className={cn("font-bold text-lg", getFitScoreColor(job.fitScore))}>
                            {job.fitScore}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-zinc-100 font-medium truncate max-w-[300px]">
                            {job.title}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-zinc-300 border-zinc-600 text-xs">
                            {job.platform}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-400">
                          {job.clientName || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-300">
                          {job.budget || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-500">
                          {formatRelativeTime(job.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {job.hasExternalLinks && (
                              <LinkIcon className="h-3 w-3 text-indigo-400" />
                            )}
                            {job.clientPaymentVerified && (
                              <BadgeCheck className="h-3 w-3 text-emerald-400" />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              // List View
              <div className="space-y-2">
                {filteredAllJobs.map((job) => (
                  <button
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    className="w-full text-left p-4 bg-zinc-900/50 border border-zinc-800/50 rounded-xl hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-medium text-zinc-100 truncate">{job.title}</h3>
                          <Badge variant="outline" className="text-zinc-400 border-zinc-600 text-[10px] shrink-0">
                            {job.platform}
                          </Badge>
                        </div>
                        {job.description && (
                          <p className="text-xs text-zinc-400 line-clamp-2 mb-2">{job.description}</p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-zinc-500">
                          {job.clientName && (
                            <span className="flex items-center gap-1">
                              {job.clientName}
                              {job.clientLocation && (
                                <span className="text-zinc-600">• {job.clientLocation}</span>
                              )}
                            </span>
                          )}
                          {job.budget && (
                            <span className="flex items-center gap-1 text-zinc-400">
                              <DollarSign className="h-3 w-3" /> {job.budget}
                            </span>
                          )}
                          {job.connectsCost && (
                            <span>{job.connectsCost} connects</span>
                          )}
                          <span className="text-zinc-600">{formatRelativeTime(job.createdAt)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={cn("text-xl font-bold", getFitScoreColor(job.fitScore))}>
                          {job.fitScore}
                        </span>
                        <div className="flex items-center gap-1">
                          {job.hasExternalLinks && (
                            <Badge variant="outline" className="text-indigo-400 border-indigo-500/30 text-[10px]">
                              Links
                            </Badge>
                          )}
                          {job.clientPaymentVerified && (
                            <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 text-[10px]">
                              Verified
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Job Detail Modal */}
      <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-zinc-100 text-lg pr-8">{selectedJob?.title}</DialogTitle>
          </DialogHeader>
          {selectedJob && (
            <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
              {/* Header Badges */}
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("text-2xl font-bold px-3 py-1 rounded-lg bg-zinc-800/50", getFitScoreColor(selectedJob.fitScore))}>
                  {selectedJob.fitScore}
                </span>
                <Badge variant="outline" className="text-zinc-300 border-zinc-600">
                  {selectedJob.platform}
                </Badge>
                <Badge variant="outline" className={cn(
                  selectedJob.status === "NEW" ? "text-emerald-400 border-emerald-500/30" :
                  selectedJob.status === "APPLIED" ? "text-blue-400 border-blue-500/30" :
                  selectedJob.status === "ARCHIVED" ? "text-zinc-400 border-zinc-500/30" :
                  "text-zinc-300 border-zinc-600"
                )}>
                  {selectedJob.status}
                </Badge>
                {selectedJob.hasExternalLinks && (
                  <Badge variant="outline" className="text-indigo-400 border-indigo-500/30">
                    <LinkIcon className="h-3 w-3 mr-1" /> Has Links
                  </Badge>
                )}
                {selectedJob.clientPaymentVerified && (
                  <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                    <BadgeCheck className="h-3 w-3 mr-1" /> Verified
                  </Badge>
                )}
              </div>

              {/* Client Information */}
              {(selectedJob.clientName || selectedJob.clientLocation || selectedJob.clientSpend || selectedJob.clientRating) && (
                <div className="p-4 bg-zinc-800/30 rounded-xl border border-zinc-700/50">
                  <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Client Information</div>
                  <div className="space-y-2">
                    {selectedJob.clientName && (
                      <div className="flex items-center gap-2 text-sm text-zinc-100">
                        <span className="font-medium">{selectedJob.clientName}</span>
                      </div>
                    )}
                    {selectedJob.clientLocation && (
                      <div className="flex items-center gap-2 text-sm text-zinc-400">
                        <MapPin className="h-3.5 w-3.5" />
                        {selectedJob.clientLocation}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      {selectedJob.clientSpend && (
                        <span className="flex items-center gap-1.5 text-zinc-300">
                          <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                          {selectedJob.clientSpend} spent
                        </span>
                      )}
                      {selectedJob.clientHireRate && (
                        <span className="text-zinc-400">{selectedJob.clientHireRate}% hire rate</span>
                      )}
                      {selectedJob.clientRating && (
                        <span className="flex items-center gap-1 text-amber-400">
                          <Star className="h-3.5 w-3.5 fill-current" />
                          {selectedJob.clientRating}
                          {selectedJob.clientReviewCount && (
                            <span className="text-zinc-500">({selectedJob.clientReviewCount})</span>
                          )}
                        </span>
                      )}
                      {selectedJob.clientPaymentVerified && (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <CreditCard className="h-3.5 w-3.5" /> Payment verified
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Job Details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {selectedJob.budget && (
                  <div className="p-3 bg-zinc-800/30 rounded-lg">
                    <div className="text-xs text-zinc-500 mb-1">Budget</div>
                    <div className="text-sm text-zinc-100 font-medium">{selectedJob.budget}</div>
                  </div>
                )}
                {selectedJob.connectsCost && (
                  <div className="p-3 bg-zinc-800/30 rounded-lg">
                    <div className="text-xs text-zinc-500 mb-1">Connects</div>
                    <div className="text-sm text-zinc-100 font-medium">{selectedJob.connectsCost}</div>
                  </div>
                )}
                {selectedJob.postedTime && (
                  <div className="p-3 bg-zinc-800/30 rounded-lg">
                    <div className="text-xs text-zinc-500 mb-1">Posted</div>
                    <div className="text-sm text-zinc-100 font-medium">{selectedJob.postedTime}</div>
                  </div>
                )}
                {selectedJob.experienceLevel && (
                  <div className="p-3 bg-zinc-800/30 rounded-lg">
                    <div className="text-xs text-zinc-500 mb-1">Experience</div>
                    <div className="text-sm text-zinc-100 font-medium">{selectedJob.experienceLevel}</div>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-zinc-500 uppercase tracking-wider">Description</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(selectedJob.description || "")}
                    className={cn(
                      "h-6 px-2 text-xs transition-all",
                      copySuccess ? "text-emerald-400" : copyError ? "text-red-400" : "text-zinc-400 hover:text-zinc-200"
                    )}
                  >
                    {copySuccess ? <Check className="h-3 w-3 mr-1" /> : copyError ? <AlertCircle className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                    {copySuccess ? "Copied!" : copyError ? "Failed" : "Copy"}
                  </Button>
                </div>
                <div className="p-4 bg-zinc-800/30 rounded-xl border border-zinc-700/50 text-sm text-zinc-300 whitespace-pre-wrap max-h-80 overflow-y-auto">
                  {selectedJob.description || "No description available"}
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions Footer */}
          {selectedJob && (
            <div className="flex-shrink-0 pt-4 border-t border-zinc-700/50">
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Quick Actions</div>
              {/* Error banner for job update */}
              {jobUpdateError && (
                <div className="flex items-center gap-2 p-2 mb-3 rounded-lg bg-red-500/10 border border-red-500/30">
                  <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                  <span className="text-sm text-red-300">{jobUpdateError}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="bg-indigo-500/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20"
                >
                  <a href={selectedJob.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in {selectedJob.platform}
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(selectedJob.description || "")}
                  className={cn(
                    "transition-all",
                    copySuccess ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
                    copyError ? "bg-red-500/10 border-red-500/30 text-red-400" :
                    "bg-zinc-800/50 border-zinc-700 text-zinc-300 hover:bg-zinc-700/50"
                  )}
                >
                  {copySuccess ? <Check className="h-4 w-4 mr-2" /> : copyError ? <AlertCircle className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  {copySuccess ? "Copied!" : copyError ? "Failed to copy" : "Copy to Workbench"}
                </Button>
                {selectedJob.status !== "APPLIED" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateJobStatus(selectedJob.id, "APPLIED")}
                    disabled={isUpdatingJob}
                    className="bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Move to Applied
                  </Button>
                )}
                {selectedJob.status !== "ARCHIVED" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateJobStatus(selectedJob.id, "ARCHIVED")}
                    disabled={isUpdatingJob}
                    className="bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:bg-zinc-700/50"
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    Archive
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Expanded content component
function ExpandedContent({
  op,
  jobs,
  isLoadingJobs,
  formatTime,
  JobCard,
}: {
  op: ScrapeOperation;
  jobs?: Job[];
  isLoadingJobs?: boolean;
  formatTime: (isoString: string) => string;
  JobCard: React.ComponentType<{ job: Job; compact?: boolean }>;
}) {
  return (
    <>
      {/* Target URL */}
      {op.targetUrl && (
        <div className="mt-3 p-2 bg-zinc-800/30 rounded-lg">
          <div className="text-xs text-zinc-500 mb-1">Target URL</div>
          <a
            href={op.targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-indigo-400 hover:underline flex items-center gap-1"
          >
            {op.targetUrl}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      {/* Error Message */}
      {op.errorMessage && (
        <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="text-xs text-red-400 mb-1">Error</div>
          <div className="text-sm text-red-300">{op.errorMessage}</div>
        </div>
      )}

      {/* Jobs from this operation */}
      {op.jobIds.length > 0 && (
        <div className="mt-3">
          <div className="text-xs text-zinc-500 mb-2">Jobs Scraped ({op.jobIds.length})</div>
          {isLoadingJobs ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 text-zinc-400 animate-spin" />
            </div>
          ) : jobs && jobs.length > 0 ? (
            <div className="grid gap-2 overflow-y-auto pr-2">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-zinc-500 py-2">
              Jobs not found (may have been deleted)
            </div>
          )}
        </div>
      )}

      {/* Logs */}
      <div className="mt-3">
        <div className="text-xs text-zinc-500 mb-2">Activity Log</div>
        <div className="bg-zinc-800/30 rounded-lg p-2 max-h-48 overflow-y-auto font-mono text-xs">
          {op.logs.length === 0 ? (
            <div className="text-zinc-500">No logs</div>
          ) : (
            op.logs.map((log, idx) => (
              <div key={idx} className="flex gap-2 py-0.5">
                <span className="text-zinc-500 whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className="text-zinc-300">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Timestamps */}
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <span className="text-zinc-500">Started:</span>
          <span className="text-zinc-300 ml-2">{formatTime(op.startedAt)}</span>
        </div>
        {op.completedAt && (
          <div>
            <span className="text-zinc-500">Completed:</span>
            <span className="text-zinc-300 ml-2">{formatTime(op.completedAt)}</span>
          </div>
        )}
      </div>
    </>
  );
}
