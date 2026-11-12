import { Elysia } from "elysia";
import {
  errorEnvelopeSchema,
  paginatedResponse,
  successResponse,
} from "../../common/http";
import type { AuthPluginGuards } from "../../plugins/auth";
import {
  categoryDetailResponseSchema,
  categoryIdParamSchema,
  categoryListResponseSchema,
  createCategoryBodySchema,
  listCategoriesQuerySchema,
  parseListCategoriesQuery,
  trimCategoryNameOnTransform,
  updateCategoryBodySchema,
  updateCategoryStatusBodySchema,
} from "./categories.schema";
import type { CategoriesService } from "./categories.service";

export interface CreateCategoriesRoutesDeps {
  categoriesService: CategoriesService;
  authPlugin: AuthPluginGuards;
}

/**
 * Defines `/api/v1/categories/*` endpoints with Admin management and Staff active-only read access.
 */
export function createCategoriesRoutes(deps: CreateCategoriesRoutesDeps) {
  const { categoriesService, authPlugin } = deps;

  const readRoutes = new Elysia({ name: "categories-read-routes" })
    .use(authPlugin.requireAuth)
    .get(
      "/",
      async ({ query, authUser }) => {
        const parsedQuery = parseListCategoriesQuery(query);
        const result = await categoriesService.listCategories(
          parsedQuery,
          authUser.role,
        );
        return paginatedResponse(
          "Data kategori berhasil diambil",
          result.items,
          result.meta,
        );
      },
      {
        query: listCategoriesQuerySchema,
        response: {
          200: categoryListResponseSchema,
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
        },
        detail: {
          tags: ["Categories"],
          summary: "Mengambil daftar kategori (Admin: semua, Staff: aktif saja)",
          security: [{ cookieAuth: [] }],
        },
      },
    )
    .get(
      "/:id",
      async ({ params, authUser }) => {
        const category = await categoriesService.getCategoryById(
          params.id,
          authUser.role,
        );
        return successResponse("Data kategori berhasil diambil", category);
      },
      {
        params: categoryIdParamSchema,
        response: {
          200: categoryDetailResponseSchema,
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
        },
        detail: {
          tags: ["Categories"],
          summary: "Mengambil detail kategori berdasarkan ID",
          security: [{ cookieAuth: [] }],
        },
      },
    );

  const adminRoutes = new Elysia({ name: "categories-admin-routes" })
    .use(authPlugin.requireRole("admin"))
    .post(
      "/",
      async ({ body, set }) => {
        const created = await categoriesService.createCategory(body);
        set.status = 201;
        return successResponse("Kategori berhasil dibuat", created);
      },
      {
        transform(context) {
          trimCategoryNameOnTransform(context.body);
        },
        body: createCategoryBodySchema,
        response: {
          201: categoryDetailResponseSchema,
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
          409: errorEnvelopeSchema,
        },
        detail: {
          tags: ["Categories"],
          summary: "Membuat kategori baru (Admin)",
          security: [{ cookieAuth: [] }],
        },
      },
    )
    .patch(
      "/:id",
      async ({ params, body }) => {
        const updated = await categoriesService.updateCategory(params.id, body);
        return successResponse("Kategori berhasil diperbarui", updated);
      },
      {
        transform(context) {
          trimCategoryNameOnTransform(context.body);
        },
        params: categoryIdParamSchema,
        body: updateCategoryBodySchema,
        response: {
          200: categoryDetailResponseSchema,
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
          409: errorEnvelopeSchema,
        },
        detail: {
          tags: ["Categories"],
          summary: "Memperbarui data kategori (Admin)",
          security: [{ cookieAuth: [] }],
        },
      },
    )
    .patch(
      "/:id/status",
      async ({ params, body }) => {
        const updated = await categoriesService.updateCategoryStatus(
          params.id,
          body.isActive,
        );
        return successResponse("Status kategori berhasil diperbarui", updated);
      },
      {
        params: categoryIdParamSchema,
        body: updateCategoryStatusBodySchema,
        response: {
          200: categoryDetailResponseSchema,
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
        },
        detail: {
          tags: ["Categories"],
          summary: "Mengaktifkan atau menonaktifkan kategori (Admin)",
          security: [{ cookieAuth: [] }],
        },
      },
    );

  return new Elysia({
    name: "categories-routes",
    prefix: "/categories",
  })
    .use(readRoutes)
    .use(adminRoutes);
}
