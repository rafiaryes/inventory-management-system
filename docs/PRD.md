# Product Requirements Document (PRD)

# Inventory Management System

**Status:** Final untuk MVP  
**Versi:** 1.0  
**Bahasa:** Indonesia  
**Frontend:** Next.js + TypeScript + Tailwind CSS  
**Backend:** Elysia.js + Bun + TypeScript  
**Database:** PostgreSQL 18  
**ORM:** Drizzle ORM  
**Target:** Proyek pembelajaran dan portofolio Full-Stack / Backend Development

---

## 1. Ringkasan Produk

### 1.1 Deskripsi

Inventory Management System (IMS) adalah aplikasi web untuk membantu pengelolaan persediaan barang dalam satu gudang.

Aplikasi ini memungkinkan pengguna untuk mengelola produk, kategori, pengguna, transaksi barang masuk (Stock In), transaksi barang keluar (Stock Out), serta memantau kondisi persediaan melalui dashboard.

Sistem memiliki dua jenis pengguna:

- Admin
- Staff

Setiap pengguna memiliki hak akses yang berbeda sesuai dengan perannya.

### 1.2 Latar Belakang

Pengelolaan persediaan secara manual dapat menimbulkan berbagai masalah, seperti:

- Kesulitan mengetahui jumlah stok terkini.
- Kesalahan pencatatan barang masuk dan keluar.
- Kesulitan menelusuri riwayat perubahan stok.
- Keterlambatan mengetahui barang yang hampir habis.
- Kurangnya pembatasan akses terhadap informasi tertentu.

IMS dikembangkan untuk menyediakan sistem pengelolaan persediaan yang lebih terstruktur, konsisten, dan mudah digunakan.

### 1.3 Tujuan Produk

Tujuan pengembangan IMS adalah:

1. Mempermudah pengelolaan data produk dan kategori.
2. Mencatat transaksi barang masuk dan barang keluar.
3. Menjaga konsistensi jumlah stok.
4. Menyediakan riwayat transaksi persediaan.
5. Menampilkan informasi stok melalui dashboard.
6. Membatasi akses berdasarkan peran pengguna.
7. Menyediakan fondasi aplikasi yang dapat dikembangkan lebih lanjut.

### 1.4 Target Pengguna

Target pengguna aplikasi:

**Admin**

Pengguna yang bertanggung jawab mengelola data utama dan memantau aktivitas persediaan.

**Staff**

Pengguna yang bertanggung jawab menjalankan transaksi barang masuk dan barang keluar serta melihat informasi persediaan yang diizinkan.

---

## 2. Ruang Lingkup Produk

### 2.1 Cakupan MVP

MVP mencakup fitur berikut:

1. Authentication dan session management.
2. Role-based access control.
3. User management.
4. Category management.
5. Product management.
6. Stock In.
7. Stock Out.
8. Stock movement history.
9. Inventory dashboard.

### 2.2 Batasan MVP

Aplikasi hanya mendukung:

- Satu gudang.
- Dua role pengguna: Admin dan Staff.
- Transaksi Stock In dan Stock Out.
- Pengelolaan produk dan kategori.
- Riwayat transaksi stok.
- Pengelolaan session berbasis database.

### 2.3 Di Luar Cakupan MVP

Fitur berikut tidak termasuk dalam MVP:

- Supplier management.
- Purchase order.
- Sales order.
- Invoice.
- Payment processing.
- Barcode scanner.
- Mobile application.
- AI-based stock prediction.
- Redis.
- Stock Adjustment.
- Multi-warehouse management.
- Generic audit log untuk seluruh perubahan master data.

Fitur tersebut dapat dipertimbangkan untuk pengembangan versi berikutnya.

---

## 3. Role dan Hak Akses

Sistem memiliki dua role:

- `admin`
- `staff`

### 3.1 Matriks Hak Akses

| Fitur | Admin | Staff |
|---|---|---|
| Login | Ya | Ya |
| Logout | Ya | Ya |
| Melihat dashboard | Ya | Ya |
| Melihat produk | Ya | Hanya produk aktif |
| Melihat kategori | Ya | Hanya kategori aktif |
| Membuat produk | Ya | Tidak |
| Mengubah produk | Ya | Tidak |
| Menonaktifkan produk | Ya | Tidak |
| Melihat harga beli | Ya | Tidak |
| Melihat harga jual | Ya | Tidak |
| Membuat kategori | Ya | Tidak |
| Mengubah kategori | Ya | Tidak |
| Menonaktifkan kategori | Ya | Tidak |
| Mengelola pengguna (termasuk reset password) | Ya | Tidak |
| Stock In | Ya | Ya |
| Stock Out | Ya | Ya |
| Melihat riwayat stok | Ya | Ya (termasuk produk inactive dalam riwayat) |

