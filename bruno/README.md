# IMS Bruno API Collection

Koleksi request Bruno untuk menguji seluruh endpoint backend **Inventory Management System (IMS)** (`http://localhost:3001`) mencakup peran **Admin** dan **Staff**.

## Cara Menggunakan

1. Buka folder `bruno/` di aplikasi Bruno dan pilih environment `local`.
2. Isi variabel rahasia (`vars:secret`) di panel Environment Bruno (jangan menyimpannya ke file yang di-commit):
   - `adminPassword`: kata sandi akun Admin (misal sesuai `SEED_ADMIN_PASSWORD` di `apps/backend/.env`).
   - `staffPassword`: kata sandi akun Staff uji.
   - `newUserPassword` & `resetUserPassword`: kata sandi dummy (8-128 karakter) untuk endpoint pembuatan dan reset password pengguna.
3. Jalankan `auth/01-login-admin.bru` untuk mendapatkan cookie sesi `ims_session` (dikelola otomatis oleh cookie jar Bruno), lalu jalankan request Admin (`users/`, `categories/`, `products/`, `stock-movements/`, `dashboard/`).
4. Untuk menguji pembatasan RBAC Staff, jalankan `auth/02-login-staff.bru` terlebih dahulu, lalu jalankan request berakhiran `-staff*`.
