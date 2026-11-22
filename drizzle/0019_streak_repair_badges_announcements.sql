CREATE TYPE "public"."announcement_tone" AS ENUM('info', 'important');--> statement-breakpoint
ALTER TYPE "public"."coin_reason" ADD VALUE 'streak_repair';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'streak_reminder';--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "announcements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"message" text NOT NULL,
	"link_url" text,
	"link_label" text,
	"tone" "announcement_tone" DEFAULT 'info' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcements_ends_after_start" CHECK ("announcements"."ends_at" IS NULL OR "announcements"."ends_at" >= "announcements"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "featured_badges" (
	"user_id" uuid NOT NULL,
	"collection_id" integer NOT NULL,
	"achievement_id" integer NOT NULL,
	CONSTRAINT "featured_badges_user_id_collection_id_pk" PRIMARY KEY("user_id","collection_id")
);
--> statement-breakpoint
ALTER TABLE "game_rules" ADD COLUMN "streak_repair_coins_per_day" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_rules" ADD COLUMN "streak_repair_max_coins" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "pack_state" ADD COLUMN "streak_frozen_days" date[] DEFAULT '{}'::date[] NOT NULL;--> statement-breakpoint
ALTER TABLE "pack_state" ADD COLUMN "streak_lost_days" integer;--> statement-breakpoint
ALTER TABLE "pack_state" ADD COLUMN "streak_lost_last_day" date;--> statement-breakpoint
ALTER TABLE "pack_state" ADD COLUMN "streak_reminder" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "pack_state" ADD COLUMN "streak_reminded_on" date;--> statement-breakpoint
ALTER TABLE "featured_badges" ADD CONSTRAINT "featured_badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_badges" ADD CONSTRAINT "featured_badges_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_badges" ADD CONSTRAINT "featured_badges_achievement_fk" FOREIGN KEY ("user_id","achievement_id") REFERENCES "public"."user_achievements"("user_id","achievement_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcements_starts_at_idx" ON "announcements" USING btree ("starts_at");