"use client";

import { useState, useEffect } from "react";
import {
  Settings,
  User,
  Puzzle,
  Database,
  Shield,
  Key,
  Globe,
  Bell,
  Palette,
  Save,
  Check,
  RefreshCw,
  Wifi,
  WifiOff,
  ExternalLink,
  Search,
  X,
  Plus,
  Info,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSocket } from "@/context/SocketContext";

export default function SettingsPage() {
  const { isConnected, extensionStatus } = useSocket();
  const extensionConnected = extensionStatus === "ONLINE";

  const [activeTab, setActiveTab] = useState("profile");
  const [saved, setSaved] = useState(false);

  // Profile settings
  const [displayName, setDisplayName] = useState("Shariq Khan");
  const [defaultSignoff, setDefaultSignoff] = useState("Best,\nShariq");
  const [timezone, setTimezone] = useState("America/New_York");

  // Extension settings
  const [autoConnect, setAutoConnect] = useState(true);
  const [scrapeDelay, setScrapeDelay] = useState("3000");
  const [maxJobsPerScrape, setMaxJobsPerScrape] = useState("50");

  // Notification settings
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [browserNotifications, setBrowserNotifications] = useState(true);
  const [newJobAlerts, setNewJobAlerts] = useState(true);

  // Appearance settings
  const [theme, setTheme] = useState("dark");
  const [compactMode, setCompactMode] = useState(false);

  // Search keywords settings
  const [searchKeywords, setSearchKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingKeywords, setIsSavingKeywords] = useState(false);

  // Fetch settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch("/api/settings");
        if (response.ok) {
          const data = await response.json();
          setSearchKeywords(data.searchKeywords || []);
        }
      } catch (error) {
        console.error("Failed to fetch settings:", error);
      } finally {
        setIsLoadingSettings(false);
      }
    };
    fetchSettings();
  }, []);

  const handleAddKeyword = () => {
    const trimmed = newKeyword.trim();
    if (trimmed && !searchKeywords.includes(trimmed) && searchKeywords.length < 10) {
      setSearchKeywords([...searchKeywords, trimmed]);
      setNewKeyword("");
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setSearchKeywords(searchKeywords.filter((k) => k !== keyword));
  };

  const handleSaveKeywords = async () => {
    setIsSavingKeywords(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchKeywords }),
      });
      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (error) {
      console.error("Failed to save keywords:", error);
    } finally {
      setIsSavingKeywords(false);
    }
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="h-full flex flex-col bg-zinc-900/50 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800/50 bg-zinc-900/80">
        <div className="flex items-center gap-3">
          <Settings className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Settings</h2>
        </div>
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

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-zinc-800/50 border border-zinc-700/50 p-1">
            {[
              { value: "profile", label: "Profile", icon: User },
              { value: "extension", label: "Extension", icon: Puzzle },
              { value: "selectors", label: "Selectors", icon: Database },
              { value: "search", label: "Search", icon: Search },
              { value: "notifications", label: "Notifications", icon: Bell },
              { value: "appearance", label: "Appearance", icon: Palette },
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className={cn(
                  "flex items-center gap-2 text-sm px-4 py-2",
                  "data-[state=active]:bg-indigo-500/20 data-[state=active]:text-indigo-400",
                  "data-[state=inactive]:text-zinc-500"
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            <Card className="bg-zinc-800/30 border-zinc-700/50">
              <CardHeader>
                <CardTitle className="text-zinc-100 flex items-center gap-2">
                  <User className="h-5 w-5 text-indigo-400" />
                  Profile Settings
                </CardTitle>
                <CardDescription className="text-zinc-500">
                  Manage your personal information and defaults
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-400 uppercase tracking-wider">
                      Display Name
                    </Label>
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="bg-zinc-900/50 border-zinc-700/50 text-zinc-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-400 uppercase tracking-wider">
                      Timezone
                    </Label>
                    <Select value={timezone} onValueChange={setTimezone}>
                      <SelectTrigger className="bg-zinc-900/50 border-zinc-700/50 text-zinc-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800">
                        <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                        <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                        <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                        <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                        <SelectItem value="UTC">UTC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-zinc-400 uppercase tracking-wider">
                    Default Sign-off
                  </Label>
                  <Textarea
                    value={defaultSignoff}
                    onChange={(e) => setDefaultSignoff(e.target.value)}
                    className="min-h-[100px] bg-zinc-900/50 border-zinc-700/50 text-zinc-200 resize-none"
                    placeholder="Your default proposal sign-off..."
                  />
                  <p className="text-[10px] text-zinc-500">
                    Used at the end of generated proposals
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Extension Tab */}
          <TabsContent value="extension" className="space-y-6">
            <Card className="bg-zinc-800/30 border-zinc-700/50">
              <CardHeader>
                <CardTitle className="text-zinc-100 flex items-center gap-2">
                  <Puzzle className="h-5 w-5 text-indigo-400" />
                  Extension Configuration
                </CardTitle>
                <CardDescription className="text-zinc-500">
                  Manage your browser extension settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Connection Status */}
                <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {extensionConnected ? (
                        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-emerald-500/20">
                          <Wifi className="h-5 w-5 text-emerald-400" />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-zinc-800/50">
                          <WifiOff className="h-5 w-5 text-zinc-500" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-zinc-200">
                          Extension Status
                        </p>
                        <p className="text-xs text-zinc-500">
                          {extensionConnected
                            ? "Connected and ready to scrape"
                            : "Not connected - please install the extension"}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        extensionConnected
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                          : "bg-zinc-800/50 border-zinc-700/50 text-zinc-500"
                      )}
                    >
                      {extensionConnected ? "Online" : "Offline"}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-400 uppercase tracking-wider">
                      Scrape Delay (ms)
                    </Label>
                    <Input
                      type="number"
                      value={scrapeDelay}
                      onChange={(e) => setScrapeDelay(e.target.value)}
                      className="bg-zinc-900/50 border-zinc-700/50 text-zinc-200"
                    />
                    <p className="text-[10px] text-zinc-500">
                      Delay between scraping actions (anti-detection)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-400 uppercase tracking-wider">
                      Max Jobs Per Scrape
                    </Label>
                    <Input
                      type="number"
                      value={maxJobsPerScrape}
                      onChange={(e) => setMaxJobsPerScrape(e.target.value)}
                      className="bg-zinc-900/50 border-zinc-700/50 text-zinc-200"
                    />
                    <p className="text-[10px] text-zinc-500">
                      Maximum jobs to scrape in one session
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm text-zinc-200 font-medium">
                        Auto-Connect on Startup
                      </Label>
                      <p className="text-[10px] text-zinc-500 mt-1">
                        Automatically connect to the extension when you open the app
                      </p>
                    </div>
                    <Switch
                      checked={autoConnect}
                      onCheckedChange={setAutoConnect}
                      className="data-[state=checked]:bg-indigo-600"
                    />
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full bg-zinc-800/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-700"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Test Extension Connection
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Selectors Tab */}
          <TabsContent value="selectors" className="space-y-6">
            <Card className="bg-zinc-800/30 border-zinc-700/50">
              <CardHeader>
                <CardTitle className="text-zinc-100 flex items-center gap-2">
                  <Database className="h-5 w-5 text-indigo-400" />
                  Platform Selectors
                </CardTitle>
                <CardDescription className="text-zinc-500">
                  CSS selectors used for scraping job platforms
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-amber-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-400">
                        Advanced Configuration
                      </p>
                      <p className="text-xs text-amber-400/70 mt-1">
                        Selectors are stored in the database and automatically updated.
                        Only modify if you know what you&apos;re doing.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    { platform: "Upwork", status: "active", selectors: 12 },
                    { platform: "LinkedIn", status: "pending", selectors: 0 },
                    { platform: "Fiverr", status: "pending", selectors: 0 },
                    { platform: "Freelancer", status: "pending", selectors: 0 },
                  ].map((platform) => (
                    <div
                      key={platform.platform}
                      className="flex items-center justify-between p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50"
                    >
                      <div className="flex items-center gap-3">
                        <Globe className="h-5 w-5 text-zinc-400" />
                        <div>
                          <p className="text-sm font-medium text-zinc-200">
                            {platform.platform}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {platform.selectors} selectors configured
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            platform.status === "active"
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                              : "bg-zinc-800/50 border-zinc-700/50 text-zinc-500"
                          )}
                        >
                          {platform.status === "active" ? "Active" : "Coming Soon"}
                        </Badge>
                        {platform.status === "active" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-zinc-400 hover:text-zinc-200"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Search Tab */}
          <TabsContent value="search" className="space-y-6">
            <Card className="bg-zinc-800/30 border-zinc-700/50">
              <CardHeader>
                <CardTitle className="text-zinc-100 flex items-center gap-2">
                  <Search className="h-5 w-5 text-indigo-400" />
                  Search Keywords
                </CardTitle>
                <CardDescription className="text-zinc-500">
                  Configure keywords for job discovery when using &quot;Scrape All&quot;
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Info Banner */}
                <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-indigo-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-indigo-300/90">
                      <p className="font-medium mb-1">How keywords are used:</p>
                      <ul className="text-xs space-y-1 text-indigo-300/70">
                        <li>• First 4 keywords are used with different sort strategies</li>
                        <li>• Keyword 1 → sorted by <span className="text-indigo-400">Relevance</span></li>
                        <li>• Keyword 2 → sorted by <span className="text-indigo-400">Recency</span></li>
                        <li>• Keyword 3 → sorted by <span className="text-indigo-400">Client Spend</span></li>
                        <li>• Keyword 4 → sorted by <span className="text-indigo-400">Client Rating</span></li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Keywords Display */}
                <div className="space-y-3">
                  <Label className="text-xs text-zinc-400 uppercase tracking-wider">
                    Your Keywords ({searchKeywords.length}/10)
                  </Label>

                  {isLoadingSettings ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-5 w-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="min-h-[60px] p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
                      <div className="flex flex-wrap gap-2">
                        {searchKeywords.map((keyword, index) => (
                          <Badge
                            key={keyword}
                            variant="outline"
                            className={cn(
                              "px-3 py-1.5 text-sm cursor-default transition-all",
                              index < 4
                                ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                                : "bg-zinc-800/50 border-zinc-700/50 text-zinc-400"
                            )}
                          >
                            {index < 4 && (
                              <span className="mr-1.5 text-xs opacity-60">#{index + 1}</span>
                            )}
                            {keyword}
                            <button
                              onClick={() => handleRemoveKeyword(keyword)}
                              className="ml-2 hover:text-red-400 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </Badge>
                        ))}
                        {searchKeywords.length === 0 && (
                          <p className="text-xs text-zinc-500 py-1">
                            No keywords configured. Add some below.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Add Keyword Input */}
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-400 uppercase tracking-wider">
                    Add New Keyword
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddKeyword()}
                      placeholder="e.g., AI automation, web scraping, Python..."
                      className="flex-1 bg-zinc-900/50 border-zinc-700/50 text-zinc-200"
                      maxLength={100}
                    />
                    <Button
                      variant="outline"
                      onClick={handleAddKeyword}
                      disabled={!newKeyword.trim() || searchKeywords.length >= 10}
                      className="bg-zinc-800/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </div>
                  <p className="text-[10px] text-zinc-500">
                    Press Enter or click Add. Maximum 10 keywords.
                  </p>
                </div>

                {/* Save Button */}
                <Button
                  onClick={handleSaveKeywords}
                  disabled={isSavingKeywords}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  {isSavingKeywords ? (
                    <>
                      <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Keywords
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6">
            <Card className="bg-zinc-800/30 border-zinc-700/50">
              <CardHeader>
                <CardTitle className="text-zinc-100 flex items-center gap-2">
                  <Bell className="h-5 w-5 text-indigo-400" />
                  Notification Preferences
                </CardTitle>
                <CardDescription className="text-zinc-500">
                  Choose how you want to be notified
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  {
                    id: "email",
                    label: "Email Notifications",
                    description: "Receive updates via email",
                    checked: emailNotifications,
                    onChange: setEmailNotifications,
                  },
                  {
                    id: "browser",
                    label: "Browser Notifications",
                    description: "Show desktop notifications",
                    checked: browserNotifications,
                    onChange: setBrowserNotifications,
                  },
                  {
                    id: "newJobs",
                    label: "New Job Alerts",
                    description: "Get notified when matching jobs are found",
                    checked: newJobAlerts,
                    onChange: setNewJobAlerts,
                  },
                ].map((notification) => (
                  <div
                    key={notification.id}
                    className="flex items-center justify-between p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50"
                  >
                    <div>
                      <Label className="text-sm text-zinc-200 font-medium">
                        {notification.label}
                      </Label>
                      <p className="text-[10px] text-zinc-500 mt-1">
                        {notification.description}
                      </p>
                    </div>
                    <Switch
                      checked={notification.checked}
                      onCheckedChange={notification.onChange}
                      className="data-[state=checked]:bg-indigo-600"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appearance Tab */}
          <TabsContent value="appearance" className="space-y-6">
            <Card className="bg-zinc-800/30 border-zinc-700/50">
              <CardHeader>
                <CardTitle className="text-zinc-100 flex items-center gap-2">
                  <Palette className="h-5 w-5 text-indigo-400" />
                  Appearance Settings
                </CardTitle>
                <CardDescription className="text-zinc-500">
                  Customize the look and feel
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-400 uppercase tracking-wider">
                    Theme
                  </Label>
                  <Select value={theme} onValueChange={setTheme}>
                    <SelectTrigger className="bg-zinc-900/50 border-zinc-700/50 text-zinc-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      <SelectItem value="dark">Dark (Default)</SelectItem>
                      <SelectItem value="light" disabled>
                        Light (Coming Soon)
                      </SelectItem>
                      <SelectItem value="system" disabled>
                        System (Coming Soon)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm text-zinc-200 font-medium">
                        Compact Mode
                      </Label>
                      <p className="text-[10px] text-zinc-500 mt-1">
                        Reduce spacing for more information density
                      </p>
                    </div>
                    <Switch
                      checked={compactMode}
                      onCheckedChange={setCompactMode}
                      className="data-[state=checked]:bg-indigo-600"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
