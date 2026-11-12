# Architecture

# Inventory Management System

**Status:** Final untuk MVP  
**Versi:** 1.0  
**Bahasa:** Indonesia

---

## 1. Tujuan Dokumen

Dokumen ini menjelaskan rancangan arsitektur Inventory Management System (IMS) sebagai pedoman implementasi frontend, backend, database, dan komunikasi antarbagian aplikasi.

Dokumen ini melengkapi:

- `AGENTS.md`
- `docs/PRD.md`
- `docs/api-contract.md`
- `docs/database-design.md`

Tujuan utamanya adalah memastikan implementasi sistem memiliki struktur yang konsisten, mudah dipelihara, aman, dan sesuai dengan kebutuhan MVP.

---

## 2. System Overview

### 2.1 Deskripsi Sistem

Inventory Management System merupakan aplikasi web untuk mengelola persediaan barang dalam satu gudang.

Sistem memiliki dua jenis pengguna:

- Admin
- Staff

Admin bertanggung jawab mengelola data utama dan memantau persediaan.

Staff bertanggung jawab menjalankan transaksi Stock In dan Stock Out serta melihat informasi persediaan yang diizinkan.

### 2.2 Architecture Style

Sistem menggunakan pendekatan **Modular Monolith**.

Modular Monolith berarti seluruh modul backend berjalan dalam satu aplikasi, tetapi tanggung jawab setiap modul dipisahkan secara terstruktur.

Keuntungan pendekatan ini:

- Lebih sederhana untuk dikembangkan.
- Lebih mudah dijalankan dan diuji.
- Tidak membutuhkan infrastruktur microservices.
- Memiliki pemisahan tanggung jawab antar modul.
- Dapat dikembangkan secara bertahap.

### 2.3 High-Level Architecture

<escape>```mermaid
flowchart TB
    U[User: Admin / Staff]

    subgraph CLIENT[Frontend]
        FE[Next.js Application]
    end

    subgraph SERVER[Backend]
        API[Elysia.js REST API]

        AUTH[Authentication Module]
        USER[Users Module]
        CAT[Categories Module]
        PROD[Products Module]
        STOCK[Stock Movements Module]
        DASH[Dashboard Module]
    end

    subgraph DATA[Database]
        DB[(PostgreSQL 18)]
    end

    U --> FE
    FE -->|HTTPS / REST API| API

    API --> AUTH
    API --> USER
    API --> CAT
    API --> PROD
    API --> STOCK
    API --> DASH

    AUTH --> DB
    USER --> DB
    CAT --> DB
    PROD --> DB
    STOCK --> DB
    DASH --> DB
```</escape>

---

## 3. Technology Stack

| Layer | Technology |
|---|---|
| Frontend Framework | Next.js |
| Frontend Language | TypeScript |
| Styling | Tailwind CSS |
| Backend Framework | Elysia.js |
| Runtime | Bun |
| Backend Language | TypeScript |
| Database | PostgreSQL 18 |
| ORM | Drizzle ORM |
| Database Driver | Postgres.js |
| Authentication | Database-backed Session |
| Password Hashing | Argon2id |
| API Documentation | Swagger / OpenAPI |
| API Testing | Bruno |
| Monorepo | Bun Workspaces |

### 3.1 Communication

Frontend berkomunikasi dengan backend menggunakan REST API melalui HTTP/HTTPS.

Seluruh endpoint bisnis menggunakan prefix:

`/api/v1`

Pada production, komunikasi wajib menggunakan HTTPS.

### 3.2 Database Access

Backend menggunakan Drizzle ORM dan Postgres.js untuk mengakses PostgreSQL.

Database query tidak boleh dijalankan langsung dari frontend.

Operasi database harus dilakukan melalui backend sesuai pembagian tanggung jawab modul.

---

## 4. Repository Structure

Struktur repository yang direkomendasikan:

<escape>```text
inventory-management-system/
├── AGENTS.md
├── package.json
├── bun.lock
├── bruno/
│
├── docs/
│   ├── PRD.md
│   ├── architecture.md
│   ├── database-design.md
│   └── api-contract.md
│
├── apps/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── app.ts
│   │   │   ├── index.ts
│   │   │   ├── config/
│   │   │   ├── db/
│   │   │   │   ├── client.ts
│   │   │   │   ├── schema/
│   │   │   │   └── migrations/
│   │   │   ├── plugins/
│   │   │   ├── common/
│   │   │   └── modules/
│   │   │       ├── auth/
│   │   │       ├── users/
│   │   │       ├── categories/
│   │   │       ├── products/
│   │   │       ├── stock-movements/
│   │   │       └── dashboard/
│   │   ├── tests/
│   │   └── package.json
│   │
│   └── frontend/
│       ├── src/
│       │   ├── app/
│       │   ├── components/
│       │   ├── features/
│       │   ├── hooks/
│       │   ├── lib/
│       │   ├── services/
│       │   └── types/
│       └── package.json
│
└── ...
```</escape>

Struktur tersebut merupakan pedoman organisasi kode, bukan kewajiban untuk membuat seluruh file kosong sejak awal.

Ikuti struktur aktual repository dan buat direktori ketika dibutuhkan.

