-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "isShortlisted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scoreClientQuality" INTEGER,
ADD COLUMN     "scoreCompetition" INTEGER,
ADD COLUMN     "scoreRelevance" INTEGER,
ADD COLUMN     "scoreWinLikelihood" INTEGER,
ADD COLUMN     "shortlistedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DailyUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "jobsScraped" INTEGER NOT NULL DEFAULT 0,
    "detailPagesVisited" INTEGER NOT NULL DEFAULT 0,
    "sourcesScraped" INTEGER NOT NULL DEFAULT 0,
    "blocksDetected" INTEGER NOT NULL DEFAULT 0,
    "cooldownsEntered" INTEGER NOT NULL DEFAULT 0,
    "lastCooldownAt" TIMESTAMP(3),
    "cooldownUntil" TIMESTAMP(3),
    "cooldownReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyUsage_userId_idx" ON "DailyUsage"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyUsage_userId_date_key" ON "DailyUsage"("userId", "date");

-- CreateIndex
CREATE INDEX "Job_userId_isShortlisted_idx" ON "Job"("userId", "isShortlisted");
