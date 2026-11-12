CREATE TYPE "public"."push_device_kind" AS ENUM('web', 'app');--> statement-breakpoint
ALTER TABLE "push_subscriptions" ALTER COLUMN "p256dh" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ALTER COLUMN "auth" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "kind" "push_device_kind" DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_web_keys" CHECK ("push_subscriptions"."kind" <> 'web' or ("push_subscriptions"."p256dh" is not null and "push_subscriptions"."auth" is not null));