---

## 5. Backend Architecture

### 5.1 Modular Monolith

Backend terdiri dari beberapa modul dengan tanggung jawab masing-masing.

| Module | Responsibility |
|---|---|
| Auth | Login, logout, session validation |
| Users | Pengelolaan akun pengguna |
| Categories | Pengelolaan kategori |
| Products | Pengelolaan produk |
| Stock Movements | Stock In, Stock Out, riwayat transaksi |
| Dashboard | Ringkasan informasi inventaris |

Setiap modul harus memiliki batas tanggung jawab yang jelas.

Hindari menggabungkan seluruh business logic ke dalam satu file atau satu service besar.

### 5.2 Module Structure

Struktur internal modul dapat menggunakan:

<escape>```text
modules/
└── products/
    ├── product.route.ts
    ├── product.service.ts
    ├── product.repository.ts
    ├── product.schema.ts
    └── product.types.ts
```</escape>

Tanggung jawab setiap bagian:

**Route**

- Mendefinisikan endpoint.
- Menerima request.
- Memvalidasi struktur request.
- Memanggil service.
- Mengembalikan HTTP response.

**Service**

- Menjalankan business logic.
- Mengatur alur operasi.
- Mengelola transaksi database.
- Memastikan aturan bisnis dipenuhi.

**Repository**

- Menangani query database.
- Mengakses tabel dan relasi.
- Mengisolasi operasi persistence dari business logic.

**Schema**

- Mendefinisikan validasi input.
- Memastikan format request sesuai kebutuhan.
- Membantu menjaga konsistensi kontrak API.

**Types**

- Mendefinisikan tipe data yang digunakan modul.
- Menghindari duplikasi definisi tipe.

Tidak semua modul harus memiliki jumlah file yang sama. Hindari membuat abstraksi yang tidak dibutuhkan.

### 5.3 Dependency Direction

Gunakan arah dependency berikut:

<escape>```mermaid
flowchart TB
    ROUTE[Route / Controller]
    SERVICE[Service]
    REPO[Repository]
    DB[(PostgreSQL)]

    ROUTE --> SERVICE
    SERVICE --> REPO
    REPO --> DB
```</escape>

Ketentuan:

- Route tidak boleh berisi business logic kompleks.
- Service tidak boleh bergantung pada HTTP request object secara langsung jika tidak diperlukan.
- Repository tidak boleh menentukan HTTP status code.
- Database query harus tetap berada pada data access layer.
- Business rule harus dapat diuji tanpa harus menjalankan HTTP server.

---

## 6. Backend Module Responsibilities

### 6.1 Authentication Module

Tanggung jawab:

- Login.
- Logout.
- Validasi session.
- Membuat session baru.
- Mencabut session.
- Memastikan user masih aktif.

Modul ini juga menyediakan authenticated user context untuk endpoint yang membutuhkan autentikasi.

### 6.2 Users Module

Tanggung jawab:

- Menampilkan daftar pengguna.
- Membuat pengguna.
- Mengubah informasi pengguna.
- Mengubah role pengguna.
- Mengaktifkan pengguna.
- Menonaktifkan pengguna (disertai pencabutan seluruh session aktif pengguna dalam satu transaksi).
- Melakukan reset password pengguna oleh Admin (disertai pencabutan seluruh session aktif pengguna dalam satu transaksi).
- Menegakkan aturan self-protection Admin serta penguncian transaksi agar Admin aktif terakhir tidak dapat dinonaktifkan atau diturunkan role-nya.

Hanya Admin yang dapat menggunakan fungsi pengelolaan pengguna.

### 6.3 Categories Module

Tanggung jawab:

- Menampilkan kategori.
- Membuat kategori.
- Mengubah kategori.
- Mengaktifkan kategori.
- Menonaktifkan kategori.

Hanya Admin yang dapat mengelola kategori.

Staff hanya dapat melihat kategori aktif (`is_active = true`). Permintaan filter atau akses langsung terhadap kategori inactive oleh Staff ditolak dengan `403 Forbidden`.

### 6.4 Products Module

Tanggung jawab:

- Menampilkan daftar produk.
- Menampilkan detail produk.
- Membuat produk.
- Mengubah produk (termasuk validasi perubahan `unit` dengan penguncian baris produk dan validasi ulang `minimum_stock`).
- Mengaktifkan produk.
- Menonaktifkan produk.

Hanya Admin yang dapat mengelola produk.

Staff hanya dapat melihat produk aktif (`status = 'active'`) tanpa informasi harga (`purchase_price` dan `selling_price`). Permintaan filter atau akses langsung terhadap produk inactive oleh Staff pada endpoint produk ditolak dengan `403 Forbidden`.

### 6.5 Stock Movements Module

Tanggung jawab:

- Melakukan Stock In.
- Melakukan Stock Out.
- Menghitung perubahan stok.
- Menjaga konsistensi stok.
- Mencatat stock movement history.
- Menampilkan riwayat transaksi.

Admin dan Staff dapat melakukan Stock In dan Stock Out.

### 6.6 Dashboard Module

Tanggung jawab:

