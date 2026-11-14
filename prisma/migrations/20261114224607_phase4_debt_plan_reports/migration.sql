-- CreateEnum
CREATE TYPE "MortgageTrackType" AS ENUM ('PRIME', 'FIXED_UNLINKED', 'FIXED_LINKED', 'VARIABLE_5_UNLINKED', 'VARIABLE_5_LINKED');

-- CreateEnum
CREATE TYPE "AmortizationMethod" AS ENUM ('SPITZER', 'EQUAL_PRINCIPAL');

-- CreateEnum
CREATE TYPE "LoanKind" AS ENUM ('CARD_CREDIT', 'CONSUMER_LOAN', 'CAR_LOAN', 'OTHER');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PROPOSED', 'APPROVED', 'IN_PROGRESS', 'DONE', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('MONTHLY', 'FULL_REVIEW');

-- CreateTable
CREATE TABLE "mortgages" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "lender" TEXT NOT NULL,
    "propertyId" TEXT,
    "asOf" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mortgages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mortgage_tracks" (
    "id" TEXT NOT NULL,
    "mortgageId" TEXT NOT NULL,
    "type" "MortgageTrackType" NOT NULL,
    "method" "AmortizationMethod" NOT NULL DEFAULT 'SPITZER',
    "balance" BIGINT NOT NULL,
    "remainingMonths" INTEGER NOT NULL,
    "annualRatePpm" INTEGER NOT NULL,
    "primeMarginPpm" INTEGER,
    "monthsToReset" INTEGER,

    CONSTRAINT "mortgage_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "kind" "LoanKind" NOT NULL,
    "lender" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "balance" BIGINT NOT NULL,
    "annualRatePpm" INTEGER NOT NULL,
    "monthlyPayment" BIGINT NOT NULL,
    "remainingMonths" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "reason" JSONB NOT NULL,
    "impactMonthly" BIGINT,
    "impactLifetime" BIGINT,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PROPOSED',
    "customTitle" TEXT,
    "advisorNote" TEXT,
    "engineVersion" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "period" TEXT,
    "locale" "Locale" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mortgages_householdId_idx" ON "mortgages"("householdId");

-- CreateIndex
CREATE INDEX "mortgage_tracks_mortgageId_idx" ON "mortgage_tracks"("mortgageId");

-- CreateIndex
CREATE INDEX "loans_householdId_idx" ON "loans"("householdId");

-- CreateIndex
CREATE INDEX "recommendations_householdId_status_idx" ON "recommendations"("householdId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "recommendations_householdId_dedupKey_key" ON "recommendations"("householdId", "dedupKey");

-- CreateIndex
CREATE UNIQUE INDEX "reports_storageKey_key" ON "reports"("storageKey");

-- CreateIndex
CREATE INDEX "reports_householdId_createdAt_idx" ON "reports"("householdId", "createdAt");

-- AddForeignKey
ALTER TABLE "mortgages" ADD CONSTRAINT "mortgages_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mortgage_tracks" ADD CONSTRAINT "mortgage_tracks_mortgageId_fkey" FOREIGN KEY ("mortgageId") REFERENCES "mortgages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
