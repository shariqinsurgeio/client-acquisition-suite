"use client";

import { useState, useEffect } from "react";
import {
  MoreHorizontal,
  ChevronRight,
  ChevronLeft,
  Video,
  Link as LinkIcon,
  GripVertical,
  Plus,
  X,
  FolderOpen,
  Github,
  FileCode,
  ExternalLink,
  Copy,
  Check,
  Search,
  Sparkles,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

import type { Asset, AssetType } from "@/lib/types";

interface AssetVaultProps {
  onClose: () => void;
  onInsertLink?: (url: string) => void;
}

// Mock assets for demo - matching the mockup
const MOCK_ASSETS: Asset[] = [
  { id: "1", type: "LOOM", name: "StubHub Scraper Demo", url: "https://loom.com/demo1", category: "Video Links" },
  { id: "2", type: "LOOM", name: "StubHub Scraper Demo", url: "https://loom.com/demo2", category: "Video Links" },
  { id: "3", type: "LOOM", name: "StubHub Scraper Demo", url: "https://loom.com/demo3", category: "Video Links" },
  { id: "4", type: "LOOM", name: "StubHub Scraper Demo", url: "https://loom.com/demo4", category: "Video Links" },
  { id: "5", type: "LOOM", name: "StubHub Scraper Demo", url: "https://loom.com/demo5", category: "Video Links" },
  { id: "6", type: "LOOM", name: "StubHub Scraper Demo", url: "https://loom.com/demo6", category: "Video Links" },
];

export function AssetVault({ onClose, onInsertLink }: AssetVaultProps) {
  const [assets, setAssets] = useState<Asset[]>(MOCK_ASSETS);
  const [filter, setFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [videoLinksOpen, setVideoLinksOpen] = useState(true);
  const [portfolioOpen, setPortfolioOpen] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyErrorId, setCopyErrorId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch real assets
  const fetchAssets = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/assets");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setAssets(data);
      }
    } catch (err) {
      console.error("[AssetVault] Failed to fetch assets:", err);
      setFetchError("Failed to load assets");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  const handleDragStart = (e: React.DragEvent, asset: Asset) => {
    e.dataTransfer.setData("text/plain", asset.url);
    e.dataTransfer.setData("application/json", JSON.stringify(asset));
    e.currentTarget.classList.add("opacity-50", "scale-95");
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("opacity-50", "scale-95");
  };

  const handleInsert = (asset: Asset) => {
    if (onInsertLink) {
      onInsertLink(asset.url);
    }
  };

  const handleCopyLink = async (e: React.MouseEvent, asset: Asset) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(asset.url);
      setCopiedId(asset.id);
      setCopyErrorId(null);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("[AssetVault] Failed to copy:", err);
      setCopyErrorId(asset.id);
      setTimeout(() => setCopyErrorId(null), 3000);
    }
  };

  const getAssetIcon = (type: AssetType) => {
    switch (type) {
      case "LOOM":
        return Video;
      case "GITHUB":
        return Github;
      case "PORTFOLIO":
        return FileCode;
      default:
        return LinkIcon;
    }
  };

  // Filter assets based on search and category
  const filteredAssets = assets.filter((asset) => {
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === "all" || asset.category === filter;
    return matchesSearch && matchesFilter;
  });

  const videoAssets = filteredAssets.filter((a) => a.type === "LOOM");
  const portfolioAssets = filteredAssets.filter((a) => a.type === "PORTFOLIO" || a.type === "GITHUB");

  return (
    <div className="h-full flex flex-col bg-zinc-900/50 backdrop-blur-sm border-l border-zinc-800/50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/80">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Asset Vault</h2>
          <Badge variant="outline" className="text-[10px] bg-zinc-800/50 border-zinc-700/50 text-zinc-400">
            {filteredAssets.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add Asset</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
            onClick={onClose}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="px-4 py-3 space-y-3 border-b border-zinc-800/50 bg-zinc-800/20">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-zinc-800/50 border-zinc-700/50 text-zinc-200 text-sm placeholder:text-zinc-500"
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-full bg-zinc-800/50 border-zinc-700/50 text-zinc-300 text-sm h-9">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900/95 backdrop-blur-sm border-zinc-800">
            <SelectItem value="all" className="text-zinc-300">All Categories</SelectItem>
            <SelectItem value="Video Links" className="text-zinc-300">
              <div className="flex items-center gap-2">
                <Video className="h-3 w-3" />
                Video Links
              </div>
            </SelectItem>
            <SelectItem value="Portfolio" className="text-zinc-300">
              <div className="flex items-center gap-2">
                <FileCode className="h-3 w-3" />
                Portfolio
              </div>
            </SelectItem>
            <SelectItem value="GitHub" className="text-zinc-300">
              <div className="flex items-center gap-2">
                <Github className="h-3 w-3" />
                GitHub
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Asset List */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* Error Banner */}
          {fetchError && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
              <span className="text-sm text-red-300">{fetchError}</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 text-xs text-red-300 hover:text-red-100 hover:bg-red-500/20"
                onClick={fetchAssets}
              >
                <RefreshCw className="h-3 w-3 mr-1.5" />
                Retry
              </Button>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-5 w-5 text-zinc-500 animate-spin" />
            </div>
          )}

          {/* Video Links Section */}
          {!isLoading && videoAssets.length > 0 && (
            <Collapsible open={videoLinksOpen} onOpenChange={setVideoLinksOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 text-xs text-zinc-400 font-medium w-full p-2 rounded-lg hover:bg-zinc-800/30 transition-colors">
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 transition-transform duration-200",
                    videoLinksOpen && "rotate-90"
                  )}
                />
                <Video className="h-3.5 w-3.5 text-rose-400" />
                <span>Video Links</span>
                <Badge variant="outline" className="ml-auto text-[10px] bg-zinc-800/50 border-zinc-700/50 text-zinc-500">
                  {videoAssets.length}
                </Badge>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 space-y-1">
                {videoAssets.map((asset, index) => {
                  const Icon = getAssetIcon(asset.type);
                  const isCopied = copiedId === asset.id;
                  const isCopyError = copyErrorId === asset.id;
                  return (
                    <div
                      key={asset.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, asset)}
                      onDragEnd={handleDragEnd}
                      onClick={() => handleInsert(asset)}
                      style={{ animationDelay: `${index * 30}ms` }}
                      className={cn(
                        "group relative flex items-center gap-3 p-3 rounded-xl",
                        "border border-transparent",
                        "hover:bg-zinc-800/40 hover:border-zinc-700/50",
                        "cursor-grab active:cursor-grabbing",
                        "transition-all duration-200",
                        "animate-in fade-in slide-in-from-left-2"
                      )}
                    >
                      <div className={cn(
                        "flex items-center justify-center w-10 h-10 rounded-xl",
                        "bg-rose-500/10 border border-rose-500/20",
                        "group-hover:bg-rose-500/15 group-hover:border-rose-500/30",
                        "transition-all duration-200"
                      )}>
                        <Icon className="h-5 w-5 text-rose-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-zinc-200 font-medium truncate block">
                          {asset.name}
                        </span>
                        <span className="text-[10px] text-zinc-500 truncate block">
                          {asset.url}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <TooltipProvider delayDuration={0}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "h-7 w-7 transition-all",
                                  isCopied ? "text-emerald-400" : isCopyError ? "text-red-400" : "text-zinc-500 hover:text-zinc-100"
                                )}
                                onClick={(e) => handleCopyLink(e, asset)}
                              >
                                {isCopied ? <Check className="h-3.5 w-3.5" /> : isCopyError ? <AlertCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{isCopied ? "Copied!" : isCopyError ? "Failed to copy" : "Copy Link"}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-zinc-500 hover:text-zinc-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(asset.url, "_blank");
                                }}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Open Link</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <GripVertical className="h-4 w-4 text-zinc-600 cursor-grab" />
                      </div>
                    </div>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Portfolio Section */}
          {!isLoading && portfolioAssets.length > 0 && (
            <Collapsible open={portfolioOpen} onOpenChange={setPortfolioOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 text-xs text-zinc-400 font-medium w-full p-2 rounded-lg hover:bg-zinc-800/30 transition-colors">
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 transition-transform duration-200",
                    portfolioOpen && "rotate-90"
                  )}
                />
                <FileCode className="h-3.5 w-3.5 text-violet-400" />
                <span>Portfolio & Code</span>
                <Badge variant="outline" className="ml-auto text-[10px] bg-zinc-800/50 border-zinc-700/50 text-zinc-500">
                  {portfolioAssets.length}
                </Badge>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 space-y-1">
                {portfolioAssets.map((asset, index) => {
                  const Icon = getAssetIcon(asset.type);
                  const isCopied = copiedId === asset.id;
                  const isCopyError = copyErrorId === asset.id;
                  const colorClass = asset.type === "GITHUB" ? "text-zinc-400 bg-zinc-500/10 border-zinc-500/20" : "text-violet-400 bg-violet-500/10 border-violet-500/20";
                  return (
                    <div
                      key={asset.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, asset)}
                      onDragEnd={handleDragEnd}
                      onClick={() => handleInsert(asset)}
                      style={{ animationDelay: `${index * 30}ms` }}
                      className={cn(
                        "group relative flex items-center gap-3 p-3 rounded-xl",
                        "border border-transparent",
                        "hover:bg-zinc-800/40 hover:border-zinc-700/50",
                        "cursor-grab active:cursor-grabbing",
                        "transition-all duration-200",
                        "animate-in fade-in slide-in-from-left-2"
                      )}
                    >
                      <div className={cn(
                        "flex items-center justify-center w-10 h-10 rounded-xl border",
                        colorClass,
                        "transition-all duration-200"
                      )}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-zinc-200 font-medium truncate block">
                          {asset.name}
                        </span>
                        <span className="text-[10px] text-zinc-500 truncate block">
                          {asset.url}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <TooltipProvider delayDuration={0}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "h-7 w-7 transition-all",
                                  isCopied ? "text-emerald-400" : isCopyError ? "text-red-400" : "text-zinc-500 hover:text-zinc-100"
                                )}
                                onClick={(e) => handleCopyLink(e, asset)}
                              >
                                {isCopied ? <Check className="h-3.5 w-3.5" /> : isCopyError ? <AlertCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{isCopied ? "Copied!" : isCopyError ? "Failed to copy" : "Copy Link"}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-zinc-500 hover:text-zinc-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(asset.url, "_blank");
                                }}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Open Link</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <GripVertical className="h-4 w-4 text-zinc-600 cursor-grab" />
                      </div>
                    </div>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Empty State */}
          {!isLoading && filteredAssets.length === 0 && (
            <div className="text-center py-12 px-4">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-zinc-800/50 mb-4">
                <Sparkles className="h-7 w-7 text-zinc-500" />
              </div>
              <p className="text-sm text-zinc-400 font-medium">No assets found</p>
              <p className="text-xs text-zinc-500 mt-1">Try adjusting your search or filter</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 text-xs bg-zinc-800/50 border-zinc-700 hover:bg-zinc-700"
              >
                <Plus className="h-3 w-3 mr-2" />
                Add Asset
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-zinc-800/50 bg-zinc-800/20">
        <p className="text-[10px] text-zinc-500 text-center">
          Drag assets to insert links into your proposal
        </p>
      </div>
    </div>
  );
}