- Menghitung active product count.
- Menghitung active category count.
- Menghitung low stock products.
- Menampilkan recent stock movements.
- Menghitung Stock In bulan berjalan.
- Menghitung Stock Out bulan berjalan.

Dashboard tidak boleh melakukan perubahan data inventaris.

---

## 7. Frontend and Backend Communication

### 7.1 Communication Flow

Frontend berkomunikasi dengan backend melalui REST API.

<escape>```mermaid
sequenceDiagram
    participant User
    participant FE as Next.js
    participant API as Elysia.js
    participant Service
    participant DB as PostgreSQL

    User->>FE: Melakukan aksi
    FE->>API: HTTP Request
    API->>API: Authentication & Authorization
    API->>Service: Memanggil service
    Service->>DB: Query database
    DB-->>Service: Query result
    Service-->>API: Business result
    API-->>FE: HTTP Response
    FE-->>User: Menampilkan hasil
```</escape>

### 7.2 API Prefix

Semua endpoint bisnis menggunakan:

`/api/v1`

Contoh endpoint:

- `/api/v1/auth/login`
- `/api/v1/auth/logout`
- `/api/v1/users`
- `/api/v1/categories`
- `/api/v1/products`
- `/api/v1/stock-movements`
- `/api/v1/dashboard`

Endpoint operasional kesehatan sistem berada di luar prefix `/api/v1` dan dikecualikan dari response envelope standar:

- `GET /health`
- `GET /health/db`

### 7.3 Request Validation

Setiap request harus divalidasi pada backend.

Validasi mencakup:

- Path parameters.
- Query parameters.
- Request body.
- Data types.
- Required fields.
- Format data.

Frontend validation hanya berfungsi membantu pengalaman pengguna.

Backend tetap menjadi sumber kebenaran untuk validasi.

### 7.4 Response Contract

Gunakan format response yang konsisten sesuai `docs/api-contract.md`.

Success response:

```json
{
  "success": true,
  "message": "Request successful",
  "data": {}
}
```

Paginated response:

```json
{
  "success": true,
  "message": "Data retrieved successfully",
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "totalItems": 100,
    "totalPages": 10
  }
}
```

Error response:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
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

Response harus sesuai dengan kebutuhan endpoint.

Jangan mengirimkan informasi internal database atau informasi sensitif.

### 7.5 HTTP Status Code

| Status | Keterangan |
|---|---|
| 200 | Request berhasil |
| 201 | Resource berhasil dibuat |
| 400 | Request malformed atau validasi struktur/schema tidak valid |
| 401 | Tidak terautentikasi |
| 403 | Tidak memiliki izin |
| 404 | Resource tidak ditemukan |
| 409 | Konflik uniqueness atau kondisi konkuren |
| 422 | Melanggar business rule |
| 429 | Rate limit terlampaui |
| 500 | Kesalahan internal server |
| 503 | Service atau dependency tidak tersedia |

---

## 8. Authentication and Session Architecture

### 8.1 Authentication Mechanism

Sistem menggunakan database-backed session authentication.

JWT tidak digunakan sebagai mekanisme autentikasi utama.

### 8.2 Login Flow

<escape>```mermaid
sequenceDiagram
    participant User
    participant FE as Next.js
    participant API as Elysia.js
    participant Auth as Auth Service
    participant DB as PostgreSQL

    User->>FE: Mengisi email dan password
    FE->>API: POST /api/v1/auth/login
    API->>Auth: Memproses login
    Auth->>DB: Mencari user berdasarkan email
    DB-->>Auth: User data
    Auth->>Auth: Verifikasi password Argon2id

    alt Kredensial valid dan user aktif
        Auth->>Auth: Generate secure random token
        Auth->>Auth: Hash token menggunakan SHA-256
        Auth->>DB: Simpan token hash dan session
        DB-->>Auth: Session tersimpan
        Auth-->>API: Authentication successful
        API-->>FE: Set HttpOnly cookie
        FE-->>User: Login berhasil
    else Kredensial tidak valid atau user inactive
        Auth-->>API: Authentication failed
        API-->>FE: 401 Unauthorized
    end
```</escape>

### 8.3 Session Storage

Session disimpan pada tabel `sessions`.

Informasi session:

- `id`
- `user_id`
- `token_hash`
- `expires_at`
- `revoked_at`
- `created_at`

Raw session token tidak boleh disimpan dalam database.

Gunakan random token dengan minimal 32 byte entropy.

Simpan SHA-256 hash dalam representasi hexadecimal lowercase sepanjang 64 karakter.

### 8.4 Session Validation Flow

<escape>```mermaid
sequenceDiagram
    participant FE as Next.js
    participant API as Elysia.js
    participant Auth as Auth Middleware
    participant DB as PostgreSQL

    FE->>API: Protected API Request + Cookie
    API->>Auth: Validate session
    Auth->>Auth: Hash raw token
    Auth->>DB: Find session by token hash
    DB-->>Auth: Session and user data

    alt Session valid dan user aktif
        Auth-->>API: Attach authenticated user context
        API->>API: Continue request
        API-->>FE: Response
    else Session tidak valid, revoked, expired, atau user inactive
        Auth-->>API: Reject authentication
        API-->>FE: 401 Unauthorized
    end
```</escape>

