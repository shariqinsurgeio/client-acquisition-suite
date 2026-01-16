"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MoreHorizontal,
  X,
  ChevronRight,
  TrendingUp,
  DollarSign,
  Target,
  Clock,
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  Briefcase,
  ArrowUpRight,
  Sparkles,
  RefreshCw,
  Percent,
  Trophy,
  LayoutGrid,
  Table,
  Filter,
  ExternalLink,
  Link as LinkIcon,
  BadgeCheck,
  Search,
  Archive,
  Send,
  MapPin,
  Star,
  CreditCard,
  Copy,
  GripVertical,
} from "lucide-react";

// dnd-kit imports for drag-and-drop
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { AssetVault } from "@/components/grandmaster/asset-vault";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useSocket } from "@/context/SocketContext";

import type { Job, Platform, JobStatus } from "@/lib/types";

// View modes and filters
type ViewMode = "kanban" | "table";
type StageFilter = "ALL" | "DRAFTS" | "APPLIED" | "INTERVIEWING" | "HIRED";

// Pipeline stages
type PipelineStage = "DRAFTS" | "APPLIED" | "INTERVIEWING" | "HIRED";

interface PipelineJob extends Job {
  stage: PipelineStage;
  appliedAt?: Date;
  isStale?: boolean;
}

// Analytics data from API
interface AnalyticsSummary {
  connectsSpent: number;
  connectsCost: number;
  connectsBalance: number;
  jobsScraped: number;
  proposalsSent: number;
  responsesReceived: number;
  interviewsScheduled: number;
  jobsWon: number;
  responseRate: number;
  interviewRate: number;
  winRate: number;
  costPerLead: number;
  costPerWin: number;
  statusBreakdown: Record<string, number>;
  periodDays: number;
}

// Map job status to pipeline stage
function statusToStage(status: JobStatus): PipelineStage {
  switch (status) {
    case "APPLIED":
      return "APPLIED";
    case "INTERVIEWING":
      return "INTERVIEWING";
    case "HIRED":
      return "HIRED";
    default:
      // NEW, SAVED, QUEUED, ARCHIVED → DRAFTS
      return "DRAFTS";
  }
}

// Check if a job is stale (applied > 7 days ago, no response)
function isJobStale(job: Record<string, unknown>): boolean {
  if (job.status !== "APPLIED") return false;
  const appliedAt = job.appliedAt as string | undefined;
  if (!appliedAt) return false;
  const appliedDate = new Date(appliedAt);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return appliedDate < sevenDaysAgo;
}

// Convert API job to PipelineJob
function convertToPipelineJob(job: Record<string, unknown>): PipelineJob {
  const status = (job.status as JobStatus) || "NEW";
  return {
    id: job.id as string,
    userId: job.userId as string,
    platform: ((job.platform as string) || "UPWORK") as Platform,
    title: job.title as string,
    description: job.description as string,
    url: job.url as string,
    status,
    createdAt: new Date(job.createdAt as string),
    updatedAt: new Date((job.updatedAt as string) || (job.createdAt as string)),
    client: {
      name: job.clientName as string | undefined,
      location: (job.clientLocation as string) || "Unknown",
      country: job.clientCountry as string | undefined,
      city: job.clientCity as string | undefined,
      localTime: job.clientLocalTime as string | undefined,
      totalSpent: (job.clientTotalSpent as number) || 0,
      avgHourlyPaid: (job.clientAvgHourly as number) || 0,
      hireRate: (job.clientHireRate as number) || 0,
      isPaymentVerified: (job.clientPaymentVerified as boolean) || false,
      isPhoneVerified: (job.clientPhoneVerified as boolean) || false,
      reviewCount: job.clientReviewCount as number | undefined,
      jobsPosted: job.clientJobsPosted as number | undefined,
      totalHires: job.clientTotalHires as number | undefined,
      activeFreelancers: job.clientActiveFreelancers as number | undefined,
      // NEW: Client history & other jobs
      historyCount: job.clientHistoryCount as number | undefined,
      recentContracts: job.clientRecentContracts ? JSON.parse(job.clientRecentContracts as string) : undefined,
      otherJobsCount: job.clientOtherJobsCount as number | undefined,
      otherJobs: job.clientOtherJobs ? JSON.parse(job.clientOtherJobs as string) : undefined,
    },
    meta: {
      fitScore: (job.fitScore as number) || 50,
      connectsCost: (job.connectsCost as number) || 0,
      hasExternalLinks: (job.hasExternalLinks as boolean) || false,
      keywordsFound: [],
      dealBreakers: [],
      postedAgo: job.postedAgo as string | undefined,
      // NEW: Job specifications
      projectType: job.projectType as string | undefined,
      toolsRequired: job.toolsRequired ? JSON.parse(job.toolsRequired as string) : undefined,
      unansweredInvites: job.unansweredInvites as number | undefined,
      budget: job.budget as number | undefined,
      budgetMin: job.budgetMin as number | undefined,
      budgetMax: job.budgetMax as number | undefined,
      hoursPerWeek: job.hoursPerWeek as string | undefined,
    },
    stage: statusToStage(status),
    appliedAt: job.appliedAt ? new Date(job.appliedAt as string) : undefined,
    isStale: isJobStale(job),
  };
}

