-- Brand kits (logo watermark + colours) and the content calendar
CREATE TABLE "BrandKit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "primaryColor" TEXT NOT NULL DEFAULT '#C8FF2E',
    "secondaryColor" TEXT NOT NULL DEFAULT '#9B6BFF',
    "logo" TEXT,
    "logoPosition" TEXT NOT NULL DEFAULT 'top-right',
    "logoSize" INTEGER NOT NULL DEFAULT 14,
    "logoOpacity" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BrandKit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BrandKit_userId_idx" ON "BrandKit"("userId");
ALTER TABLE "BrandKit" ADD CONSTRAINT "BrandKit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ScheduledPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScheduledPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ScheduledPost_userId_scheduledAt_idx" ON "ScheduledPost"("userId", "scheduledAt");
ALTER TABLE "ScheduledPost" ADD CONSTRAINT "ScheduledPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduledPost" ADD CONSTRAINT "ScheduledPost_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
