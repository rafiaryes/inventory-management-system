# IMS Bruno API Collection

Koleksi request Bruno terurut untuk menguji seluruh endpoint backend **Inventory Management System (IMS)** (`http://localhost:3001/api/v1`), mencakup alur **Health**, **Authentication & Negative Tests**, **Admin Flow**, dan **Staff Flow**.

## Struktur Urutan Eksekusi

Folder diberi nomor urut dengan `folder.bru` (`seq: 1..4`) agar *Collection Runner* mengeksekusi permintaan dalam urutan yang aman dan deterministik:

1. `01-health/` — Pemeriksaan `GET /health` dan `GET /health/db`.
2. `02-auth-and-negative/` — Pengujian `401` sebelum login, `401 INVALID_CREDENTIALS`, `400 VALIDATION_ERROR`, login Admin, dan `GET /auth/me`. Request `04-login-admin.bru` otomatis menghasilkan suffix unik per-eksekusi (`dynamicUserEmail`, `dynamicCategoryName`, `dynamicProductSku`) agar eksekusi berulang tidak gagal `409`.
3. `03-admin-flow/` — Sesi Admin penuh: CRUD Users (termasuk `400`, `404`, `409`, reset password, status nonaktif), CRUD Categories (`409` duplikat, update), CRUD Products (memastikan `purchasePrice` & `sellingPrice` tampil, `400` presisi, `409` SKU duplikat, `404`), Stock Movements (`in`, `out`, `422 INVALID_UNIT_QUANTITY`, `422 INSUFFICIENT_STOCK`, history, detail), Dashboard, pengujian penonaktifan (`422 INACTIVE_PRODUCT`, `422 INACTIVE_CATEGORY`), lalu **Logout Admin**.
4. `04-staff-flow/` — Login sebagai Staff terpisah, verifikasi RBAC (`403 FORBIDDEN` pada `/users`, filter kategori nonaktif, detail produk nonaktif, sort harga, dan mutasi kategori/produk), memastikan field harga (`purchasePrice`, `sellingPrice`) tidak pernah dikirim ke Staff, memverifikasi histori movement produk nonaktif tetap terbaca, lalu **Logout Staff** dan verifikasi `401` setelah sesi dicabut.

## Environment Variables (`environments/local.bru`)

Variabel publik:
- `baseUrl`: URL backend (default `http://localhost:3001`).
- `apiPrefix`: Prefix API bisnis (default `/api/v1`).
- `adminEmail`: Email akun Admin aktif di database target (default `admin@example.com`).
- `staffEmail`: Email akun Staff aktif di database target (default `staff@example.com`).
- `dynamicUserEmail`, `dynamicCategoryName`, `dynamicProductSku`, `createdUserId`, `createdCategoryId`, `createdProductId`, `createdMovementId`: Diisi otomatis oleh pre-request / post-response script selama Collection Runner berjalan.

Variabel rahasia (`vars:secret`, isi melalui panel Environment Bruno dan **jangan** commit ke Git):
- `adminPassword`: Kata sandi akun `adminEmail`.
- `staffPassword`: Kata sandi akun `staffEmail`.
- `newUserPassword`: Kata sandi dummy (8–128 karakter) untuk `Create User (Admin)`.
- `resetUserPassword`: Kata sandi dummy baru (8–128 karakter) untuk `Reset User Password (Admin)`.

## Cara Menjalankan

1. Jalankan backend IMS (`bun run dev:backend`) terhubung ke database PostgreSQL yang memiliki akun Admin dan Staff aktif sesuai `adminEmail` / `staffEmail`.
2. Buka folder `bruno/` di aplikasi Bruno (atau Bruno CLI jika tersedia).
3. Pilih environment `local` lalu isi keempat nilai `vars:secret`.
4. Jalankan **Run Collection** dari root `bruno/` secara berurutan (`01-health` → `04-staff-flow`).