### 3.2 Aturan Hak Akses

1. Admin memiliki akses terhadap seluruh fitur MVP.
2. Staff hanya dapat mengakses fitur yang diizinkan.
3. Staff tidak boleh mengakses fitur pengelolaan pengguna.
4. Staff tidak boleh mengelola produk maupun kategori.
5. Staff hanya boleh melihat kategori dan produk yang berstatus aktif pada endpoint kategori dan produk; permintaan akses langsung atau filter terhadap data inactive oleh Staff wajib ditolak (`403 Forbidden`).
6. Staff tidak boleh melihat harga beli dan harga jual.
7. Staff tidak boleh mengubah harga produk.
8. Pembatasan hak akses wajib diterapkan pada backend.
9. Pembatasan tampilan frontend tidak dapat menggantikan validasi authorization pada backend.

Informasi harga tidak boleh dikirimkan dalam response API kepada Staff.

---

## 4. Authentication dan Session Management

### 4.1 Login

Pengguna dapat masuk ke aplikasi menggunakan email dan password yang telah terdaftar.

Persyaratan:

- Email harus valid dan dinormalisasi (trim dan lowercase).
- Password wajib diisi (8 sampai 128 karakter).
- Kredensial harus diverifikasi terhadap data pengguna.
- Password disimpan dalam bentuk hash menggunakan Argon2id.
- Pengguna yang tidak aktif tidak dapat login.
- Endpoint login dilindungi rate limiting untuk mencegah brute-force (`429 Too Many Requests`).

### 4.2 Session Management

Sistem menggunakan database-backed session dengan ketentuan:

- Setiap login menghasilkan session baru.
- Session disimpan dalam database.
- Session token berupa random token yang aman secara kriptografis.
- Raw session token hanya diberikan kepada client melalui HttpOnly cookie.
- Database hanya menyimpan SHA-256 hash dari session token.
- Session memiliki masa berlaku absolut selama 7 hari.
- Aktivitas pengguna tidak memperpanjang masa berlaku session.
- Pengguna dapat login dari beberapa perangkat secara bersamaan.
- Setiap perangkat memiliki session tersendiri.
- Logout hanya mencabut session yang sedang digunakan.
- Menonaktifkan pengguna atau me-reset password pengguna wajib mencabut seluruh session aktif milik pengguna tersebut.

### 4.3 Logout

Pengguna dapat mengakhiri session aktif melalui fitur logout.

Ketika logout berhasil:

1. Session yang sedang digunakan ditandai sebagai revoked.
2. Cookie session dihapus dari browser.
3. Session perangkat lain tidak ikut dicabut.

### 4.4 Keamanan Cookie

Cookie session menggunakan ketentuan:

- HttpOnly.
- Secure pada production melalui HTTPS.
- SameSite=Lax sebagai default.
- Path=/.
- Domain tidak ditentukan kecuali dibutuhkan oleh konfigurasi deployment.

Jika deployment membutuhkan cross-site cookie, sistem harus menggunakan konfigurasi yang sesuai dan perlindungan CSRF tambahan.

---

## 5. User Management

### 5.1 Deskripsi

User Management memungkinkan Admin mengelola akun pengguna yang dapat mengakses aplikasi.

### 5.2 Fitur

Admin dapat:

- Melihat daftar pengguna.
- Membuat pengguna baru.
- Mengubah informasi pengguna.
- Mengubah role pengguna.
- Mengaktifkan pengguna.
- Menonaktifkan pengguna.
- Melakukan reset password pengguna.

### 5.3 Data Pengguna

Informasi pengguna meliputi:

| Field | Keterangan |
|---|---|
| id | Identitas unik pengguna |
| name | Nama pengguna |
| email | Email pengguna |
| password_hash | Hash password |
| role | Admin atau Staff |
| is_active | Status aktif pengguna |
| created_at | Waktu pembuatan |
| updated_at | Waktu perubahan terakhir |

### 5.4 Aturan Bisnis

