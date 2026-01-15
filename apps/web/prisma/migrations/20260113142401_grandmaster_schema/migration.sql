-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "appliedAt" TIMESTAMP(3),
ADD COLUMN     "clientAvgHourly" DOUBLE PRECISION,
ADD COLUMN     "clientCountry" TEXT,
ADD COLUMN     "clientHireRate" DOUBLE PRECISION,
ADD COLUMN     "clientLocation" TEXT,
ADD COLUMN     "clientName" TEXT,
ADD COLUMN     "clientPaymentVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clientReviewCount" INTEGER,
ADD COLUMN     "clientTotalSpent" DOUBLE PRECISION,
ADD COLUMN     "connectsCost" INTEGER,
ADD COLUMN     "connectsRefunded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dealBreakers" TEXT,
ADD COLUMN     "hasExternalLinks" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "keywordsFound" TEXT,
ADD COLUMN     "lastContactAt" TIMESTAMP(3),
ADD COLUMN     "postedAgo" TEXT;

-- CreateTable
CREATE TABLE "UserPersona" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'Direct',
    "expertiseTags" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPersona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "autoDeclineRateIncrease" BOOLEAN NOT NULL DEFAULT true,
    "defaultSignOff" TEXT NOT NULL DEFAULT 'Peace ✌️',
    "minHireRate" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "minAvgHourly" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "bigFiveOnly" BOOLEAN NOT NULL DEFAULT false,
    "liveStreamEnabled" BOOLEAN NOT NULL DEFAULT false,
    "liveStreamIntervalSec" INTEGER NOT NULL DEFAULT 60,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserPersona_userId_idx" ON "UserPersona"("userId");

-- CreateIndex
CREATE INDEX "Asset_userId_idx" ON "Asset"("userId");

-- CreateIndex
CREATE INDEX "Asset_userId_type_idx" ON "Asset"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE INDEX "UserSettings_userId_idx" ON "UserSettings"("userId");

-- CreateIndex
CREATE INDEX "Job_userId_fitScore_idx" ON "Job"("userId", "fitScore");

-- CreateIndex
CREATE INDEX "Job_clientCountry_idx" ON "Job"("clientCountry");
