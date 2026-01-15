-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "autoShortlistEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "autoShortlistThreshold" INTEGER NOT NULL DEFAULT 80,
ADD COLUMN     "enrichmentThreshold" INTEGER NOT NULL DEFAULT 70;