1. Email wajib diisi.
2. Email harus unik tanpa membedakan huruf besar dan kecil setelah normalisasi.
3. Email disimpan dalam format lowercase setelah trimming.
4. Password wajib diisi ketika membuat akun (8 sampai 128 karakter).
5. Password harus di-hash menggunakan Argon2id.
6. Role hanya boleh bernilai `admin` atau `staff`.
7. Pengguna yang tidak aktif tidak dapat melakukan autentikasi.
8. Menonaktifkan pengguna atau melakukan reset password pengguna wajib mencabut seluruh session aktif milik pengguna tersebut sehingga aktivasi ulang tidak menghidupkan kembali session lama.
9. Admin tidak dapat menurunkan role dirinya sendiri maupun menonaktifkan dirinya sendiri.
10. Admin aktif terakhir tidak boleh diturunkan role-nya maupun dinonaktifkan.
11. Akun pengguna dinonaktifkan, bukan dihapus secara fisik melalui fitur normal aplikasi.
12. Password hash tidak boleh ditampilkan melalui API.
13. Sistem tidak boleh membiarkan perubahan data pengguna melewati aturan authorization.

---

## 6. Category Management

### 6.1 Deskripsi

Category Management digunakan untuk mengelompokkan produk berdasarkan kategori tertentu.

Contoh:

- Elektronik.
- Peralatan Kantor.
- Peralatan Rumah Tangga.
- Perlengkapan Komputer.

### 6.2 Fitur

Admin dapat:

- Melihat daftar kategori.
- Membuat kategori.
- Mengubah informasi kategori (nama dan deskripsi).
- Mengaktifkan kategori.
- Menonaktifkan kategori.

Staff hanya dapat melihat kategori aktif.

### 6.3 Data Kategori

| Field | Keterangan |
|---|---|
| id | Identitas unik kategori |
| name | Nama kategori |
| description | Deskripsi kategori |
| is_active | Status aktif kategori |
| created_at | Waktu pembuatan |
| updated_at | Waktu perubahan terakhir |

### 6.4 Aturan Bisnis

1. Nama kategori wajib diisi.
2. Nama kategori harus unik tanpa membedakan huruf besar dan kecil setelah trimming.
3. Nama kategori tidak boleh kosong atau hanya berisi whitespace.
4. Kategori aktif dapat dipilih ketika membuat produk.
5. Kategori tidak aktif tidak dapat dipilih untuk produk baru.
6. Kategori tidak aktif tidak dapat digunakan ketika mengubah kategori produk.
7. Produk yang sudah menggunakan kategori tersebut tetap terhubung meskipun kategori dinonaktifkan.
8. Menonaktifkan kategori tidak otomatis menonaktifkan produk yang terhubung.
9. Kategori dinonaktifkan, bukan dihapus secara fisik melalui fitur normal aplikasi.

---

## 7. Product Management

### 7.1 Deskripsi

Product Management digunakan untuk mengelola informasi produk yang tersedia dalam inventaris.

### 7.2 Fitur

Admin dapat:

- Melihat daftar produk.
- Melihat detail produk.
- Membuat produk.
- Mengubah informasi produk.
- Mengaktifkan produk.
- Menonaktifkan produk.

Staff hanya dapat melihat produk aktif dengan informasi yang diizinkan (tanpa harga). Permintaan akses langsung atau filter terhadap produk inactive oleh Staff pada endpoint produk ditolak (`403 Forbidden`), sementara riwayat stock movement tetap menampilkan referensi produk yang telah dinonaktifkan.

### 7.3 Data Produk

| Field | Keterangan |
|---|---|
| id | Identitas unik produk |
| category_id | Referensi kategori |
| sku | Kode unik produk |
| name | Nama produk |
| description | Deskripsi produk |
| unit | Satuan produk |
| purchase_price | Harga beli |
| selling_price | Harga jual |
| current_stock | Jumlah stok terkini |
| minimum_stock | Batas minimum stok |
| status | Status produk |
| created_at | Waktu pembuatan |
| updated_at | Waktu perubahan terakhir |

### 7.4 Aturan Bisnis

