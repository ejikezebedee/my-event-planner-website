-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('payment', 'refund');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "expenseId" BIGINT,
ADD COLUMN     "paymentId" BIGINT;

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "budgetItemId" BIGINT,
ADD COLUMN     "grossOnly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "refundOfPaymentId" BIGINT,
ADD COLUMN     "type" "PaymentType" NOT NULL DEFAULT 'payment';

-- CreateIndex
CREATE INDEX "documents_expenseId_idx" ON "documents"("expenseId");

-- CreateIndex
CREATE INDEX "documents_paymentId_idx" ON "documents"("paymentId");

-- CreateIndex
CREATE INDEX "expenses_budgetItemId_idx" ON "expenses"("budgetItemId");

-- CreateIndex
CREATE INDEX "payments_refundOfPaymentId_idx" ON "payments"("refundOfPaymentId");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_budgetItemId_fkey" FOREIGN KEY ("budgetItemId") REFERENCES "budget_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_refundOfPaymentId_fkey" FOREIGN KEY ("refundOfPaymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
