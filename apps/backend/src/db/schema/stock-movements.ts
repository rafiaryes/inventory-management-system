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
import { products } from "./products";
import { users } from "./users";

export const STOCK_MOVEMENT_TYPES = ["in", "out"] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    type: varchar("type", { length: 10 }).$type<StockMovementType>().notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    stockBefore: numeric("stock_before", {
      precision: 14,
      scale: 3,
    }).notNull(),
    stockAfter: numeric("stock_after", { precision: 14, scale: 3 }).notNull(),
    reason: text("reason").notNull(),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("stock_movements_product_id_idx").on(table.productId),
    index("stock_movements_created_by_idx").on(table.createdBy),
    index("stock_movements_type_idx").on(table.type),
    index("stock_movements_created_at_idx").on(table.createdAt),
    index("stock_movements_product_created_idx").on(
      table.productId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    check("stock_movements_type_chk", sql`${table.type} IN ('in', 'out')`),
    check(
      "stock_movements_quantity_positive_chk",
      sql`${table.quantity} > 0`,
    ),
    check(
      "stock_movements_stock_before_nonnegative_chk",
      sql`${table.stockBefore} >= 0`,
    ),
    check(
      "stock_movements_stock_after_nonnegative_chk",
      sql`${table.stockAfter} >= 0`,
    ),
    check(
      "stock_movements_reason_not_blank_chk",
      sql`BTRIM(${table.reason}) <> ''`,
    ),
    check(
      "stock_movements_arithmetic_chk",
      sql`((${table.type} = 'in' AND ${table.stockAfter} = ${table.stockBefore} + ${table.quantity}) OR (${table.type} = 'out' AND ${table.stockAfter} = ${table.stockBefore} - ${table.quantity}))`,
    ),
  ],
);

export type StockMovementRow = typeof stockMovements.$inferSelect;
export type NewStockMovementRow = typeof stockMovements.$inferInsert;
