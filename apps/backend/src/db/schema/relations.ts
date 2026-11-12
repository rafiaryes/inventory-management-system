import { relations } from "drizzle-orm";
import { categories } from "./categories";
import { products } from "./products";
import { sessions } from "./sessions";
import { stockMovements } from "./stock-movements";
import { users } from "./users";

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  stockMovements: many(stockMovements),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  stockMovements: many(stockMovements),
}));

export const stockMovementsRelations = relations(
  stockMovements,
  ({ one }) => ({
    product: one(products, {
      fields: [stockMovements.productId],
      references: [products.id],
    }),
    creator: one(users, {
      fields: [stockMovements.createdBy],
      references: [users.id],
    }),
  }),
);
