-- Rename columns: Sarah-specific names -> generic agent
ALTER TABLE "SiteSettings" RENAME COLUMN "llmSarahModel" TO "llmAgentModel";
ALTER TABLE "SiteSettings" RENAME COLUMN "promptSarahIntro" TO "promptAgentIntro";
ALTER TABLE "SiteSettings" RENAME COLUMN "promptSarahTone" TO "promptAgentTone";
