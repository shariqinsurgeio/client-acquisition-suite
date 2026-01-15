-- CreateTable
CREATE TABLE "ScrapeOperation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "targetUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "jobsFound" INTEGER NOT NULL DEFAULT 0,
    "jobsNew" INTEGER NOT NULL DEFAULT 0,
    "jobsUpdated" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "logs" TEXT,
    "errorMessage" TEXT,
    "jobIds" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapeOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScrapeOperation_userId_idx" ON "ScrapeOperation"("userId");

-- CreateIndex
CREATE INDEX "ScrapeOperation_userId_startedAt_idx" ON "ScrapeOperation"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "ScrapeOperation_userId_status_idx" ON "ScrapeOperation"("userId", "status");