1. Produk harus memiliki SKU.
2. SKU harus unik.
3. SKU dinormalisasi dengan menghapus whitespace di awal dan akhir serta mengubah seluruh huruf menjadi uppercase.
4. SKU hanya boleh mengandung huruf A-Z, angka 0-9, dan tanda hubung.
5. Nama produk wajib diisi.
6. Nama produk tidak harus unik.
7. Produk harus memiliki kategori yang valid dan aktif ketika dibuat.
8. Produk harus memiliki unit.
9. Unit disimpan dalam lowercase setelah trimming.
10. Harga beli dan harga jual wajib diisi oleh Admin.
11. Harga beli dan harga jual tidak boleh negatif.
12. Harga menggunakan tipe `NUMERIC(14,2)`.
13. Stok awal produk selalu `0`.
14. Penambahan stok awal dilakukan melalui Stock In.
15. Minimum stock tidak boleh negatif dan harus mengikuti aturan presisi unit produk.
16. Minimum stock default adalah `0`.
17. Produk menggunakan status `active` atau `inactive`.
18. Produk yang tidak aktif tidak dapat digunakan dalam transaksi Stock In maupun Stock Out.
19. Produk yang dinonaktifkan tetap memiliki riwayat transaksi.
20. Produk tidak dihapus secara fisik melalui fitur normal aplikasi.
21. Perubahan `unit` produk hanya diperbolehkan apabila `current_stock` bernilai `0` dan produk belum memiliki riwayat transaksi stok.

### 7.5 Satuan Produk

Satuan produk disimpan sebagai teks (trim dan lowercase).

Unit **count-only** yang hanya menerima bilangan bulat (untuk quantity transaksi maupun `minimum_stock`):

- `pcs`
- `unit`
- `box`
- `pack`
- `set`

Unit di luar daftar tersebut (contoh: `kg`, `gram`, `liter`, `meter`, `roll`, `rim`) dapat menggunakan bilangan pecahan hingga 3 angka desimal.

MVP tidak menggunakan tabel master satuan.

Validasi satuan, quantity, dan `minimum_stock` dilakukan pada application layer.

### 7.6 Visibilitas Harga

Admin dapat melihat:

- Purchase Price.
- Selling Price.

Staff tidak dapat melihat kedua informasi tersebut.

Backend wajib menghilangkan field harga dari response yang diberikan kepada Staff.

Jangan hanya menyembunyikan informasi harga melalui frontend.

---

## 8. Stock Management

### 8.1 Deskripsi

Stock Management digunakan untuk mencatat perubahan jumlah persediaan melalui transaksi Stock In dan Stock Out.

Setiap transaksi harus menghasilkan catatan pada stock movement history.

### 8.2 Tipe Transaksi

Sistem memiliki dua jenis transaksi:

**Stock In**

Transaksi untuk menambahkan jumlah stok produk.

**Stock Out**

Transaksi untuk mengurangi jumlah stok produk.

### 8.3 Data Stock Movement

Setiap transaksi mencatat:

| Field | Keterangan |
|---|---|
| id | Identitas unik transaksi |
| product_id | Produk yang ditransaksikan |
| type | `in` atau `out` |
| quantity | Jumlah barang |
| stock_before | Jumlah stok sebelum transaksi |
| stock_after | Jumlah stok setelah transaksi |
| reason | Alasan transaksi |
| notes | Catatan tambahan |
| created_by | Pengguna yang melakukan transaksi |
| created_at | Waktu transaksi |

### 8.4 Ketentuan Kuantitas

Kuantitas stok menggunakan:

`NUMERIC(14,3)`

Ketentuan:

1. Quantity harus lebih besar dari nol.
2. Quantity tidak boleh melebihi tiga angka di belakang koma.
3. Quantity tidak boleh mengalami pembulatan diam-diam akibat batas presisi database.
4. Quantity harus sesuai dengan aturan satuan produk.
5. Sistem tidak menggunakan floating-point arithmetic untuk menghitung stok.

### 8.5 Stock In

Admin dan Staff dapat melakukan Stock In.

Aturan:

1. Produk harus tersedia.
2. Produk harus berstatus aktif.
3. Quantity wajib diisi.
4. Quantity harus lebih besar dari nol.
5. Reason wajib diisi.
6. Notes bersifat opsional.
7. Sistem menghitung stok setelah transaksi.
8. Sistem memperbarui `current_stock`.
9. Sistem mencatat transaksi ke stock movement history.

Rumus:

`stock_after = stock_before + quantity`

### 8.6 Stock Out

Admin dan Staff dapat melakukan Stock Out.

Aturan:

1. Produk harus tersedia.
2. Produk harus berstatus aktif.
3. Quantity wajib diisi.
4. Quantity harus lebih besar dari nol.
5. Reason wajib diisi.
6. Notes bersifat opsional.
7. Stok harus mencukupi.
8. Sistem tidak boleh menghasilkan stok negatif.
9. Sistem memperbarui `current_stock`.
10. Sistem mencatat transaksi ke stock movement history.

Rumus:

`stock_after = stock_before - quantity`

Jika stok tidak mencukupi, transaksi harus ditolak.

### 8.7 Reason dan Notes

