-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'FETCHING', 'ANALYZING', 'RENDERING', 'DONE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('URL', 'UPLOAD');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClipJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceKind" "SourceKind" NOT NULL,
    "sourceUrl" TEXT,
    "sourceName" TEXT,
    "title" TEXT,
    "uploader" TEXT,
    "thumbnailUrl" TEXT,
    "sourceDuration" DOUBLE PRECISION,
    "sourceWidth" INTEGER,
    "sourceHeight" INTEGER,
    "options" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ClipJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clip" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "score" DOUBLE PRECISION,
    "file" TEXT NOT NULL,
    "thumb" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Clip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ClipJob_userId_createdAt_idx" ON "ClipJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ClipJob_status_createdAt_idx" ON "ClipJob"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Clip_jobId_index_key" ON "Clip"("jobId", "index");

-- AddForeignKey
ALTER TABLE "ClipJob" ADD CONSTRAINT "ClipJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clip" ADD CONSTRAINT "Clip_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ClipJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

