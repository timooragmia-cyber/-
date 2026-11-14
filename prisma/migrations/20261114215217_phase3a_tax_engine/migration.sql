-- CreateTable
CREATE TABLE "cpi_values" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "valueMilli" INTEGER NOT NULL,
    "base" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cpi_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculation_runs" (
    "id" TEXT NOT NULL,
    "householdId" TEXT,
    "calculator" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT,
    "inputs" JSONB NOT NULL,
    "rulesUsed" JSONB NOT NULL,
    "steps" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calculation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cpi_values_period_key" ON "cpi_values"("period");

-- CreateIndex
CREATE INDEX "calculation_runs_householdId_createdAt_idx" ON "calculation_runs"("householdId", "createdAt");

-- AddForeignKey
ALTER TABLE "calculation_runs" ADD CONSTRAINT "calculation_runs_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
