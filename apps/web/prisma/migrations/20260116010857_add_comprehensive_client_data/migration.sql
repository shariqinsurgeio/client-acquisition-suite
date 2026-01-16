-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "clientHistoryCount" INTEGER,
ADD COLUMN     "clientOtherJobs" TEXT,
ADD COLUMN     "clientOtherJobsCount" INTEGER,
ADD COLUMN     "clientRecentContracts" TEXT,
ADD COLUMN     "projectType" TEXT,
ADD COLUMN     "toolsRequired" TEXT,
ADD COLUMN     "unansweredInvites" INTEGER;
