import { Elysia } from "elysia";
import {
  errorEnvelopeSchema,
  paginatedResponse,
  successResponse,
} from "../../common/http";
import type { AuthPluginGuards } from "../../plugins/auth";
import {
  createProductBodySchema,
  listProductsQuerySchema,
  normalizeProductBodyOnTransform,
  parseListProductsQuery,
  productAdminDetailResponseSchema,
  productDetailResponseSchema,
  productIdParamSchema,
  productListResponseSchema,
  updateProductBodySchema,
  updateProductStatusBodySchema,
} from "./products.schema";
import type { ProductsService } from "./products.service";

export interface CreateProductsRoutesDeps {
  productsService: ProductsService;
  authPlugin: AuthPluginGuards;
}

/**
 * Defines `/api/v1/products/*` endpoints with Admin management and Staff restricted price-free read access.
 */
export function createProductsRoutes(deps: CreateProductsRoutesDeps) {
  const { productsService, authPlugin } = deps;

  const readRoutes = new Elysia({ name: "products-read-routes" })
    .use(authPlugin.requireAuth)
    .get(
      "/",
      async ({ query, authUser }) => {
        const parsedQuery = parseListProductsQuery(query, authUser.role);
        const result = await productsService.listProducts(
          parsedQuery,
          authUser.role,
        );
        return paginatedResponse(
          "Data produk berhasil diambil",
          result.items,
          result.meta,
        );
      },
      {
        query: listProductsQuerySchema,
        response: {
          200: productListResponseSchema,
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
        },
        detail: {
          tags: ["Products"],
          summary: "Mengambil daftar produk (Admin lengkap, Staff tanpa harga & aktif saja)",
          description:
            "Perbedaan respons berdasarkan role: Admin menerima ProductAdminDto (termasuk field harga purchasePrice dan sellingPrice) serta dapat memfilter status active/inactive/all dan menyortir berdasarkan purchasePrice, sellingPrice, atau status. Staff hanya dapat melihat produk active (status=inactive/all atau sortBy purchasePrice/sellingPrice/status ditolak dengan 403 FORBIDDEN) dan menerima ProductStaffDto tanpa field purchasePrice maupun sellingPrice.",
          security: [{ cookieAuth: [] }],
        },
      },
    )
    .get(
      "/:id",
      async ({ params, authUser }) => {
        const product = await productsService.getProductById(
          params.id,
          authUser.role,
        );
        return successResponse("Data produk berhasil diambil", product);
      },
      {
        params: productIdParamSchema,
        response: {
          200: productDetailResponseSchema,
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
        },
        detail: {
          tags: ["Products"],
          summary: "Mengambil detail produk berdasarkan ID sesuai role",
          description:
            "Perbedaan respons berdasarkan role: Admin dapat melihat detail produk active maupun inactive dalam format ProductAdminDto (dengan field purchasePrice dan sellingPrice). Staff hanya dapat mengakses produk active (produk inactive ditolak dengan 403 FORBIDDEN) dan menerima ProductStaffDto tanpa field purchasePrice maupun sellingPrice.",
          security: [{ cookieAuth: [] }],
        },
      },
    );

  const adminRoutes = new Elysia({ name: "products-admin-routes" })
    .use(authPlugin.requireRole("admin"))
    .post(
      "/",
      async ({ body, set }) => {
        const created = await productsService.createProduct(body);
        set.status = 201;
        return successResponse("Produk berhasil dibuat", created);
      },
      {
        transform(context) {
          normalizeProductBodyOnTransform(context.body);
        },
        body: createProductBodySchema,
        response: {
          201: productAdminDetailResponseSchema,
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
          409: errorEnvelopeSchema,
          422: errorEnvelopeSchema,
        },
        detail: {
          tags: ["Products"],
          summary: "Membuat produk baru dengan stok awal 0 (Admin)",
          security: [{ cookieAuth: [] }],
        },
      },
    )
    .patch(
      "/:id",
      async ({ params, body }) => {
        const updated = await productsService.updateProduct(params.id, body);
        return successResponse("Produk berhasil diperbarui", updated);
      },
      {
        transform(context) {
          normalizeProductBodyOnTransform(context.body);
        },
        params: productIdParamSchema,
        body: updateProductBodySchema,
        response: {
          200: productAdminDetailResponseSchema,
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
          409: errorEnvelopeSchema,
          422: errorEnvelopeSchema,
        },
        detail: {
          tags: ["Products"],
          summary: "Memperbarui data produk (Admin)",
          security: [{ cookieAuth: [] }],
        },
      },
    )
    .patch(
      "/:id/status",
      async ({ params, body }) => {
        const updated = await productsService.updateProductStatus(
          params.id,
          body.status,
        );
        return successResponse("Status produk berhasil diperbarui", updated);
      },
      {
        params: productIdParamSchema,
        body: updateProductStatusBodySchema,
        response: {
          200: productAdminDetailResponseSchema,
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
        },
        detail: {
          tags: ["Products"],
          summary: "Mengaktifkan atau menonaktifkan produk (Admin)",
          security: [{ cookieAuth: [] }],
        },
      },
    );

  return new Elysia({
    name: "products-routes",
    prefix: "/products",
  })
    .use(readRoutes)
    .use(adminRoutes);
}
