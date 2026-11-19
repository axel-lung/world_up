ALTER TYPE "public"."notification_kind" ADD VALUE 'packs_full';--> statement-breakpoint
ALTER TABLE "pack_state" ADD COLUMN "notify_when_full" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "pack_state_notify_when_full_idx" ON "pack_state" USING btree ("collection_id") WHERE "pack_state"."notify_when_full";