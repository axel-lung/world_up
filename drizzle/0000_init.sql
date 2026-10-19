CREATE TABLE "collections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "collections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"theme" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_slug_unique" UNIQUE("slug")
);