### 8.5 Session Expiration and Revocation

Ketentuan session:

- Masa berlaku absolut: 7 hari (atau sesuai `SESSION_TTL_DAYS`).
- Aktivitas pengguna tidak memperpanjang expiration.
- Setiap login membuat session baru.
- Multiple-device login diperbolehkan.
- Logout hanya mencabut session yang sedang digunakan.
- Menonaktifkan user (`is_active = false`) atau me-reset password user wajib mencabut seluruh session aktif user terkait (`revoked_at = NOW()`) dalam satu transaksi database bersama perubahan user, sehingga aktivasi ulang tidak pernah menghidupkan kembali session lama.

### 8.6 Login Rate Limiting

Karena Redis tidak termasuk MVP, endpoint `POST /api/v1/auth/login` dilindungi oleh **in-memory rate limiter** pada backend Elysia.js (dirancang untuk deployment single-instance MVP):

- Melacak jumlah percobaan login pada window waktu tertentu per IP client dan kombinasi IP + email ternormalisasi.
- Menggunakan konfigurasi environment variable (`LOGIN_RATE_LIMIT_MAX` dan `LOGIN_RATE_LIMIT_WINDOW_SECONDS`).
- Apabila batas terlampaui, mengembalikan HTTP `429 RATE_LIMIT_EXCEEDED` disertai header `Retry-After` (dalam detik).

Catatan arsitektur: Apabila di masa depan backend dijalankan dalam mode multi-instance, penyimpanan state rate limiter perlu dipindahkan ke store terpusat.

### 8.7 Cookie Configuration

Default cookie:

| Attribute | Value |
|---|---|
| HttpOnly | true |
| Secure | true pada production HTTPS |
| SameSite | Lax |
| Path | / |
| Domain | Tidak ditentukan secara default |

Jika deployment menggunakan cross-site cookie:

- SameSite harus disesuaikan menjadi `None`.
- Secure harus aktif.
- CSRF protection harus diterapkan.

### 8.7 CSRF and CORS

Karena autentikasi menggunakan cookie, endpoint yang mengubah data harus memiliki perlindungan terhadap CSRF.

Terapkan:

- Explicit CORS origin allowlist.
- Validasi Origin pada state-changing requests.
- Validasi Referer sebagai pemeriksaan tambahan jika sesuai.
- CSRF token apabila dibutuhkan oleh model deployment.
- Jangan menggunakan wildcard origin bersama credentialed requests.

GET request tidak boleh melakukan perubahan data.

---

## 9. Role-Based Access Control

### 9.1 Role Definition

Sistem memiliki dua role:

- `admin`
- `staff`

Role diambil dari user context hasil autentikasi backend.

Jangan mempercayai role yang dikirim oleh frontend.

### 9.2 Permission Matrix

| Feature | Admin | Staff |
|---|---|---|
| Dashboard | Read | Read |
| User Management (termasuk Reset Password) | Full | No Access |
| Category Management | Full | Read (Active only) |
| Product Management | Full | Read (Active only) |
| Purchase Price | Read | No Access |
| Selling Price | Read | No Access |
| Stock In | Execute | Execute |
| Stock Out | Execute | Execute |
| Stock Movement History | Read | Read |

### 9.3 Authorization Flow

<escape>```mermaid
flowchart TD
    A[Incoming Request]
    B{Authenticated?}
    C[401 Unauthorized]
    D[Read User Role]
    E{Permission Granted?}
    F[403 Forbidden]
    G[Execute Handler]
    H[Return Response]

    A --> B
    B -->|No| C
    B -->|Yes| D
    D --> E
    E -->|No| F
    E -->|Yes| G
    G --> H
```</escape>

### 9.4 Price Visibility

Purchase price dan selling price hanya boleh dikirimkan kepada Admin.

Backend harus melakukan response shaping berdasarkan role serta menolak sorting berdasarkan field harga oleh Staff (`403 Forbidden`).

Staff tidak boleh memperoleh informasi harga melalui:

- Product list (termasuk parameter `sortBy`).
- Product detail.
- Dashboard.
- Search result.
- Endpoint lain yang mengembalikan data produk.

Jangan hanya menyembunyikan harga melalui frontend.

---

## 10. Stock Transaction Architecture

### 10.1 General Flow

Stock In dan Stock Out merupakan operasi yang mengubah jumlah stok produk.

Keduanya harus menggunakan database transaction dan row-level locking.

### 10.2 Stock In Flow

<escape>```mermaid
flowchart TD
    A[Stock In Request]
    B[Validate Request]
    C[Begin Transaction]
    D[Lock Product Row]
    E{Product Exists?}
    F[404 Not Found]
    G{Product Active?}
    H[422 Business Rule Error]
    I{Quantity Valid & No Overflow?}
    J[422 Business Rule Error]
    K[Calculate Stock After]
    L[Update Product Stock]
    M[Insert Stock Movement]
    N[Commit Transaction]
    O[Return Success]

    A --> B
    B --> C
    C --> D
    D --> E
    E -->|No| F
    E -->|Yes| G
    G -->|No| H
    G -->|Yes| I
    I -->|No| J
    I -->|Yes| K
    K --> L
    L --> M
    M --> N
    N --> O
```</escape>