const PIPELINE_STAGES: { key: PipelineStage; label: string; color: string; icon: typeof Clock; bgColor: string }[] = [
  { key: "DRAFTS", label: "Drafts", color: "text-zinc-400", icon: Clock, bgColor: "bg-zinc-500/10" },
  { key: "APPLIED", label: "Applied", color: "text-blue-400", icon: ArrowUpRight, bgColor: "bg-blue-500/10" },
  { key: "INTERVIEWING", label: "Interviewing", color: "text-amber-400", icon: MessageSquare, bgColor: "bg-amber-500/10" },
  { key: "HIRED", label: "Hired", color: "text-emerald-400", icon: CheckCircle2, bgColor: "bg-emerald-500/10" },
];

// Map pipeline stage to job status for API updates
function stageToStatus(stage: PipelineStage): JobStatus {
  switch (stage) {
    case "APPLIED":
      return "APPLIED";
    case "INTERVIEWING":
      return "INTERVIEWING";
    case "HIRED":
      return "HIRED";
    default:
      return "NEW";
  }
}

// Sortable Job Card for drag-and-drop
function SortableJobCard({
  job,
  onClick,
  getFitScoreColor,
}: {
  job: PipelineJob;
  onClick: () => void;
  getFitScoreColor: (score: number) => string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: job.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "p-4 rounded-xl border cursor-pointer",
        "transition-all duration-200",
        "hover:shadow-lg",
        isDragging
          ? "opacity-50 shadow-2xl scale-105 z-50"
          : "hover:-translate-y-0.5",
        job.isStale
          ? "bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/15"
          : "bg-zinc-900/60 border-zinc-700/50 hover:bg-zinc-800/60 hover:border-zinc-600/50"
      )}
      onClick={onClick}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center gap-2 mb-2 -mx-1 px-1 py-1 rounded cursor-grab active:cursor-grabbing hover:bg-zinc-800/50"
      >
        <GripVertical className="h-4 w-4 text-zinc-600" />
        <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Drag to move</span>
      </div>

      {/* Stale Warning */}
      {job.isStale && (
        <div className="flex items-center gap-2 mb-3 text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span className="text-[10px] font-medium uppercase tracking-wider">Stale Lead</span>
        </div>
      )}

      <h5 className="text-sm font-medium text-zinc-100 mb-3 line-clamp-2">
        {job.title}
      </h5>

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <div className={cn(
          "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold",
          "bg-gradient-to-r shadow-sm",
          getFitScoreColor(job.meta.fitScore)
        )}>
          <TrendingUp className="h-3 w-3 mr-1" />
          Fit {job.meta.fitScore}
        </div>
        <Badge className="bg-purple-500/15 text-purple-400 border-purple-500/30 text-[10px] px-2 py-0.5 font-medium">
          {job.meta.connectsCost} Connects
        </Badge>
      </div>

      {/* Client Info */}
      <div className="flex items-center gap-2 text-xs text-zinc-400 mb-3">
        <span className="text-zinc-500">Client:</span>
        <span className="text-zinc-300">{job.client.name || "Unknown"}</span>
        <span className="text-zinc-600">•</span>
        <span>{job.client.location}</span>
      </div>

      {/* Stale action */}
      {job.isStale && (
        <Button
          size="sm"
          className="w-full h-8 text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30"
          onClick={(e) => e.stopPropagation()}
        >
          <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
          Draft Nudge
        </Button>
      )}
    </div>
  );
}

