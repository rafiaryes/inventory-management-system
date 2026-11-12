import { t } from "elysia";
import { createSuccessSchema } from "../../common/http";

export const dashboardSummarySchema = t.Object({
  activeProductCount: t.Integer({ minimum: 0 }),
  activeCategoryCount: t.Integer({ minimum: 0 }),
  lowStockCount: t.Integer({ minimum: 0 }),
  stockInCount: t.Integer({ minimum: 0 }),
  stockOutCount: t.Integer({ minimum: 0 }),
});

export const dashboardLowStockProductSchema = t.Object({
  id: t.String({ format: "uuid" }),
  sku: t.String(),
  name: t.String(),
  unit: t.String(),
  currentStock: t.String(),
  minimumStock: t.String(),
});

export const dashboardRecentMovementSchema = t.Object({
  id: t.String({ format: "uuid" }),
  product: t.Object({
    id: t.String({ format: "uuid" }),
    sku: t.String(),
    name: t.String(),
    unit: t.String(),
  }),
  type: t.Union([t.Literal("in"), t.Literal("out")]),
  quantity: t.String(),
  stockBefore: t.String(),
  stockAfter: t.String(),
  reason: t.String(),
  createdBy: t.Object({
    id: t.String({ format: "uuid" }),
    name: t.String(),
  }),
  createdAt: t.String({ format: "date-time" }),
});

export const dashboardOverviewSchema = t.Object({
  summary: dashboardSummarySchema,
  lowStockProducts: t.Array(dashboardLowStockProductSchema),
  recentStockMovements: t.Array(dashboardRecentMovementSchema),
});

export const dashboardResponseSchema = createSuccessSchema(
  dashboardOverviewSchema,
);
