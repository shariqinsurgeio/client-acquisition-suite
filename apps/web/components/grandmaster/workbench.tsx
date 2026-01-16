"use client";

import { useState, useEffect, useRef } from "react";
import {
  MoreHorizontal,
  Pencil,
  ClipboardList,
  Copy,
  Braces,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  Wand2,
  Check,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  MessageSquare,
  FileText,
  Link2,
  MapPin,
  AlertCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

import type { Job, PlaybookType } from "@/lib/types";

interface WorkbenchV2Props {
  job: Job | null;
  onOpenVault: () => void;
}

// Highlight keywords in description
const HIGHLIGHT_KEYWORDS = ["stubhub", "scraper", "scraping", "data", "api", "automation"];

// P.S. templates by location
const PS_TEMPLATES: Record<string, string> = {
  Dubai: "P.S. Hope the weather in Dubai is treating you well!",
  "United Arab Emirates": "P.S. Hope the weather in Dubai is treating you well!",
  "United States": "P.S. Hope you're having a great day stateside!",
  "United Kingdom": "P.S. Cheers from across the pond!",
  Canada: "P.S. Hope it's not too cold up there!",
  Australia: "P.S. G'day from the other side of the world!",
  default: "P.S. Looking forward to working together!",
};

// Playbook templates
const PLAYBOOK_TEMPLATES: Record<PlaybookType, { greeting: string; body: string }> = {
  AUDIT_PITCH: {
    greeting: "Hey {name},",
    body: `I saw your job post and noticed the link to your current setup.

I've gone ahead and recorded a quick audit for you.

Here is a video where I build a similar scraper:
[LINK]`,
  },
  CONTEXT_TRAP: {
    greeting: "Hey {name},",
    body: `I saw your job post for the StubHub scraper.

I'd love to help, but I need a bit more context to give you a proper audit.

Could you share the specific data points you're looking for?`,
  },
  DIRECT_APPLY: {
    greeting: "Hey {name},",
    body: `I saw your job post and I'm confident I can help.

I specialize in building scrapers and have completed similar projects.

Let me know if you'd like to discuss further.`,
  },
};

export function WorkbenchV2({ job, onOpenVault }: WorkbenchV2Props) {
  const [playbook, setPlaybook] = useState<PlaybookType>("CONTEXT_TRAP");
  const [playbookEnabled, setPlaybookEnabled] = useState(true);
  const [proposalText, setProposalText] = useState("");
  const [psExpanded, setPsExpanded] = useState(true);
  const [descExpanded, setDescExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-select playbook based on hasExternalLinks
  useEffect(() => {
    if (job?.meta.hasExternalLinks) {
      setPlaybook("AUDIT_PITCH");
    } else {
      setPlaybook("CONTEXT_TRAP");
    }
  }, [job?.meta.hasExternalLinks, job?.id]);

  // Generate proposal when job or playbook changes
  useEffect(() => {
    if (job) {
      generateProposal();
    }
  }, [job?.id, playbook]);

  const generateProposal = () => {
    if (!job) return;

    setIsGenerating(true);

    // Simulate typing effect
    setTimeout(() => {
      const template = PLAYBOOK_TEMPLATES[playbook];
      const clientName = job.client.name || "there";

      let text = template.greeting.replace("{name}", clientName);
      text += "\n\n" + template.body;
      text += "\n\nPeace ✌️";

      setProposalText(text);
      setIsGenerating(false);
    }, 300);
  };

  const highlightDescription = (text: string) => {
    let highlighted = text;
    HIGHLIGHT_KEYWORDS.forEach((keyword) => {
      const regex = new RegExp(`(${keyword})`, "gi");
      highlighted = highlighted.replace(
        regex,
        '<mark class="bg-amber-500/30 text-amber-200 px-0.5 rounded">$1</mark>'
      );
    });
    return highlighted;
  };

  const handleCopyProposal = async () => {
    try {
      await navigator.clipboard.writeText(proposalText);
      setCopied(true);
      setCopyError(false);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("[Workbench] Failed to copy to clipboard:", err);
      setCopyError(true);
      setTimeout(() => setCopyError(false), 3000);
    }
  };

  const insertPS = () => {
    if (!job) return;
    const location = job.client.location || job.client.country || "";
    const ps = PS_TEMPLATES[location] || PS_TEMPLATES.default;

    // Insert before "Peace" sign-off
    const lines = proposalText.split("\n");
    const peaceIndex = lines.findIndex(line => line.includes("Peace"));
    if (peaceIndex > 0) {
      lines.splice(peaceIndex, 0, ps, "");
      setProposalText(lines.join("\n"));
    } else {
      setProposalText(proposalText + "\n\n" + ps);
    }
  };

  const insertAssetLink = () => {
    onOpenVault();
  };

  const getDetectedLocation = () => {
    if (!job) return null;
    return job.client.location || job.client.country || null;
  };

  const getPlaybookInfo = (type: PlaybookType) => {
    switch (type) {
      case "AUDIT_PITCH":
        return {
          icon: Target,
          label: "Audit Pitch",
          desc: "For jobs with external links - offer free audit",
          color: "from-emerald-500 to-emerald-600",
        };
      case "CONTEXT_TRAP":
        return {
          icon: MessageSquare,
          label: "Context Trap",
          desc: "Ask clarifying questions to stand out",
          color: "from-amber-500 to-amber-600",
        };
      case "DIRECT_APPLY":
        return {
          icon: Send,
          label: "Direct Apply",
          desc: "Straightforward pitch with credentials",
          color: "from-indigo-500 to-indigo-600",
        };
    }
  };

  if (!job) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-900/50 backdrop-blur-sm text-zinc-500">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-2xl bg-zinc-800/50 border border-zinc-700/50">
            <FileText className="h-10 w-10 text-zinc-500" />
          </div>
          <div>
            <p className="text-zinc-300 font-medium">Select a job to start drafting</p>
            <p className="text-xs text-zinc-500 mt-1">Choose from the job feed on the left</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-900/50 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/80">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Proposal Workbench</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-zinc-400 hover:text-zinc-100"
            onClick={() => job.url && window.open(job.url, "_blank")}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            View Job
          </Button>
        </div>
      </div>

      {/* Job Description Section - Collapsible */}
      <div className="border-b border-zinc-800/50">
        <button
          onClick={() => setDescExpanded(!descExpanded)}
          className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-zinc-800/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-zinc-500" />
            <h3 className="text-xs font-medium text-zinc-400">Job Description</h3>
            <Badge variant="outline" className="text-[10px] bg-zinc-800/50 border-zinc-700/50 text-zinc-500">
              {job.meta.hasExternalLinks ? "Has Links" : "No Links"}
            </Badge>
          </div>
          {descExpanded ? (
            <ChevronUp className="h-4 w-4 text-zinc-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-zinc-500" />
          )}
        </button>
        {descExpanded && (
          <ScrollArea className="h-36">
            <div
              className="px-4 py-3 text-sm text-zinc-300 leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: highlightDescription(job.description || "No description available"),
              }}
            />
          </ScrollArea>
        )}
      </div>

      {/* Proposal Draft Section */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Playbook Selector */}
        <div className="px-4 py-3 border-b border-zinc-800/50 bg-zinc-800/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              <span className="text-xs font-medium text-zinc-300">AI Playbook</span>
              <Switch
                checked={playbookEnabled}
                onCheckedChange={setPlaybookEnabled}
                className="data-[state=checked]:bg-indigo-600 scale-90"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-zinc-400 hover:text-zinc-100"
              onClick={generateProposal}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              Regenerate
            </Button>
          </div>

          {/* Playbook Options */}
          <TooltipProvider delayDuration={0}>
            <div className="grid grid-cols-3 gap-2">
              {(["AUDIT_PITCH", "CONTEXT_TRAP", "DIRECT_APPLY"] as PlaybookType[]).map((type) => {
                const info = getPlaybookInfo(type);
                const isSelected = playbook === type;
                return (
                  <Tooltip key={type}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setPlaybook(type)}
                        className={cn(
                          "relative flex flex-col items-center gap-1.5 p-3 rounded-xl",
                          "border transition-all duration-200",
                          isSelected
                            ? "bg-gradient-to-br border-transparent shadow-lg"
                            : "bg-zinc-800/30 border-zinc-700/50 hover:border-zinc-600/50 hover:bg-zinc-800/50"
                        )}
                        style={isSelected ? {
                          background: `linear-gradient(135deg, var(--tw-gradient-stops))`,
                        } : undefined}
                      >
                        {isSelected && (
                          <div className={cn(
                            "absolute inset-0 rounded-xl bg-gradient-to-br opacity-20",
                            info.color
                          )} />
                        )}
                        <info.icon className={cn(
                          "h-4 w-4 relative z-10",
                          isSelected ? "text-white" : "text-zinc-400"
                        )} />
                        <span className={cn(
                          "text-[10px] font-medium tracking-wide relative z-10",
                          isSelected ? "text-white" : "text-zinc-400"
                        )}>
                          {info.label}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="bg-zinc-800/95 backdrop-blur-sm border-zinc-700/50 text-xs">
                      {info.desc}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        </div>

        {/* Editor Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Editor Toolbar */}
          <TooltipProvider delayDuration={0}>
            <div className="w-12 border-r border-zinc-800/50 flex flex-col items-center py-3 gap-1 bg-zinc-800/20">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Generate with AI"
                    className="h-8 w-8 text-zinc-500 hover:text-zinc-100 hover:bg-zinc-700/50"
                    onClick={generateProposal}
                  >
                    <Wand2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Generate with AI</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={copied ? "Copied" : copyError ? "Copy failed" : "Copy to clipboard"}
                    className={cn(
                      "h-8 w-8 hover:bg-zinc-700/50 transition-all",
                      copied ? "text-emerald-400" : copyError ? "text-red-400" : "text-zinc-500 hover:text-zinc-100"
                    )}
                    onClick={handleCopyProposal}
                  >
                    {copied ? <Check className="h-4 w-4" /> : copyError ? <AlertCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{copied ? "Copied!" : copyError ? "Failed to copy" : "Copy to Clipboard"}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Insert asset link"
                    className="h-8 w-8 text-zinc-500 hover:text-zinc-100 hover:bg-zinc-700/50"
                    onClick={insertAssetLink}
                  >
                    <Link2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Insert Asset Link</TooltipContent>
              </Tooltip>

              <div className="flex-1" />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Show variables"
                    className="h-8 w-8 text-zinc-500 hover:text-zinc-100 hover:bg-zinc-700/50"
                  >
                    <Braces className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Variables</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>

          {/* Text Editor */}
          <div className="flex-1 flex flex-col">
            <div className="flex-1 p-4">
              <Textarea
                ref={textareaRef}
                value={proposalText}
                onChange={(e) => setProposalText(e.target.value)}
                className={cn(
                  "h-full resize-none bg-transparent border-none",
                  "text-sm text-zinc-200 placeholder:text-zinc-600",
                  "focus-visible:ring-0 focus-visible:ring-offset-0",
                  "leading-relaxed",
                  isGenerating && "opacity-50"
                )}
                placeholder="Your proposal will appear here..."
                disabled={isGenerating}
              />
            </div>

            {/* Word count */}
            <div className="px-4 py-2 border-t border-zinc-800/30 flex items-center justify-between text-[10px] text-zinc-500">
              <span>{proposalText.split(/\s+/).filter(Boolean).length} words</span>
              <span>{proposalText.length} characters</span>
            </div>
          </div>
        </div>

        {/* P.S. Builder */}
        <div className="border-t border-zinc-800/50 bg-zinc-800/20">
          <button
            onClick={() => setPsExpanded(!psExpanded)}
            className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-zinc-800/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-zinc-500" />
              <span className="text-xs font-medium text-zinc-400">P.S. Builder</span>
              {getDetectedLocation() && (
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
                  {getDetectedLocation()}
                </Badge>
              )}
            </div>
            {psExpanded ? (
              <ChevronUp className="h-4 w-4 text-zinc-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-zinc-500" />
            )}
          </button>

          {psExpanded && (
            <div className="px-4 py-3 flex items-center justify-between border-t border-zinc-800/30">
              <div className="text-xs">
                <span className="text-zinc-500">Detected Location: </span>
                <span className="text-zinc-100 font-medium">{getDetectedLocation() || "Unknown"}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 bg-zinc-800/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all"
                onClick={insertPS}
              >
                <MapPin className="h-3 w-3 mr-1.5" />
                Insert P.S.
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
