"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Crosshair,
  LayoutList,
  Settings,
  BrainCircuit,
  Zap,
  FileCode2,
  Wifi,
  WifiOff,
  Loader2,
  Radar,
  History,
  RefreshCcw,
  Shield,
  ShieldAlert,
  Clock,
  ChevronDown,
  Search,
  ListFilter,
} from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { useSocket } from "@/context/SocketContext";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Navigation items - V2 Grandmaster edition
const navItems = [
  {
    title: "Hunt",
    icon: Crosshair,
    href: "/v2",
  },
  {
    title: "Pipeline",
    icon: LayoutList,
    href: "/v2/pipeline",
  },
  {
    title: "History",
    icon: History,
    href: "/v2/history",
  },
  {
    title: "Cortex",
    icon: BrainCircuit,
    href: "/v2/cortex",
  },
  {
    title: "DOM",
    icon: FileCode2,
    href: "/v2/dom-captures",
  },
  {
    title: "Settings",
    icon: Settings,
    href: "/v2/settings",
  },
];

interface GrandmasterShellProps {
  children: React.ReactNode;
}

// Scrape source types
type ScrapeMode = "all" | "best-matches" | "most-recent" | "search";

// Protection status
type ProtectionStatus = "safe" | "cooldown" | "blocked";

