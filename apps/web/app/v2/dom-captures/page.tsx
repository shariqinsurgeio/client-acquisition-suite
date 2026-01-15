"use client";

import { useState, useEffect, useMemo } from "react";
import {
  FileCode2,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  Code,
  Eye,
  Clock,
  Globe,
  Search,
  CheckCircle2,
  Circle,
  AlertCircle,
  ExternalLink
} from "lucide-react";

// Required page types for comprehensive DOM coverage (based on Firecrawl analysis + actual URLs)
const REQUIRED_PAGE_TYPES = [
  {
    type: "job-list-best-match",
    label: "Job List (Best Match)",
    url: "https://www.upwork.com/nx/search/jobs",
    priority: "critical",
    description: "Primary discovery - default job feed",
  },
  {
    type: "job-list-most-recent",
    label: "Job List (Most Recent)",
    url: "https://www.upwork.com/nx/search/jobs?sort=recency",
    priority: "critical",
    description: "Time-sensitive jobs sorted by recency",
  },
  {
    type: "job-list-search",
    label: "Job List (Keyword Search)",
    url: "https://www.upwork.com/nx/search/jobs?q=AI+automation",
    priority: "high",
    description: "Search results with keyword query",
  },
  {
    type: "job-detail",
    label: "Job Detail Page",
    url: "https://www.upwork.com/jobs/~01xxxxxx",
    priority: "critical",
    description: "Individual job - client info, full description",
  },
  {
    type: "job-detail-apply",
    label: "Job Application Page",
    url: "https://www.upwork.com/nx/proposals/job/~02xxxxxxxxx/apply/",
    priority: "high",
    description: "Application form - click 'Apply Now' on any job to reach this page",
  },
  {
    type: "profile-stats",
    label: "Profile Stats",
    url: "https://www.upwork.com/nx/my-stats/",
    priority: "high",
    description: "Connects balance, proposals count",
  },
  {
    type: "job-list-saved",
    label: "Saved Jobs",
    url: "https://www.upwork.com/nx/search/jobs/saved/",
    priority: "medium",
    description: "User's saved jobs list",
  },
  {
    type: "proposals",
    label: "Proposals Page",
    url: "https://www.upwork.com/nx/proposals/",
    priority: "medium",
    description: "Active proposals tracking",
  },
  {
    type: "best-matches",
    label: "Best Matches Feed",
    url: "https://www.upwork.com/nx/find-work/best-matches",
    priority: "high",
    description: "Alternative best matches view",
  },
  {
    type: "messages",
    label: "Messages Inbox",
    url: "https://www.upwork.com/nx/messages/",
    priority: "low",
    description: "Client conversations (capture when you have messages)",
  },
] as const;

interface DomCapture {
  id: string;
  pageUrl: string;
  pageType: string;
  urlPattern?: string;
  platform: string;
  capturedAt: string;
  analyzed: boolean;
  notes: string | null;
}

interface DomCaptureDetail extends DomCapture {
  dataAttributes: Array<{
    attr: string | null;
    tag: string;
    classes: string;
    textPreview?: string;
  }>;
  jobCardSample: string | null;
  clientSection: string | null;
  fullStructure: {
    title?: string;
    jobCount?: number;
    hasClientInfo: boolean;
    hasJobCards: boolean;
    uniqueDataAttrs: string[];
    uniqueClasses: string[];
  } | null;
  suggestedSelectors: Record<string, string[]> | null;
}

