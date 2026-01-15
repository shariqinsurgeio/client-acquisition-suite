-- AlterTable
ALTER TABLE "UserSettings" ALTER COLUMN "defaultSignOff" SET DEFAULT 'Peace';

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "upworkUsername" TEXT,
    "upworkProfileUrl" TEXT,
    "profileBio" TEXT,
    "connectsBalance" INTEGER NOT NULL DEFAULT 0,
    "connectsSpentTotal" INTEGER NOT NULL DEFAULT 0,
    "connectsRefundedTotal" INTEGER NOT NULL DEFAULT 0,
    "proposalsSentTotal" INTEGER NOT NULL DEFAULT 0,
    "proposalsActiveCount" INTEGER NOT NULL DEFAULT 0,
    "interviewsTotal" INTEGER NOT NULL DEFAULT 0,
    "hiresTotal" INTEGER NOT NULL DEFAULT 0,
    "profileCompletionPct" INTEGER NOT NULL DEFAULT 0,
    "availabilityStatus" TEXT NOT NULL DEFAULT 'available',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "playbook" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "psLine" TEXT,
    "assetsUsed" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sentAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyAnalytics" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "jobsScraped" INTEGER NOT NULL DEFAULT 0,
    "proposalsSent" INTEGER NOT NULL DEFAULT 0,
    "connectsSpent" INTEGER NOT NULL DEFAULT 0,
    "responsesReceived" INTEGER NOT NULL DEFAULT 0,
    "interviewsScheduled" INTEGER NOT NULL DEFAULT 0,
    "jobsWon" INTEGER NOT NULL DEFAULT 0,
    "revenueEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "upworkClientId" TEXT,
    "totalJobsPosted" INTEGER NOT NULL DEFAULT 0,
    "avgBudget" DOUBLE PRECISION,
    "avgHourlyRate" DOUBLE PRECISION,
    "totalSpent" DOUBLE PRECISION,
    "hireRate" DOUBLE PRECISION,
    "previousWorkCount" INTEGER NOT NULL DEFAULT 0,
    "lastContactAt" TIMESTAMP(3),
    "notes" TEXT,
    "isVIP" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE INDEX "UserProfile_userId_idx" ON "UserProfile"("userId");

-- CreateIndex
CREATE INDEX "ProposalDraft_userId_idx" ON "ProposalDraft"("userId");

-- CreateIndex
CREATE INDEX "ProposalDraft_jobId_idx" ON "ProposalDraft"("jobId");

-- CreateIndex
CREATE INDEX "DailyAnalytics_userId_idx" ON "DailyAnalytics"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyAnalytics_userId_date_key" ON "DailyAnalytics"("userId", "date");

-- CreateIndex
CREATE INDEX "ClientProfile_userId_idx" ON "ClientProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientProfile_userId_clientName_key" ON "ClientProfile"("userId", "clientName");

-- AddForeignKey
ALTER TABLE "ProposalDraft" ADD CONSTRAINT "ProposalDraft_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