Reason wajib diisi untuk setiap transaksi Stock In maupun Stock Out.

Contoh reason:

- Pembelian barang.
- Pengembalian barang.
- Barang digunakan untuk operasional.
- Barang rusak.
- Barang diberikan kepada pengguna.

Reason tidak boleh kosong atau hanya berisi whitespace.

Notes bersifat opsional dan dapat digunakan untuk memberikan informasi tambahan.

### 8.8 Transaksi Database

Perubahan stok dan pencatatan stock movement harus dilakukan dalam satu database transaction.

Ketentuan:

1. Mulai transaksi database.
2. Lock baris produk menggunakan row-level locking.
3. Periksa keberadaan produk.
4. Periksa status produk.
5. Validasi quantity.
6. Periksa kecukupan stok untuk Stock Out.
7. Hitung stok sebelum dan sesudah transaksi.
8. Update `products.current_stock`.
9. Insert data ke `stock_movements`.
10. Commit transaksi.

Jika salah satu operasi gagal, seluruh transaksi harus di-rollback.

Sistem harus mencegah dua transaksi bersamaan menghasilkan perhitungan stok yang tidak konsisten.

### 8.9 Riwayat Transaksi

Stock movement history menyimpan seluruh transaksi Stock In dan Stock Out.

Aturan:

- Riwayat transaksi tidak dapat diedit melalui aplikasi.
- Riwayat transaksi tidak dapat dihapus melalui aplikasi.
- Riwayat tetap tersedia meskipun produk dinonaktifkan.
- Setiap transaksi harus mencatat pengguna yang melakukan transaksi.
- Riwayat transaksi dapat difilter berdasarkan produk dan tipe transaksi.
- Riwayat transaksi harus memiliki urutan yang deterministik.

### 8.10 Stock Adjustment

Stock Adjustment tidak termasuk dalam MVP.

Koreksi stok dilakukan melalui transaksi Stock In atau Stock Out dengan alasan yang sesuai dan akurat.

Sistem tidak boleh membuat transaksi palsu untuk menyamarkan koreksi stok.

---

## 9. Inventory Dashboard

### 9.1 Deskripsi

Dashboard menampilkan ringkasan informasi persediaan agar pengguna dapat memahami kondisi inventaris dengan cepat.

Dashboard tersedia untuk Admin dan Staff.

### 9.2 Informasi Dashboard

Dashboard menampilkan:

1. Active Product Count.
2. Active Category Count.
3. Low Stock Products.
4. Recent Stock Movements.
5. Stock In Count.
6. Stock Out Count.

### 9.3 Active Product Count

Menampilkan jumlah produk dengan status `active`.

Produk inactive tidak dihitung.

### 9.4 Active Category Count

Menampilkan jumlah kategori dengan `is_active = true`.

Kategori inactive tidak dihitung.

### 9.5 Low Stock Products

Low stock adalah produk aktif dengan kondisi:

`current_stock <= minimum_stock`

Dashboard menampilkan informasi produk yang memenuhi kondisi tersebut.

Produk inactive tidak dimasukkan dalam perhitungan.

### 9.6 Recent Stock Movements

Menampilkan transaksi Stock In dan Stock Out terbaru.

Informasi yang ditampilkan:

- Nama produk.
- SKU.
- Tipe transaksi.
- Quantity.
- Stock before.
- Stock after.
- Reason.
- Pengguna yang melakukan transaksi.
- Waktu transaksi.

### 9.7 Stock In dan Stock Out Count

Menampilkan jumlah transaksi Stock In dan Stock Out pada bulan kalender berjalan.

Periode dihitung berdasarkan timezone bisnis aplikasi.

Default timezone:

`Asia/Jakarta`

Perhitungan dilakukan berdasarkan batas awal dan akhir bulan dalam timezone tersebut.

Dashboard tidak boleh menjumlahkan kuantitas stok dari produk yang memiliki satuan berbeda sebagai satu total stok yang seolah-olah memiliki arti bisnis.

---

## 10. Data dan Aturan Integritas

### 10.1 Identitas Data

Seluruh primary key menggunakan UUID.

UUID dihasilkan oleh PostgreSQL menggunakan `gen_random_uuid()` sebagai default.

### 10.2 Timestamp

Gunakan `TIMESTAMPTZ` untuk pencatatan waktu.

Data waktu disimpan secara konsisten dan ditampilkan sesuai timezone aplikasi.

### 10.3 Normalisasi Data

**Email**

- Trim whitespace.
- Convert ke lowercase.
- Unik tanpa membedakan huruf besar dan kecil.

