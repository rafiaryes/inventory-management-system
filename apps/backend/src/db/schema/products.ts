import { sql } from "drizzle-orm";
import {
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { categories } from "./categories";

export const PRODUCT_STATUSES = ["active", "inactive"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const COUNT_ONLY_UNITS = ["pcs", "unit", "box", "pack", "set"] as const;

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    sku: varchar("sku", { length: 50 }).notNull().unique(),
    name: varchar("name", { length: 150 }).notNull(),
    description: text("description"),
    unit: varchar("unit", { length: 30 }).notNull(),
    purchasePrice: numeric("purchase_price", {
      precision: 14,
      scale: 2,
    }).notNull(),
    sellingPrice: numeric("selling_price", {
      precision: 14,
      scale: 2,
    }).notNull(),
    currentStock: numeric("current_stock", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    minimumStock: numeric("minimum_stock", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    status: varchar("status", { length: 20 })
      .$type<ProductStatus>()
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("products_category_id_idx").on(table.categoryId),
    index("products_status_idx").on(table.status),
    index("products_name_idx").on(table.name),
    index("products_current_stock_idx").on(table.currentStock),
    check(
      "products_sku_canonical_chk",
      sql`BTRIM(${table.sku}) <> '' AND ${table.sku} = UPPER(BTRIM(${table.sku})) AND ${table.sku} ~ '^[A-Z0-9-]+$'`,
    ),
    check("products_name_not_blank_chk", sql`BTRIM(${table.name}) <> ''`),
    check(
      "products_unit_canonical_chk",
      sql`BTRIM(${table.unit}) <> '' AND ${table.unit} = LOWER(BTRIM(${table.unit}))`,
    ),
    check(
      "products_purchase_price_nonnegative_chk",
      sql`${table.purchasePrice} >= 0`,
    ),
    check(
      "products_selling_price_nonnegative_chk",
      sql`${table.sellingPrice} >= 0`,
    ),
    check(
      "products_current_stock_nonnegative_chk",
      sql`${table.currentStock} >= 0`,
    ),
    check(
      "products_minimum_stock_nonnegative_chk",
      sql`${table.minimumStock} >= 0`,
    ),
    check(
      "products_status_chk",
      sql`${table.status} IN ('active', 'inactive')`,
    ),
  ],
);

export type ProductRow = typeof products.$inferSelect;
export type NewProductRow = typeof products.$inferInsert;
