import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET /api/analytics - Get analytics summary and ROI dashboard
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type") || "summary";
    const range = parseInt(searchParams.get("range") || "30", 10);

    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - range);

    switch (type) {
      case "summary":
        return await getSummary(userId, startDate);
      case "daily":
        return await getDailyBreakdown(userId, startDate);
      case "funnel":
        return await getFunnel(userId, startDate);
      case "pipeline":
        return await getPipelineStats(userId);
      default:
        return await getSummary(userId, startDate);
    }
  } catch (error) {
    console.error("Analytics API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}

// Summary: ROI Dashboard data
async function getSummary(userId: string, startDate: Date) {
  // Get job counts by status
  const jobCounts = await prisma.job.groupBy({
    by: ["status"],
    where: {
      userId,
      createdAt: { gte: startDate },
    },
    _count: true,
  });

  // Get total jobs
  const totalJobs = await prisma.job.count({
    where: {
      userId,
      createdAt: { gte: startDate },
    },
  });

  // Get jobs with applied status
  const appliedJobs = await prisma.job.count({
    where: {
      userId,
      status: { in: ["APPLIED", "INTERVIEWING", "HIRED"] },
      createdAt: { gte: startDate },
    },
  });

  // Get interviewing count
  const interviewingJobs = await prisma.job.count({
    where: {
      userId,
      status: "INTERVIEWING",
      createdAt: { gte: startDate },
    },
  });

  // Get hired count
  const hiredJobs = await prisma.job.count({
    where: {
      userId,
      status: "HIRED",
      createdAt: { gte: startDate },
    },
  });

  // Calculate connects spent (sum of connectsCost for applied jobs)
  const connectsData = await prisma.job.aggregate({
    where: {
      userId,
      status: { in: ["APPLIED", "INTERVIEWING", "HIRED"] },
      createdAt: { gte: startDate },
    },
    _sum: {
      connectsCost: true,
    },
  });

  const connectsSpent = connectsData._sum.connectsCost || 0;
  const connectsCost = connectsSpent * 0.15; // $0.15 per connect

  // Calculate rates
  const responseRate = appliedJobs > 0 ? (interviewingJobs / appliedJobs) * 100 : 0;
  const winRate = interviewingJobs > 0 ? (hiredJobs / interviewingJobs) * 100 : 0;
  const costPerLead = interviewingJobs > 0 ? connectsCost / interviewingJobs : 0;
  const costPerWin = hiredJobs > 0 ? connectsCost / hiredJobs : 0;

  // Get user profile for additional stats
  const userProfile = await prisma.userProfile.findUnique({
    where: { userId },
  });

  return NextResponse.json({
    // Investment
    connectsSpent,
    connectsCost: Math.round(connectsCost * 100) / 100,
    connectsBalance: userProfile?.connectsBalance || 0,

    // Funnel
    jobsScraped: totalJobs,
    proposalsSent: appliedJobs,
    responsesReceived: interviewingJobs,
    interviewsScheduled: interviewingJobs,
    jobsWon: hiredJobs,

    // Rates (as percentages)
    responseRate: Math.round(responseRate * 10) / 10,
    interviewRate: Math.round(responseRate * 10) / 10,
    winRate: Math.round(winRate * 10) / 10,

    // ROI
    costPerLead: Math.round(costPerLead * 100) / 100,
    costPerWin: Math.round(costPerWin * 100) / 100,

    // Breakdown by status
    statusBreakdown: jobCounts.reduce((acc, item) => {
      acc[item.status] = item._count;
      return acc;
    }, {} as Record<string, number>),

    // Period
    periodDays: Math.ceil((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
  });
}

// Daily breakdown for charts
async function getDailyBreakdown(userId: string, startDate: Date) {
  // Get daily analytics if they exist
  const dailyAnalytics = await prisma.dailyAnalytics.findMany({
    where: {
      userId,
      date: { gte: startDate },
    },
    orderBy: { date: "asc" },
  });

  // If no daily analytics, aggregate from jobs
  if (dailyAnalytics.length === 0) {
    const jobs = await prisma.job.findMany({
      where: {
        userId,
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
        status: true,
        connectsCost: true,
      },
    });

    // Group by date
    const dailyMap = new Map<string, {
      date: string;
      jobsScraped: number;
      proposalsSent: number;
      connectsSpent: number;
    }>();

    jobs.forEach((job) => {
      const dateKey = job.createdAt.toISOString().split("T")[0];
      const existing = dailyMap.get(dateKey) || {
        date: dateKey,
        jobsScraped: 0,
        proposalsSent: 0,
        connectsSpent: 0,
      };

      existing.jobsScraped += 1;
      if (["APPLIED", "INTERVIEWING", "HIRED"].includes(job.status)) {
        existing.proposalsSent += 1;
        existing.connectsSpent += job.connectsCost || 0;
      }

      dailyMap.set(dateKey, existing);
    });

    return NextResponse.json({
      daily: Array.from(dailyMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      ),
    });
  }

  return NextResponse.json({
    daily: dailyAnalytics.map((d) => ({
      date: d.date.toISOString().split("T")[0],
      jobsScraped: d.jobsScraped,
      proposalsSent: d.proposalsSent,
      connectsSpent: d.connectsSpent,
      responsesReceived: d.responsesReceived,
      interviewsScheduled: d.interviewsScheduled,
      jobsWon: d.jobsWon,
      revenueEarned: d.revenueEarned,
    })),
  });
}

// Funnel metrics
async function getFunnel(userId: string, startDate: Date) {
  const [scraped, saved, applied, interviewing, hired] = await Promise.all([
    prisma.job.count({
      where: { userId, createdAt: { gte: startDate } },
    }),
    prisma.job.count({
      where: { userId, status: "SAVED", createdAt: { gte: startDate } },
    }),
    prisma.job.count({
      where: { userId, status: "APPLIED", createdAt: { gte: startDate } },
    }),
    prisma.job.count({
      where: { userId, status: "INTERVIEWING", createdAt: { gte: startDate } },
    }),
    prisma.job.count({
      where: { userId, status: "HIRED", createdAt: { gte: startDate } },
    }),
  ]);

  return NextResponse.json({
    funnel: [
      { stage: "Scraped", count: scraped, percentage: 100 },
      { stage: "Saved", count: saved, percentage: scraped > 0 ? (saved / scraped) * 100 : 0 },
      { stage: "Applied", count: applied, percentage: scraped > 0 ? (applied / scraped) * 100 : 0 },
      { stage: "Interviewing", count: interviewing, percentage: applied > 0 ? (interviewing / applied) * 100 : 0 },
      { stage: "Hired", count: hired, percentage: interviewing > 0 ? (hired / interviewing) * 100 : 0 },
    ],
  });
}

// Pipeline stats by stage
async function getPipelineStats(userId: string) {
  const stages = ["NEW", "SAVED", "QUEUED", "APPLIED", "INTERVIEWING", "HIRED", "ARCHIVED"];

  const counts = await Promise.all(
    stages.map(async (status) => {
      const count = await prisma.job.count({
        where: { userId, status },
      });
      return { status, count };
    })
  );

  // Get stale leads (applied > 7 days ago, not moved to interviewing)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const staleLeads = await prisma.job.count({
    where: {
      userId,
      status: "APPLIED",
      appliedAt: { lt: sevenDaysAgo },
    },
  });

  // Get recent activity
  const recentJobs = await prisma.job.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: {
      id: true,
      title: true,
      status: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    stages: counts,
    staleLeads,
    recentActivity: recentJobs,
    totalActive: counts
      .filter((c) => !["ARCHIVED", "HIRED"].includes(c.status))
      .reduce((sum, c) => sum + c.count, 0),
  });
}

// POST /api/analytics - Record daily analytics
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Upsert daily analytics
    const analytics = await prisma.dailyAnalytics.upsert({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
      update: {
        jobsScraped: { increment: body.jobsScraped || 0 },
        proposalsSent: { increment: body.proposalsSent || 0 },
        connectsSpent: { increment: body.connectsSpent || 0 },
        responsesReceived: { increment: body.responsesReceived || 0 },
        interviewsScheduled: { increment: body.interviewsScheduled || 0 },
        jobsWon: { increment: body.jobsWon || 0 },
        revenueEarned: { increment: body.revenueEarned || 0 },
      },
      create: {
        userId,
        date: today,
        jobsScraped: body.jobsScraped || 0,
        proposalsSent: body.proposalsSent || 0,
        connectsSpent: body.connectsSpent || 0,
        responsesReceived: body.responsesReceived || 0,
        interviewsScheduled: body.interviewsScheduled || 0,
        jobsWon: body.jobsWon || 0,
        revenueEarned: body.revenueEarned || 0,
      },
    });

    return NextResponse.json(analytics);
  } catch (error) {
    console.error("Analytics POST error:", error);
    return NextResponse.json(
      { error: "Failed to record analytics" },
      { status: 500 }
    );
  }
}