**SKU**

- Trim whitespace.
- Convert ke uppercase.
- Hanya A-Z, angka, dan tanda hubung.
- Harus unik.

**Category Name**

- Trim whitespace.
- Unik tanpa membedakan huruf besar dan kecil.

**Unit**

- Trim whitespace.
- Convert ke lowercase.

### 10.4 Foreign Key

Relasi antar tabel harus menggunakan foreign key.

Gunakan `ON DELETE RESTRICT` untuk menjaga referensi dan riwayat data.

Normal application flow menggunakan deactivation, bukan physical deletion.

### 10.5 Soft Delete

MVP menggunakan mekanisme deactivation.

- User menggunakan `is_active`.
- Category menggunakan `is_active`.
- Product menggunakan `status` dengan nilai `active` atau `inactive`.

Tidak diperlukan `deleted_at` untuk mekanisme ini.

### 10.6 Konsistensi Stok

Jumlah stok pada tabel products harus selalu konsisten dengan transaksi yang tercatat melalui application transaction flow.

Perubahan stok dan insert movement harus berlangsung dalam satu transaksi database.

Sistem tidak boleh melakukan perubahan stok tanpa catatan movement yang sesuai.

---

## 11. API Requirements

### 11.1 API Style

Backend menyediakan REST API.

Seluruh endpoint menggunakan prefix:

`/api/v1`

### 11.2 Endpoint Groups

Endpoint dikelompokkan berdasarkan modul:

- Authentication.
- Users.
- Categories.
- Products.
- Stock Movements.
- Dashboard.

Detail endpoint, request, response, dan authorization mengikuti `docs/api-contract.md`, dokumentasi OpenAPI, serta desain arsitektur.

### 11.3 HTTP Status Codes

Gunakan status code secara konsisten.

| Status | Penggunaan |
|---|---|
| 200 | Request berhasil |
| 201 | Resource berhasil dibuat |
| 400 | Request malformed atau struktur/schema request tidak valid |
| 401 | Belum terautentikasi |
| 403 | Tidak memiliki izin |
| 404 | Resource tidak ditemukan |
| 409 | Konflik uniqueness atau kondisi konkuren |
| 422 | Request valid secara struktur tetapi melanggar business rule |
| 429 | Rate limit terlampaui |
| 500 | Kesalahan internal server |
| 503 | Service atau dependency tidak tersedia |

### 11.4 Idempotency

MVP tidak menggunakan `Idempotency-Key`.

Untuk transaksi Stock In dan Stock Out, setiap request yang berhasil diproses merupakan transaksi baru.

Client tidak boleh melakukan retry otomatis pada request mutasi stok ketika hasil request sebelumnya belum diketahui.

`X-Request-ID`, jika digunakan, hanya berfungsi sebagai correlation identifier dan bukan mekanisme deduplikasi.

---

## 12. Non-Functional Requirements

### 12.1 Security

Sistem harus:

- Menggunakan Argon2id untuk password hashing.
- Menggunakan database-backed session.
- Menyimpan hash token, bukan raw token.
- Menggunakan HttpOnly cookie.
- Menggunakan Secure cookie pada production HTTPS.
- Menerapkan authorization pada backend.
- Mencegah Staff mengakses informasi harga.
- Memvalidasi seluruh input.
- Menggunakan parameterized database queries.
- Tidak menampilkan informasi sensitif dalam response atau log.

### 12.2 Data Integrity

Sistem harus:

- Mencegah stok menjadi negatif.
- Menjaga konsistensi antara stok produk dan transaksi.
- Menggunakan database transaction untuk operasi stok.
- Menggunakan row-level locking untuk mencegah race condition.
- Menggunakan database constraints untuk aturan integritas penting.
- Mempertahankan riwayat transaksi.

### 12.3 Maintainability

Sistem harus:

- Menggunakan Modular Monolith.
- Memisahkan tanggung jawab antar modul.
- Memiliki struktur kode yang konsisten.
- Menghindari duplikasi business logic.
- Menggunakan TypeScript.
- Memiliki dokumentasi API.
- Memiliki automated tests untuk fitur penting.

### 12.4 Usability

Aplikasi harus:

- Memiliki navigasi yang jelas.
- Menampilkan informasi secara terstruktur.
- Memberikan feedback ketika operasi berhasil atau gagal.
- Menampilkan validasi form.
- Menampilkan loading dan empty state.
- Mendukung penggunaan pada desktop dan perangkat dengan layar lebih kecil.

### 12.5 Reliability

