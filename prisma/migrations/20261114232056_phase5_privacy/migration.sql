-- CreateEnum
CREATE TYPE "PrivacyRequestType" AS ENUM ('ACCESS', 'CORRECTION', 'DELETION');

-- CreateEnum
CREATE TYPE "PrivacyRequestStatus" AS ENUM ('OPEN', 'DONE', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'RESTRICT';
ALTER TYPE "AuditAction" ADD VALUE 'UNRESTRICT';
ALTER TYPE "AuditAction" ADD VALUE 'PURGE';

-- AlterTable
ALTER TABLE "households" ADD COLUMN     "restrictedAt" TIMESTAMP(3),
ADD COLUMN     "restrictedReason" TEXT;

-- CreateTable
CREATE TABLE "privacy_requests" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "type" "PrivacyRequestType" NOT NULL,
    "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'OPEN',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "details" TEXT,
    "createdByUserId" TEXT,
    "handledAt" TIMESTAMP(3),
    "handledByUserId" TEXT,
    "resolution" TEXT,

    CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "privacy_requests_householdId_receivedAt_idx" ON "privacy_requests"("householdId", "receivedAt");

-- CreateIndex
CREATE INDEX "privacy_requests_status_dueAt_idx" ON "privacy_requests"("status", "dueAt");

-- AddForeignKey
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
