-- AlterTable
ALTER TABLE "Clip" ADD COLUMN     "caption" TEXT,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "transcript" TEXT;

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "sources" TEXT[],
    "days" INTEGER NOT NULL DEFAULT 3,
    "minViews" INTEGER NOT NULL DEFAULT 0,
    "minSubscribers" INTEGER NOT NULL DEFAULT 0,
    "maxMinutes" INTEGER NOT NULL DEFAULT 60,
    "videosPerRun" INTEGER NOT NULL DEFAULT 3,
    "everyHours" INTEGER NOT NULL DEFAULT 6,
    "options" JSONB NOT NULL,
    "autoPublish" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignItem" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "creator" TEXT,
    "views" INTEGER,
    "score" DOUBLE PRECISION,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_userId_idx" ON "Campaign"("userId");

-- CreateIndex
CREATE INDEX "Campaign_enabled_nextRunAt_idx" ON "Campaign"("enabled", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignItem_campaignId_url_key" ON "CampaignItem"("campaignId", "url");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignItem" ADD CONSTRAINT "CampaignItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
