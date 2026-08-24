-- Registration lifecycle on companies, capacity + visual industry zones on drafts
CREATE TYPE "RegistrationStatus" AS ENUM ('CONFIRMED', 'PENDING', 'CANCELED');

ALTER TABLE "Company" ADD COLUMN "status" "RegistrationStatus" NOT NULL DEFAULT 'CONFIRMED';
ALTER TABLE "Company" ADD COLUMN "contactName" TEXT;
ALTER TABLE "Company" ADD COLUMN "contactEmail" TEXT;
ALTER TABLE "Company" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "Company" ADD COLUMN "registeredOn" TEXT;

ALTER TABLE "Draft" ADD COLUMN "industryZones" JSONB;
ALTER TABLE "Draft" ADD COLUMN "capacityPerDay" INTEGER NOT NULL DEFAULT 480;