Formula:

`stock_after = stock_before + quantity` (dan wajib memenuhi `stock_after <= 99999999999.999`)

### 10.3 Stock Out Flow

<escape>```mermaid
flowchart TD
    A[Stock Out Request]
    B[Validate Request]
    C[Begin Transaction]
    D[Lock Product Row]
    E{Product Exists?}
    F[404 Not Found]
    G{Product Active?}
    H[422 Business Rule Error]
    I{Quantity Valid?}
    J[422 Business Rule Error]
    K{Sufficient Stock?}
    L[422 Insufficient Stock]
    M[Calculate Stock After]
    N[Update Product Stock]
    O[Insert Stock Movement]
    P[Commit Transaction]
    Q[Return Success]

    A --> B
    B --> C
    C --> D
    D --> E
    E -->|No| F
    E -->|Yes| G
    G -->|No| H
    G -->|Yes| I
    I -->|No| J
    I -->|Yes| K
    K -->|No| L
    K -->|Yes| M
    M --> N
    N --> O
    O --> P
    P --> Q
```</escape>

Formula:

`stock_after = stock_before - quantity`

### 10.4 Transaction Rules

Urutan operasi wajib:

1. Validasi struktur request di luar transaksi (`400 VALIDATION_ERROR` untuk pelanggaran schema Elysia, format desimal invalid, > 3 desimal, atau overflow batas atas input).
2. Begin transaction.
3. Lock product row menggunakan `SELECT ... FOR UPDATE`.
4. Periksa keberadaan produk (`404`).
5. Periksa status produk (`422 INACTIVE_PRODUCT`).
6. Validasi quantity (`422 BUSINESS_RULE_VIOLATION` bila `<= 0`; `422 INVALID_UNIT_QUANTITY` bila pecahan pada unit count-only).
7. Periksa kecukupan stok untuk Stock Out (`422 INSUFFICIENT_STOCK`) atau batas atas `stock_after <= 99999999999.999` untuk Stock In (`422 BUSINESS_RULE_VIOLATION`).
8. Hitung stock before dan stock after menggunakan aritmetika desimal eksak.
9. Update `products.current_stock` dan `products.updated_at`.
10. Insert `stock_movements`.
11. Commit transaction.

Jika terjadi kegagalan, seluruh operasi harus di-rollback.

Jangan melakukan pemeriksaan stok di luar transaksi dan menganggap hasilnya tetap valid ketika transaksi dijalankan.

### 10.5 Concurrency Control

Row-level locking digunakan untuk mencegah race condition pada perubahan stok.

Contoh:

Stok awal: 10 pcs.

Dua transaksi Stock Out berjalan hampir bersamaan:

- Transaksi A meminta 7 pcs.
- Transaksi B meminta 6 pcs.

Tanpa locking, kedua transaksi berpotensi membaca stok awal yang sama dan menghasilkan stok negatif atau pencatatan yang tidak konsisten.

Dengan `SELECT ... FOR UPDATE`:

1. Transaksi A memperoleh lock.
2. Transaksi B menunggu.
3. Transaksi A mengubah stok menjadi 3 dan melakukan commit.
4. Transaksi B memperoleh lock setelah A selesai.
5. Transaksi B membaca stok terbaru, yaitu 3.
6. Transaksi B ditolak karena stok tidak mencukupi.

Dengan demikian, stok tidak menjadi negatif akibat operasi konkuren.

### 10.6 Movement History

Setiap Stock In dan Stock Out harus menghasilkan satu record pada `stock_movements`.

Movement history tidak dapat diedit atau dihapus melalui aplikasi.

Stock Adjustment tidak termasuk MVP.

### 10.7 Idempotency Limitation

MVP tidak menggunakan `Idempotency-Key`.

Client tidak boleh otomatis mengulang request Stock In atau Stock Out apabila hasil request sebelumnya belum diketahui.

`X-Request-ID` hanya digunakan untuk correlation dan logging, bukan untuk mencegah duplikasi transaksi.

---

## 11. Product and Category Lifecycle

### 11.1 Product Lifecycle

Product memiliki status:

- `active`
- `inactive`

Aturan:

- Product baru memiliki status active secara default.
- Product inactive tidak dapat digunakan untuk Stock In.
- Product inactive tidak dapat digunakan untuk Stock Out.
- Product inactive tetap memiliki stock movement history.
- Product dinonaktifkan, bukan dihapus secara fisik.

### 11.2 Category Lifecycle

Category menggunakan:

`is_active: boolean`

Aturan:

- Category baru aktif secara default.
- Category inactive tidak dapat digunakan untuk membuat produk baru.
- Category inactive tidak dapat digunakan ketika mengganti kategori produk.
- Produk lama tetap terhubung dengan kategori inactive.
- Menonaktifkan kategori tidak otomatis menonaktifkan produk.

### 11.3 Category Assignment and Product Update Concurrency

Ketika membuat produk atau mengganti kategori produk, backend harus memastikan kategori masih aktif pada saat operasi disimpan. Selain itu, saat memperbarui produk (`PATCH`), backend harus mengunci baris produk untuk mencegah perubahan `unit` bertabrakan dengan Stock In konkuren.