Sistem harus:

- Menjaga konsistensi data ketika transaksi gagal.
- Menolak transaksi yang melanggar aturan bisnis.
- Tidak menghilangkan riwayat transaksi akibat deactivation.
- Memiliki mekanisme error handling yang konsisten.

---

## 13. Testing Requirements

Pengujian dilakukan untuk memastikan fitur berfungsi sesuai kebutuhan.

### 13.1 Authentication

- Login berhasil.
- Login gagal dengan kredensial salah.
- Login ditolak untuk user inactive.
- Rate limiting login mengembalikan `429` dengan header `Retry-After`.
- Session berlaku selama 7 hari.
- Session tidak diperpanjang oleh aktivitas.
- Logout mencabut session saat ini.
- Session perangkat lain tetap berlaku.
- Deaktivasi user atau reset password mencabut seluruh session aktif user terkait.

### 13.2 Authorization

- Admin dapat mengakses fitur Admin.
- Staff tidak dapat mengakses fitur Admin.
- Staff hanya melihat kategori & produk aktif pada endpoint kategori & produk (`403` untuk akses/filter inactive).
- Staff tidak dapat melihat purchase price.
- Staff tidak dapat melihat selling price.
- Staff tidak dapat mengubah harga produk atau menyortir produk berdasarkan harga.
- User tanpa autentikasi tidak dapat mengakses endpoint protected.

### 13.3 User Management

- Admin dapat membuat user.
- Admin dapat melakukan reset password user dan mencabut session aktif user.
- Email duplikat ditolak.
- Email dinormalisasi.
- Password disimpan dalam bentuk hash.
- Role hanya menerima nilai yang valid.
- User inactive tidak dapat login.
- Admin tidak dapat menurunkan role atau menonaktifkan diri sendiri maupun Admin aktif terakhir.

### 13.4 Category Management

- Admin dapat membuat kategori.
- Nama kategori duplikat ditolak.
- Kategori dapat dinonaktifkan.
- Kategori inactive tidak dapat dipilih untuk produk baru.
- Produk lama tetap terhubung dengan kategori inactive.

### 13.5 Product Management

- Admin dapat membuat produk.
- SKU dinormalisasi.
- SKU duplikat ditolak.
- Harga negatif ditolak.
- Harga wajib diisi.
- Stok awal produk bernilai nol.
- Produk inactive tidak dapat digunakan untuk transaksi stok.

### 13.6 Stock Management

- Stock In berhasil.
- Stock Out berhasil.
- Quantity nol ditolak.
- Quantity negatif ditolak.
- Quantity dengan presisi berlebih ditolak.
- Reason wajib diisi.
- Reason whitespace-only ditolak.
- Stock Out melebihi stok ditolak.
- Stok tidak boleh negatif.
- Perubahan stok dan movement tercatat secara atomik.
- Transaksi gagal harus di-rollback.
- Transaksi bersamaan tidak merusak konsistensi stok.

### 13.7 Dashboard

- Active product count benar.
- Active category count benar.
- Low stock count benar.
- Recent movement benar.
- Stock In count bulan berjalan benar.
- Stock Out count bulan berjalan benar.
- Perhitungan menggunakan timezone bisnis.

---

## 14. Definition of Done

MVP dianggap selesai apabila seluruh kriteria berikut terpenuhi.

### Authentication

- [ ] Login dan logout berjalan.
- [ ] Rate limiting login (`429`) berjalan.
- [ ] Password menggunakan Argon2id.
- [ ] Session disimpan dalam database.
- [ ] Session berlaku selama 7 hari secara absolut.
- [ ] Multiple-device session didukung.
- [ ] Deaktivasi pengguna dan reset password mencabut seluruh session aktif pengguna terkait.
- [ ] Cookie memiliki konfigurasi keamanan yang sesuai.

### Authorization

- [ ] Admin memiliki akses sesuai matriks hak akses.
- [ ] Staff memiliki akses sesuai matriks hak akses (hanya melihat produk & kategori aktif pada endpoint master data).
- [ ] Staff tidak dapat melihat harga melalui API atau menyortir berdasarkan harga.
- [ ] Staff tidak dapat mengubah data yang dilarang.

### User Management

- [ ] Admin dapat mengelola pengguna dan melakukan reset password pengguna.
- [ ] Normalisasi dan uniqueness email berjalan.
- [ ] Deactivation pengguna berjalan dan aturan proteksi diri / Admin aktif terakhir terjaga.

### Category Management

