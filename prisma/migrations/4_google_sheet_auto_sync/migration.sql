-- Background sync of the connected Google Sheet after booth changes, plus the
-- outcome of the last write so the UI can flag a sheet that fell behind.
ALTER TABLE "Draft" ADD COLUMN "googleAutoSync" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Draft" ADD COLUMN "googleSyncedAt" TIMESTAMP(3);
ALTER TABLE "Draft" ADD COLUMN "googleSyncError" TEXT;
