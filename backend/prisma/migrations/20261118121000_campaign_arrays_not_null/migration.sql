-- The filter arrays are never null: Prisma's schema declares them required
ALTER TABLE "Campaign" ALTER COLUMN "excludeKeywords" SET NOT NULL;
ALTER TABLE "Campaign" ALTER COLUMN "excludeCreators" SET NOT NULL;