Gunakan transaksi dengan urutan:

1. Begin transaction.
2. Lock category row (`SELECT ... FOR SHARE`) jika membuat produk atau mengubah `category_id`, lalu pastikan kategori ada (`404`) dan `is_active = true` (`422`).
3. Jika memperbarui produk yang sudah ada, lock product row (`SELECT ... FOR UPDATE`), pastikan produk ada (`404`), dan jika `unit` berubah pastikan `current_stock = 0` serta belum memiliki `stock_movements` (`422`).
4. Validasi kecocokan `minimum_stock` akhir terhadap `unit` produk akhir (bilangan bulat untuk unit count-only `pcs`, `unit`, `box`, `pack`, `set`).
5. Insert atau update produk (termasuk memperbarui `updated_at`).
6. Commit transaction.

Mekanisme ini mencegah proses deactivation kategori maupun Stock In konkuren menciptakan assignment atau perubahan unit yang tidak konsisten.

Foreign key tetap digunakan untuk menjamin kategori tersedia.

---

## 12. Dashboard Architecture

### 12.1 Dashboard Metrics

Dashboard menyediakan:

- Active Product Count.
- Active Category Count.
- Low Stock Products (total count serta daftar maksimal 10 produk aktif).
- Recent Stock Movements (maksimal 10 transaksi terbaru).
- Stock In Count.
- Stock Out Count.

### 12.2 Low Stock Calculation

Low stock didefinisikan sebagai:

`current_stock <= minimum_stock`

Hanya produk aktif yang dihitung. Daftar `lowStockProducts` (maksimal 10 item) diurutkan secara deterministik berdasarkan `(minimum_stock - current_stock) DESC, current_stock ASC, id ASC`.

### 12.3 Monthly Transaction Count

Stock In Count dan Stock Out Count dihitung berdasarkan bulan kalender berjalan (termasuk transaksi dari produk yang saat ini sudah `inactive`).

Default business timezone:

`Asia/Jakarta`

Alur perhitungan:

1. Ambil waktu saat ini.
2. Tentukan awal bulan dan awal bulan berikutnya dalam timezone bisnis (`BUSINESS_TIMEZONE`).
3. Konversi kedua batas waktu menjadi instant.
4. Query transaksi menggunakan rentang waktu tersebut.

Gunakan `TIMESTAMPTZ` untuk menyimpan waktu transaksi.

Jangan menggunakan timezone database atau server secara implisit sebagai pengganti timezone bisnis.

### 12.4 Recent Movements

Recent movements menampilkan maksimal 10 transaksi terbaru (termasuk transaksi produk yang sekarang `inactive`) berdasarkan `created_at` secara descending dengan `id DESC` sebagai tie-breaker agar hasil deterministik.

Dashboard tidak boleh menjumlahkan quantity produk dengan satuan berbeda menjadi total stok gabungan.

---

## 13. Database Architecture

### 13.1 Database Technology

Database utama:

PostgreSQL 18.

Database access:

- Drizzle ORM.
- Postgres.js.

### 13.2 Core Tables

Sistem menggunakan tabel utama berikut:

| Table | Responsibility |
|---|---|
| users | Data pengguna |
| sessions | Data session autentikasi |
| categories | Data kategori |
| products | Data produk dan stok terkini |
| stock_movements | Riwayat perubahan stok |

### 13.3 Entity Relationship Diagram

<escape>```mermaid
erDiagram
    USERS ||--o{ SESSIONS : owns
    USERS ||--o{ STOCK_MOVEMENTS : creates
    CATEGORIES ||--o{ PRODUCTS : contains
    PRODUCTS ||--o{ STOCK_MOVEMENTS : records

    USERS {
        uuid id PK
        varchar name
        varchar email UK
        varchar password_hash
        varchar role
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    SESSIONS {
        uuid id PK
        uuid user_id FK
        varchar token_hash UK
        timestamptz expires_at
        timestamptz revoked_at
        timestamptz created_at
    }

    CATEGORIES {
        uuid id PK
        varchar name
        text description
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    PRODUCTS {
        uuid id PK
        uuid category_id FK
        varchar sku UK
        varchar name
        text description
        varchar unit
        numeric purchase_price
        numeric selling_price
        numeric current_stock
        numeric minimum_stock
        varchar status
        timestamptz created_at
        timestamptz updated_at
    }

    STOCK_MOVEMENTS {
        uuid id PK
        uuid product_id FK
        varchar type
        numeric quantity
        numeric stock_before
        numeric stock_after
        text reason
        text notes
        uuid created_by FK
        timestamptz created_at
    }
```</escape>

Detail tipe data, constraints, indexes, dan migration rules dijelaskan pada `docs/database-design.md`.

### 13.4 Database Integrity

Database harus menjaga:

- Primary key uniqueness.
- Foreign key integrity.
- SKU uniqueness.
- Email uniqueness case-insensitive.
- Category name uniqueness case-insensitive.
- Valid role dan status.
- Nonnegative prices.
- Nonnegative minimum stock.
- Positive movement quantity.
- Valid stock arithmetic.
- Nonempty movement reason.

Gunakan `ON DELETE RESTRICT` pada foreign key yang relevan.

