-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "enrichedAt" TIMESTAMP(3),
ADD COLUMN     "needsEnrichment" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "searchKeywords" TEXT;
