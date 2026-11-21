CREATE TABLE "streak_rewards" (
	"collection_id" integer NOT NULL,
	"days" integer NOT NULL,
	"packs" integer NOT NULL,
	CONSTRAINT "streak_rewards_collection_id_days_pk" PRIMARY KEY("collection_id","days"),
	CONSTRAINT "streak_rewards_positive" CHECK ("streak_rewards"."days" > 0 AND "streak_rewards"."packs" > 0)
);
--> statement-breakpoint
ALTER TABLE "pack_state" ADD COLUMN "streak_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pack_state" ADD COLUMN "streak_last_day" date;--> statement-breakpoint
ALTER TABLE "pack_state" ADD COLUMN "streak_grace_day" date;--> statement-breakpoint
ALTER TABLE "streak_rewards" ADD CONSTRAINT "streak_rewards_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;