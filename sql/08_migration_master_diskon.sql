-- ============================================================
-- YESHTOSA ERP - MIGRATION TAMBAHAN
-- Bagian 8: Master Diskon (terpisah dari Master Promo)
--
-- Perbedaan dengan Master Promo:
--   - Promo: hanya Owner yang bisa kelola (CRUD), berlaku di
--     level NOTA (potongan akhir nota / potongan ongkir).
--   - Diskon: Owner DAN Admin bisa kelola, berlaku PER PRODUK
--     pada baris item transaksi penjualan.
-- Jalankan ini SETELAH 01-07.
-- ============================================================

create type bentuk_diskon as enum ('flat', 'persen');

create table master_diskon (
  id uuid primary key default uuid_generate_v4(),
  nama_diskon text not null,
  bentuk_diskon bentuk_diskon not null default 'flat',
  nilai numeric(14,2) not null, -- jika flat: Rupiah, jika persen: 0-100
  is_aktif boolean not null default true,
  dibuat_oleh uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table master_diskon enable row level security;
create policy "master_diskon_select" on master_diskon for select using (auth.role() = 'authenticated');
-- Diskon dapat dibuat dan dikelola oleh Owner MAUPUN Admin (beda dari promo)
create policy "master_diskon_write" on master_diskon for all using (current_user_role() in ('owner','admin'));

-- ============================================================
-- Kolom referensi diskon yang dipakai per baris item penjualan.
-- Kolom diskon_nominal di penjualan_detail TETAP dipertahankan
-- sebagai nilai hasil akhir (akumulasi Rupiah) untuk laporan,
-- terlepas dari apakah berasal dari diskon master atau manual.
-- ============================================================
alter table penjualan_detail add column if not exists diskon_id uuid references master_diskon(id);
