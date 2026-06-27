-- ============================================================
-- YESHTOSA ERP - SEED DATA CONTOH (OPSIONAL)
-- Jalankan ini SETELAH 01-04 jika ingin data contoh untuk
-- mencoba aplikasi. Boleh dilewati jika ingin mulai dari kosong.
-- Ganti/hapus sesuai kebutuhan produksi sebenarnya.
-- ============================================================

-- Ambil id cabang yang sudah ada (dibuat di 01_schema_master.sql)
-- Contoh produk
insert into master_produk (kode_produk, nama_produk, kategori, satuan, harga_jual_default, harga_jual_reseller, harga_jual_stock_point, umur_simpan_frozen_hari)
values
  ('GST-001', 'Gogos Isi Tuna', 'Gogos', 'pcs', 8000, 6500, 7000, 30);

-- Contoh bahan baku
insert into master_bahan_baku (kode_bahan, nama_bahan, satuan, stok_minimum) values
  ('BHN-001', 'Beras Ketan', 'kg', 10),
  ('BHN-002', 'Tuna Segar', 'kg', 5),
  ('BHN-003', 'Daun Pisang', 'lembar', 50),
  ('BHN-004', 'Bumbu Tuna', 'kg', 3);

-- Resep produk: berapa bahan baku dipakai untuk 1 pcs Gogos Isi Tuna
insert into resep_produk (produk_id, bahan_baku_id, jumlah_per_unit)
select p.id, b.id, v.jumlah
from master_produk p
join master_bahan_baku b on true
join (values
  ('BHN-001', 0.08),
  ('BHN-002', 0.04),
  ('BHN-003', 1),
  ('BHN-004', 0.01)
) as v(kode_bahan, jumlah) on b.kode_bahan = v.kode_bahan
where p.kode_produk = 'GST-001';

-- Contoh promo
insert into master_promo (nama_promo, tipe, nilai, berlaku_mulai, berlaku_sampai, is_aktif)
values ('Promo Pembukaan Tangerang', 'persen', 10, current_date, current_date + interval '30 days', true);

-- ============================================================
-- CATATAN PENTING UNTUK MEMBUAT USER PERTAMA (OWNER)
-- ============================================================
-- Tabel app_users terhubung ke auth.users milik Supabase Auth.
-- User PERTAMA harus dibuat manual lewat:
--   1. Supabase Dashboard > Authentication > Add User (isi email & password)
--   2. Salin User UID yang muncul
--   3. Jalankan query berikut (ganti UID dan data sesuai):
--
-- insert into app_users (id, nama, role, cabang_id)
-- values (
--   'PASTE-USER-UID-DISINI',
--   'Nama Owner',
--   'owner',
--   null  -- owner tidak terikat satu cabang
-- );
--
-- Setelah user Owner pertama ada, gunakan menu Pengaturan > Pengguna
-- di aplikasi untuk membuat user Admin & Produksi berikutnya.
