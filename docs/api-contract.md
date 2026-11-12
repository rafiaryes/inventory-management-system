# API Contract

**Project:** Inventory Management System (IMS)  
**Status:** Final untuk MVP  
**Versi:** 1.0  
**Bahasa:** Indonesia  
**Base URL Development:** `http://localhost:3001`  
**API Prefix:** `/api/v1`  
**Format:** JSON  
**Authentication:** Database-backed Session menggunakan HttpOnly Cookie

---

## 1. Tujuan Dokumen

Dokumen ini mendefinisikan kontrak komunikasi HTTP API Inventory Management System (IMS).

Dokumen ini menjadi acuan implementasi untuk:

- Backend Elysia.js.
- Frontend Next.js.
- Dokumentasi Swagger/OpenAPI.
- API testing menggunakan Bruno.
- Automated integration testing.

Seluruh endpoint, HTTP method, request, response, authorization, pagination, filtering, dan error response harus mengikuti dokumen ini.

Dokumen ini melengkapi:

- `AGENTS.md`
- `docs/PRD.md`
- `docs/architecture.md`
- `docs/database-design.md`

Jika terdapat perbedaan kontrak API antar dokumen, `api-contract.md` menjadi acuan utama untuk perilaku HTTP API. Aturan bisnis tetap mengikuti PRD.

---

## 2. Konvensi API

### 2.1 Base URL

Development:

```text
http://localhost:3001/api/v1
```

Production:

```text
https://<api-domain>/api/v1
```

### 2.2 HTTP Methods

| Method | Penggunaan |
|---|---|
| GET | Mengambil data |
| POST | Membuat data atau menjalankan transaksi |
| PATCH | Mengubah sebagian data atau status |
| DELETE | Tidak digunakan untuk penghapusan data master pada MVP |

Data master menggunakan mekanisme aktivasi dan deaktivasi, bukan hard delete.

### 2.3 Content Type

Request dan response menggunakan:

```http
Content-Type: application/json
Accept: application/json
```

Untuk request yang tidak memiliki body, `Content-Type` tidak diwajibkan.

### 2.4 API Versioning

Seluruh endpoint bisnis menggunakan prefix:

```text
/api/v1
```

Perubahan kontrak yang tidak kompatibel harus menggunakan versi API baru.

### 2.5 Request ID

Client boleh mengirim:

```http
X-Request-ID: <unique-request-id>
```

Server wajib menghasilkan request ID unik apabila client tidak mengirimkannya, mengembalikannya pada header response `X-Request-ID`, serta menyertakannya pada `error.requestId`.

Request ID digunakan untuk correlation dan logging, bukan sebagai mekanisme idempotency atau pencegah duplikasi transaksi.

---

## 3. Standar Response

### 3.1 Success Response

Response sukses menggunakan format:

```json
{
  "success": true,
  "message": "Request berhasil diproses",
  "data": {}
}
```

Ketentuan:

- `success` selalu bernilai `true`.
- `message` berisi informasi singkat.
- `data` berisi hasil operasi.
- Response tanpa data menggunakan `data: null`.

### 3.2 Paginated Response

Endpoint list menggunakan format:

```json
{
  "success": true,
  "message": "Data berhasil diambil",
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "totalItems": 100,
    "totalPages": 10
  }
}
```

Ketentuan:

- `page` dimulai dari 1.
- `pageSize` default 10.
- `pageSize` maksimum 100.
- `totalItems` adalah jumlah seluruh data yang memenuhi filter.
- `totalPages` dihitung berdasarkan `Math.ceil(totalItems / pageSize)`.
- Jika tidak ada data, `totalItems` dan `totalPages` bernilai 0.
- Pagination menggunakan offset-based pagination pada MVP.

### 3.3 Error Response