export default function DomCapturesPage() {
  const [captures, setCaptures] = useState<DomCapture[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<DomCaptureDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showCoverageGuide, setShowCoverageGuide] = useState(true);

  // Calculate coverage status
  const coverageStatus = useMemo(() => {
    const capturedTypes = new Set(captures.map((c) => c.pageType));
    return REQUIRED_PAGE_TYPES.map((req) => ({
      ...req,
      captured: capturedTypes.has(req.type),
      captureCount: captures.filter((c) => c.pageType === req.type).length,
      latestCapture: captures.find((c) => c.pageType === req.type),
    }));
  }, [captures]);

  const coverageStats = useMemo(() => {
    const total = REQUIRED_PAGE_TYPES.length;
    const captured = coverageStatus.filter((s) => s.captured).length;
    const critical = coverageStatus.filter((s) => s.priority === "critical");
    const criticalCaptured = critical.filter((s) => s.captured).length;
    return {
      total,
      captured,
      percentage: Math.round((captured / total) * 100),
      criticalTotal: critical.length,
      criticalCaptured,
      allCriticalDone: criticalCaptured === critical.length,
    };
  }, [coverageStatus]);

  // Fetch captures list
  const fetchCaptures = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dom-captures?limit=50");
      const data = await res.json();
      setCaptures(data.captures || []);
    } catch (err) {
      console.error("Failed to fetch captures:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCaptures();
  }, []);

  // Fetch detail when expanding
  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetailData(null);
      return;
    }

    setExpandedId(id);
    setDetailLoading(true);

    try {
      const res = await fetch(`/api/dom-captures/${id}`);
      const data = await res.json();
      setDetailData(data.capture);
    } catch (err) {
      console.error("Failed to fetch capture detail:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  // Delete capture
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this DOM capture?")) return;

    try {
      await fetch(`/api/dom-captures/${id}`, { method: "DELETE" });
      setCaptures((prev) => prev.filter((c) => c.id !== id));
      if (expandedId === id) {
        setExpandedId(null);
        setDetailData(null);
      }
    } catch (err) {
      console.error("Failed to delete capture:", err);
    }
  };

  // Format date
  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  // Filter captures
  const filteredCaptures = captures.filter((c) => {
    const matchesSearch = searchFilter === "" ||
      c.pageUrl.toLowerCase().includes(searchFilter.toLowerCase()) ||
      c.pageType.toLowerCase().includes(searchFilter.toLowerCase());
    const matchesType = typeFilter === "all" || c.pageType === typeFilter;
    return matchesSearch && matchesType;
  });

  // Get unique page types for filter
  const pageTypes = ["all", ...new Set(captures.map((c) => c.pageType))];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <FileCode2 className="h-6 w-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">DOM Captures</h1>
            <p className="text-sm text-zinc-400">
              Captured page structures for selector development
            </p>
          </div>
        </div>
        <button
          onClick={fetchCaptures}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by URL or page type..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          {pageTypes.map((type) => (
            <option key={type} value={type}>
              {type === "all" ? "All Types" : type}
            </option>
          ))}
        </select>
      </div>

      {/* Coverage Guide Section */}
      {showCoverageGuide && (
        <div className="mb-6 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {/* Coverage Header */}
          <div
            className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-800/50"
            onClick={() => setShowCoverageGuide(!showCoverageGuide)}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${coverageStats.allCriticalDone ? "bg-green-500/20" : "bg-amber-500/20"}`}>
                {coverageStats.allCriticalDone ? (
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-amber-400" />
                )}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Capture Coverage: {coverageStats.percentage}%
                </h2>
                <p className="text-sm text-zinc-400">
                  {coverageStats.captured}/{coverageStats.total} page types captured
                  {!coverageStats.allCriticalDone && (
                    <span className="text-amber-400 ml-2">
                      ({coverageStats.criticalTotal - coverageStats.criticalCaptured} critical missing)
                    </span>
                  )}
                </p>
              </div>
            </div>
            <ChevronDown className={`h-5 w-5 text-zinc-500 transition-transform ${showCoverageGuide ? "" : "-rotate-90"}`} />
          </div>

          {/* Coverage Checklist */}
          <div className="border-t border-zinc-800 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              {coverageStatus.map((item) => (
                <div
                  key={item.type}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    item.captured
                      ? "bg-green-500/5 border-green-500/20"
                      : item.priority === "critical"
                      ? "bg-red-500/5 border-red-500/20"
                      : "bg-zinc-800/30 border-zinc-700/50"
                  }`}
                >
                  {item.captured ? (
                    <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Circle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
                      item.priority === "critical" ? "text-red-400" : "text-zinc-500"
                    }`} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${item.captured ? "text-green-400" : "text-white"}`}>
                        {item.label}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-medium ${
                        item.priority === "critical"
                          ? "bg-red-500/20 text-red-400"
                          : item.priority === "high"
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-zinc-500/20 text-zinc-400"
                      }`}>
                        {item.priority}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">{item.description}</p>
                    {item.captured ? (
                      <p className="text-xs text-green-500/70 mt-1">
                        {item.captureCount} capture{item.captureCount !== 1 ? "s" : ""} available
                      </p>
                    ) : (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 mt-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open this page to capture
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Instructions */}
            <div className="mt-4 p-3 bg-zinc-800/30 rounded-lg border border-zinc-700/50">
              <p className="text-xs text-zinc-400">
                <strong className="text-zinc-300">How to capture:</strong> Navigate to each URL above in your browser,
                then click the <span className="text-purple-400">"Capture DOM Structure"</span> button in the extension popup.
                Critical pages are required for the scraper to work correctly.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Toggle Coverage Guide when collapsed */}
      {!showCoverageGuide && (
        <button
          onClick={() => setShowCoverageGuide(true)}
          className="mb-4 px-4 py-2 bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700 rounded-lg text-sm text-zinc-400 flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4" />
          Show Capture Guide ({coverageStats.captured}/{coverageStats.total} captured)
        </button>
      )}

      {/* Captures List */}
      {loading ? (
        <div className="text-center py-12 text-zinc-500">Loading captures...</div>
      ) : filteredCaptures.length === 0 ? (
        <div className="text-center py-12">
          <FileCode2 className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-400 mb-2">No DOM captures yet</p>
          <p className="text-sm text-zinc-500">
            Navigate to Upwork and click "Capture DOM Structure" in the extension popup
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCaptures.map((capture) => (
            <div
              key={capture.id}
              className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden"
            >
              {/* Capture Header */}
              <div
                onClick={() => handleExpand(capture.id)}
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  {expandedId === capture.id ? (
                    <ChevronDown className="h-5 w-5 text-zinc-500" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-zinc-500" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                        capture.pageType === "job-list" ? "bg-blue-500/20 text-blue-400" :
                        capture.pageType === "job-detail" ? "bg-green-500/20 text-green-400" :
                        capture.pageType === "profile" ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-zinc-500/20 text-zinc-400"
                      }`}>
                        {capture.pageType}
                      </span>
                      <span className="text-sm text-zinc-400">{capture.platform}</span>
                    </div>
                    <p className="text-sm text-zinc-300 mt-1 truncate max-w-xl">
                      {capture.pageUrl}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1 text-xs text-zinc-500">
                    <Clock className="h-3 w-3" />
                    {formatDate(capture.capturedAt)}
                  </div>
                  <button
                    onClick={(e) => handleDelete(capture.id, e)}
                    className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Expanded Detail */}
              {expandedId === capture.id && (
                <div className="border-t border-zinc-800 p-4">
                  {detailLoading ? (
                    <div className="text-center py-8 text-zinc-500">Loading details...</div>
                  ) : detailData ? (
                    <div className="space-y-6">
                      {/* Structure Summary */}
                      {detailData.fullStructure && (
                        <div>
                          <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                            <Globe className="h-4 w-4" />
                            Page Structure Summary
                          </h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-zinc-800/50 rounded-lg p-3">
                              <p className="text-xs text-zinc-500">Page Title</p>
                              <p className="text-sm text-white truncate">{detailData.fullStructure.title || "N/A"}</p>
                            </div>
                            <div className="bg-zinc-800/50 rounded-lg p-3">
                              <p className="text-xs text-zinc-500">Job Cards Found</p>
                              <p className="text-lg font-bold text-white">{detailData.fullStructure.jobCount || 0}</p>
                            </div>
                            <div className="bg-zinc-800/50 rounded-lg p-3">
                              <p className="text-xs text-zinc-500">Has Client Info</p>
                              <p className={`text-sm font-medium ${detailData.fullStructure.hasClientInfo ? "text-green-400" : "text-red-400"}`}>
                                {detailData.fullStructure.hasClientInfo ? "Yes" : "No"}
                              </p>
                            </div>
                            <div className="bg-zinc-800/50 rounded-lg p-3">
                              <p className="text-xs text-zinc-500">Data Attributes</p>
                              <p className="text-lg font-bold text-white">{detailData.dataAttributes.length}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Data Attributes */}
                      <div>
                        <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                          <Code className="h-4 w-4" />
                          Data Attributes ({detailData.dataAttributes.length})
                        </h3>
                        <div className="bg-zinc-950 rounded-lg p-4 max-h-64 overflow-y-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-zinc-500 border-b border-zinc-800">
                                <th className="text-left py-2 pr-4">Attribute</th>
                                <th className="text-left py-2 pr-4">Tag</th>
                                <th className="text-left py-2">Preview</th>
                              </tr>
                            </thead>
                            <tbody className="font-mono text-xs">
                              {detailData.dataAttributes.slice(0, 50).map((attr, i) => (
                                <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                                  <td className="py-2 pr-4 text-purple-400">{attr.attr || "(none)"}</td>
                                  <td className="py-2 pr-4 text-blue-400">&lt;{attr.tag}&gt;</td>
                                  <td className="py-2 text-zinc-500 truncate max-w-xs">{attr.textPreview || ""}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {detailData.dataAttributes.length > 50 && (
                            <p className="text-xs text-zinc-500 mt-2">
                              + {detailData.dataAttributes.length - 50} more attributes
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Unique Classes */}
                      {detailData.fullStructure?.uniqueClasses && detailData.fullStructure.uniqueClasses.length > 0 && (
                        <div>
                          <h3 className="text-sm font-medium text-zinc-300 mb-3">
                            Job/Client Related Classes
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            {detailData.fullStructure.uniqueClasses.map((cls, i) => (
                              <span
                                key={i}
                                className="px-2 py-1 bg-zinc-800 text-zinc-300 rounded text-xs font-mono"
                              >
                                .{cls}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Job Card Sample */}
                      {detailData.jobCardSample && (
                        <div>
                          <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                            <Eye className="h-4 w-4" />
                            Job Card HTML Sample
                          </h3>
                          <div className="bg-zinc-950 rounded-lg p-4 max-h-64 overflow-auto">
                            <pre className="text-xs text-zinc-400 whitespace-pre-wrap break-all font-mono">
                              {detailData.jobCardSample.slice(0, 5000)}
                              {detailData.jobCardSample.length > 5000 && "\n... (truncated)"}
                            </pre>
                          </div>
                        </div>
                      )}

                      {/* Client Section Sample */}
                      {detailData.clientSection && (
                        <div>
                          <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                            <Eye className="h-4 w-4" />
                            Client Section HTML Sample
                          </h3>
                          <div className="bg-zinc-950 rounded-lg p-4 max-h-64 overflow-auto">
                            <pre className="text-xs text-zinc-400 whitespace-pre-wrap break-all font-mono">
                              {detailData.clientSection.slice(0, 5000)}
                              {detailData.clientSection.length > 5000 && "\n... (truncated)"}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-zinc-500">No detail data available</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
