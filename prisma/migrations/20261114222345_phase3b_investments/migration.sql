-- CreateEnum
CREATE TYPE "PropertyUsage" AS ENUM ('RESIDENCE', 'INVESTMENT');

-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('EQUITY_IL', 'EQUITY_FOREIGN', 'BONDS_GOV', 'BONDS_CORP', 'MONEY_MARKET', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "PortfolioTxnType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'BUY', 'SELL', 'DIVIDEND', 'INTEREST', 'FEE', 'TAX');

-- CreateEnum
CREATE TYPE "FeeKind" AS ENUM ('MANAGEMENT', 'TRADING', 'CUSTODY', 'OTHER');

-- CreateEnum
CREATE TYPE "DepositKind" AS ENUM ('BANK_DEPOSIT', 'MONEY_MARKET_FUND');

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "city" TEXT,
    "usage" "PropertyUsage" NOT NULL,
    "isOnlyApartment" BOOLEAN NOT NULL DEFAULT false,
    "purchaseDate" DATE NOT NULL,
    "purchasePrice" BIGINT NOT NULL,
    "purchaseCosts" BIGINT NOT NULL DEFAULT 0,
    "improvementCosts" BIGINT NOT NULL DEFAULT 0,
    "currentValue" BIGINT NOT NULL,
    "valueAsOf" DATE NOT NULL,
    "monthlyRent" BIGINT NOT NULL DEFAULT 0,
    "monthlyExpenses" BIGINT NOT NULL DEFAULT 0,
    "mortgageBalance" BIGINT NOT NULL DEFAULT 0,
    "monthlyMortgagePayment" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_accounts" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "targetAllocation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_holdings" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "assetClass" "AssetClass" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_txns" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "holdingId" TEXT,
    "date" DATE NOT NULL,
    "type" "PortfolioTxnType" NOT NULL,
    "units" BIGINT NOT NULL DEFAULT 0,
    "amount" BIGINT NOT NULL,
    "feeKind" "FeeKind",
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_txns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holding_valuations" (
    "id" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "asOf" DATE NOT NULL,
    "value" BIGINT NOT NULL,

    CONSTRAINT "holding_valuations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_deposits" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "kind" "DepositKind" NOT NULL,
    "institution" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "balance" BIGINT NOT NULL,
    "balanceAsOf" DATE NOT NULL,
    "annualRatePpm" INTEGER NOT NULL,
    "feePpm" INTEGER NOT NULL DEFAULT 0,
    "maturityDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "savings_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "properties_householdId_idx" ON "properties"("householdId");

-- CreateIndex
CREATE INDEX "portfolio_accounts_householdId_idx" ON "portfolio_accounts"("householdId");

-- CreateIndex
CREATE INDEX "portfolio_holdings_accountId_idx" ON "portfolio_holdings"("accountId");

-- CreateIndex
CREATE INDEX "portfolio_txns_accountId_date_idx" ON "portfolio_txns"("accountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "holding_valuations_holdingId_asOf_key" ON "holding_valuations"("holdingId", "asOf");

-- CreateIndex
CREATE INDEX "savings_deposits_householdId_idx" ON "savings_deposits"("householdId");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_accounts" ADD CONSTRAINT "portfolio_accounts_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_holdings" ADD CONSTRAINT "portfolio_holdings_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "portfolio_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_txns" ADD CONSTRAINT "portfolio_txns_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "portfolio_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_txns" ADD CONSTRAINT "portfolio_txns_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "portfolio_holdings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holding_valuations" ADD CONSTRAINT "holding_valuations_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "portfolio_holdings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_deposits" ADD CONSTRAINT "savings_deposits_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