// Job Card for DragOverlay (non-sortable version)
function JobCardOverlay({
  job,
  getFitScoreColor,
}: {
  job: PipelineJob;
  getFitScoreColor: (score: number) => string;
}) {
  return (
    <div
      className={cn(
        "p-4 rounded-xl border cursor-grabbing shadow-2xl rotate-3",
        "w-72",
        job.isStale
          ? "bg-amber-500/20 border-amber-500/40"
          : "bg-zinc-800 border-zinc-600"
      )}
    >
      <h5 className="text-sm font-medium text-zinc-100 mb-3 line-clamp-2">
        {job.title}
      </h5>

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <div className={cn(
          "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold",
          "bg-gradient-to-r shadow-sm",
          getFitScoreColor(job.meta.fitScore)
        )}>
          <TrendingUp className="h-3 w-3 mr-1" />
          Fit {job.meta.fitScore}
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <span className="text-zinc-300">{job.client.name || "Unknown"}</span>
      </div>
    </div>
  );
}

// Droppable Column for receiving dropped cards
function DroppableColumn({
  stage,
  children,
  isOver,
}: {
  stage: PipelineStage;
  children: React.ReactNode;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "p-3 space-y-2 min-h-[200px] rounded-lg transition-colors duration-200",
        isOver && "bg-indigo-500/10 ring-2 ring-indigo-500/30 ring-inset"
      )}
    >
      {children}
    </div>
  );
}

