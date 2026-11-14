-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('PENSION_COMPREHENSIVE', 'PENSION_GENERAL', 'MANAGERS_INSURANCE', 'PROVIDENT_FUND', 'INVESTMENT_PROVIDENT_FUND', 'STUDY_FUND');

-- AlterTable
ALTER TABLE "financial_accounts" ADD COLUMN     "annualCardFee" BIGINT,
ADD COLUMN     "billingDay" INTEGER,
ADD COLUMN     "creditLimit" BIGINT,
ADD COLUMN     "monthlyFee" BIGINT,
ADD COLUMN     "overdraftLimit" BIGINT,
ADD COLUMN     "overdraftRatePpm" INTEGER;

-- CreateTable
CREATE TABLE "balance_snapshots" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "asOf" DATE NOT NULL,
    "balance" BIGINT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "long_term_products" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "personId" TEXT,
    "productType" "ProductType" NOT NULL,
    "provider" TEXT NOT NULL,
    "track" TEXT,
    "policyLast4" VARCHAR(4),
    "balance" BIGINT NOT NULL,
    "balanceAsOf" DATE NOT NULL,
    "employeeDeposit" BIGINT NOT NULL DEFAULT 0,
    "employerDeposit" BIGINT NOT NULL DEFAULT 0,
    "severanceDeposit" BIGINT NOT NULL DEFAULT 0,
    "feeDepositsPpm" INTEGER NOT NULL DEFAULT 0,
    "feeAccumulationPpm" INTEGER NOT NULL DEFAULT 0,
    "startDate" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "long_term_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_balances" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "asOf" DATE NOT NULL,
    "balance" BIGINT NOT NULL,

    CONSTRAINT "product_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retirement_assumptions" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "retirementAge" INTEGER NOT NULL,
    "conservativeReturnPpm" INTEGER NOT NULL,
    "baseReturnPpm" INTEGER NOT NULL,
    "optimisticReturnPpm" INTEGER NOT NULL,
    "depositGrowthPpm" INTEGER NOT NULL DEFAULT 0,
    "annuityFactorMilli" INTEGER NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retirement_assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "balance_snapshots_accountId_asOf_key" ON "balance_snapshots"("accountId", "asOf");

-- CreateIndex
CREATE INDEX "long_term_products_householdId_idx" ON "long_term_products"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "product_balances_productId_asOf_key" ON "product_balances"("productId", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "retirement_assumptions_householdId_key" ON "retirement_assumptions"("householdId");

-- AddForeignKey
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "long_term_products" ADD CONSTRAINT "long_term_products_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "long_term_products" ADD CONSTRAINT "long_term_products_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_balances" ADD CONSTRAINT "product_balances_productId_fkey" FOREIGN KEY ("productId") REFERENCES "long_term_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retirement_assumptions" ADD CONSTRAINT "retirement_assumptions_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sanity constraints for Phase 2 fields
ALTER TABLE "financial_accounts" ADD CONSTRAINT billing_day_range CHECK ("billingDay" IS NULL OR "billingDay" BETWEEN 1 AND 31);
ALTER TABLE "long_term_products" ADD CONSTRAINT fee_ppm_range_products
  CHECK ("feeDepositsPpm" BETWEEN 0 AND 1000000 AND "feeAccumulationPpm" BETWEEN 0 AND 1000000);
ALTER TABLE "long_term_products" ADD CONSTRAINT policy_last4_digits CHECK ("policyLast4" IS NULL OR "policyLast4" ~ '^[0-9]{4}$');
