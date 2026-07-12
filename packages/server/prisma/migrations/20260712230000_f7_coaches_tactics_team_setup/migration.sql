-- AlterTable
ALTER TABLE "Team" ADD COLUMN "tacticalStyle" TEXT;

-- AlterTable
ALTER TABLE "Coach" ADD COLUMN "overallCoaching" INTEGER;
ALTER TABLE "Coach" ADD COLUMN "playerDevelopment" INTEGER;
ALTER TABLE "Coach" ADD COLUMN "offense" INTEGER;
ALTER TABLE "Coach" ADD COLUMN "defense" INTEGER;
