-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADVISOR', 'CLIENT');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('he', 'ar');

-- CreateEnum
CREATE TYPE "HouseholdStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RiskTolerance" AS ENUM ('VERY_LOW', 'LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('PRIMARY', 'SPOUSE', 'DEPENDENT', 'OTHER');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('SALARIED', 'SELF_EMPLOYED', 'BOTH', 'NOT_EMPLOYED', 'RETIRED');

-- CreateEnum
CREATE TYPE "IncomeType" AS ENUM ('SALARY', 'SELF_EMPLOYMENT', 'BONUS', 'RENTAL', 'PENSION', 'ALLOWANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "Regularity" AS ENUM ('FIXED', 'IRREGULAR');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'ACHIEVED', 'DROPPED');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('DATA_PROCESSING', 'STATEMENT_IMPORT', 'REPORT_DELIVERY_EMAIL');

-- CreateEnum
CREATE TYPE "ConsentMethod" AS ENUM ('SIGNED_FORM', 'PORTAL_ACCEPTANCE', 'RECORDED_VERBAL');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('BANK_ACCOUNT', 'CREDIT_CARD', 'CASH');

-- CreateEnum
CREATE TYPE "Institution" AS ENUM ('LEUMI', 'HAPOALIM', 'DISCOUNT', 'MIZRAHI_TEFAHOT', 'ISRACARD', 'CAL', 'MAX', 'OTHER');

-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('STATEMENT', 'PENSION_REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING_REVIEW', 'IMPORTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEW', 'COMMITTED', 'UNDONE', 'FAILED');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');

-- CreateEnum
CREATE TYPE "SpendNature" AS ENUM ('FIXED', 'VARIABLE', 'DISCRETIONARY');

-- CreateEnum
CREATE TYPE "CategorySource" AS ENUM ('NONE', 'RULE', 'LEARNED', 'MANUAL');

-- CreateEnum
CREATE TYPE "RuleMatch" AS ENUM ('CONTAINS', 'STARTS_WITH', 'EQUALS', 'REGEX');

-- CreateEnum
CREATE TYPE "RuleOrigin" AS ENUM ('SYSTEM', 'ADVISOR', 'LEARNED');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('VERIFIED', 'UNVERIFIED', 'MISSING');

-- CreateEnum
CREATE TYPE "FeeBase" AS ENUM ('DEPOSITS', 'ACCUMULATION');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGIN_LOCKED', 'LOGOUT', 'TWO_FACTOR_ENROLLED', 'TWO_FACTOR_FAILED', 'VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'IMPORT_COMMIT', 'IMPORT_UNDO', 'MONTH_CLOSE', 'CONFIG_CHANGE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "displayName" TEXT NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'he',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "totpSecretEnc" TEXT,
    "totpEnabledAt" TIMESTAMP(3),
    "totpLastCounter" BIGINT,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "householdId" TEXT,
    "personId" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secondFactorDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "households" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "HouseholdStatus" NOT NULL DEFAULT 'ONBOARDING',
    "preferredLocale" "Locale" NOT NULL DEFAULT 'he',
    "riskTolerance" "RiskTolerance",
    "riskAssessedAt" TIMESTAMP(3),
    "city" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persons" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "memberRole" "MemberRole" NOT NULL,
    "birthYear" INTEGER,
    "employmentType" "EmploymentType",
    "nationalIdEnc" TEXT,
    "nationalIdIndex" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "income_sources" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "personId" TEXT,
    "type" "IncomeType" NOT NULL,
    "label" TEXT NOT NULL,
    "grossMonthly" BIGINT,
    "netMonthly" BIGINT,
    "regularity" "Regularity" NOT NULL DEFAULT 'FIXED',
    "activeFrom" DATE,
    "activeTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "income_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetAmount" BIGINT NOT NULL,
    "targetDate" DATE,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "personId" TEXT,
    "type" "ConsentType" NOT NULL,
    "textVersion" TEXT NOT NULL,
    "method" "ConsentMethod" NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "recordedByUserId" TEXT NOT NULL,
    "documentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_accounts" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "ownerPersonId" TEXT,
    "kind" "AccountKind" NOT NULL,
    "institution" "Institution" NOT NULL,
    "nickname" TEXT NOT NULL,
    "last4" VARCHAR(4),
    "currency" CHAR(3) NOT NULL DEFAULT 'ILS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_files" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "purpose" "FilePurpose" NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_mappings" (
    "id" TEXT NOT NULL,
    "householdId" TEXT,
    "institution" "Institution" NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "isPreset" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "fileId" TEXT,
    "mappingId" TEXT,
    "adapter" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "rowsTotal" INTEGER NOT NULL DEFAULT 0,
    "rowsImported" INTEGER NOT NULL DEFAULT 0,
    "rowsDuplicate" INTEGER NOT NULL DEFAULT 0,
    "rowsError" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" "CategoryKind" NOT NULL,
    "nature" "SpendNature",
    "nameHe" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "importBatchId" TEXT,
    "date" DATE NOT NULL,
    "chargeDate" DATE,
    "amount" BIGINT NOT NULL,
    "originalAmount" BIGINT,
    "originalCurrency" CHAR(3),
    "description" TEXT NOT NULL,
    "merchantNormalized" TEXT,
    "categoryId" TEXT,
    "categorySource" "CategorySource" NOT NULL DEFAULT 'NONE',
    "installmentNumber" INTEGER,
    "installmentTotal" INTEGER,
    "isTransfer" BOOLEAN NOT NULL DEFAULT false,
    "dedupKey" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorization_rules" (
    "id" TEXT NOT NULL,
    "householdId" TEXT,
    "match" "RuleMatch" NOT NULL,
    "pattern" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "origin" "RuleOrigin" NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categorization_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "monthlyAmount" BIGINT NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_snapshots" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "totalIncome" BIGINT NOT NULL,
    "totalExpenses" BIGINT NOT NULL,
    "surplus" BIGINT NOT NULL,
    "savingsRatePpm" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "calcVersion" TEXT NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "closedByUserId" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advisor_notes" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "period" TEXT,
    "body" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advisor_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_items" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "period" TEXT,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "status" "ActionStatus" NOT NULL DEFAULT 'OPEN',
    "visibleToClient" BOOLEAN NOT NULL DEFAULT true,
    "dueDate" DATE,
    "createdByUserId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "action_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rules" (
    "id" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL DEFAULT 'IL',
    "parameters" JSONB,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "sourceUrl" TEXT,
    "sourceTitle" TEXT,
    "status" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "lastVerifiedByUserId" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_benchmarks" (
    "id" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "feeBase" "FeeBase" NOT NULL,
    "benchmarkPpm" INTEGER,
    "legalCeilingPpm" INTEGER,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "sourceUrl" TEXT,
    "sourceTitle" TEXT,
    "status" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "lastVerifiedByUserId" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_benchmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advisory_parameters" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "description" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advisory_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "actorRole" "Role",
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "householdId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_personId_key" ON "users"("personId");

-- CreateIndex
CREATE INDEX "users_householdId_idx" ON "users"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "recovery_codes_userId_idx" ON "recovery_codes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "persons_nationalIdIndex_key" ON "persons"("nationalIdIndex");

-- CreateIndex
CREATE INDEX "persons_householdId_idx" ON "persons"("householdId");

-- CreateIndex
CREATE INDEX "income_sources_householdId_idx" ON "income_sources"("householdId");

-- CreateIndex
CREATE INDEX "goals_householdId_idx" ON "goals"("householdId");

-- CreateIndex
CREATE INDEX "consents_householdId_idx" ON "consents"("householdId");

-- CreateIndex
CREATE INDEX "financial_accounts_householdId_idx" ON "financial_accounts"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "uploaded_files_storageKey_key" ON "uploaded_files"("storageKey");

-- CreateIndex
CREATE INDEX "uploaded_files_householdId_idx" ON "uploaded_files"("householdId");

-- CreateIndex
CREATE INDEX "import_mappings_householdId_idx" ON "import_mappings"("householdId");

-- CreateIndex
CREATE INDEX "import_batches_householdId_idx" ON "import_batches"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_key_key" ON "categories"("key");

-- CreateIndex
CREATE INDEX "transactions_householdId_date_idx" ON "transactions"("householdId", "date");

-- CreateIndex
CREATE INDEX "transactions_importBatchId_idx" ON "transactions"("importBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_accountId_dedupKey_key" ON "transactions"("accountId", "dedupKey");

-- CreateIndex
CREATE INDEX "categorization_rules_householdId_idx" ON "categorization_rules"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_householdId_categoryId_effectiveFrom_key" ON "budgets"("householdId", "categoryId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_snapshots_householdId_period_version_key" ON "monthly_snapshots"("householdId", "period", "version");

-- CreateIndex
CREATE INDEX "advisor_notes_householdId_idx" ON "advisor_notes"("householdId");

-- CreateIndex
CREATE INDEX "action_items_householdId_idx" ON "action_items"("householdId");

-- CreateIndex
CREATE INDEX "tax_rules_ruleKey_effectiveFrom_idx" ON "tax_rules"("ruleKey", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "tax_rules_ruleKey_jurisdiction_effectiveFrom_key" ON "tax_rules"("ruleKey", "jurisdiction", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "fee_benchmarks_productType_feeBase_effectiveFrom_key" ON "fee_benchmarks"("productType", "feeBase", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "advisory_parameters_key_effectiveFrom_key" ON "advisory_parameters"("key", "effectiveFrom");

-- CreateIndex
CREATE INDEX "audit_log_householdId_at_idx" ON "audit_log"("householdId", "at");

-- CreateIndex
CREATE INDEX "audit_log_actorUserId_at_idx" ON "audit_log"("actorUserId", "at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_sources" ADD CONSTRAINT "income_sources_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_sources" ADD CONSTRAINT "income_sources_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_mappings" ADD CONSTRAINT "import_mappings_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "uploaded_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "import_mappings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_snapshots" ADD CONSTRAINT "monthly_snapshots_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advisor_notes" ADD CONSTRAINT "advisor_notes_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- Integrity guarantees enforced by the database (not only by app code)
-- ─────────────────────────────────────────────────────────────

-- Monthly snapshots are immutable. Re-closing a month inserts a new version.
-- DELETE is allowed only inside a privacy purge transaction that runs:
--   SET LOCAL app.allow_snapshot_purge = 'on';
CREATE OR REPLACE FUNCTION forbid_snapshot_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'monthly_snapshots are immutable (UPDATE forbidden)';
  END IF;
  IF TG_OP = 'DELETE' AND coalesce(current_setting('app.allow_snapshot_purge', true), '') <> 'on' THEN
    RAISE EXCEPTION 'monthly_snapshots are immutable (DELETE allowed only during privacy purge)';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER monthly_snapshots_immutable
  BEFORE UPDATE OR DELETE ON "monthly_snapshots"
  FOR EACH ROW EXECUTE FUNCTION forbid_snapshot_mutation();

-- Audit log is append-only.
CREATE OR REPLACE FUNCTION forbid_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();

-- Defense in depth for "money is integer agorot": sanity check on rates.
ALTER TABLE "monthly_snapshots" ADD CONSTRAINT savings_rate_ppm_range
  CHECK ("savingsRatePpm" BETWEEN -100000000 AND 1000000);
ALTER TABLE "financial_accounts" ADD CONSTRAINT last4_digits_only
  CHECK ("last4" IS NULL OR "last4" ~ '^[0-9]{4}$');
ALTER TABLE "fee_benchmarks" ADD CONSTRAINT fee_ppm_range
  CHECK (("benchmarkPpm" IS NULL OR "benchmarkPpm" BETWEEN 0 AND 1000000)
     AND ("legalCeilingPpm" IS NULL OR "legalCeilingPpm" BETWEEN 0 AND 1000000));