export function GrandmasterShell({ children }: GrandmasterShellProps) {
  const pathname = usePathname();
  const { isConnected, extensionStatus, socket, scrapeProgress } = useSocket();
  const extensionConnected = extensionStatus === "ONLINE";
  const [isScrapingLocal, setIsScrapingLocal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasAutoRefreshed = useRef(false);

  // Protection state
  const [protectionStatus, setProtectionStatus] = useState<ProtectionStatus>("safe");
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [lastBlockSignal, setLastBlockSignal] = useState<string | null>(null);

  // Daily usage stats (from extension via server)
  const [dailyStats, setDailyStats] = useState({
    jobsScraped: 0,
    detailPagesVisited: 0,
    maxJobsPerDay: 200,
    maxDetailVisitsPerDay: 30,
  });

  // Multi-stage scrape progress
  const [scrapeStage, setScrapeStage] = useState<"idle" | "discovering" | "scoring" | "enriching" | "complete">("idle");
  const [discoveredJobCount, setDiscoveredJobCount] = useState(0);
  const [qualifyingJobCount, setQualifyingJobCount] = useState(0);
  const [enrichingJobCount, setEnrichingJobCount] = useState(0);

  // Handle scrape button click with mode
  const handleScrape = (mode: ScrapeMode = "all") => {
    if (!socket || !extensionConnected) {
      alert("Extension not connected. Please make sure the extension is installed and connected.");
      return;
    }

    // Check protection status
    if (protectionStatus === "cooldown" || protectionStatus === "blocked") {
      alert(`Scraping is paused due to account protection. ${cooldownRemaining > 0 ? `Please wait ${Math.ceil(cooldownRemaining / 60)} minutes.` : ""}`);
      return;
    }

    setIsScrapingLocal(true);

    // Reset multi-stage progress state
    setScrapeStage("discovering");
    setDiscoveredJobCount(0);
    setQualifyingJobCount(0);
    setEnrichingJobCount(0);

    // Map mode to target URL
    const urlMap: Record<ScrapeMode, string> = {
      all: "https://www.upwork.com/nx/find-work/best-matches", // Start with best matches
      "best-matches": "https://www.upwork.com/nx/find-work/best-matches",
      "most-recent": "https://www.upwork.com/nx/find-work/most-recent",
      search: "https://www.upwork.com/nx/search/jobs/", // Will need search keywords
    };

    // Emit scrape command to server, which forwards to extension
    socket.emit("CMD_EXECUTE", {
      action: mode === "all" ? "SCRAPE_ALL" : "SCRAPE",
      platform: "UPWORK",
      targetUrl: urlMap[mode],
      scrapeMode: mode,
    });

    // Reset local state after timeout (in case no progress updates come)
    setTimeout(() => {
      setIsScrapingLocal(false);
    }, 60000); // Extended timeout for multi-source scraping
  };

  // Handle refresh existing jobs
  const handleRefreshJobs = () => {
    if (!socket || !extensionConnected) {
      alert("Extension not connected. Please make sure the extension is installed and connected.");
      return;
    }

    setIsRefreshing(true);

    // Emit refresh command - server will get stale job URLs and send them
    socket.emit("CMD_EXECUTE", {
      action: "REFRESH_JOBS",
      platform: "UPWORK",
    });

    // Note: Button state is reset via TASK_UPDATE event (see handleTaskUpdate)
    // This extended timeout is only a fallback in case socket communication fails
    setTimeout(() => {
      setIsRefreshing((current) => {
        if (current) {
          console.warn("[Shell] Refresh timeout reached - forcing reset. TASK_UPDATE may not have been received.");
        }
        return false;
      });
    }, 300000); // 5 minutes emergency fallback (event-driven reset is primary)
  };

  // Auto-refresh jobs when app starts and extension connects
  // DISABLED: Auto-refresh was causing conflicts with manual refresh button
  // Uncomment if you want automatic refresh on page load
  /*
  useEffect(() => {
    if (socket && extensionConnected && !hasAutoRefreshed.current) {
      hasAutoRefreshed.current = true;
      // Delay auto-refresh by 2 seconds to let everything settle
      const timer = setTimeout(() => {
        console.log("[Shell] Auto-refreshing stale jobs on startup...");
        socket.emit("CMD_EXECUTE", {
          action: "REFRESH_JOBS",
          platform: "UPWORK",
        });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [socket, extensionConnected]);
  */

  // Listen for refresh completion and task updates
  useEffect(() => {
    if (!socket) return;

    const handleTaskUpdate = (data: {
      status?: string;
      message?: string;
      dailyCounters?: {
        jobsScraped: number;
        detailPagesVisited: number;
      };
    }) => {
      console.log("[Shell] TASK_UPDATE received:", data.status, data.message || "");

      if (data.status === "COMPLETED" || data.status === "ERROR") {
        console.log("[Shell] Resetting refresh/scrape state due to:", data.status);
        setIsRefreshing(false);
        setIsScrapingLocal(false);
        setScrapeStage("idle");
      }

      // Update daily stats if provided
      if (data.dailyCounters) {
        setDailyStats((prev) => ({
          ...prev,
          jobsScraped: data.dailyCounters!.jobsScraped,
          detailPagesVisited: data.dailyCounters!.detailPagesVisited,
        }));
      }

      // Handle blocked status
      if (data.status === "BLOCKED") {
        setProtectionStatus("blocked");
        setIsScrapingLocal(false);
      }
    };

    socket.on("TASK_UPDATE", handleTaskUpdate);
    return () => {
      socket.off("TASK_UPDATE", handleTaskUpdate);
    };
  }, [socket]);

  // Listen for SCRAPE_BLOCKED events (anti-detection)
  useEffect(() => {
    if (!socket) return;

    const handleScrapeBlocked = (data: {
      signal: string;
      action: string;
      cooldownMinutes?: number;
      message?: string;
      dailyCounters?: {
        jobsScraped: number;
        detailPagesVisited: number;
        blocksDetected: number;
      };
    }) => {
      console.warn("[Shell] SCRAPE_BLOCKED received:", data);

      setLastBlockSignal(data.signal);
      setIsScrapingLocal(false);

      if (data.action === "COOLDOWN_STARTED" && data.cooldownMinutes) {
        setProtectionStatus("cooldown");
        setCooldownRemaining(data.cooldownMinutes * 60); // Convert to seconds
      } else {
        setProtectionStatus("blocked");
      }

      // Update daily stats
      if (data.dailyCounters) {
        setDailyStats((prev) => ({
          ...prev,
          jobsScraped: data.dailyCounters!.jobsScraped,
          detailPagesVisited: data.dailyCounters!.detailPagesVisited,
        }));
      }
    };

    socket.on("SCRAPE_BLOCKED", handleScrapeBlocked);
    return () => {
      socket.off("SCRAPE_BLOCKED", handleScrapeBlocked);
    };
  }, [socket]);

  // Listen for multi-stage progress events
  useEffect(() => {
    if (!socket) return;

    // Extended SCRAPE_PROGRESS with stage info
    const handleScrapeProgress = (data: {
      current: number;
      status: string;
      stage?: string;
      jobCount?: number;
      enrichCount?: number;
    }) => {
      console.log("[Shell] SCRAPE_PROGRESS:", data);

      // Update stage
      if (data.stage) {
        setScrapeStage(data.stage as typeof scrapeStage);
      }

      // Update job counts
      if (data.jobCount !== undefined) {
        setDiscoveredJobCount(data.jobCount);
      }
      if (data.enrichCount !== undefined) {
        setEnrichingJobCount(data.enrichCount);
      }
    };

    // JOBS_DISCOVERED event from server
    const handleJobsDiscovered = (data: { total: number; qualifying: number }) => {
      console.log("[Shell] JOBS_DISCOVERED:", data);
      setDiscoveredJobCount(data.total);
      setQualifyingJobCount(data.qualifying);
      setScrapeStage("scoring");
    };

    socket.on("SCRAPE_PROGRESS", handleScrapeProgress);
    socket.on("JOBS_DISCOVERED", handleJobsDiscovered);

    return () => {
      socket.off("SCRAPE_PROGRESS", handleScrapeProgress);
      socket.off("JOBS_DISCOVERED", handleJobsDiscovered);
    };
  }, [socket]);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownRemaining <= 0) {
      if (protectionStatus === "cooldown") {
        setProtectionStatus("safe");
        setLastBlockSignal(null);
      }
      return;
    }

    const timer = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          setProtectionStatus("safe");
          setLastBlockSignal(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownRemaining, protectionStatus]);

  // Check if currently scraping (from socket context or local state)
  const isScraping = isScrapingLocal || Boolean(scrapeProgress && scrapeProgress.progress < 100);

  return (
    <div className="flex h-screen w-full bg-zinc-950">
      {/* Sidebar - Icon Only with Glass Effect */}
      <aside className="flex flex-col w-16 border-r border-zinc-800/50 bg-zinc-900/80 backdrop-blur-xl">
        {/* Logo */}
        <div className="flex items-center justify-center h-14 border-b border-zinc-800/50">
          <Link href="/v2" className="flex items-center justify-center group">
            <div className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl",
              "bg-gradient-to-br from-indigo-500 to-violet-600",
              "text-white font-bold text-sm",
              "shadow-lg shadow-indigo-500/25",
              "transition-all duration-300 ease-out",
              "group-hover:scale-110 group-hover:shadow-indigo-500/40 group-hover:rotate-3"
            )}>
              <Zap className="h-5 w-5" />
            </div>
          </Link>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 px-2">
          <TooltipProvider delayDuration={0}>
            <ul className="flex flex-col items-center gap-1">
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/" &&
                    item.href !== "/v2" &&
                    pathname?.startsWith(item.href)) ||
                  (item.href === "/v2" && pathname === "/v2");

                return (
                  <li key={item.href} className="w-full">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href={item.href}
                          className={cn(
                            "relative flex flex-col items-center justify-center w-full h-14 rounded-xl",
                            "transition-all duration-200 ease-out",
                            "group",
                            isActive
                              ? "bg-indigo-500/15 text-indigo-400"
                              : "text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800/50"
                          )}
                        >
                          {/* Active indicator */}
                          {isActive && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-indigo-500 rounded-r-full" />
                          )}
                          <item.icon className={cn(
                            "h-5 w-5 transition-transform duration-200",
                            "group-hover:scale-110"
                          )} />
                          <span className={cn(
                            "text-[10px] mt-1 font-medium tracking-wide",
                            isActive ? "text-indigo-300" : "text-zinc-500 group-hover:text-zinc-300"
                          )}>
                            {item.title}
                          </span>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent
                        side="right"
                        className="bg-zinc-800/90 backdrop-blur-sm text-zinc-100 border-zinc-700/50 shadow-xl"
                      >
                        {item.title}
                      </TooltipContent>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          </TooltipProvider>
        </nav>

        {/* User Avatar & Status */}
        <div className="flex flex-col items-center gap-3 py-4 border-t border-zinc-800/50">
          {/* Connection Status */}
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  "flex items-center justify-center h-8 w-8 rounded-lg",
                  "transition-colors duration-200",
                  extensionConnected
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-zinc-800/50 text-zinc-500"
                )}>
                  {extensionConnected ? (
                    <Wifi className="h-4 w-4" />
                  ) : (
                    <WifiOff className="h-4 w-4" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-zinc-800/90 backdrop-blur-sm text-zinc-100 border-zinc-700/50">
                {extensionConnected ? "Extension Connected" : "Extension Disconnected"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <UserButton
            appearance={{
              elements: {
                avatarBox: "h-9 w-9 ring-2 ring-zinc-700/50 hover:ring-indigo-500/50 transition-all duration-200",
              },
            }}
          />
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header with Glass Effect */}
        <header className="flex items-center justify-between h-14 px-6 border-b border-zinc-800/50 bg-zinc-900/60 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
              Client Acquisition Suite
            </h1>
            <Badge
              variant="outline"
              className="bg-indigo-500/10 text-indigo-400 border-indigo-500/30 text-[10px] font-medium tracking-wide"
            >
              GRANDMASTER
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            {/* PROTECTION STATUS INDICATOR */}
            {protectionStatus !== "safe" && (
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-full border",
                      protectionStatus === "cooldown"
                        ? "bg-amber-500/10 border-amber-500/30"
                        : "bg-red-500/10 border-red-500/30"
                    )}>
                      {protectionStatus === "cooldown" ? (
                        <Clock className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                      ) : (
                        <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
                      )}
                      <span className={cn(
                        "text-xs font-medium",
                        protectionStatus === "cooldown" ? "text-amber-400" : "text-red-400"
                      )}>
                        {protectionStatus === "cooldown"
                          ? `${Math.floor(cooldownRemaining / 60)}:${String(cooldownRemaining % 60).padStart(2, "0")}`
                          : "Blocked"
                        }
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-zinc-800/90 backdrop-blur-sm text-zinc-100 border-zinc-700/50 max-w-xs">
                    {protectionStatus === "cooldown"
                      ? `Bot detection triggered (${lastBlockSignal}). Scraping paused for account protection.`
                      : `Scraping blocked due to detection. Please check your Upwork account.`
                    }
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* DAILY USAGE INDICATOR */}
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-zinc-800/50 border border-zinc-700/30">
                    <Shield className="h-3 w-3 text-zinc-500" />
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {dailyStats.jobsScraped}/{dailyStats.maxJobsPerDay}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-zinc-800/90 backdrop-blur-sm text-zinc-100 border-zinc-700/50">
                  <div className="text-xs space-y-1">
                    <div>Jobs scraped today: {dailyStats.jobsScraped}/{dailyStats.maxJobsPerDay}</div>
                    <div>Detail pages: {dailyStats.detailPagesVisited}/{dailyStats.maxDetailVisitsPerDay}</div>
                    <div className="text-zinc-400 pt-1">Rate limits protect your account</div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* SCRAPE BUTTON WITH DROPDOWN */}
            <DropdownMenu>
              <div className="flex">
                {/* Main scrape button */}
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => handleScrape("all")}
                        disabled={!extensionConnected || isScraping || protectionStatus !== "safe"}
                        className={cn(
                          "relative h-9 px-4 font-semibold text-sm rounded-r-none",
                          "transition-all duration-300",
                          extensionConnected && !isScraping && protectionStatus === "safe"
                            ? "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40"
                            : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                        )}
                      >
                        {isScraping ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            {scrapeStage === "discovering" && (
                              <>
                                Discovering...
                                {discoveredJobCount > 0 && (
                                  <span className="ml-1 text-xs opacity-75">
                                    ({discoveredJobCount} found)
                                  </span>
                                )}
                              </>
                            )}
                            {scrapeStage === "scoring" && (
                              <>
                                Scoring...
                                <span className="ml-1 text-xs opacity-75">
                                  ({qualifyingJobCount}/{discoveredJobCount} qualify)
                                </span>
                              </>
                            )}
                            {scrapeStage === "enriching" && (
                              <>
                                Enriching...
                                <span className="ml-1 text-xs opacity-75">
                                  ({enrichingJobCount} left)
                                </span>
                              </>
                            )}
                            {(scrapeStage === "idle" || scrapeStage === "complete") && (
                              <>
                                Scraping...
                                {scrapeProgress && (
                                  <span className="ml-1 text-xs opacity-75">
                                    {scrapeProgress.progress}%
                                  </span>
                                )}
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            <Radar className="h-4 w-4 mr-2" />
                            Scrape All
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="bg-zinc-800/90 backdrop-blur-sm text-zinc-100 border-zinc-700/50">
                      {protectionStatus !== "safe"
                        ? "Scraping paused for account protection"
                        : extensionConnected
                          ? "Scrape from all sources (Best Matches + Most Recent)"
                          : "Connect extension first to scrape"
                      }
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* Dropdown trigger */}
                <DropdownMenuTrigger asChild>
                  <Button
                    disabled={!extensionConnected || isScraping || protectionStatus !== "safe"}
                    className={cn(
                      "h-9 px-2 rounded-l-none border-l border-white/20",
                      "transition-all duration-300",
                      extensionConnected && !isScraping && protectionStatus === "safe"
                        ? "bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white"
                        : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                    )}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </div>

              <DropdownMenuContent align="end" className="w-56 bg-zinc-900/95 backdrop-blur-sm border-zinc-700/50">
                <DropdownMenuItem
                  onClick={() => handleScrape("all")}
                  className="text-zinc-100 focus:bg-indigo-500/20 focus:text-indigo-300"
                >
                  <Radar className="h-4 w-4 mr-2" />
                  Scrape All Sources
                  <span className="ml-auto text-[10px] text-zinc-500">Recommended</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-zinc-700/50" />
                <DropdownMenuItem
                  onClick={() => handleScrape("best-matches")}
                  className="text-zinc-300 focus:bg-zinc-700/50 focus:text-zinc-100"
                >
                  <ListFilter className="h-4 w-4 mr-2" />
                  Best Matches Only
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleScrape("most-recent")}
                  className="text-zinc-300 focus:bg-zinc-700/50 focus:text-zinc-100"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Most Recent Only
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleScrape("search")}
                  className="text-zinc-300 focus:bg-zinc-700/50 focus:text-zinc-100"
                  disabled
                >
                  <Search className="h-4 w-4 mr-2" />
                  Search (Coming Soon)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* UPDATE JOBS BUTTON */}
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleRefreshJobs}
                    disabled={!extensionConnected || isRefreshing || isScraping}
                    variant="outline"
                    className={cn(
                      "relative h-9 px-3 font-medium text-sm",
                      "transition-all duration-300",
                      extensionConnected && !isRefreshing && !isScraping
                        ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/50"
                        : "border-zinc-700 text-zinc-500 cursor-not-allowed"
                    )}
                  >
                    {isRefreshing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <RefreshCcw className="h-4 w-4 mr-2" />
                        Update Jobs
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-zinc-800/90 backdrop-blur-sm text-zinc-100 border-zinc-700/50">
                  {extensionConnected
                    ? "Refresh existing jobs with latest data from Upwork"
                    : "Connect extension first to update"
                  }
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Extension Status */}
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full border",
                    extensionConnected
                      ? "bg-emerald-500/10 border-emerald-500/30"
                      : "bg-zinc-800/50 border-zinc-700/50"
                  )}>
                    {extensionConnected ? (
                      <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <WifiOff className="h-3.5 w-3.5 text-zinc-500" />
                    )}
                    <span className={cn(
                      "text-xs font-medium",
                      extensionConnected ? "text-emerald-400" : "text-zinc-500"
                    )}>
                      {extensionConnected ? "Extension" : "No Extension"}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-zinc-800/90 backdrop-blur-sm text-zinc-100 border-zinc-700/50">
                  {extensionConnected
                    ? "Chrome extension connected and ready"
                    : "Install and connect the Chrome extension"
                  }
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Live indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800/50 border border-zinc-700/50">
              <div className={cn(
                "h-2 w-2 rounded-full",
                isConnected ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"
              )} />
              <span className="text-xs text-zinc-400">
                {isConnected ? "Live" : "Offline"}
              </span>
            </div>

            <Link href="/v2/settings">
              <button className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 transition-all duration-200">
                <Settings className="h-5 w-5" />
              </button>
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-hidden bg-zinc-950">
          {children}
        </main>
      </div>
    </div>
  );
}
