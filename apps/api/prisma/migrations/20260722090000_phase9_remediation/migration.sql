-- CreateEnum
CREATE TYPE "DocumentScanStatus" AS ENUM ('pending', 'clean', 'infected', 'error');

-- DropIndex
DROP INDEX "payments_idempotencyKey_key";

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "scanStatus" "DocumentScanStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "scannedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "email_change_tokens" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "newEmail" VARCHAR(320) NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_change_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_change_tokens_tokenHash_key" ON "email_change_tokens"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "payments_eventId_idempotencyKey_key" ON "payments"("eventId", "idempotencyKey");

