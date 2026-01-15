"use client";

import { useState } from "react";
import {
  MoreHorizontal,
  ChevronRight,
  BrainCircuit,
  User,
  Lightbulb,
  Shield,
  DollarSign,
  Ban,
  Save,
  Sparkles,
  Check,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export default function CortexPage() {
  const [vaultOpen, setVaultOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("persona");
  const [saved, setSaved] = useState(false);

  // Persona settings
  const [bioSnippet, setBioSnippet] = useState(
    "AI & Automation specialist with 5+ years building intelligent systems. I help businesses automate workflows and leverage AI to scale operations."
  );
  const [tone, setTone] = useState("Consultative");

  // Rate Guard settings
  const [autoDecline, setAutoDecline] = useState(true);
  const [minHourlyRate, setMinHourlyRate] = useState([100]);
  const [negativeKeywords, setNegativeKeywords] = useState("unpaid, volunteer, intern, data entry");

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      {/* Main Cortex Area */}
      <ResizablePanel defaultSize={vaultOpen ? 80 : 100} minSize={60}>
        <div className="h-full flex flex-col bg-zinc-900/50 backdrop-blur-sm">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800/50 bg-zinc-900/80">
            <div className="flex items-center gap-3">
              <BrainCircuit className="h-4 w-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-zinc-100">AI Knowledge Base (Cortex)</h2>
              <Badge variant="outline" className="text-[10px] bg-indigo-500/10 border-indigo-500/30 text-indigo-400">
                AI-Powered
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 text-xs transition-all",
                  saved
                    ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                    : "bg-zinc-800/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-700"
                )}
                onClick={handleSave}
              >
                {saved ? (
                  <>
                    <Check className="h-3.5 w-3.5 mr-1.5" />
                    Saved!
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <div className="border-b border-zinc-800/50 bg-zinc-800/20">
              <TabsList className="h-12 px-6 bg-transparent border-0 gap-1">
                {[
                  { value: "persona", label: "Persona", icon: User },
                  { value: "solutions", label: "Solutions", icon: Lightbulb },
                  { value: "cortex", label: "Cortex AI", icon: Sparkles },
                ].map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className={cn(
                      "flex items-center gap-2 text-sm px-4 py-2 rounded-lg",
                      "data-[state=active]:bg-indigo-500/20 data-[state=active]:text-indigo-400",
                      "data-[state=inactive]:text-zinc-500 data-[state=inactive]:hover:text-zinc-300",
                      "transition-all duration-200"
                    )}
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="persona" className="flex-1 m-0 p-6">
              <div className="grid grid-cols-2 gap-6 h-full">
                {/* Persona Builder */}
                <div className="bg-zinc-800/20 rounded-xl border border-zinc-800/50 p-6 backdrop-blur-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-indigo-500/20">
                      <User className="h-5 w-5 text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-100">Persona Builder</h3>
                      <p className="text-[10px] text-zinc-500">Define how AI writes your proposals</p>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label className="text-xs text-zinc-400 uppercase tracking-wider">Bio Snippet</Label>
                      <Textarea
                        value={bioSnippet}
                        onChange={(e) => setBioSnippet(e.target.value)}
                        className="min-h-[140px] bg-zinc-900/50 border-zinc-700/50 text-zinc-200 text-sm resize-none focus:border-indigo-500/50 transition-colors"
                        placeholder="Enter your bio snippet..."
                      />
                      <p className="text-[10px] text-zinc-500">{bioSnippet.length}/500 characters</p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-zinc-400 uppercase tracking-wider">Writing Tone</Label>
                      <Select value={tone} onValueChange={setTone}>
                        <SelectTrigger className="bg-zinc-900/50 border-zinc-700/50 text-zinc-200 focus:border-indigo-500/50">
                          <SelectValue placeholder="Select tone" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900/95 backdrop-blur-sm border-zinc-800">
                          <SelectItem value="Direct" className="text-zinc-200 focus:bg-indigo-500/20">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-blue-400" />
                              Direct - Straight to the point
                            </div>
                          </SelectItem>
                          <SelectItem value="Consultative" className="text-zinc-200 focus:bg-indigo-500/20">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-emerald-400" />
                              Consultative - Helpful & advisory
                            </div>
                          </SelectItem>
                          <SelectItem value="Casual" className="text-zinc-200 focus:bg-indigo-500/20">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-amber-400" />
                              Casual - Friendly & approachable
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Rules Engine & Rate Guard */}
                <div className="bg-zinc-800/20 rounded-xl border border-zinc-800/50 p-6 backdrop-blur-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-emerald-500/20">
                      <Shield className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-100">Rate Guard</h3>
                      <p className="text-[10px] text-zinc-500">Protect your rates and filter jobs</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {/* Auto-Decline */}
                    <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Ban className="h-4 w-4 text-rose-400" />
                          <Label className="text-sm text-zinc-200 font-medium">Auto-Decline Low Rates</Label>
                        </div>
                        <Switch
                          checked={autoDecline}
                          onCheckedChange={setAutoDecline}
                          className="data-[state=checked]:bg-emerald-600"
                        />
                      </div>
                      <p className="text-[10px] text-zinc-500">
                        Automatically skip jobs below your minimum rate
                      </p>
                    </div>

                    {/* Minimum Hourly Rate */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-emerald-400" />
                        <Label className="text-sm text-zinc-200 font-medium">
                          Minimum Hourly Rate
                        </Label>
                      </div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="px-4 py-6 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
                              <Slider
                                value={minHourlyRate}
                                onValueChange={setMinHourlyRate}
                                min={50}
                                max={200}
                                step={10}
                                className="[&_[role=slider]]:bg-emerald-500 [&_[role=slider]]:border-emerald-600"
                              />
                              <div className="flex justify-between mt-4 text-xs text-zinc-500">
                                <span>$50</span>
                                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold">
                                  ${minHourlyRate[0]}/hr
                                </span>
                                <span>$200</span>
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Jobs below this rate will be filtered</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>

                    {/* Negative Keywords */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Ban className="h-4 w-4 text-rose-400" />
                        <Label className="text-sm text-zinc-200 font-medium">Negative Keywords</Label>
                      </div>
                      <Input
                        value={negativeKeywords}
                        onChange={(e) => setNegativeKeywords(e.target.value)}
                        className="bg-zinc-900/50 border-zinc-700/50 text-zinc-200 focus:border-indigo-500/50"
                        placeholder="unpaid, volunteer, intern..."
                      />
                      <p className="text-[10px] text-zinc-500">
                        Comma-separated keywords to auto-skip
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="solutions" className="flex-1 m-0 p-6">
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-zinc-800/50 border border-zinc-700/50">
                    <Lightbulb className="h-8 w-8 text-zinc-500" />
                  </div>
                  <div>
                    <p className="text-zinc-300 font-medium">Solutions Library</p>
                    <p className="text-xs text-zinc-500 mt-1">Define reusable solution templates coming soon...</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="cortex" className="flex-1 m-0 p-6">
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
                    <Sparkles className="h-8 w-8 text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-zinc-300 font-medium">Cortex AI Settings</p>
                    <p className="text-xs text-zinc-500 mt-1">Advanced AI configuration coming soon...</p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
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
    </ResizablePanelGroup>
  );
}
