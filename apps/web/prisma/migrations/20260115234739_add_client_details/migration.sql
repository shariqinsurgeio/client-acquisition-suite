-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "clientActiveFreelancers" INTEGER,
ADD COLUMN     "clientCity" TEXT,
ADD COLUMN     "clientJobsPosted" INTEGER,
ADD COLUMN     "clientLocalTime" TEXT,
ADD COLUMN     "clientPhoneVerified" BOOLEAN NOT NULL DEFAULT false;