Normal application flow menggunakan deactivation, bukan physical deletion.

### 13.5 Numeric Precision

Gunakan:

- Stock quantity: `NUMERIC(14,3)`.
- Price: `NUMERIC(14,2)`.
- Minimum stock: `NUMERIC(14,3)`.

Tolak nilai yang melebihi skala yang diizinkan sebelum disimpan.

Jangan menggunakan floating-point arithmetic untuk perhitungan stok maupun harga.

### 13.6 Updated At

`updated_at` diperbarui oleh application layer pada setiap operasi update.

Tidak menggunakan database trigger untuk mekanisme ini.

---

## 14. API Architecture

### 14.1 API Module Groups

API dikelompokkan berdasarkan modul.

| Module | Endpoint Group |
|---|---|
| Auth | `/api/v1/auth` |
| Users | `/api/v1/users` |
| Categories | `/api/v1/categories` |
| Products | `/api/v1/products` |
| Stock Movements | `/api/v1/stock-movements` |
| Dashboard | `/api/v1/dashboard` |

Selain modul bisnis di atas, tersedia endpoint operasional kesehatan aplikasi di luar prefix `/api/v1` (`/health` dan `/health/db`).

### 14.2 API Responsibilities

Setiap endpoint harus:

1. Memvalidasi request.
2. Memeriksa authentication.
3. Memeriksa authorization.
4. Memanggil service yang sesuai.
5. Mengembalikan response yang konsisten.
6. Menangani error secara terstruktur.

### 14.3 Error Handling

Gunakan HTTP status code secara konsisten:

| Status | Penggunaan |
|---|---|
| 200 | Request berhasil |
| 201 | Resource dibuat |
| 400 | Request malformed atau validasi struktur/schema tidak valid |
| 401 | Tidak terautentikasi |
| 403 | Tidak memiliki izin |
| 404 | Resource tidak ditemukan |
| 409 | Konflik uniqueness atau concurrent state |
| 422 | Business rule dilanggar |
| 429 | Rate limit terlampaui |
| 500 | Internal server error |
| 503 | Service atau dependency tidak tersedia |

Pelanggaran schema validation Elysia wajib dipetakan melalui custom error handler ke HTTP `400 VALIDATION_ERROR` (bukan default Elysia `422`).

Error response tidak boleh menampilkan:

- SQL statement.
- Database credentials.
- Stack trace.
- Password hash.
- Session token.
- Informasi internal sensitif lainnya.

### 14.4 OpenAPI

Gunakan Swagger/OpenAPI untuk mendokumentasikan seluruh endpoint.

Dokumentasi harus mencerminkan implementasi aktual.

Perubahan API harus diikuti dengan pembaruan dokumentasi OpenAPI.

---

## 15. Security Architecture

### 15.1 Password Security

Gunakan Argon2id untuk password hashing.

Password plaintext tidak boleh disimpan.

Password hash tidak boleh dikembalikan melalui API.

### 15.2 Session Security

- Random token minimal 32 byte entropy.
- SHA-256 hash disimpan dalam database.
- Raw token dikirim melalui HttpOnly cookie.
- Session memiliki absolute expiration 7 hari.
- Session dapat dicabut.
- Session perangkat lain tetap independen.

### 15.3 Authorization Security

- Backend wajib memvalidasi role.
- Jangan mempercayai role dari frontend.
- Staff tidak boleh mengakses Admin-only endpoints.
- Staff tidak boleh mendapatkan data harga.

### 15.4 Database Security

- Gunakan parameterized queries.
- Validasi seluruh input.
- Gunakan database constraints.
- Hindari query yang membuka peluang SQL injection.
- Jangan menyimpan secrets dalam source code.

### 15.5 Cookie and CSRF Security

Default:

- HttpOnly.
- Secure pada production HTTPS.
- SameSite=Lax.
- Explicit CORS allowlist.
- Origin validation untuk state-changing requests.

Jika cross-site cookie diperlukan, gunakan SameSite=None; Secure dan perlindungan CSRF yang sesuai.

### 15.6 Logging

Log harus membantu debugging tanpa mengungkap informasi sensitif.

Jangan mencatat:

- Password.
- Password hash.
- Raw session token.
- Session token hash.
- Database credentials.

Gunakan request identifier untuk menghubungkan log yang berasal dari request yang sama.

`X-Request-ID` tidak menggantikan mekanisme idempotency.

---

## 16. Testing Architecture

Pengujian dilakukan pada beberapa lapisan.

### 16.1 Unit Tests

Menguji business logic secara terisolasi.

Contoh:

- Password verification.
- Role permission checks.
- SKU normalization.
- Email normalization.
- Quantity validation.
- Low stock calculation.
- Stock before dan stock after calculation.

### 16.2 Integration Tests

Menguji integrasi antar komponen.

Contoh:

- Authentication dengan database.
- Product service dengan repository.
- Category validation.
- Stock In transaction.
- Stock Out transaction.
- Database rollback.
- Authorization middleware.

### 16.3 API Tests

Gunakan Bruno untuk menguji endpoint.

Pengujian mencakup:

- Success response.
- Validation error.
- Authentication error.
- Authorization error.
- Not found.
- Conflict.
- Business rule error.

