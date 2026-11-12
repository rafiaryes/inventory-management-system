CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(150) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" varchar(20) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_name_not_blank_chk" CHECK (BTRIM("users"."name") <> ''),
	CONSTRAINT "users_email_canonical_chk" CHECK (BTRIM("users"."email") <> '' AND "users"."email" = LOWER(BTRIM("users"."email"))),
	CONSTRAINT "users_password_hash_not_blank_chk" CHECK (BTRIM("users"."password_hash") <> ''),
	CONSTRAINT "users_role_chk" CHECK ("users"."role" IN ('admin', 'staff'))
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_name_canonical_chk" CHECK (BTRIM("categories"."name") <> '' AND "categories"."name" = BTRIM("categories"."name"))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "sessions_token_hash_chk" CHECK ("sessions"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"sku" varchar(50) NOT NULL,
	"name" varchar(150) NOT NULL,
	"description" text,
	"unit" varchar(30) NOT NULL,
	"purchase_price" numeric(14, 2) NOT NULL,
	"selling_price" numeric(14, 2) NOT NULL,
	"current_stock" numeric(14, 3) DEFAULT '0' NOT NULL,
	"minimum_stock" numeric(14, 3) DEFAULT '0' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku"),
	CONSTRAINT "products_sku_canonical_chk" CHECK (BTRIM("products"."sku") <> '' AND "products"."sku" = UPPER(BTRIM("products"."sku")) AND "products"."sku" ~ '^[A-Z0-9-]+$'),
	CONSTRAINT "products_name_not_blank_chk" CHECK (BTRIM("products"."name") <> ''),
	CONSTRAINT "products_unit_canonical_chk" CHECK (BTRIM("products"."unit") <> '' AND "products"."unit" = LOWER(BTRIM("products"."unit"))),
	CONSTRAINT "products_purchase_price_nonnegative_chk" CHECK ("products"."purchase_price" >= 0),
	CONSTRAINT "products_selling_price_nonnegative_chk" CHECK ("products"."selling_price" >= 0),
	CONSTRAINT "products_current_stock_nonnegative_chk" CHECK ("products"."current_stock" >= 0),
	CONSTRAINT "products_minimum_stock_nonnegative_chk" CHECK ("products"."minimum_stock" >= 0),
	CONSTRAINT "products_status_chk" CHECK ("products"."status" IN ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"type" varchar(10) NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"stock_before" numeric(14, 3) NOT NULL,
	"stock_after" numeric(14, 3) NOT NULL,
	"reason" text NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_type_chk" CHECK ("stock_movements"."type" IN ('in', 'out')),
	CONSTRAINT "stock_movements_quantity_positive_chk" CHECK ("stock_movements"."quantity" > 0),
	CONSTRAINT "stock_movements_stock_before_nonnegative_chk" CHECK ("stock_movements"."stock_before" >= 0),
	CONSTRAINT "stock_movements_stock_after_nonnegative_chk" CHECK ("stock_movements"."stock_after" >= 0),
	CONSTRAINT "stock_movements_reason_not_blank_chk" CHECK (BTRIM("stock_movements"."reason") <> ''),
	CONSTRAINT "stock_movements_arithmetic_chk" CHECK ((("stock_movements"."type" = 'in' AND "stock_movements"."stock_after" = "stock_movements"."stock_before" + "stock_movements"."quantity") OR ("stock_movements"."type" = 'out' AND "stock_movements"."stock_after" = "stock_movements"."stock_before" - "stock_movements"."quantity")))
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_normalized_uidx" ON "users" USING btree (LOWER(BTRIM("email")));--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_normalized_uidx" ON "categories" USING btree (LOWER(BTRIM("name")));--> statement-breakpoint
CREATE INDEX "categories_is_active_idx" ON "categories" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "products_category_id_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("name");--> statement-breakpoint
CREATE INDEX "products_current_stock_idx" ON "products" USING btree ("current_stock");--> statement-breakpoint
CREATE INDEX "stock_movements_product_id_idx" ON "stock_movements" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "stock_movements_created_by_idx" ON "stock_movements" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "stock_movements_type_idx" ON "stock_movements" USING btree ("type");--> statement-breakpoint
CREATE INDEX "stock_movements_created_at_idx" ON "stock_movements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_product_created_idx" ON "stock_movements" USING btree ("product_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);