-- AI clipping (OpusClip): the project id on the job, and each clip's headline, caption and hashtags
ALTER TABLE "ClipJob" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Clip" ADD COLUMN "title" TEXT;
ALTER TABLE "Clip" ADD COLUMN "description" TEXT;
ALTER TABLE "Clip" ADD COLUMN "hashtags" TEXT;