Seluruh error menggunakan format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request tidak valid",
    "details": [
      {
        "field": "quantity",
        "message": "Quantity harus lebih besar dari 0"
      }
    ],
    "requestId": "req-123"
  }
}
```

Ketentuan:

- `success` selalu bernilai `false`.
- `error.code` merupakan kode error yang stabil.
- `error.message` merupakan pesan yang dapat ditampilkan kepada pengguna.
- `error.details` berupa array dan boleh kosong.
- `error.requestId` berisi request ID untuk keperluan penelusuran.

Jangan mengirim stack trace, SQL query, database credentials, atau informasi internal server kepada client.

---

## 4. Format Data

### 4.1 UUID

Seluruh ID menggunakan UUID dalam bentuk string.

Contoh:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### 4.2 Timestamp

Seluruh timestamp dikirim menggunakan ISO 8601 dengan timezone UTC.

Contoh:

```json
{
  "createdAt": "2026-11-12T10:30:00.000Z"
}
```

Database menggunakan `TIMESTAMPTZ`.

### 4.3 NUMERIC

Seluruh nilai PostgreSQL `NUMERIC` harus dikirim sebagai JSON string, bukan JSON number.

Contoh:

```json
{
  "currentStock": "125.500",
  "minimumStock": "10.000",
  "purchasePrice": "15000.00",
  "sellingPrice": "18000.00"
}
```

Ketentuan:

| Jenis Data | Database | Format JSON |
|---|---|---|
| Stock | `NUMERIC(14,3)` | String dengan maksimal 3 angka desimal |
| Quantity | `NUMERIC(14,3)` | String dengan maksimal 3 angka desimal |
| Minimum Stock | `NUMERIC(14,3)` | String dengan maksimal 3 angka desimal |
| Price | `NUMERIC(14,2)` | String dengan maksimal 2 angka desimal |

Contoh request quantity:

```json
{
  "quantity": "10.500"
}
```

Backend wajib memvalidasi format, presisi, nilai minimum, dan batas maksimum sebelum melakukan operasi database.

Jangan mengubah nilai tersebut menjadi JavaScript `Number` untuk melakukan aritmetika desimal.

### 4.4 Batas Numerik

| Tipe | Nilai Minimum | Nilai Maksimum |
|---|---:|---:|
| Quantity / Stock | 0.001 untuk transaksi positif | 99999999999.999 |
| Minimum Stock | 0 | 99999999999.999 |
| Price | 0 | 999999999999.99 |

Ketentuan batas numerik:

- Nilai input yang melampaui batas maksimum representasi database atau memiliki lebih dari 3/2 angka desimal ditolak sebagai `400 VALIDATION_ERROR` (bukan menjadi internal server error).
- Nilai `quantity <= 0` serta nilai negatif pada `purchasePrice`, `sellingPrice`, atau `minimumStock` (dengan format desimal yang valid) ditolak sebagai `422 BUSINESS_RULE_VIOLATION`.
- Pada Stock In, hasil penjumlahan `stockAfter = stockBefore + quantity` tidak boleh melampaui `99999999999.999` (`422 BUSINESS_RULE_VIOLATION`).

---

## 5. Authentication dan Session

### 5.1 Authentication Mechanism

Authentication menggunakan database-backed session dengan HttpOnly Cookie.

Nama cookie default:

```text
ims_session
```

Atribut cookie:

| Attribute | Value |
|---|---|
| HttpOnly | true |
| Secure | true pada production HTTPS |
| SameSite | Lax |
| Path | `/` |
| Max-Age | Mengikuti `SESSION_TTL_DAYS * 86400` (default `604800` detik / 7 hari) |
| Domain | Tidak ditetapkan secara default |

Cookie berisi random session token. Database hanya menyimpan SHA-256 hash dari token.

Session berlaku selama 7 hari secara absolut (atau sesuai `SESSION_TTL_DAYS`) dan tidak diperpanjang otomatis ketika pengguna melakukan request.

### 5.2 Login

**Endpoint**

```http
POST /api/v1/auth/login
```

**Authentication:** Tidak diperlukan.

**Request**

```json
{
  "email": "admin@example.com",
  "password": "password123"
}
```

**Response: 200 OK**

```json
{
  "success": true,
  "message": "Login berhasil",
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Administrator",
      "email": "admin@example.com",
      "role": "admin"
    }
  }
}
```

Server mengirim session cookie melalui header `Set-Cookie`.

Ketentuan:

- Email dinormalisasi dengan trim dan lowercase (maksimal 255 karakter).
- Password diverifikasi menggunakan Argon2id.
- Password minimal 8 dan maksimal 128 karakter.
- Akun inactive tidak boleh login.
- Login gagal karena email, password, atau status akun menggunakan pesan generik yang sama (`401 INVALID_CREDENTIALS`).
- Setiap login membuat session baru.
- Multi-device login diperbolehkan.
- Endpoint login wajib dilindungi in-memory rate limiter pada backend Elysia.js (cocok untuk single-instance MVP tanpa Redis), misalnya berdasarkan IP client dan kombinasi IP + email ternormalisasi (`LOGIN_RATE_LIMIT_MAX`, default 10 percobaan per `LOGIN_RATE_LIMIT_WINDOW_SECONDS` default 900 detik). Ketika limit terlampaui, server mengembalikan `429 RATE_LIMIT_EXCEEDED` disertai header `Retry-After` (dalam detik).

### 5.3 Get Current User

**Endpoint**

```http
GET /api/v1/auth/me
```

**Authentication:** Wajib.

**Request:** Tidak memiliki body.

**Response: 200 OK**

```json
{
  "success": true,
  "message": "Session valid",
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Administrator",
      "email": "admin@example.com",
      "role": "admin"
    }
  }
}
```

Endpoint ini digunakan frontend untuk:

- Memulihkan authentication state ketika halaman direfresh.
- Mendapatkan informasi pengguna yang sedang login.
- Menentukan role pengguna.
- Memeriksa validitas session.

Jika session tidak valid atau sudah expired, server mengembalikan `401 Unauthorized`.

### 5.4 Logout

**Endpoint**

```http
POST /api/v1/auth/logout
```

**Authentication:** Wajib.

**Request:** Tidak memiliki body.

**Response: 200 OK**

```json
{
  "success": true,
  "message": "Logout berhasil",
  "data": null
}
```

Ketentuan:

- Hanya session yang sedang digunakan yang dicabut.
- Server mengisi `revoked_at` pada session terkait.
- Cookie dihapus menggunakan atribut cookie yang konsisten.
- Session pada perangkat lain tidak ikut dicabut.

### 5.5 Password Management

MVP tidak menyediakan self-service password change.

Admin dapat melakukan reset password pengguna melalui:

```http
PATCH /api/v1/users/:id/password
```

Request:

```json
{
  "newPassword": "newpassword123"
}
```

Ketentuan:

- Hanya Admin yang dapat melakukan reset password.
- Password baru harus memenuhi panjang 8 sampai 128 karakter dan tidak boleh hanya berisi whitespace.
- Password disimpan menggunakan Argon2id.
- Dalam satu transaksi database, `password_hash` serta `updated_at` diperbarui dan seluruh session aktif pengguna tersebut wajib dicabut (`revoked_at = NOW()`).
- Jika Admin me-reset password miliknya sendiri, seluruh session aktifnya (termasuk session saat ini) dicabut dan server menghapus session cookie melalui `Set-Cookie`.
- Pengguna harus login kembali menggunakan password baru.

---

## 6. User Management

Role yang tersedia:

- `admin`
- `staff`

Seluruh endpoint user management hanya dapat diakses oleh Admin.

### 6.1 Get Users

```http
GET /api/v1/users
```

**Authentication:** Wajib.

**Role:** Admin.

Query parameters:

| Parameter | Type | Default | Keterangan |
|---|---|---|---|
| page | integer | 1 | Halaman |
| pageSize | integer | 10 | Jumlah data |
| search | string | - | Pencarian nama atau email |
| role | string | - | Filter `admin` atau `staff` |
| isActive | boolean | - | Filter status aktif (`true` atau `false`) |
| sortBy | string | createdAt | Allowlist: `createdAt`, `updatedAt`, `name`, `email`, `role`, `isActive` |
| sortOrder | string | desc | `asc` atau `desc` |

Pengurutan selalu menggunakan `id` sebagai tie-breaker agar pagination deterministik.

**Response: 200 OK**

```json
{
  "success": true,
  "message": "Data pengguna berhasil diambil",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Administrator",
      "email": "admin@example.com",
      "role": "admin",
      "isActive": true,
      "createdAt": "2026-11-12T10:30:00.000Z",
      "updatedAt": "2026-11-12T10:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

### 6.2 Create User

```http
POST /api/v1/users
```

**Role:** Admin.

Request:

```json
{
  "name": "Staff Gudang",
  "email": "staff@example.com",
  "password": "password123",
  "role": "staff"
}
```

**Response: 201 Created**

```json
{
  "success": true,
  "message": "Pengguna berhasil dibuat",
  "data": {
    "id": "850e8400-e29b-41d4-a716-446655440001",
    "name": "Staff Gudang",
    "email": "staff@example.com",
    "role": "staff",
    "isActive": true,
    "createdAt": "2026-11-12T10:30:00.000Z",
    "updatedAt": "2026-11-12T10:30:00.000Z"
  }
}
```

Ketentuan:

- `name` wajib diisi (1–150 karakter setelah trim, tidak boleh whitespace-only).
- `email` wajib valid, maksimal 255 karakter, dan unik setelah trim serta lowercase.
- `password` wajib diisi dengan panjang 8–128 karakter (tidak boleh hanya whitespace) dan di-hash menggunakan Argon2id.
- `role` hanya `admin` atau `staff`.
- User baru otomatis aktif (`isActive: true`).

### 6.3 Get User Detail

```http
GET /api/v1/users/:id
```

**Role:** Admin.

**Response: 200 OK**

Mengembalikan informasi satu pengguna dengan struktur DTO yang sama seperti item pada `GET /api/v1/users`, tanpa `password` atau `passwordHash`.

### 6.4 Update User

```http
PATCH /api/v1/users/:id
```

**Role:** Admin.

Request:

```json
{
  "name": "Staff Gudang Utama",
  "email": "staff@example.com",
  "role": "staff"
}
```

Seluruh field bersifat opsional, tetapi minimal satu field harus dikirim (body kosong `{}` mengembalikan `400 VALIDATION_ERROR`).

Ketentuan:

- `name` (jika dikirim): 1–150 karakter setelah trim, tidak boleh whitespace-only.
- `email` (jika dikirim): valid, maksimal 255 karakter, mengikuti aturan normalisasi dan uniqueness (`409 DUPLICATE_EMAIL`).
- `role` (jika dikirim): hanya `admin` atau `staff`.
- Admin tidak boleh menurunkan role dirinya sendiri (`422 BUSINESS_RULE_VIOLATION`).
- Admin aktif terakhir tidak boleh kehilangan role Admin (`422 BUSINESS_RULE_VIOLATION`), divalidasi dalam transaksi dengan mengunci baris admin aktif (`SELECT ... FOR UPDATE`).

**Response: 200 OK**

Mengembalikan DTO pengguna terbaru (sama seperti `GET /api/v1/users/:id`).

### 6.5 Activate / Deactivate User

```http
PATCH /api/v1/users/:id/status
```

**Role:** Admin.

Request:

```json
{
  "isActive": false
}
```

**Response: 200 OK**

Mengembalikan DTO pengguna terbaru (sama seperti `GET /api/v1/users/:id`).

Ketentuan:

- Jika `isActive` bernilai `false`, seluruh session aktif pengguna wajib dicabut (`revoked_at = NOW()`) dalam satu transaksi database bersama pembaruan `users.is_active`.
- Pengguna inactive tidak dapat login.
- Request authentication dari session pengguna inactive harus ditolak (`401 UNAUTHENTICATED`).
- Aktivasi ulang tidak boleh menghidupkan kembali session lama.
- Operasi dengan status yang sama bersifat idempotent (`200 OK`, tanpa mengubah `updatedAt`).
- Admin tidak boleh menonaktifkan dirinya sendiri (`422 BUSINESS_RULE_VIOLATION`).
- Admin aktif terakhir tidak boleh dinonaktifkan (`422 BUSINESS_RULE_VIOLATION`), divalidasi dalam transaksi dengan mengunci baris admin aktif (`SELECT ... FOR UPDATE`).

### 6.6 Reset User Password

```http
PATCH /api/v1/users/:id/password
```

**Role:** Admin.

Request:

```json
{
  "newPassword": "newpassword123"
}
```

**Response: 200 OK**

```json
{
  "success": true,
  "message": "Password pengguna berhasil direset",
  "data": null
}
```

Ketentuan:

- `newPassword` wajib 8–128 karakter (tidak boleh hanya whitespace).
- Seluruh session aktif pengguna wajib dicabut (`revoked_at = NOW()`) dalam satu transaksi database setelah password berhasil diubah; jika target adalah Admin yang sedang login, cookie session saat ini juga dihapus.

---

## 7. Category Management

Endpoint kategori hanya dapat dikelola oleh Admin.

Staff hanya dapat melihat kategori aktif.

### 7.1 Get Categories

```http
GET /api/v1/categories
```

**Authentication:** Wajib.

Query parameters:

| Parameter | Type | Default | Keterangan |
|---|---|---|---|
| page | integer | 1 | Halaman |
| pageSize | integer | 10 | Jumlah data |
| search | string | - | Pencarian nama kategori |
| isActive | boolean | - | Filter status (`true` atau `false`) |
| sortBy | string | createdAt | Allowlist: `createdAt`, `updatedAt`, `name`, `isActive` |
| sortOrder | string | desc | `asc` atau `desc` |

Pengurutan selalu menggunakan `id` sebagai tie-breaker agar pagination deterministik.

Ketentuan:

- Admin dapat melihat kategori aktif dan inactive.
- Staff hanya dapat melihat kategori aktif.
- Jika Staff mengirim filter `isActive=false`, server menolak dengan `403 FORBIDDEN`.

Response: `200 OK`.

```json
{
  "success": true,
  "message": "Data kategori berhasil diambil",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Elektronik",
      "description": "Kategori barang elektronik",
      "isActive": true,
      "createdAt": "2026-11-12T10:30:00.000Z",
      "updatedAt": "2026-11-12T10:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

### 7.2 Create Category

```http
POST /api/v1/categories
```

**Role:** Admin.

Request:

```json
{
  "name": "Elektronik",
  "description": "Kategori barang elektronik"
}
```

**Response: 201 Created**

```json
{
  "success": true,
  "message": "Kategori berhasil dibuat",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Elektronik",
    "description": "Kategori barang elektronik",
    "isActive": true,
    "createdAt": "2026-11-12T10:30:00.000Z",
    "updatedAt": "2026-11-12T10:30:00.000Z"
  }
}
```

Ketentuan:

- `name` wajib diisi (1–100 karakter setelah trim, tidak boleh whitespace-only).
- `description` bersifat opsional dan nullable; string kosong atau whitespace-only dinormalisasi menjadi `null`.
- Kapitalisasi `name` dipertahankan setelah trim.
- Nama kategori harus unik secara case-insensitive setelah trim (`409 DUPLICATE_CATEGORY_NAME`).
- Kategori baru otomatis aktif (`isActive: true`).

### 7.3 Get Category Detail

```http
GET /api/v1/categories/:id
```

**Authentication:** Wajib.

**Response: 200 OK**

Mengembalikan DTO satu kategori (sama seperti item pada `GET /api/v1/categories`).

Ketentuan:

- Admin dapat mengakses kategori aktif maupun inactive.
- Staff hanya dapat mengakses kategori aktif; jika kategori berstatus inactive (`isActive: false`), server menolak dengan `403 FORBIDDEN`.

### 7.4 Update Category

```http
PATCH /api/v1/categories/:id
```

**Role:** Admin.

Request:

```json
{
  "name": "Peralatan Elektronik",
  "description": "Peralatan elektronik dan aksesoris"
}
```

Seluruh field bersifat opsional, tetapi minimal satu field harus dikirim (body kosong `{}` mengembalikan `400 VALIDATION_ERROR`).

**Response: 200 OK**

Mengembalikan DTO kategori terbaru (sama seperti `GET /api/v1/categories/:id`).

Ketentuan:

- `name` (jika dikirim): 1–100 karakter setelah trim, tidak boleh whitespace-only, tetap unik secara case-insensitive (`409 DUPLICATE_CATEGORY_NAME`).
- `description` dapat diisi `null` atau string kosong/whitespace (dinormalisasi menjadi `null`) untuk menghapus deskripsi.

### 7.5 Activate / Deactivate Category

```http
PATCH /api/v1/categories/:id/status
```

**Role:** Admin.

Request:

```json
{
  "isActive": false
}
```

**Response: 200 OK**

Mengembalikan DTO kategori terbaru (sama seperti `GET /api/v1/categories/:id`).

Ketentuan:

- Kategori inactive tidak dapat dipilih untuk produk baru.
- Kategori inactive tidak dapat dipilih ketika mengubah kategori produk.
- Produk yang sebelumnya menggunakan kategori tersebut tetap terhubung.
- Deaktivasi kategori tidak otomatis menonaktifkan produk.
- Operasi dengan status yang sama bersifat idempotent (`200 OK`, tanpa mengubah `updatedAt`).

---

## 8. Product Management

### 8.1 Get Products

```http
GET /api/v1/products
```

**Authentication:** Wajib.

Query parameters:

| Parameter | Type | Default | Keterangan |
|---|---|---|---|
| page | integer | 1 | Halaman |
| pageSize | integer | 10 | Jumlah data |
| search | string | - | Pencarian nama atau SKU |
| categoryId | UUID | - | Filter kategori |
| status | string | active | `active`, `inactive`, atau `all` (khusus Admin) |
| lowStock | boolean | - | `true`: `current_stock <= minimum_stock`; `false`: `current_stock > minimum_stock` |
| sortBy | string | createdAt | Admin: `createdAt`, `updatedAt`, `name`, `sku`, `currentStock`, `minimumStock`, `status`, `purchasePrice`, `sellingPrice`. Staff: `createdAt`, `updatedAt`, `name`, `sku`, `currentStock`, `minimumStock` |
| sortOrder | string | desc | `asc` atau `desc` |

Pengurutan selalu menggunakan `id` sebagai tie-breaker agar pagination deterministik.

Ketentuan:

- Admin dapat melihat produk `active`, `inactive`, atau gabungan keduanya (`status=all`).
- Staff hanya dapat melihat produk `active`. Jika Staff mengirim `status=inactive` atau `status=all`, server menolak dengan `403 FORBIDDEN`.
- Jika Staff mengirim `sortBy=purchasePrice` atau `sortBy=sellingPrice` (atau `status`), server menolak dengan `403 FORBIDDEN`. Nilai `sortBy` di luar allowlist yang sah mengembalikan `400 VALIDATION_ERROR`.
- Staff hanya menerima field produk yang diizinkan.
- Field harga tidak boleh dikirim kepada Staff.
- Filter `lowStock=true` menggunakan kondisi `current_stock <= minimum_stock`.

**Response Admin: 200 OK**

```json
{
  "success": true,
  "message": "Data produk berhasil diambil",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "category": {
        "id": "650e8400-e29b-41d4-a716-446655440000",
        "name": "Elektronik"
      },
      "sku": "ELK-001",
      "name": "Keyboard",
      "description": "Mechanical keyboard",
      "unit": "pcs",
      "purchasePrice": "150000.00",
      "sellingPrice": "200000.00",
      "currentStock": "10.000",
      "minimumStock": "5.000",
      "status": "active",
      "createdAt": "2026-11-12T10:30:00.000Z",
      "updatedAt": "2026-11-12T10:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

**Response Staff: 200 OK**

```json
{
  "success": true,
  "message": "Data produk berhasil diambil",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "category": {
        "id": "650e8400-e29b-41d4-a716-446655440000",
        "name": "Elektronik"
      },
      "sku": "ELK-001",
      "name": "Keyboard",
      "description": "Mechanical keyboard",
      "unit": "pcs",
      "currentStock": "10.000",
      "minimumStock": "5.000",
      "status": "active",
      "createdAt": "2026-11-12T10:30:00.000Z",
      "updatedAt": "2026-11-12T10:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

`purchasePrice` dan `sellingPrice` tidak boleh muncul dalam response Staff, termasuk ketika nilainya `null`.

### 8.2 Create Product

```http
POST /api/v1/products
```

**Role:** Admin.

Request:

```json
{
  "categoryId": "650e8400-e29b-41d4-a716-446655440000",
  "sku": "elk-001",
  "name": "Keyboard",
  "description": "Mechanical keyboard",
  "unit": "pcs",
  "purchasePrice": "150000.00",
  "sellingPrice": "200000.00",
  "minimumStock": "5.000"
}
```

**Response: 201 Created**

Mengembalikan DTO satu produk versi Admin (sama seperti item pada `GET /api/v1/products` Admin) dengan `currentStock: "0.000"` dan `status: "active"`.

Ketentuan:

- `sku` wajib diisi (1–50 karakter setelah trim), di-trim dan diubah menjadi uppercase, hanya berisi `A-Z`, `0-9`, dan `-`, serta unik (`409 DUPLICATE_SKU`).
- `name` wajib diisi (1–150 karakter setelah trim, tidak boleh whitespace-only) dan tidak harus unik.
- `description` bersifat opsional dan nullable; string kosong atau whitespace-only dinormalisasi menjadi `null`.
- `unit` wajib diisi (1–30 karakter setelah trim), di-trim dan diubah menjadi lowercase.
- `categoryId` wajib merujuk kategori yang ada (`404` jika tidak ditemukan) dan aktif (`422 INACTIVE_CATEGORY`), divalidasi dalam transaksi dengan `SELECT ... FOR SHARE`.
- `purchasePrice` dan `sellingPrice` wajib diisi, maksimal 2 angka desimal, tidak boleh negatif (`>= 0`).
- `minimumStock` bersifat opsional (default `"0.000"`), maksimal 3 angka desimal, tidak boleh negatif (`>= 0`), dan wajib mengikuti aturan presisi `unit` produk (`422 INVALID_UNIT_QUANTITY` bila pecahan pada unit count-only).
- `currentStock` otomatis bernilai `"0.000"` dan `status` otomatis `"active"`.
- Stok awal harus dimasukkan melalui Stock In.

### 8.3 Get Product Detail

```http
GET /api/v1/products/:id
```

**Authentication:** Wajib.

**Response: 200 OK**

Mengembalikan DTO satu produk sesuai role (Admin menyertakan `purchasePrice` dan `sellingPrice`; Staff tanpa kedua field harga).

Ketentuan:

- Admin dapat melihat produk aktif maupun inactive.
- Staff hanya dapat melihat produk aktif; jika produk berstatus `inactive`, server menolak dengan `403 FORBIDDEN`.
- Field harga hanya tersedia untuk Admin.
- Produk aktif dengan kategori inactive tetap dapat ditampilkan kepada Admin dan Staff.

### 8.4 Update Product

```http
PATCH /api/v1/products/:id
```

**Role:** Admin.

Request:

```json
{
  "categoryId": "650e8400-e29b-41d4-a716-446655440000",
  "sku": "ELK-002",
  "name": "Mechanical Keyboard",
  "description": "Updated description",
  "unit": "pcs",
  "purchasePrice": "160000.00",
  "sellingPrice": "210000.00",
  "minimumStock": "8.000"
}
```

Seluruh field bersifat opsional. Minimal satu field harus dikirim (body kosong `{}` mengembalikan `400 VALIDATION_ERROR`).

**Response: 200 OK**

Mengembalikan DTO produk terbaru versi Admin (sama seperti `GET /api/v1/products/:id` Admin).

Ketentuan:

- `sku` (jika dikirim): 1–50 karakter setelah trim, aturan karakter sama dengan create, boleh diubah selama tidak duplikat (`409 DUPLICATE_SKU`).
- `name` (jika dikirim): 1–150 karakter setelah trim, tidak boleh whitespace-only.
- `description` (jika dikirim): nullable; string kosong atau whitespace-only dinormalisasi menjadi `null`.
- `purchasePrice` dan `sellingPrice` boleh diubah oleh Admin (tidak boleh negatif).
- `currentStock` tidak dapat diubah melalui endpoint ini (diabaikan atau ditolak sesuai validasi schema).
- Perubahan `unit` (1–30 karakter setelah trim) hanya diperbolehkan apabila `currentStock` masih nol dan produk belum memiliki `stock_movements` (`422 BUSINESS_RULE_VIOLATION` jika tidak memenuhi syarat).
- Nilai `minimumStock` akhir (nilai baru jika dikirim, atau nilai `minimumStock` yang sudah tersimpan jika hanya `unit` yang diubah) wajib valid terhadap `unit` produk akhir (`422 INVALID_UNIT_QUANTITY` jika pecahan pada unit count-only).
- Jika `categoryId` tidak berubah, kategori inactive yang sudah terhubung tetap diperbolehkan.
- Jika `categoryId` berubah, kategori tujuan harus ada dan aktif (`422 INACTIVE_CATEGORY`).
- Pemeriksaan kategori (jika berubah dengan `SELECT ... FOR SHARE`) dan penguncian baris produk (`SELECT ... FOR UPDATE`) wajib dilakukan dalam satu transaksi database.

### 8.5 Activate / Deactivate Product

```http
PATCH /api/v1/products/:id/status
```

**Role:** Admin.

Request:

```json
{
  "status": "inactive"
}
```

**Response: 200 OK**

Mengembalikan DTO produk terbaru versi Admin (sama seperti `GET /api/v1/products/:id` Admin).

Ketentuan:

- Status hanya `active` atau `inactive`.
- Produk inactive tidak dapat menerima Stock In atau Stock Out.
- Riwayat stock movement tetap tersedia.
- Operasi dengan status yang sama bersifat idempotent (`200 OK`, tanpa mengubah `updatedAt`).

---

## 9. Stock Movement

Stock movement digunakan untuk mencatat transaksi Stock In dan Stock Out.

### 9.1 Get Stock Movements

```http
GET /api/v1/stock-movements
```

**Authentication:** Wajib.

Query parameters:

| Parameter | Type | Default | Keterangan |
|---|---|---|---|
| page | integer | 1 | Halaman |
| pageSize | integer | 10 | Jumlah data |
| productId | UUID | - | Filter produk |
| type | string | - | `in` atau `out` |
| createdBy | UUID | - | Filter pengguna |
| startDate | ISO 8601 | - | Batas waktu awal |
| endDate | ISO 8601 | - | Batas waktu akhir |
| sortOrder | string | desc | `asc` atau `desc` |

Pengurutan selalu menggunakan `createdAt` dan `id` sebagai tie-breaker agar hasil pagination deterministik.

**Response: 200 OK**

```json
{
  "success": true,
  "message": "Riwayat stok berhasil diambil",
  "data": [
    {
      "id": "750e8400-e29b-41d4-a716-446655440000",
      "product": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "sku": "ELK-001",
        "name": "Keyboard",
        "unit": "pcs"
      },
      "type": "in",
      "quantity": "10.000",
      "stockBefore": "0.000",
      "stockAfter": "10.000",
      "reason": "Pembelian stok awal",
      "notes": "Barang diterima dalam kondisi baik",
      "createdBy": {
        "id": "850e8400-e29b-41d4-a716-446655440000",
        "name": "Administrator"
      },
      "createdAt": "2026-11-12T10:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

Ketentuan:

- Riwayat tidak dapat diubah atau dihapus melalui API.
- Staff dapat melihat riwayat transaksi.
- Riwayat tidak menampilkan harga pembelian atau penjualan.
- Produk inactive tetap dapat muncul dalam riwayat.

### 9.2 Get Stock Movement Detail

```http
GET /api/v1/stock-movements/:id
```

**Authentication:** Wajib.

Response: `200 OK`.

Mengembalikan detail satu stock movement dengan struktur yang sama seperti item pada endpoint list.

### 9.3 Create Stock Movement

```http
POST /api/v1/stock-movements
```

**Authentication:** Wajib.

**Role:** Admin dan Staff.

Request Stock In:

```json
{
  "productId": "550e8400-e29b-41d4-a716-446655440000",
  "type": "in",
  "quantity": "10.000",
  "reason": "Pembelian stok",
  "notes": "Barang diterima dari toko"
}
```

Request Stock Out:

```json
{
  "productId": "550e8400-e29b-41d4-a716-446655440000",
  "type": "out",
  "quantity": "2.000",
  "reason": "Penggunaan operasional",
  "notes": "Digunakan oleh bagian administrasi"
}
```

Response: `201 Created`.

```json
{
  "success": true,
  "message": "Stock movement berhasil dicatat",
  "data": {
    "id": "750e8400-e29b-41d4-a716-446655440000",
    "product": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "sku": "ELK-001",
      "name": "Keyboard",
      "unit": "pcs"
    },
    "type": "in",
    "quantity": "10.000",
    "stockBefore": "0.000",
    "stockAfter": "10.000",
    "reason": "Pembelian stok",
    "notes": "Barang diterima dari toko",
    "createdBy": {
      "id": "850e8400-e29b-41d4-a716-446655440000",
      "name": "Administrator"
    },
    "createdAt": "2026-11-12T10:30:00.000Z"
  }
}
```

Ketentuan:

- `type` hanya `in` atau `out`.
- Quantity harus lebih besar dari nol (`422 BUSINESS_RULE_VIOLATION` bila `<= 0`).
- Quantity maksimal 3 angka desimal.
- Reason wajib diisi dan tidak boleh kosong atau hanya whitespace.
- Notes bersifat opsional dan nullable; string kosong atau whitespace-only dinormalisasi menjadi `null`.
- Produk harus aktif (`422 INACTIVE_PRODUCT`).
- Stock Out tidak boleh menyebabkan stok negatif (`422 INSUFFICIENT_STOCK`).
- Untuk Stock In, hasil `stockAfter` tidak boleh melampaui batas maksimum `NUMERIC(14,3)` (`99999999999.999`); jika terlampaui ditolak dengan `422 BUSINESS_RULE_VIOLATION`.
- Unit count-only harus menggunakan quantity bilangan bulat (`422 INVALID_UNIT_QUANTITY`).
- Stock In/Out dan pembaruan `currentStock` wajib dilakukan dalam satu database transaction.
- Product row wajib dikunci menggunakan `SELECT ... FOR UPDATE`.
- Stock movement tidak boleh diedit atau dihapus melalui aplikasi.

**Penting:**

MVP tidak menggunakan `Idempotency-Key`.

Client tidak boleh otomatis mengulang request Stock In/Out ketika hasil request sebelumnya tidak diketahui. Client harus memeriksa riwayat atau kondisi stok terlebih dahulu untuk menghindari transaksi ganda.

`X-Request-ID` hanya digunakan untuk correlation, bukan deduplication.

---

## 10. Dashboard

### 10.1 Get Dashboard

```http
GET /api/v1/dashboard
```

**Authentication:** Wajib.

**Role:** Admin dan Staff.

Dashboard menggunakan periode bulan kalender berjalan berdasarkan timezone bisnis yang dikonfigurasi melalui `BUSINESS_TIMEZONE` (default `Asia/Jakarta`).

Server menghitung batas awal dan akhir bulan berdasarkan timezone tersebut, lalu menggunakan instant UTC untuk query database.

**Response: 200 OK**

```json
{
  "success": true,
  "message": "Dashboard berhasil diambil",
  "data": {
    "summary": {
      "activeProductCount": 100,
      "activeCategoryCount": 10,
      "lowStockCount": 5,
      "stockInCount": 20,
      "stockOutCount": 15
    },
    "lowStockProducts": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "sku": "ELK-001",
        "name": "Keyboard",
        "unit": "pcs",
        "currentStock": "2.000",
        "minimumStock": "5.000"
      }
    ],
    "recentStockMovements": [
      {
        "id": "750e8400-e29b-41d4-a716-446655440000",
        "product": {
          "id": "550e8400-e29b-41d4-a716-446655440000",
          "sku": "ELK-001",
          "name": "Keyboard",
          "unit": "pcs"
        },
        "type": "in",
        "quantity": "10.000",
        "stockBefore": "0.000",
        "stockAfter": "10.000",
        "reason": "Pembelian stok",
        "createdBy": {
          "id": "850e8400-e29b-41d4-a716-446655440000",
          "name": "Administrator"
        },
        "createdAt": "2026-11-12T10:30:00.000Z"
      }
    ]
  }
}
```

Ketentuan:

- `activeProductCount` menghitung produk aktif.
- `activeCategoryCount` menghitung kategori aktif.
- `lowStockCount` menghitung produk aktif dengan `currentStock <= minimumStock`.
- `lowStockProducts` menampilkan maksimal 10 produk aktif dengan stok rendah, diurutkan secara deterministik berdasarkan defisit terbesar `(minimum_stock - current_stock) DESC`, lalu `current_stock ASC`, dan `id ASC` sebagai tie-breaker.
- `recentStockMovements` menampilkan maksimal 10 transaksi terbaru (termasuk transaksi produk yang sekarang inactive), diurutkan berdasarkan `createdAt DESC` dan `id DESC`.
- `stockInCount` menghitung jumlah transaksi Stock In pada bulan berjalan.
- `stockOutCount` menghitung jumlah transaksi Stock Out pada bulan berjalan.
- Perhitungan Stock In/Out tetap memasukkan transaksi produk yang sekarang inactive.
- Low stock dan recent movement tidak menampilkan informasi harga.
- Tidak dilakukan penjumlahan kuantitas dari produk dengan satuan berbeda.

Admin dan Staff menerima struktur dashboard yang sama karena tidak ada informasi harga pada dashboard.

---

## 11. Endpoint Catalog

Ringkasan seluruh endpoint MVP:

| Method | Endpoint | Role |
|---|---|---|
| POST | `/api/v1/auth/login` | Public |
| GET | `/api/v1/auth/me` | Authenticated |
| POST | `/api/v1/auth/logout` | Authenticated |
| GET | `/api/v1/users` | Admin |
| POST | `/api/v1/users` | Admin |
| GET | `/api/v1/users/:id` | Admin |
| PATCH | `/api/v1/users/:id` | Admin |
| PATCH | `/api/v1/users/:id/status` | Admin |
| PATCH | `/api/v1/users/:id/password` | Admin |
| GET | `/api/v1/categories` | Admin, Staff |
| POST | `/api/v1/categories` | Admin |
| GET | `/api/v1/categories/:id` | Admin, Staff |
| PATCH | `/api/v1/categories/:id` | Admin |
| PATCH | `/api/v1/categories/:id/status` | Admin |
| GET | `/api/v1/products` | Admin, Staff |
| POST | `/api/v1/products` | Admin |
| GET | `/api/v1/products/:id` | Admin, Staff |
| PATCH | `/api/v1/products/:id` | Admin |
| PATCH | `/api/v1/products/:id/status` | Admin |
| GET | `/api/v1/stock-movements` | Admin, Staff |
| GET | `/api/v1/stock-movements/:id` | Admin, Staff |
| POST | `/api/v1/stock-movements` | Admin, Staff |
| GET | `/api/v1/dashboard` | Admin, Staff |

Operational health endpoints berada di luar API versioning:

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/health` | Memeriksa proses aplikasi |
| GET | `/health/db` | Memeriksa koneksi database |

Health endpoint tidak membutuhkan authentication.

Response `/health`:

```json
{
  "status": "ok"
}
```

HTTP status: `200 OK`.

Response `/health/db` ketika database sehat:

```json
{
  "status": "ok",
  "database": "connected"
}
```

HTTP status: `200 OK`.

Response ketika database tidak tersedia:

```json
{
  "status": "error",
  "database": "disconnected"
}
```

HTTP status: `503 Service Unavailable`.

Health endpoint merupakan operational probe dan dikecualikan dari response envelope API bisnis.

---

## 12. HTTP Status Code

| Status | Penggunaan |
|---|---|
| 200 | Request berhasil |
| 201 | Resource berhasil dibuat |
| 400 | Request malformed atau gagal validasi struktur/schema |
| 401 | Belum login atau session tidak valid |
| 403 | Tidak memiliki izin |
| 404 | Resource tidak ditemukan |
| 409 | Konflik uniqueness atau konflik state |
| 422 | Request valid secara struktur tetapi melanggar aturan bisnis |
| 429 | Rate limit terlampaui |
| 500 | Internal server error |
| 503 | Service atau dependency tidak tersedia |

### 12.1 Validasi 400 dan 422

HTTP `400` (`VALIDATION_ERROR`) digunakan untuk validasi struktur/schema sebelum logika bisnis:

- JSON malformed.
- Required field tidak dikirim atau payload `PATCH` kosong `{}`.
- String wajib kosong atau hanya berisi whitespace (seperti `name`, `sku`, `unit`, `reason`, `password`) setelah trim.
- Panjang string melebihi batas kolom database (`name`, `email`, `sku`, `unit`) atau password di luar 8–128 karakter.
- Format email, format SKU (`^[A-Z0-9-]+$` setelah trim + uppercase), UUID, atau ISO 8601 datetime tidak valid.
- Tipe data atau parameter pagination/sorting (`page`, `pageSize`, `sortBy` di luar allowlist, `sortOrder`) tidak valid.
- Format angka desimal tidak valid.
- Nilai numerik melampaui batas maksimum representasi database (`> 99999999999.999` atau `> 999999999999.99`).
- Jumlah angka desimal melebihi presisi yang diperbolehkan (> 3 desimal untuk stok/kuantitas/`minimumStock`, > 2 desimal untuk harga).

Elysia schema validation error wajib dipetakan melalui custom error handler menjadi HTTP `400`, bukan menggunakan default `422`.

HTTP `422` digunakan untuk pelanggaran business rule (struktur & sintaks numerik valid):

- Quantity bernilai nol atau negatif (`BUSINESS_RULE_VIOLATION`).
- `purchasePrice`, `sellingPrice`, atau `minimumStock` bernilai negatif (`BUSINESS_RULE_VIOLATION`).
- `stock_after` pada Stock In melampaui batas maksimum `99999999999.999` (`BUSINESS_RULE_VIOLATION`).
- Stock Out melebihi stok tersedia (`INSUFFICIENT_STOCK`).
- Produk inactive melakukan Stock In/Out (`INACTIVE_PRODUCT`).
- Kategori inactive dipilih untuk produk baru atau perubahan kategori (`INACTIVE_CATEGORY`).
- Quantity atau `minimumStock` pecahan digunakan pada unit count-only (`INVALID_UNIT_QUANTITY`).
- Perubahan `unit` produk tidak memenuhi syarat (`BUSINESS_RULE_VIOLATION`).
- Admin mencoba menurunkan role diri sendiri, menonaktifkan diri sendiri, atau mengubah/menonaktifkan Admin aktif terakhir (`BUSINESS_RULE_VIOLATION`).
- Business rule lainnya dilanggar.

HTTP `403` (`FORBIDDEN`) digunakan untuk:

- Role tidak memiliki izin mengakses endpoint.
- Staff mencoba mengakses kategori/produk `inactive` secara langsung (`GET /categories/:id`, `GET /products/:id`) atau memfilter data `inactive`/`all`.
- Staff mencoba menyortir `GET /products` berdasarkan `purchasePrice`, `sellingPrice`, atau `status`.
- Pelanggaran validasi `Origin` / `Referer` (CSRF).

HTTP `409` digunakan untuk:

- SKU duplikat (`DUPLICATE_SKU`).
- Email duplikat (`DUPLICATE_EMAIL`).
- Nama kategori duplikat setelah normalisasi (`DUPLICATE_CATEGORY_NAME`).
- Konflik uniqueness lainnya.
- Konflik state yang memang tidak dapat diselesaikan sebagai validasi bisnis biasa (`STATE_CONFLICT`).

---

## 13. Error Code Catalog

| Error Code | HTTP | Keterangan |
|---|---:|---|
| `VALIDATION_ERROR` | 400 | Request tidak valid (schema/format/batas panjang) |
| `UNAUTHENTICATED` | 401 | Session tidak valid |
| `INVALID_CREDENTIALS` | 401 | Login gagal |
| `FORBIDDEN` | 403 | Akses ditolak / pelanggaran Origin |
| `RESOURCE_NOT_FOUND` | 404 | Resource tidak ditemukan |
| `DUPLICATE_EMAIL` | 409 | Email sudah digunakan |
| `DUPLICATE_SKU` | 409 | SKU sudah digunakan |
| `DUPLICATE_CATEGORY_NAME` | 409 | Nama kategori sudah digunakan |
| `STATE_CONFLICT` | 409 | Konflik state |
| `BUSINESS_RULE_VIOLATION` | 422 | Aturan bisnis dilanggar |
| `INSUFFICIENT_STOCK` | 422 | Stok tidak mencukupi |
| `INACTIVE_PRODUCT` | 422 | Produk inactive |
| `INACTIVE_CATEGORY` | 422 | Kategori inactive |
| `INVALID_UNIT_QUANTITY` | 422 | Quantity atau `minimumStock` tidak sesuai aturan unit |
| `RATE_LIMIT_EXCEEDED` | 429 | Terlalu banyak request |
| `INTERNAL_SERVER_ERROR` | 500 | Kesalahan internal |
| `SERVICE_UNAVAILABLE` | 503 | Dependency tidak tersedia |

Error code harus konsisten untuk kondisi yang sama.

---

## 14. Authorization Rules

### 14.1 Role Matrix

| Feature | Admin | Staff |
|---|---|---|
| Login | Yes | Yes |
| Get current user | Yes | Yes |
| Logout | Yes | Yes |
| View users | Yes | No |
| Create users | Yes | No |
| Update users | Yes | No |
| Deactivate users | Yes | No |
| Reset user password | Yes | No |
| View categories | Yes | Active only (`403` for inactive) |
| Create categories | Yes | No |
| Update categories | Yes | No |
| Deactivate categories | Yes | No |
| View products | Yes | Active only (`403` for inactive) |
| Create products | Yes | No |
| Update products | Yes | No |
| Deactivate products | Yes | No |
| View product prices | Yes | No |
| Stock In | Yes | Yes |
| Stock Out | Yes | Yes |
| View stock movements | Yes | Yes (including inactive product references) |
| View dashboard | Yes | Yes |

### 14.2 Backend Enforcement

Authorization wajib dilakukan pada backend.

Frontend hiding atau disabling button bukan mekanisme authorization.

Backend wajib:

- Memvalidasi session.
- Memastikan user masih aktif.
- Memeriksa role.
- Membatasi data berdasarkan role.
- Menghilangkan field harga dari response Staff.

---

## 15. CORS dan CSRF

### 15.1 Development Origin

Frontend:

```text
http://localhost:3000
```

Backend:

```text
http://localhost:3001
```

Kedua origin berada pada site yang sama untuk skema dan host tersebut, tetapi tetap berbeda origin.

Backend harus menggunakan explicit CORS allowlist.

### 15.2 CORS Configuration

Konfigurasi development:

```text
Allowed Origin: http://localhost:3000
Allow Credentials: true
Allowed Methods: GET, POST, PATCH, OPTIONS
Allowed Headers: Content-Type, Accept, X-Request-ID
```

Jangan menggunakan wildcard `*` ketika credentials diaktifkan.

Frontend wajib mengirim cookie pada request API melalui:

```typescript
credentials: "include"
```

### 15.3 Origin Validation

Untuk request yang mengubah state:

- Jika header `Origin` tersedia, nilainya harus cocok dengan allowlist.
- Jika `Origin` tidak tersedia tetapi `Referer` tersedia, origin dari `Referer` harus cocok dengan allowlist.
- Jika kedua header tidak tersedia, request non-browser seperti Bruno atau curl diperbolehkan melalui mekanisme session authentication dan authorization normal.
- Jika `Origin` atau `Referer` tersedia tetapi tidak cocok, request ditolak dengan `403 Forbidden`.

Jangan memperlakukan header yang tidak cocok sebagai header yang tidak tersedia.

### 15.4 Production

MVP menggunakan frontend dan backend dalam site yang sama, atau deployment melalui reverse proxy/BFF yang mempertahankan kebijakan same-site.

Cookie production menggunakan:

```text
HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800
```

Deployment cross-site yang membutuhkan `SameSite=None` berada di luar konfigurasi default MVP dan wajib memiliki proteksi CSRF eksplisit sebelum digunakan.

---

## 16. Product Unit Rules

Unit disimpan sebagai string lowercase setelah trim.

Tidak ada tabel master unit pada MVP.

### 16.1 Count-only Units

Daftar unit yang hanya menerima bilangan bulat:

```text
pcs
unit
box
pack
set
```

Contoh valid:

```json
{
  "quantity": "2.000"
}
```

Contoh tidak valid:

```json
{
  "quantity": "2.500"
}
```

### 16.2 Other Units

Unit di luar daftar count-only menerima nilai pecahan hingga 3 angka desimal.

Contoh:

- kg
- gram
- liter
- meter
- roll
- rim

Backend tidak membuat asumsi bahwa unit bebas tertentu selalu mempunyai karakteristik fisik tertentu.

### 16.3 Minimum Stock

`minimumStock` mengikuti aturan unit produk.

Contoh:

- Produk dengan unit `pcs` tidak boleh memiliki minimum stock `2.500`.
- Produk dengan unit `kg` boleh memiliki minimum stock `2.500`.

### 16.4 Unit Changes

Perubahan unit hanya diperbolehkan jika:

- `currentStock` bernilai nol.
- Produk belum mempunyai stock movement.
- Pemeriksaan dilakukan di dalam transaksi dengan mengunci baris produk (`SELECT ... FOR UPDATE`).
- Nilai `minimumStock` akhir (nilai baru bila ikut diperbarui, atau nilai `minimumStock` yang sudah ada bila tidak dikirim) tetap valid terhadap aturan presisi `unit` yang baru (`422 INVALID_UNIT_QUANTITY`).

Aturan ini mencegah satu riwayat stok mencampur satuan yang berbeda maupun menghasilkan `minimumStock` pecahan pada unit count-only.

---

## 17. Product and Category State Rules

### 17.1 Category

- Kategori inactive tidak boleh digunakan untuk produk baru.
- Kategori inactive tidak boleh menjadi tujuan perubahan kategori.
- Produk lama tetap terhubung ke kategori inactive.
- Perubahan field produk lain tetap diperbolehkan selama `categoryId` tidak berubah.

### 17.2 Product

- Produk inactive tidak dapat melakukan Stock In/Out.
- Produk inactive tetap dapat ditampilkan oleh Admin.
- Riwayat stock movement tetap tersedia.
- Produk inactive tidak masuk perhitungan active product count dan low stock dashboard.

### 17.3 Idempotent Status Changes

Request perubahan status yang mengirim status sama dengan kondisi saat ini tetap mengembalikan sukses (`200 OK`) dengan data kondisi saat ini tanpa mengubah `updatedAt`.

Contoh: mengirim `inactive` pada produk yang sudah inactive tidak menghasilkan error.

---

## 18. API Query Rules

### 18.1 Pagination

Semua endpoint list menggunakan:

```text
?page=1&pageSize=10
```

Ketentuan:

- `page` minimal 1.
- `pageSize` minimal 1.
- `pageSize` maksimal 100.
- Parameter invalid menghasilkan `400`.

### 18.2 Search

Search dilakukan pada field yang telah ditentukan oleh endpoint.

Search menggunakan pencarian case-insensitive.

Input search harus di-trim.

### 18.3 Sorting

Sorting menggunakan allowlist field yang dapat diurutkan pada masing-masing endpoint (`GET /users`, `GET /categories`, `GET /products`).

Jangan memasukkan nama kolom dari query string secara langsung ke SQL.

`sortOrder` hanya menerima:

```text
asc
desc
```

Parameter sorting yang tidak valid menghasilkan `400 VALIDATION_ERROR` (kecuali Staff mencoba menyortir produk berdasarkan kolom terlarang `purchasePrice`/`sellingPrice`/`status` yang menghasilkan `403 FORBIDDEN`).

### 18.4 Date Filtering

`startDate` dan `endDate` wajib menggunakan format ISO 8601 datetime lengkap dengan timezone/offset (contoh: `2026-11-12T00:00:00.000Z` atau `2026-11-12T00:00:00+07:00`); format tanggal tanpa waktu atau format invalid ditolak dengan `400 VALIDATION_ERROR`.

Jika keduanya digunakan:

```text
startDate <= endDate
```

Rentang waktu menggunakan batas inklusif pada awal dan eksklusif pada akhir (`[start, end)`). Catatan: apabila `startDate` sama persis dengan `endDate`, rentang `[start, end)` menghasilkan himpunan kosong.

---

## 19. Transaction and Concurrency Requirements

### 19.1 Stock Movement

Stock In/Out harus menggunakan satu database transaction:

1. Validasi struktur request (`400 VALIDATION_ERROR` bila format/skema gagal).
2. Mulai transaction.
3. Lock product row menggunakan `SELECT ... FOR UPDATE`.
4. Pastikan produk ditemukan (`404`) dan aktif (`422 INACTIVE_PRODUCT`).
5. Validasi quantity (`422 BUSINESS_RULE_VIOLATION` bila `<= 0`; `422 INVALID_UNIT_QUANTITY` bila melanggar unit count-only).
6. Pastikan stok mencukupi untuk Stock Out (`422 INSUFFICIENT_STOCK`) atau `stockAfter <= 99999999999.999` untuk Stock In (`422 BUSINESS_RULE_VIOLATION`).
7. Hitung stock before dan stock after dengan aritmetika desimal presisi (`BigInt`).
8. Update `products.current_stock` dan `products.updated_at`.
9. Insert `stock_movements`.
10. Commit transaction.

Jika salah satu langkah gagal, seluruh transaction harus rollback.

### 19.2 Category Assignment and Product Update

Ketika membuat produk atau memperbarui produk:

1. Mulai transaction.
2. Jika membuat produk atau mengubah `categoryId`, lock category row menggunakan `SELECT ... FOR SHARE`, lalu pastikan kategori ditemukan (`404`) dan aktif (`422 INACTIVE_CATEGORY`).
3. Jika memperbarui produk yang sudah ada (`PATCH`), lock product row menggunakan `SELECT ... FOR UPDATE`, pastikan produk ditemukan (`404`), validasi syarat perubahan `unit` (`currentStock = 0` dan belum ada movement), serta validasi `minimumStock` akhir terhadap `unit` akhir.
4. Insert atau update produk (termasuk memperbarui `updated_at`).
5. Commit transaction.

Jika salah satu validasi gagal, transaction dibatalkan.

### 19.3 Numeric Arithmetic

Backend wajib menggunakan exact decimal arithmetic berbasis scaled `BigInt` atau operasi SQL yang setara.

Jangan menggunakan floating-point arithmetic untuk menghitung stok atau harga.

---

## 20. Frontend Integration Requirements

### 20.1 Authentication State

Frontend menggunakan:

```http
GET /api/v1/auth/me
```

untuk memulihkan authentication state.

Frontend tidak boleh membaca session token secara langsung karena cookie menggunakan HttpOnly.

### 20.2 API Requests

Request frontend wajib mengirim:

```typescript
credentials: "include"
```

Untuk request dengan body:

```typescript
headers: {
  "Content-Type": "application/json",
  "Accept": "application/json"
}
```

### 20.3 Authentication Handling

- `401`: arahkan pengguna ke halaman login.
- `403`: tampilkan halaman atau pesan akses ditolak.
- `422`: tampilkan pesan aturan bisnis yang dilanggar.
- `429`: tampilkan pesan terlalu banyak request.
- `500`: tampilkan pesan kesalahan umum.

Frontend tidak boleh menampilkan detail internal server.

### 20.4 Price Visibility

Komponen frontend Staff tidak boleh mengandalkan penyembunyian field harga saja.

Backend wajib tidak mengirimkan field harga pada response Staff.

---

## 21. Bruno API Collection

Koleksi Bruno disimpan pada:

```text
bruno/
```

Struktur yang direkomendasikan:

```text
bruno/
├── collection.bru
├── environments/
│   ├── local.bru
│   └── production.example.bru
├── auth/
│   ├── login.bru
│   ├── me.bru
│   └── logout.bru
├── users/
├── categories/
├── products/
├── stock-movements/
└── dashboard/
```

Ketentuan:

- Environment lokal menggunakan backend `http://localhost:3001`.
- Credential dan password tidak boleh disimpan dalam file yang di-commit.
- Session cookie harus dikelola melalui cookie jar Bruno.
- Request collection harus mengikuti kontrak ini.
- Test harus mencakup role Admin dan Staff.

---

## 22. OpenAPI / Swagger

Backend wajib menyediakan dokumentasi OpenAPI yang merepresentasikan kontrak API ini.

Ketentuan:

- Seluruh endpoint harus didokumentasikan.
- Request dan response schema harus didefinisikan.
- Role dan authentication requirement harus dicantumkan.
- Error response harus didokumentasikan.
- Field harga harus dibedakan berdasarkan role.
- Format `NUMERIC` harus menggunakan JSON string.
- Cookie session harus direpresentasikan sebagai cookie-based security scheme.

Swagger UI tersedia pada endpoint dokumentasi yang dikonfigurasi di backend dan hanya untuk kebutuhan development.

---

## 23. Out of Scope

Hal berikut tidak termasuk MVP:

- Idempotency-Key.
- Refresh token.
- JWT authentication.
- OAuth atau social login.
- Self-service password change.
- Forgot password melalui email.
- Multi-factor authentication.
- Multi-warehouse.
- Stock Adjustment.
- Supplier dan purchase order.
- Sales order dan invoice.
- Payment processing.
- Generic audit log.
- Bulk import/export.
- Webhook.
- Public API key.

---

## 24. Final API Contract Rules

1. Seluruh endpoint bisnis wajib menggunakan `/api/v1` (operational probe `/health` dan `/health/db` berada di luar prefix ini).
2. Seluruh endpoint bisnis harus mengikuti response envelope (kecuali operational probe `/health` dan `/health/db`).
3. Semua nilai PostgreSQL NUMERIC dikirim sebagai JSON string.
4. Pagination menggunakan `page` dan `pageSize`.
5. Session menggunakan HttpOnly Cookie dengan masa berlaku absolut 7 hari (`SESSION_TTL_DAYS`).
6. Frontend menggunakan `/auth/me` untuk memulihkan authentication state.
7. Authorization wajib dilakukan di backend.
8. Staff tidak boleh menerima field harga, tidak boleh menyortir produk berdasarkan field harga (`403`), dan hanya melihat kategori/produk aktif pada endpoint master data (`403` untuk akses inactive).
9. Stock In/Out wajib atomik dan menggunakan row-level locking (`SELECT ... FOR UPDATE`).
10. Stock movement tidak dapat diedit atau dihapus melalui aplikasi.
11. Schema validation error dipetakan ke HTTP `400`.
12. Business-rule validation error dipetakan ke HTTP `422`.
13. Duplicate uniqueness menghasilkan HTTP `409`.
14. User deactivation dan password reset mencabut seluruh session aktif secara transaksional.
15. Semua implementasi API, OpenAPI, dan Bruno harus mengikuti dokumen ini.

**Status:** Final untuk kontrak API MVP. Perubahan selanjutnya harus melalui revisi dokumentasi dan pemeriksaan konsistensi terhadap PRD, architecture, database design, serta AGENTS.md.