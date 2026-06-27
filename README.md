# Yeshtosa ERP — Business Management System

Sistem manajemen bisnis untuk **Yeshtosa** (Gogos Isi Tuna — Makassar & Tangerang), dibangun dengan Node.js (Express + EJS + Tailwind) dan Supabase (PostgreSQL + Auth).

Mencakup: Penjualan, Produksi (Fresh/Frozen), Pembelian, Stok, Kas, Pengeluaran, Pembayaran, Tutup Buku bulanan, Approval/Audit Trail, Dashboard Owner, dan seluruh Master Data (Produk, Bahan Baku, Pelanggan, Supplier, Stock Point).

---

## 1. Struktur Proyek

```
yeshtosa-erp/
├── sql/                      # Jalankan berurutan di Supabase SQL Editor
│   ├── 01_schema_master.sql
│   ├── 02_schema_transaksi.sql
│   ├── 03_schema_kas_approval.sql
│   ├── 04_rls_policies.sql
│   └── 05_seed_data_contoh.sql   (opsional)
├── src/
│   ├── app.js                # Entry point
│   ├── config/supabase.js
│   ├── controllers/
│   ├── middlewares/
│   ├── routes/
│   ├── utils/
│   └── views/                # EJS templates
├── public/css/style.css      # Hasil build Tailwind (sudah di-generate)
├── .env.example
├── package.json
├── Procfile                   # Untuk Railway/Heroku/Render
├── railway.json
└── render.yaml
```

---

## 2. Setup Supabase (Database & Auth)

