# Yeshtosa ERP

**Business Management System** untuk UMKM **Yeshtosa** — produsen Gogos Isi Tuna khas Makassar, dengan cabang di Makassar dan Tangerang.

Dibangun bukan sekadar aplikasi kasir, melainkan pusat operasional bisnis: penjualan, produksi, stok, kas, dan pengambilan keputusan — semua dalam satu sistem yang bisa dipelajari admin baru dalam waktu kurang dari 30 menit.

---

## Daftar Isi

- [Fitur](#fitur)
- [Tech Stack](#tech-stack)
- [Struktur Proyek](#struktur-proyek)
- [Persiapan](#persiapan)
  - [1. Setup Supabase](#1-setup-supabase-database--auth)
  - [2. Environment Variables](#2-environment-variables)
  - [3. Instalasi & Jalankan Lokal](#3-instalasi--jalankan-lokal)
- [Deployment](#deployment)
- [Role & Hak Akses](#role--hak-akses)
- [Keamanan](#keamanan)
- [Roadmap](#roadmap)
- [Lisensi](#lisensi)

---

## Fitur

**Operasional**
- Penjualan — kalkulasi otomatis harga per kategori pelanggan (Konsumen/Reseller/Stock Point), promo, diskon, status bayar, dan **ongkir yang dipisah dari omzet** (estimasi vs aktual, mirip model tarif Gojek/Grab)
- Produksi — pencatatan hasil Fresh/Frozen, **konversi otomatis Fresh → Frozen** dengan batch & tanggal kedaluwarsa, pengurangan bahan baku otomatis sesuai resep produk, serta **edit dan pembatalan produksi** dengan pembalikan stok otomatis
- Pembelian — dari supplier, otomatis memperbarui stok bahan baku dan harga beli terakhir
- Pembayaran — pencatatan cicilan/pelunasan, otomatis memperbarui status bayar dan kas
- Pengeluaran — pencatatan biaya operasional per kategori

**Stok & Keuangan**
- Stok bahan baku dan produk jadi (Fresh/Frozen) terpisah per cabang, dengan peringatan stok minimum
- Kas ledger — saldo kas selalu konsisten dan terpisah dari laba
- **Tutup Buku bulanan** — kalkulasi laba kotor/bersih, cadangan pajak, cadangan usaha, dan laba siap distribusi

**Kontrol & Audit**
- **Approval Queue** — admin tidak bisa menghapus transaksi secara langsung; perubahan transaksi yang sudah selesai harus disetujui Owner
- **Audit Trail** — semua perubahan penting tercatat (nilai lama, nilai baru, waktu, dan pelaku)
- 3 peran pengguna (Owner, Admin, Produksi) dengan hak akses berbeda, diperkuat Row Level Security di level database

**Master Data**
- Produk, Bahan Baku (dengan resep per produk), Pelanggan (nomor permanen, multi nomor HP, **histori perubahan kategori tersimpan**), Supplier (harga beli terakhir, status utama/cadangan), Stock Point

**Laporan & Analisis**
- Dashboard Owner — kas, omzet, estimasi laba, margin, piutang, pelanggan tidak aktif, ranking reseller & stock point
- Analisis Konsumen, Reseller (grafik perkembangan & ranking), dan Stock Point (perputaran, margin, kinerja)

**Pengalaman Pengguna**
- **Pencarian real-time** (live search) di semua dropdown penting — ketik per huruf, hasil langsung tersaring tanpa perlu Enter
- Tampilan ala aplikasi desktop dengan sidebar navigasi, sepenuhnya **responsif** untuk diakses lewat tablet Android maupun desktop

---

## Tech Stack

| Layer | Teknologi |
|---|---|
| Backend | Node.js, Express |
| Database | PostgreSQL via [Supabase](https://supabase.com) |
| Auth | Supabase Auth |
| Frontend | EJS (server-rendered) + Tailwind CSS |
| Keamanan | Row Level Security (Supabase), Helmet, rate limiting |

---

## Struktur Proyek

```
yeshtosa-erp/
├── sql/                          # Jalankan berurutan di Supabase SQL Editor
│   ├── 01_schema_master.sql
│   ├── 02_schema_transaksi.sql
│   ├── 03_schema_kas_approval.sql
│   ├── 04_rls_policies.sql
│   ├── 05_seed_data_contoh.sql   (opsional)
│   └── 06_migration_produksi_edit.sql
├── src/
│   ├── app.js                    # Entry point
│   ├── config/supabase.js
│   ├── controllers/
│   ├── middlewares/
│   ├── routes/
│   ├── utils/
│   └── views/                    # EJS templates
├── public/
│   ├── css/style.css             # Hasil build Tailwind
│   └── js/combobox.js            # Komponen pencarian real-time
├── .env.example
├── package.json
├── Procfile                      # Railway / Heroku
├── railway.json
└── render.yaml
```

---

## Persiapan

### 1. Setup Supabase (Database & Auth)

**a. Buat project**
Buat project baru di [supabase.com](https://supabase.com), lalu catat **Project URL**, **anon/publishable key**, dan **service_role/secret key** dari **Project Settings → API Keys**.

> Catatan: Supabase kini menggunakan format key baru (`sb_publishable_...` dan `sb_secret_...`). Keduanya kompatibel langsung dengan `@supabase/supabase-js` yang dipakai proyek ini — tidak perlu konversi.

**b. Jalankan schema SQL**
Buka **SQL Editor** di dashboard Supabase, jalankan file di folder `sql/` **secara berurutan** (copy isi file → paste → Run):

| Urutan | File | Isi |
|---|---|---|
| 1 | `01_schema_master.sql` | Cabang, users, produk, bahan baku, pelanggan, supplier |
| 2 | `02_schema_transaksi.sql` | Stok, penjualan, produksi, pembelian |
| 3 | `03_schema_kas_approval.sql` | Kas ledger, pengeluaran, tutup buku, approval, audit trail |
| 4 | `04_rls_policies.sql` | Row Level Security |
| 5 | `05_seed_data_contoh.sql` | *(opsional)* Data contoh untuk uji coba |
| 6 | `06_migration_produksi_edit.sql` | Tambahan kolom untuk fitur edit/hapus produksi |

Jika muncul peringatan **"Potential issue detected"** soal RLS saat menjalankan file 01–03, klik **"Run without RLS"** — RLS akan diaktifkan dengan benar di langkah 4.

**c. Buat user Owner pertama**
Tabel `app_users` terhubung ke Supabase Auth, sehingga user pertama dibuat manual:

1. **Authentication → Users → Add User** → isi email & password → centang **Auto Confirm User**.
2. Salin **User UID** dari user yang baru dibuat.
3. Di **SQL Editor**, jalankan:
   ```sql
   insert into app_users (id, nama, role, cabang_id)
   values ('PASTE-USER-UID-DISINI', 'Nama Anda', 'owner', null);
   ```
4. User Admin & Produksi selanjutnya bisa dibuat lewat menu **Pengaturan → Pengguna** di aplikasi (sebagai Owner).

### 2. Environment Variables

```bash
cp .env.example .env
```

Isi `.env`:

| Variabel | Sumber / Catatan |
|---|---|
| `SUPABASE_URL` | Project URL — **hanya** `https://xxxxx.supabase.co`, tanpa `/rest/v1/` atau path lain |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key (`sb_secret_...`) — server-side only, jangan pernah expose |
| `SUPABASE_ANON_KEY` | Publishable key (`sb_publishable_...`) |
| `SESSION_SECRET` | String acak panjang — generate dengan `openssl rand -base64 32` |
| `PORT` | Default `3000` |
| `FORCE_SECURE_COOKIE` | `false` untuk development (HTTP lokal), `true` hanya jika diakses lewat HTTPS asli di production |

> **Penting:** Jangan set `FORCE_SECURE_COOKIE=true` saat masih diakses lewat `http://localhost`, karena browser akan menolak menyimpan cookie session pada koneksi non-HTTPS dan login akan gagal tanpa pesan error yang jelas.

### 3. Instalasi & Jalankan Lokal

```bash
npm install     # otomatis build CSS Tailwind (postinstall)
npm start       # jalan di http://localhost:3000
```

Mode development dengan auto-reload:
```bash
npm run dev
```

---

## Deployment

### Railway
1. Push repo ini ke GitHub, lalu di Railway: **New Project → Deploy from GitHub repo**.
2. Railway otomatis mendeteksi Node.js (`railway.json` sudah disediakan).
3. Tambahkan environment variables di tab **Variables** (sama seperti `.env`, plus `NODE_ENV=production` dan `FORCE_SECURE_COOKIE=true`).
4. Railway otomatis `npm install` dan menjalankan `node src/app.js`.

### Render
1. Push ke GitHub, lalu di Render: **New → Web Service**, hubungkan repo ini.
2. Render membaca `render.yaml` secara otomatis, atau isi manual: **Build Command** `npm install`, **Start Command** `node src/app.js`.
3. Isi environment variables di tab **Environment**.

### VPS (DigitalOcean, AWS EC2, dll.)
```bash
git clone <url-repo-anda>
cd yeshtosa-erp
npm install
cp .env.example .env && nano .env
npm install -g pm2
pm2 start src/app.js --name yeshtosa-erp
pm2 save && pm2 startup
```
Pasang reverse proxy Nginx ke `localhost:3000`, lalu SSL gratis:
```bash
sudo certbot --nginx -d domain-anda.com
```

### Heroku
```bash
heroku create yeshtosa-erp
heroku config:set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... SESSION_SECRET=... NODE_ENV=production FORCE_SECURE_COOKIE=true
git push heroku main
```

---

## Role & Hak Akses

| Role | Akses |
|---|---|
| **Owner** | Akses penuh — semua cabang, Dashboard Owner, Tutup Buku, Approval Queue, Audit Trail, Pengaturan Pengguna |
| **Admin** | Operasional harian per cabang — penjualan, pembelian, pembayaran, pengeluaran, master data |
| **Produksi** | Input produksi, konversi Fresh/Frozen, lihat stok |

Hak akses diterapkan di dua lapis: middleware Express (`requireRole`) dan Row Level Security di PostgreSQL.

---

## Keamanan

- `SUPABASE_SERVICE_ROLE_KEY` hanya dipakai di sisi server, tidak pernah dikirim ke frontend. File `.env` sudah masuk `.gitignore`.
- Row Level Security berfungsi sebagai lapisan kedua jika suatu saat ada akses langsung ke Supabase API memakai `anon key`.
- Rate limiting pada endpoint login (20 percobaan / 15 menit) untuk mencegah brute force.
- Tidak ada penghapusan transaksi langsung — perubahan pada transaksi yang sudah selesai melalui Approval Queue dan disetujui Owner, dengan jejak lengkap di Audit Trail.

---

## Roadmap

- [ ] Form UI untuk modal awal & penyesuaian kas manual (saat ini via SQL)
- [ ] Form UI untuk mengelola resep produk (saat ini via SQL)
- [ ] Export laporan ke PDF/Excel
- [ ] Notifikasi WhatsApp untuk piutang jatuh tempo & stok menipis
- [ ] Dukungan multi-cabang lebih dari 2 lokasi

---

## Lisensi

Proprietary — dibangun khusus untuk operasional internal Yeshtosa.