### 16.4 Concurrency Tests

Stock transaction harus diuji dalam kondisi request bersamaan.

Contoh:

- Dua Stock Out pada produk yang sama.
- Stock In dan Stock Out secara bersamaan.
- Stock Out yang totalnya melebihi stok tersedia.

Pastikan hasil akhir tidak menghasilkan stok negatif dan movement history tetap konsisten.

### 16.5 Frontend Tests

Uji:

- Form validation.
- Loading state.
- Error state.
- Role-based rendering.
- API integration.
- Session expiration handling.

---

## 17. Environment Configuration

Konfigurasi environment harus disimpan melalui environment variables.

Konfigurasi utama backend:

| Variable | Default / Example | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Application environment |
| `PORT` | `3001` | Backend HTTP port |
| `DATABASE_URL` | - | PostgreSQL connection string |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated explicit CORS origin allowlist |
| `SESSION_COOKIE_NAME` | `ims_session` | Session cookie name |
| `SESSION_TTL_DAYS` | `7` | Session lifetime (days) |
| `COOKIE_SECURE` | `false` (dev) / `true` (prod) | Cookie `Secure` flag |
| `COOKIE_SAME_SITE` | `Lax` | Cookie `SameSite` attribute |
| `BUSINESS_TIMEZONE` | `Asia/Jakarta` | Business timezone for dashboard period |
| `LOGIN_RATE_LIMIT_MAX` | `10` | Max login attempts per window |
| `LOGIN_RATE_LIMIT_WINDOW_SECONDS` | `900` | Login rate-limit window duration |
| `ENABLE_SWAGGER` | `true` (dev) / `false` (prod) | Toggle development Swagger UI |
| `SEED_ADMIN_NAME` | - | Initial development Admin name (seed script) |
| `SEED_ADMIN_EMAIL` | - | Initial development Admin email (seed script) |
| `SEED_ADMIN_PASSWORD` | - | Initial development Admin password (seed script) |

Default:

- Port backend: `3001`.
- Session TTL: 7 hari.
- Business timezone: `Asia/Jakarta`.

Jika cookie policy, CORS, atau deployment membutuhkan konfigurasi tambahan, gunakan environment variables yang divalidasi saat startup.

Jangan menyimpan secret asli dalam `.env.example`.

---

## 18. MVP Exclusions

Arsitektur MVP tidak mencakup:

- Supplier module.
- Purchase order.
- Sales order.
- Invoice.
- Payment.
- Barcode scanning.
- Mobile application.
- AI prediction.
- Redis.
- Stock Adjustment.
- Multi-warehouse.
- Generic audit logging.

Jangan menambahkan modul tersebut tanpa perubahan scope yang disetujui.

---

## 19. Architecture Change Principles

Perubahan arsitektur hanya dilakukan ketika memiliki alasan teknis atau kebutuhan produk yang jelas.

Setiap perubahan harus mempertimbangkan:

1. Dampak terhadap business logic.
2. Dampak terhadap database.
3. Dampak terhadap API.
4. Dampak terhadap frontend.
5. Dampak terhadap security.
6. Dampak terhadap testing.
7. Dampak terhadap dokumentasi.

Jika perubahan menyentuh keputusan yang sudah disepakati, dokumentasikan alasan dan konsekuensinya.

Jangan melakukan refactoring besar yang tidak berhubungan dengan kebutuhan implementasi.

---

## 20. Final Architecture Decisions

| Area | Decision |
|---|---|
| Architecture Style | Modular Monolith |
| Frontend | Next.js + TypeScript |
| Backend | Elysia.js + Bun + TypeScript |
| Database | PostgreSQL 18 |
| ORM | Drizzle ORM |
| Driver | Postgres.js |
| API Style | REST |
| API Prefix | `/api/v1` (except `/health`, `/health/db`, dev Swagger UI) |
| Authentication | Database-backed Session |
| Password Hashing | Argon2id |
| Session Lifetime | 7 days absolute |
| Session Token | Secure random token, SHA-256 hash stored |
| Session Revocation | Logout (current), user deactivation & password reset (all user sessions) |
| Login Rate Limiting | In-memory rate limiter (`429` + `Retry-After`) |
| Cookie | HttpOnly, Secure in production, SameSite=Lax default |
| CSRF | Origin/Referer validation and explicit CORS allowlist |
| Authorization | Backend-enforced RBAC; Staff active-only on category/product endpoints |
| Roles | Admin, Staff |
| Stock Quantity | NUMERIC(14,3) |
| Price | NUMERIC(14,2) |
| Stock Transaction | Database transaction |
| Concurrency Control | SELECT FOR UPDATE |
| Category Assignment & Product Update | Transaction with category `FOR SHARE` & product `FOR UPDATE` |
| Stock History | Immutable through application |
| Product Deactivation | `status` |
| Category Deactivation | `is_active` |
| User Deactivation | `is_active` |
| Foreign Key | ON DELETE RESTRICT |
| Dashboard Timezone | Asia/Jakarta by default (`BUSINESS_TIMEZONE`) |
| Idempotency-Key | Not implemented in MVP |

---

**End of Architecture Document**