-- Creator allowlist, multi-format campaigns and the job ids of a campaign item

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "includeCreators" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Campaign" ADD COLUMN "formats" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "CampaignItem" ADD COLUMN "jobIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