- [ ] Admin dapat mengelola kategori.
- [ ] Uniqueness nama kategori berjalan.
- [ ] Deactivation kategori berjalan.
- [ ] Relasi kategori dan produk tetap konsisten.

### Product Management

- [ ] Admin dapat mengelola produk.
- [ ] SKU unik dan dinormalisasi.
- [ ] Validasi harga berjalan.
- [ ] Validasi unit count-only dan syarat perubahan `unit` berjalan.
- [ ] Stok awal bernilai nol.
- [ ] Deactivation produk berjalan.

### Stock Management

- [ ] Stock In berjalan.
- [ ] Stock Out berjalan.
- [ ] Validasi quantity berjalan.
- [ ] Reason wajib diisi.
- [ ] Stok tidak dapat menjadi negatif.
- [ ] Transaction dan row-level locking berjalan.
- [ ] Stock movement history tercatat.
- [ ] Riwayat tidak dapat diedit atau dihapus melalui aplikasi.

### Dashboard

- [ ] Seluruh metrik dashboard tersedia.
- [ ] Low stock menggunakan aturan yang ditentukan.
- [ ] Periode Stock In dan Stock Out menggunakan bulan kalender berjalan.
- [ ] Timezone bisnis diterapkan dengan benar.

### Technical

- [ ] Database migrations berjalan.
- [ ] API terdokumentasi melalui `docs/api-contract.md` dan OpenAPI.
- [ ] Backend dan frontend terintegrasi.
- [ ] Automated tests untuk fitur penting tersedia dan lulus.
- [ ] Type checking berjalan.
- [ ] Linting berjalan jika tersedia.
- [ ] Build berhasil.
- [ ] Tidak ada kredensial yang ter-commit.

---

## 15. Future Development

Fitur berikut dapat dipertimbangkan setelah MVP selesai:

- Supplier Management.
- Purchase Order.
- Sales Order.
- Stock Adjustment dengan mekanisme koreksi yang dapat ditelusuri.
- Multi-warehouse.
- Barcode scanning.
- Export laporan.
- Notifikasi stok minimum.
- Audit log untuk perubahan master data.
- Advanced inventory analytics.
- Automated backup dan monitoring.

Fitur future development tidak boleh dimasukkan ke implementasi MVP tanpa persetujuan perubahan scope.

---

## 16. Ringkasan Keputusan Final MVP

| Area | Keputusan |
|---|---|
| Architecture | Modular Monolith |
| Warehouse | Single Warehouse |
| User Roles | Admin dan Staff |
| Authentication | Database-backed Session |
| Password Hashing | Argon2id |
| Session Expiration | 7 hari, absolute expiration |
| Multi-device Login | Diizinkan |
| Logout | Mencabut session saat ini |
| User Deactivation & Password Reset | Mencabut seluruh session aktif user |
| Admin Password Reset | Diizinkan oleh Admin (tanpa self-service) |
| Login Rate Limiting | In-memory rate limiter pada endpoint login (`429`) |
| Staff Product/Category Visibility | Active only pada endpoint produk/kategori (`403` untuk inactive), tanpa harga |
| Product Status | active / inactive |
| Category Status | is_active boolean |
| User Status | is_active boolean |
| Product SKU | Unique, uppercase, trimmed |
| Product Name | Tidak harus unique |
| Category Name | Unique case-insensitive |
| Email | Unique case-insensitive |
| Initial Stock | 0 |
| Stock Quantity | NUMERIC(14,3) |
| Price | NUMERIC(14,2) |
| Minimum Stock | NUMERIC(14,3), default 0, mengikuti aturan presisi unit |
| Product Unit | Text, lowercase; count-only canonical (`pcs`, `unit`, `box`, `pack`, `set`); ubah unit hanya saat stok 0 & tanpa movement |
| Stock Transactions | Stock In dan Stock Out |
| Stock Adjustment | Tidak termasuk MVP |
| Transaction Reason | Wajib |
| Transaction Notes | Opsional |
| Stock Concurrency | Row-level locking |
| Movement History | Immutable melalui aplikasi |
| Staff Price Visibility | Tidak diizinkan |
| Idempotency-Key | Tidak digunakan dalam MVP |
| Dashboard Low Stock | current_stock <= minimum_stock (produk aktif) |
| Dashboard Period | Bulan kalender berjalan |
| Default Business Timezone | Asia/Jakarta |
| Soft Delete | Deactivation |
| Foreign Key Deletion | ON DELETE RESTRICT |
| Generic Audit Log | Tidak termasuk MVP |

---

**End of PRD**