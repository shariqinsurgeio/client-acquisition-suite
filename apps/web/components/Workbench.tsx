"use client";

import { BarChart3, ExternalLink, TrendingUp, Briefcase, Clock, Star } from "lucide-react";
import { useSocket } from "@/context/SocketContext";
import { useEffect, useState } from "react";

interface Job {
  id: string;
  platform: string;
  title: string;
  description: string;
  url: string;
  status: string;
  fitScore: number | null;
  createdAt: string;
}

interface Stats {
  total: number;
  new: number;
  saved: number;
  highScore: number;
  avgScore: number;
  todayCount: number;
}

export const Workbench = () => {
  const [stats, setStats] = useState<Stats>({
    total: 0,
    new: 0,
    saved: 0,
    highScore: 0,
    avgScore: 0,
    todayCount: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/jobs?limit=500");
      if (!res.ok) return;

      const jobs: Job[] = await res.json();

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const scores = jobs.map(j => j.fitScore || 0).filter(s => s > 0);

      setStats({
        total: jobs.length,
        new: jobs.filter(j => j.status === "NEW").length,
        saved: jobs.filter(j => j.status === "SAVED").length,
        highScore: jobs.filter(j => (j.fitScore || 0) >= 70).length,
        avgScore: scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : 0,
        todayCount: jobs.filter(j => new Date(j.createdAt) >= today).length,
      });
    } catch (e) {
      console.error("Failed to fetch stats:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const StatCard = ({
    icon: Icon,
    label,
    value,
    color
  }: {
    icon: any;
    label: string;
    value: number | string;
    color: string;
  }) => (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-800">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
        <h2 className="font-semibold text-gray-700 flex items-center gap-2">
          <BarChart3 className="w-4 h-4" /> Job Statistics
        </h2>
      </div>

      {/* Stats Grid */}
      <div className="p-4 grid grid-cols-2 gap-3">
        <StatCard
          icon={Briefcase}
          label="Total Jobs"
          value={loading ? "..." : stats.total}
          color="bg-indigo-500"
        />
        <StatCard
          icon={Clock}
          label="New Today"
          value={loading ? "..." : stats.todayCount}
          color="bg-blue-500"
        />
        <StatCard
          icon={Star}
          label="Saved"
          value={loading ? "..." : stats.saved}
          color="bg-amber-500"
        />
        <StatCard
          icon={TrendingUp}
          label="High Score (70+)"
          value={loading ? "..." : stats.highScore}
          color="bg-green-500"
        />
      </div>

      {/* Average Score */}
      <div className="px-4 pb-4">
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4 border border-indigo-100">
          <p className="text-sm text-gray-600 mb-1">Average Fit Score</p>
          <div className="flex items-center gap-2">
            <div className="text-3xl font-bold text-indigo-600">
              {loading ? "..." : stats.avgScore}
            </div>
            <div className="text-sm text-gray-400">/ 100</div>
          </div>
        </div>
      </div>

      {/* Quick Tips */}
      <div className="flex-1 p-4 border-t border-gray-100">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Quick Tips</h3>
        <ul className="space-y-2 text-sm text-gray-500">
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">●</span>
            <span>Jobs with <strong>70+</strong> fit score match your skills</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-amber-500 mt-0.5">●</span>
            <span>Save interesting jobs for later review</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5">●</span>
            <span>Click job title to view full description</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-indigo-500 mt-0.5">●</span>
            <span>Use <strong>Open on Platform</strong> to apply directly</span>
          </li>
        </ul>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-100 bg-gray-50">
        <a
          href="https://www.upwork.com/nx/find-work/best-matches"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
        >
          <ExternalLink className="w-4 h-4" />
          Open Upwork Best Matches
        </a>
      </div>
    </div>
  );
};
