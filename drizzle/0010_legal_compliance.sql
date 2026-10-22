ALTER TYPE "public"."hidden_reason" ADD VALUE 'national_domain';--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "national_domain" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_active_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "inactivity_notice_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "users_last_active_at_idx" ON "users" USING btree ("last_active_at");