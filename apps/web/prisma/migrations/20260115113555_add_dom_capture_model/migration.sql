-- CreateTable
CREATE TABLE "DomCapture" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "pageType" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'UPWORK',
    "dataAttributes" TEXT NOT NULL,
    "jobCardSample" TEXT,
    "clientSection" TEXT,
    "fullStructure" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "analyzed" BOOLEAN NOT NULL DEFAULT false,
    "suggestedSelectors" TEXT,

    CONSTRAINT "DomCapture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DomCapture_userId_idx" ON "DomCapture"("userId");

-- CreateIndex
CREATE INDEX "DomCapture_pageType_idx" ON "DomCapture"("pageType");

-- CreateIndex
CREATE INDEX "DomCapture_capturedAt_idx" ON "DomCapture"("capturedAt");
