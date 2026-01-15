"use client";

import { useState, useCallback } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { JobFeedV2 } from "@/components/grandmaster/job-feed";
import { WorkbenchV2 } from "@/components/grandmaster/workbench";
import { AssetVault } from "@/components/grandmaster/asset-vault";
import { ChevronLeft, ChevronRight, FolderOpen, List } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Job } from "@/lib/types";
import type { LucideIcon } from "lucide-react";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { useRef } from "react";

// Collapsed panel icon component for IDE-style collapse
function CollapsedPanelIcon({
  icon: Icon,
  label,
  onClick,
  side = "left",
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  side?: "left" | "right";
}) {
  const ChevronIcon = side === "left" ? ChevronRight : ChevronLeft;

  return (
    <div
      className={cn(
        "h-full flex flex-col items-center py-4 bg-zinc-900/95 backdrop-blur-xl cursor-pointer group",
        side === "left" ? "border-r border-zinc-700/50" : "border-l border-zinc-700/50",
        "hover:bg-zinc-800/95 transition-colors duration-200"
      )}
      onClick={onClick}
      title={`Expand ${label}`}
    >
      <Icon className="h-5 w-5 text-zinc-400 group-hover:text-indigo-400 transition-colors" />
      <span className="text-[10px] font-medium text-zinc-500 group-hover:text-zinc-300 tracking-wider [writing-mode:vertical-lr] rotate-180 mt-2">
        {label}
      </span>
      <ChevronIcon className="h-4 w-4 text-zinc-600 group-hover:text-indigo-400 mt-2 transition-colors" />
    </div>
  );
}

export default function HuntPage() {
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [insertedLink, setInsertedLink] = useState<string | null>(null);

  // Collapse states for IDE-style panels
  const [jobFeedCollapsed, setJobFeedCollapsed] = useState(false);

  // Panel refs for programmatic control
  const jobFeedPanelRef = useRef<ImperativePanelHandle>(null);

  const handleInsertLink = useCallback((url: string) => {
    // Flash feedback for link insertion
    setInsertedLink(url);
    setTimeout(() => setInsertedLink(null), 2000);

    // Copy link to clipboard for easy pasting
    navigator.clipboard.writeText(url);
  }, []);

  // Handle Job Feed collapse/expand
  const handleJobFeedCollapse = useCallback(() => {
    setJobFeedCollapsed(true);
  }, []);

  const handleJobFeedExpand = useCallback(() => {
    setJobFeedCollapsed(false);
  }, []);

  const expandJobFeed = useCallback(() => {
    jobFeedPanelRef.current?.expand();
  }, []);

  return (
    <div className="h-full relative">
      {/* Link insertion feedback toast */}
      {insertedLink && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 rounded-lg backdrop-blur-sm">
            <p className="text-sm text-emerald-300 font-medium">Link copied to clipboard!</p>
          </div>
        </div>
      )}

      <ResizablePanelGroup direction="horizontal" className="h-full" autoSaveId="hunt-panels">
        {/* Job Feed Panel - Collapsible */}
        <ResizablePanel
          ref={jobFeedPanelRef}
          defaultSize={28}
          minSize={15}
          maxSize={40}
          collapsible={true}
          collapsedSize={4}
          onCollapse={handleJobFeedCollapse}
          onExpand={handleJobFeedExpand}
        >
          {jobFeedCollapsed ? (
            <CollapsedPanelIcon
              icon={List}
              label="Jobs"
              onClick={expandJobFeed}
              side="left"
            />
          ) : (
            <JobFeedV2
              onSelectJob={setSelectedJob}
              selectedJobId={selectedJob?.id}
            />
          )}
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Workbench Panel - Takes remaining space */}
        <ResizablePanel defaultSize={vaultOpen ? 52 : 72} minSize={40}>
          <WorkbenchV2
            job={selectedJob}
            onOpenVault={() => setVaultOpen(true)}
          />
        </ResizablePanel>

        {/* Asset Vault Panel - Collapsible */}
        {vaultOpen && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
              <AssetVault
                onClose={() => setVaultOpen(false)}
                onInsertLink={handleInsertLink}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      {/* Vault Toggle Button - Always Visible on Right Edge when closed */}
      {!vaultOpen && (
        <button
          onClick={() => setVaultOpen(true)}
          className={cn(
            "absolute right-0 top-1/2 -translate-y-1/2 z-50",
            "w-7 h-36 bg-zinc-900/95 backdrop-blur-xl",
            "border-l border-y border-zinc-700/50 rounded-l-xl",
            "flex flex-col items-center justify-center gap-1",
            "text-zinc-500 hover:text-indigo-400",
            "hover:bg-zinc-800/95 hover:border-indigo-500/30",
            "transition-all duration-300 cursor-pointer",
            "shadow-xl shadow-black/30",
            "group"
          )}
        >
          <FolderOpen className="h-4 w-4 mb-1 transition-transform group-hover:scale-110" />
          <span className="text-[9px] font-medium tracking-wider [writing-mode:vertical-lr] rotate-180">
            Asset Vault
          </span>
          <ChevronLeft className="h-3 w-3 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      )}
    </div>
  );
}
