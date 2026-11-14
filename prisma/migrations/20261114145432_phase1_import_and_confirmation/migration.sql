-- AlterTable
ALTER TABLE "advisory_parameters" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedByUserId" TEXT;

-- AlterTable
ALTER TABLE "import_batches" ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "preview" JSONB,
ADD COLUMN     "sheetName" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