export default function PipelinePage() {
  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [showROI, setShowROI] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const { socket } = useSocket();

  // New view and filter state
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [stageFilter, setStageFilter] = useState<StageFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJob, setSelectedJob] = useState<PipelineJob | null>(null);
  const [isUpdatingJob, setIsUpdatingJob] = useState(false);

  // Drag-and-drop state
  const [activeJob, setActiveJob] = useState<PipelineJob | null>(null);
  const [activeOverColumn, setActiveOverColumn] = useState<PipelineStage | null>(null);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch jobs from API
  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      if (Array.isArray(data)) {
        setJobs(data.map(convertToPipelineJob));
      }
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
    }
  }, []);

  // Fetch analytics from API
  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics?type=summary&range=30");
      const data = await res.json();
      if (!data.error) {
        setAnalytics(data);
      }
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchJobs(), fetchAnalytics()]);
      setIsLoading(false);
    };
    loadData();
  }, [fetchJobs, fetchAnalytics]);

  // Listen for real-time job updates
  useEffect(() => {
    if (!socket) return;

    const handleJobUpdate = (newJob: Record<string, unknown>) => {
      const job = convertToPipelineJob(newJob);
      setJobs((prev) => {
        const exists = prev.some((j) => j.id === job.id);
        if (exists) {
          return prev.map((j) => (j.id === job.id ? job : j));
        }
        return [job, ...prev];
      });
    };

    socket.on("JOB_UPDATE", handleJobUpdate);
    return () => {
      socket.off("JOB_UPDATE", handleJobUpdate);
    };
  }, [socket]);

  // Use API analytics or calculate from jobs as fallback
  const totalConnects = analytics?.connectsSpent || jobs.reduce((sum, job) => sum + (job.meta.connectsCost || 0), 0);
  const totalSpent = analytics?.connectsCost || totalConnects * 0.15;
  const leadsGenerated = analytics?.interviewsScheduled || jobs.filter(j => j.stage === "INTERVIEWING" || j.stage === "HIRED").length;
  const jobsWon = analytics?.jobsWon || jobs.filter(j => j.stage === "HIRED").length;
  const cpl = analytics?.costPerLead || (leadsGenerated > 0 ? totalSpent / leadsGenerated : 0);
  const responseRate = analytics?.responseRate || 0;
  const winRate = analytics?.winRate || 0;

  const getJobsByStage = (stage: PipelineStage) => {
    return jobs.filter(job => job.stage === stage);
  };

  // Filtered jobs for table view
  const filteredJobs = jobs.filter((job) => {
    // Stage filter
    if (stageFilter !== "ALL" && job.stage !== stageFilter) return false;
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      if (
        !job.title.toLowerCase().includes(query) &&
        !job.client.name?.toLowerCase().includes(query)
      ) {
        return false;
      }
    }
    return true;
  });

  // Update job status
  const updateJobStatus = useCallback(async (jobId: string, newStatus: JobStatus) => {
    setIsUpdatingJob(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId
            ? { ...job, status: newStatus, stage: statusToStage(newStatus) }
            : job
        )
      );
      setSelectedJob((prev) =>
        prev && prev.id === jobId
          ? { ...prev, status: newStatus, stage: statusToStage(newStatus) }
          : prev
      );
    } catch (err) {
      console.error("[Pipeline] Failed to update job status:", err);
      setToast({ message: "Failed to update job status", type: "error" });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setIsUpdatingJob(false);
    }
  }, []);

  // Drag-and-drop handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const job = jobs.find((j) => j.id === event.active.id);
    setActiveJob(job || null);
  }, [jobs]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    if (over) {
      // Check if we're over a column (droppable)
      const overId = over.id as string;
      if (PIPELINE_STAGES.some((s) => s.key === overId)) {
        setActiveOverColumn(overId as PipelineStage);
      } else {
        // Over a card - find its column
        const overJob = jobs.find((j) => j.id === overId);
        if (overJob) {
          setActiveOverColumn(overJob.stage);
        }
      }
    } else {
      setActiveOverColumn(null);
    }
  }, [jobs]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveJob(null);
    setActiveOverColumn(null);

    if (!over) return;

    const activeJobId = active.id as string;
    const overId = over.id as string;

    // Determine target stage
    let targetStage: PipelineStage | null = null;

    // Check if dropped on a column directly
    if (PIPELINE_STAGES.some((s) => s.key === overId)) {
      targetStage = overId as PipelineStage;
    } else {
      // Dropped on a card - get its stage
      const overJob = jobs.find((j) => j.id === overId);
      if (overJob) {
        targetStage = overJob.stage;
      }
    }

    if (!targetStage) return;

    // Find the dragged job
    const draggedJob = jobs.find((j) => j.id === activeJobId);
    if (!draggedJob || draggedJob.stage === targetStage) return;

    // Get stage label for toast
    const stageLabel = PIPELINE_STAGES.find((s) => s.key === targetStage)?.label || targetStage;

    // Optimistically update local state
    setJobs((prev) =>
      prev.map((job) =>
        job.id === activeJobId
          ? { ...job, stage: targetStage!, status: stageToStatus(targetStage!) }
          : job
      )
    );

    // Update on server
    try {
      const newStatus = stageToStatus(targetStage);
      await fetch(`/api/jobs/${activeJobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      // Show success toast
      setToast({ message: `Moved to ${stageLabel}`, type: "success" });
      setTimeout(() => setToast(null), 2500);
    } catch (err) {
      console.error("Failed to update job stage:", err);
      // Revert on error
      setJobs((prev) =>
        prev.map((job) =>
          job.id === activeJobId
            ? { ...job, stage: draggedJob.stage, status: draggedJob.status }
            : job
        )
      );
      // Show error toast
      setToast({ message: "Failed to move job", type: "error" });
      setTimeout(() => setToast(null), 2500);
    }
  }, [jobs]);

  // Copy to clipboard
  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast({ message: "Copied to clipboard", type: "success" });
      setTimeout(() => setToast(null), 2000);
    } catch (err) {
      console.error("[Pipeline] Failed to copy:", err);
      setToast({ message: "Failed to copy to clipboard", type: "error" });
      setTimeout(() => setToast(null), 3000);
    }
  }, []);

  // Get fit score color
  const getFitScoreColor = (score: number) => {
    if (score >= 80) return "from-emerald-500 to-emerald-600 text-emerald-100";
    if (score >= 60) return "from-amber-500 to-amber-600 text-amber-100";
    return "from-zinc-500 to-zinc-600 text-zinc-100";
  };

  const getFitScoreTextColor = (score: number) => {
    if (score >= 80) return "text-emerald-400";
    if (score >= 60) return "text-amber-400";
    return "text-zinc-400";
  };

  return (
    <div className="h-full relative">
      {/* Toast Notification */}
      {toast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
          <div className={cn(
            "px-4 py-2 rounded-lg backdrop-blur-sm border shadow-lg",
            toast.type === "success"
              ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
              : "bg-red-500/20 border-red-500/30 text-red-300"
          )}>
            <p className="text-sm font-medium">{toast.message}</p>
          </div>
        </div>
      )}

      <ResizablePanelGroup direction="horizontal" className="h-full">
        {/* Main Pipeline Area */}
        <ResizablePanel defaultSize={vaultOpen ? 80 : 100} minSize={60}>
          <div className="h-full flex flex-col bg-zinc-900/50 backdrop-blur-sm">
          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-zinc-800/50 bg-zinc-900/80">
            <div className="flex items-center gap-3">
              <Briefcase className="h-4 w-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-zinc-100">Proposal Pipeline</h2>
              <Badge variant="outline" className="text-[10px] bg-zinc-800/50 border-zinc-700/50 text-zinc-400">
                {jobs.length} Active
              </Badge>
              {analytics?.periodDays && (
                <Badge variant="outline" className="text-[10px] bg-indigo-500/20 border-indigo-500/30 text-indigo-300">
                  Last {analytics.periodDays} days
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* View Mode Toggle */}
              <div className="flex items-center bg-zinc-800/50 rounded-lg p-0.5 mr-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-7 w-7 rounded",
                    viewMode === "kanban" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-100"
                  )}
                  onClick={() => setViewMode("kanban")}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-7 w-7 rounded",
                    viewMode === "table" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-100"
                  )}
                  onClick={() => setViewMode("table")}
                >
                  <Table className="h-4 w-4" />
                </Button>
              </div>
              {!showROI && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-zinc-400 hover:text-zinc-100"
                  onClick={() => setShowROI(true)}
                >
                  <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                  Show ROI
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 text-xs text-zinc-400 hover:text-zinc-100",
                  isLoading && "animate-pulse"
                )}
                onClick={() => {
                  fetchJobs();
                  fetchAnalytics();
                }}
                disabled={isLoading}
              >
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isLoading && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>

          {/* ROI Dashboard */}
          {showROI && (
            <div className="mx-6 mt-4 p-4 bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-purple-500/10 rounded-xl border border-indigo-500/20">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-indigo-400" />
                  <h3 className="text-sm font-semibold text-zinc-100">ROI Dashboard</h3>
                  <Badge variant="outline" className="text-[10px] bg-zinc-800/50 border-zinc-700/50 text-zinc-400">
                    30-day view
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-zinc-500 hover:text-zinc-300"
                  onClick={() => setShowROI(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Primary Metrics Row */}
              <div className="grid grid-cols-4 gap-4 mb-4">
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-purple-500/20">
                          <Sparkles className="h-5 w-5 text-purple-400" />
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Connects Spent</p>
                          <p className="text-lg font-semibold text-zinc-100">{totalConnects}</p>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Total connects used on proposals</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-emerald-500/20">
                          <DollarSign className="h-5 w-5 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Total Invested</p>
                          <p className="text-lg font-semibold text-zinc-100">${totalSpent.toFixed(2)}</p>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>At $0.15 per connect</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-500/20">
                          <Target className="h-5 w-5 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Leads</p>
                          <p className="text-lg font-semibold text-zinc-100">{leadsGenerated}</p>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Interviews scheduled</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-emerald-500/20">
                          <Trophy className="h-5 w-5 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Jobs Won</p>
                          <p className="text-lg font-semibold text-zinc-100">{jobsWon}</p>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Hired status</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* Secondary Metrics Row */}
              <div className="grid grid-cols-4 gap-4">
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-amber-500/20">
                          <TrendingUp className="h-5 w-5 text-amber-400" />
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Cost Per Lead</p>
                          <p className="text-lg font-semibold text-zinc-100">${cpl.toFixed(2)}</p>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Investment ÷ Leads</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-500/20">
                          <Percent className="h-5 w-5 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Response Rate</p>
                          <p className="text-lg font-semibold text-zinc-100">{responseRate.toFixed(1)}%</p>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Interviews ÷ Proposals Sent</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-emerald-500/20">
                          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Win Rate</p>
                          <p className="text-lg font-semibold text-zinc-100">{winRate.toFixed(1)}%</p>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Hired ÷ Interviews</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-violet-500/20">
                          <ArrowUpRight className="h-5 w-5 text-violet-400" />
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Proposals Sent</p>
                          <p className="text-lg font-semibold text-zinc-100">{analytics?.proposalsSent || 0}</p>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Total proposals submitted</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          )}

          {/* Kanban View with Drag-and-Drop */}
          {viewMode === "kanban" && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <div className="flex-1 overflow-x-auto p-6 min-h-0">
                <div className="flex gap-4 h-full min-w-max">
                  {PIPELINE_STAGES.map((stage) => {
                    const stageJobs = getJobsByStage(stage.key);
                    const StageIcon = stage.icon;
                    const isOver = activeOverColumn === stage.key;
                    return (
                      <div
                        key={stage.key}
                        className={cn(
                          "w-72 flex flex-col bg-zinc-800/20 rounded-xl border backdrop-blur-sm transition-all duration-200",
                          isOver
                            ? "border-indigo-500/50 bg-indigo-500/5"
                            : "border-zinc-800/50"
                        )}
                      >
                        {/* Column Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
                          <div className="flex items-center gap-2">
                            <div className={cn("p-1.5 rounded-lg", stage.bgColor)}>
                              <StageIcon className={cn("h-4 w-4", stage.color)} />
                            </div>
                            <h4 className={cn("text-sm font-semibold", stage.color)}>
                              {stage.label}
                            </h4>
                            <Badge variant="outline" className="text-[10px] bg-zinc-800/50 border-zinc-700/50 text-zinc-500">
                              {stageJobs.length}
                            </Badge>
                          </div>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-500 hover:text-zinc-300">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        {/* Cards with Drag-and-Drop */}
                        <ScrollArea className="flex-1">
                          <SortableContext
                            items={stageJobs.map((j) => j.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <DroppableColumn stage={stage.key} isOver={isOver}>
                              {stageJobs.map((job) => (
                                <SortableJobCard
                                  key={job.id}
                                  job={job}
                                  onClick={() => setSelectedJob(job)}
                                  getFitScoreColor={getFitScoreColor}
                                />
                              ))}

                              {stageJobs.length === 0 && !isLoading && (
                                <div className="text-center py-8 px-4">
                                  <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-zinc-800/50 mb-3">
                                    <StageIcon className="h-5 w-5 text-zinc-500" />
                                  </div>
                                  <p className="text-xs text-zinc-500">
                                    {isOver ? "Drop here" : `No jobs in ${stage.label.toLowerCase()}`}
                                  </p>
                                </div>
                              )}

                              {isLoading && stageJobs.length === 0 && (
                                <div className="text-center py-8 px-4">
                                  <RefreshCw className="h-5 w-5 text-zinc-500 animate-spin mx-auto mb-3" />
                                  <p className="text-xs text-zinc-500">Loading...</p>
                                </div>
                              )}
                            </DroppableColumn>
                          </SortableContext>
                        </ScrollArea>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Drag Overlay - Shows card being dragged */}
              <DragOverlay>
                {activeJob ? (
                  <JobCardOverlay job={activeJob} getFitScoreColor={getFitScoreColor} />
                ) : null}
              </DragOverlay>
            </DndContext>
          )}

          {/* Table View */}
          {viewMode === "table" && (
            <>
              {/* Table Filters */}
              <div className="flex-shrink-0 flex items-center gap-2 px-6 py-3 border-b border-zinc-800/50 bg-zinc-900/60">
                {/* Search */}
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    placeholder="Search jobs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-8 bg-zinc-800/50 border-zinc-700/50 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>

                {/* Stage Filter */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-8 bg-zinc-800/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-700/50",
                        stageFilter !== "ALL" && "border-indigo-500/50 text-indigo-400"
                      )}
                    >
                      <Filter className="h-4 w-4 mr-2" />
                      Stage
                      {stageFilter !== "ALL" && (
                        <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                          {stageFilter}
                        </Badge>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="bg-zinc-900 border-zinc-700 text-zinc-100">
                    <DropdownMenuLabel className="text-zinc-400">Filter by Stage</DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-zinc-700" />
                    {["ALL", "DRAFTS", "APPLIED", "INTERVIEWING", "HIRED"].map((stage) => (
                      <DropdownMenuItem
                        key={stage}
                        onClick={() => setStageFilter(stage as StageFilter)}
                        className={cn(
                          "cursor-pointer text-zinc-100 focus:text-zinc-100 focus:bg-zinc-800",
                          stageFilter === stage && "bg-zinc-800"
                        )}
                      >
                        {stage === "ALL" ? "All Stages" : stage}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Clear Filters */}
                {(stageFilter !== "ALL" || searchQuery) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setStageFilter("ALL");
                      setSearchQuery("");
                    }}
                    className="h-8 text-zinc-400 hover:text-zinc-200"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}

                <span className="text-xs text-zinc-500 ml-auto">
                  Showing {filteredJobs.length} jobs
                </span>
              </div>

              {/* Table Content */}
              <div className="flex-1 overflow-auto min-h-0 p-6">
                <div className="rounded-xl border border-zinc-800/50 overflow-hidden overflow-x-auto">
                  <table className="w-full min-w-[900px]">
                    <thead className="bg-zinc-900/50">
                      <tr className="text-xs text-zinc-400 uppercase tracking-wider">
                        <th className="px-4 py-3 text-left">Stage</th>
                        <th className="px-4 py-3 text-left w-16">Fit</th>
                        <th className="px-4 py-3 text-left">Title</th>
                        <th className="px-4 py-3 text-left">Client</th>
                        <th className="px-4 py-3 text-left">Budget</th>
                        <th className="px-4 py-3 text-left">Connects</th>
                        <th className="px-4 py-3 text-left">Flags</th>
                        <th className="px-4 py-3 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredJobs.map((job) => {
                        const stageInfo = PIPELINE_STAGES.find((s) => s.key === job.stage);
                        return (
                          <tr
                            key={job.id}
                            className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer"
                            onClick={() => setSelectedJob(job)}
                          >
                            <td className="px-4 py-3">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px]",
                                  stageInfo?.bgColor,
                                  stageInfo?.color,
                                  "border-current/30"
                                )}
                              >
                                {job.stage}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn("font-bold text-lg", getFitScoreTextColor(job.meta.fitScore))}>
                                {job.meta.fitScore}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm text-zinc-100 font-medium truncate max-w-[250px]">
                                {job.title}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-zinc-400">
                              <div className="flex items-center gap-1.5">
                                {job.client.isPaymentVerified && (
                                  <BadgeCheck className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                                )}
                                <span className="truncate max-w-[120px]">
                                  {job.client.name || job.client.location}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-zinc-300">
                              ${job.client.totalSpent?.toLocaleString() || 0}
                            </td>
                            <td className="px-4 py-3 text-sm text-purple-400">
                              {job.meta.connectsCost}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                {job.meta.hasExternalLinks && (
                                  <LinkIcon className="h-3.5 w-3.5 text-emerald-400" />
                                )}
                                {job.isStale && (
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-zinc-500 hover:text-zinc-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(job.url, "_blank");
                                }}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredJobs.length === 0 && !isLoading && (
                    <div className="text-center py-12">
                      <Briefcase className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
                      <p className="text-sm text-zinc-400">No jobs match your filters</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </ResizablePanel>

      {/* Asset Vault Panel */}
      {vaultOpen && (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
            <AssetVault onClose={() => setVaultOpen(false)} />
          </ResizablePanel>
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
                <span className={cn("text-2xl font-bold px-3 py-1 rounded-lg bg-zinc-800/50", getFitScoreTextColor(selectedJob.meta.fitScore))}>
                  {selectedJob.meta.fitScore}
                </span>
                <Badge variant="outline" className="text-zinc-300 border-zinc-600">
                  {selectedJob.platform}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    selectedJob.stage === "DRAFTS" ? "text-zinc-400 border-zinc-500/30" :
                    selectedJob.stage === "APPLIED" ? "text-blue-400 border-blue-500/30" :
                    selectedJob.stage === "INTERVIEWING" ? "text-amber-400 border-amber-500/30" :
                    "text-emerald-400 border-emerald-500/30"
                  )}
                >
                  {selectedJob.stage}
                </Badge>
                {selectedJob.meta.hasExternalLinks && (
                  <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                    <LinkIcon className="h-3 w-3 mr-1" /> Has Links
                  </Badge>
                )}
                {selectedJob.client.isPaymentVerified && (
                  <Badge variant="outline" className="text-blue-400 border-blue-500/30">
                    <BadgeCheck className="h-3 w-3 mr-1" /> Verified
                  </Badge>
                )}
                {selectedJob.isStale && (
                  <Badge variant="outline" className="text-amber-400 border-amber-500/30">
                    <AlertTriangle className="h-3 w-3 mr-1" /> Stale
                  </Badge>
                )}
              </div>

              {/* Client Information */}
              <div className="p-4 bg-zinc-800/30 rounded-xl border border-zinc-700/50">
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Client Information</div>
                <div className="space-y-2">
                  {selectedJob.client.name && (
                    <div className="text-sm text-zinc-100 font-medium">{selectedJob.client.name}</div>
                  )}
                  {selectedJob.client.location && (
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <MapPin className="h-3.5 w-3.5" />
                      {selectedJob.client.location}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    {selectedJob.client.totalSpent > 0 && (
                      <span className="flex items-center gap-1.5 text-zinc-300">
                        <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                        ${selectedJob.client.totalSpent.toLocaleString()} spent
                      </span>
                    )}
                    {selectedJob.client.hireRate > 0 && (
                      <span className="text-zinc-400">{selectedJob.client.hireRate}% hire rate</span>
                    )}
                    {selectedJob.client.avgHourlyPaid > 0 && (
                      <span className="text-zinc-400">${selectedJob.client.avgHourlyPaid}/hr avg</span>
                    )}
                    {selectedJob.client.isPaymentVerified && (
                      <span className="flex items-center gap-1 text-blue-400">
                        <CreditCard className="h-3.5 w-3.5" /> Payment verified
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Job Details */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-zinc-800/30 rounded-lg">
                  <div className="text-xs text-zinc-500 mb-1">Connects</div>
                  <div className="text-sm text-zinc-100 font-medium">{selectedJob.meta.connectsCost}</div>
                </div>
                {selectedJob.meta.postedAgo && (
                  <div className="p-3 bg-zinc-800/30 rounded-lg">
                    <div className="text-xs text-zinc-500 mb-1">Posted</div>
                    <div className="text-sm text-zinc-100 font-medium">{selectedJob.meta.postedAgo}</div>
                  </div>
                )}
                {selectedJob.appliedAt && (
                  <div className="p-3 bg-zinc-800/30 rounded-lg">
                    <div className="text-xs text-zinc-500 mb-1">Applied</div>
                    <div className="text-sm text-zinc-100 font-medium">{selectedJob.appliedAt.toLocaleDateString()}</div>
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
                    className="h-6 px-2 text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                </div>
                <div className="p-4 bg-zinc-800/30 rounded-xl border border-zinc-700/50 text-sm text-zinc-300 whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {selectedJob.description || "No description available"}
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions Footer */}
          {selectedJob && (
            <div className="flex-shrink-0 pt-4 border-t border-zinc-700/50">
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Quick Actions</div>
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
                {selectedJob.stage === "DRAFTS" && (
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
                {selectedJob.stage === "APPLIED" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateJobStatus(selectedJob.id, "INTERVIEWING")}
                    disabled={isUpdatingJob}
                    className="bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Move to Interviewing
                  </Button>
                )}
                {selectedJob.stage === "INTERVIEWING" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateJobStatus(selectedJob.id, "HIRED")}
                    disabled={isUpdatingJob}
                    className="bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                  >
                    <Trophy className="h-4 w-4 mr-2" />
                    Mark as Hired
                  </Button>
                )}
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
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ResizablePanelGroup>
    </div>
  );
}