### 2.1 Buat Project Supabase
Jika belum punya, buat project baru di [supabase.com](https://supabase.com) → catat **Project URL**, **anon key**, dan **service_role key** dari **Project Settings → API**.

### 2.2 Jalankan Schema SQL
Buka **Supabase Dashboard → SQL Editor**, lalu jalankan file-file di folder `sql/` **secara berurutan**:

1. `01_schema_master.sql` — tabel cabang, users, produk, bahan baku, pelanggan, supplier
2. `02_schema_transaksi.sql` — stok, penjualan, produksi, pembelian
3. `03_schema_kas_approval.sql` — kas ledger, pengeluaran, tutup buku, approval, audit trail
4. `04_rls_policies.sql` — Row Level Security (lapisan keamanan tambahan)
5. `05_seed_data_contoh.sql` — **opsional**, data contoh produk/bahan baku/promo untuk uji coba

Copy-paste isi setiap file ke SQL Editor lalu klik **Run**, satu per satu.

### 2.3 Buat User Owner Pertama
Tabel `app_users` terhubung ke sistem Auth Supabase, jadi user pertama harus dibuat manual:

1. **Authentication → Users → Add User** → isi email & password owner Anda → simpan.
2. Salin **User UID** yang muncul di daftar user.
3. Kembali ke **SQL Editor**, jalankan:
   ```sql
   insert into app_users (id, nama, role, cabang_id)
   values ('PASTE-USER-UID-DISINI', 'Nama Anda', 'owner', null);
   ```
4. Setelah ini, login pertama bisa dilakukan dengan email & password yang dibuat di langkah 1. User Admin & Produksi selanjutnya bisa dibuat lewat menu **Pengaturan → Pengguna** di aplikasi (sebagai Owner).

---

## 3. Setup Environment Variables

Salin `.env.example` menjadi `.env`:

```bash
cp .env.example .env
```

Isi nilai berikut di `.env`:

| Variabel | Sumber |
|---|---|
| `SUPABASE_URL` | Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → service_role key (⚠️ rahasia, jangan expose ke frontend) |
| `SUPABASE_ANON_KEY` | Project Settings → API → anon public key |
| `SESSION_SECRET` | String acak panjang, generate dengan `openssl rand -base64 32` |
| `PORT` | Default `3000`, biasanya platform hosting akan override otomatis |

---

## 4. Jalankan di Lokal (Opsional, untuk Testing)

```bash
npm install        # otomatis build CSS Tailwind juga (postinstall)
npm start          # jalan di http://localhost:3000
```

Untuk development dengan auto-reload:
```bash
npm run dev
```

---

## 5. Deployment ke Hosting

Karena Anda sudah punya akun hosting, pilih salah satu panduan berikut sesuai platform.

### Opsi A — Railway

1. Push proyek ini ke repository GitHub Anda.
2. Di Railway: **New Project → Deploy from GitHub repo** → pilih repo ini.
3. Railway otomatis mendeteksi Node.js (file `railway.json` sudah disediakan).
4. Masuk ke tab **Variables**, tambahkan semua variabel dari `.env` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SESSION_SECRET`, `NODE_ENV=production`).
5. Railway akan otomatis `npm install` (termasuk build CSS) dan menjalankan `node src/app.js`.
6. Setelah deploy sukses, buka domain yang diberikan Railway (atau hubungkan custom domain di tab **Settings → Domains**).

### Opsi B — Render

1. Push proyek ke GitHub.
2. Di Render: **New → Web Service** → connect ke repo ini.
3. Render akan membaca `render.yaml` secara otomatis (Blueprint), atau isi manual:
   - **Build Command**: `npm install`
   - **Start Command**: `node src/app.js`
4. Di tab **Environment**, isi `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (yang lain sudah ter-set di `render.yaml`).
5. Klik **Create Web Service**. Render akan build & deploy otomatis.

### Opsi C — VPS Sendiri (misal DigitalOcean, AWS EC2, dsb.)

```bash
git clone <url-repo-anda>
cd yeshtosa-erp
npm install
cp .env.example .env
nano .env   # isi semua variabel
npm install -g pm2
pm2 start src/app.js --name yeshtosa-erp
pm2 save
pm2 startup   # agar otomatis jalan saat server reboot
```
Lalu pasang reverse proxy (Nginx) yang mengarahkan domain Anda ke `localhost:3000`, dan pasang SSL gratis dengan Certbot:
```bash
sudo certbot --nginx -d domain-anda.com
```

### Opsi D — Heroku

```bash
heroku create yeshtosa-erp
heroku config:set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... SESSION_SECRET=... NODE_ENV=production
git push heroku main
```
File `Procfile` sudah disediakan sehingga Heroku otomatis tahu cara menjalankan aplikasi.

---

## 6. Checklist Setelah Deploy

- [ ] Login sebagai Owner berhasil di domain production.
- [ ] Buat user Admin & Produksi via **Pengaturan → Pengguna**.
- [ ] Tambahkan Master Produk, Bahan Baku, Pelanggan, Supplier sesuai data nyata Yeshtosa (hapus data contoh dari `05_seed_data_contoh.sql` jika sudah tidak diperlukan).
- [ ] Lengkapi **Resep Produk** (tabel `resep_produk`) agar stok bahan baku otomatis berkurang saat produksi — bisa lewat SQL Editor untuk saat ini.
- [ ] Catat **modal awal** sebagai entri kas pertama (lewat SQL manual ke `kas_ledger` dengan `jenis='modal'`, atau minta penambahan fitur form modal awal jika diperlukan).
- [ ] Uji alur lengkap: Pembelian bahan baku → Produksi → Penjualan → Pembayaran → cek Stok & Kas otomatis berubah.
- [ ] Uji **Tutup Buku** di akhir bulan pertama untuk memverifikasi kalkulasi laba & cadangan.
- [ ] Pastikan akses tablet Android via browser (Chrome) sudah nyaman digunakan admin di lapangan.

---

## 7. Catatan Keamanan

- `SUPABASE_SERVICE_ROLE_KEY` memiliki akses penuh ke database — **jangan pernah** expose ke kode frontend atau commit ke Git. File `.env` sudah masuk `.gitignore`.
- Row Level Security (RLS) di `04_rls_policies.sql` berfungsi sebagai lapisan kedua jika suatu saat ada akses langsung ke Supabase API memakai `anon key`.
- Login dibatasi rate limit (20 percobaan / 15 menit) untuk mencegah brute force.
- Admin tidak dapat menghapus transaksi langsung — semua perubahan transaksi yang sudah selesai melalui **Approval Queue** dan disetujui Owner, dengan jejak di **Audit Trail**.

---

## 8. Pengembangan Lanjutan yang Disarankan

Beberapa hal yang masih bisa dikembangkan sesuai pertumbuhan bisnis:
- Form input **modal awal** & **penyesuaian kas manual** langsung dari UI (saat ini via SQL).
- Form untuk mengelola **Resep Produk** langsung dari UI (saat ini via SQL).
- Export laporan ke PDF/Excel untuk investor.
- Notifikasi WhatsApp otomatis untuk piutang jatuh tempo atau stok bahan baku menipis.
- Multi-cabang lebih dari 2 (struktur database sudah siap, tinggal tambah baris di tabel `cabang`).
