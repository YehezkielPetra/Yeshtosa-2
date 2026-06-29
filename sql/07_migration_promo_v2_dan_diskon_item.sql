-- ============================================================
-- YESHTOSA ERP - MIGRATION TAMBAHAN
-- Bagian 7: Master Promo Baru (potongan_akhir/potongan_ongkir)
-- dan Diskon Per Item di Penjualan Detail
-- Jalankan ini SETELAH 01-06.
-- ============================================================

-- ============================================================
-- Master Promo Baru
-- Skema ini TERPISAH dari master_promo lama (tipe persen/nominal).
-- Tabel baru ini punya 2 dimensi:
--   - tipe_promo:      potongan_akhir (memotong total akhir nota)
--                      atau potongan_ongkir (memotong ongkir)
--   - bentuk_potongan: flat (nominal Rupiah tetap) atau
--                      persen (persentase dari basis yang dipotong)
-- Kolom nominal_potongan bersifat kontekstual: jika bentuk_potongan
-- = 'flat', nilainya adalah Rupiah. Jika 'persen', nilainya 0-100.
-- ============================================================
create type tipe_promo_baru as enum ('potongan_akhir', 'potongan_ongkir');
create type bentuk_potongan_promo as enum ('flat', 'persen');

create table master_promo_v2 (
  id uuid primary key default uuid_generate_v4(),
  nama_promo text not null,
  tipe_promo tipe_promo_baru not null,
  bentuk_potongan bentuk_potongan_promo not null default 'flat',
  nominal_potongan numeric(14,2) not null,
  is_aktif boolean not null default true,
  created_at timestamptz not null default now()
);

alter table master_promo_v2 enable row level security;
create policy "master_promo_v2_select" on master_promo_v2 for select using (auth.role() = 'authenticated');
create policy "master_promo_v2_write" on master_promo_v2 for all using (current_user_role() = 'owner');

-- ============================================================
-- Refactor Diskon Penjualan: Hapus diskon nominal global,
-- ganti menjadi diskon per item (kolom diskon_nominal sudah ada
-- di penjualan_detail sejak awal, sekarang benar-benar dipakai).
-- Kolom diskon_nominal di header 'penjualan' DIPERTAHANKAN secara
-- skema (agar data lama tidak hilang), tapi tidak lagi diisi
-- form baru — nilainya akan selalu 0 untuk transaksi baru karena
-- diskon kini diakumulasi dari penjualan_detail.
-- ============================================================

-- Kolom referensi promo_v2 yang dipakai (opsional, untuk audit promo mana yang dipakai)
alter table penjualan add column if not exists promo_v2_id uuid references master_promo_v2(id);
alter table penjualan add column if not exists promo_ongkir_id uuid references master_promo_v2(id);

-- ============================================================
-- Field Logistik Pengiriman (Bagian 3)
-- ============================================================
alter table penjualan add column if not exists tanggal_kirim date;
alter table penjualan add column if not exists jam_kirim time;
