-- Content filters, active hours, webhooks and run history for autopilot campaigns

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "excludeKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Campaign" ADD COLUMN "excludeCreators" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Campaign" ADD COLUMN "fromHour" INTEGER;
ALTER TABLE "Campaign" ADD COLUMN "toHour" INTEGER;
ALTER TABLE "Campaign" ADD COLUMN "webhookUrl" TEXT;

-- CreateTable
CREATE TABLE "CampaignRun" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DONE',
    "note" TEXT NOT NULL DEFAULT '',
    "queued" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignRun_campaignId_startedAt_idx" ON "CampaignRun"("campaignId", "startedAt");

-- AddForeignKey
ALTER TABLE "CampaignRun" ADD CONSTRAINT "CampaignRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
