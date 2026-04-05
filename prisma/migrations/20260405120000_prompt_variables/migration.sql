-- AlterTable
ALTER TABLE "SiteSettings"
ADD COLUMN "promptLiveChatRules" TEXT NOT NULL DEFAULT '',
ADD COLUMN "shopperFacingMaxTokens" INTEGER NOT NULL DEFAULT 700;
