import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const USER_ROLES = ["admin", "staff"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 150 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    role: varchar("role", { length: 20 }).$type<UserRole>().notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("users_email_normalized_uidx").on(
      sql`LOWER(BTRIM(${table.email}))`,
    ),
    check("users_name_not_blank_chk", sql`BTRIM(${table.name}) <> ''`),
    check(
      "users_email_canonical_chk",
      sql`BTRIM(${table.email}) <> '' AND ${table.email} = LOWER(BTRIM(${table.email}))`,
    ),
    check(
      "users_password_hash_not_blank_chk",
      sql`BTRIM(${table.passwordHash}) <> ''`,
    ),
    check("users_role_chk", sql`${table.role} IN ('admin', 'staff')`),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
