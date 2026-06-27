-- ============================================================
-- YESHTOSA ERP - DATABASE SCHEMA
-- Bagian 4: Row Level Security (RLS)
-- Jalankan SETELAH 03_schema_kas_approval.sql
--
-- Catatan penting:
-- Aplikasi Node.js akan menggunakan SUPABASE SERVICE ROLE KEY
-- di backend (server-side only, tidak pernah dikirim ke browser).
-- Service role key BYPASS semua RLS.
-- RLS di sini berfungsi sebagai lapisan pertahanan kedua
-- seandainya ada akses langsung memakai anon/auth key.
-- ============================================================

alter table app_users enable row level security;
alter table cabang enable row level security;
alter table master_produk enable row level security;
alter table master_bahan_baku enable row level security;
alter table resep_produk enable row level security;
alter table master_pelanggan enable row level security;
alter table pelanggan_hp enable row level security;
alter table pelanggan_histori_kategori enable row level security;
alter table master_stock_point enable row level security;
alter table master_supplier enable row level security;
alter table supplier_bahan_baku enable row level security;
alter table stok_bahan_baku enable row level security;
alter table mutasi_stok_bahan_baku enable row level security;
alter table stok_produk enable row level security;
alter table batch_stok_frozen enable row level security;
alter table mutasi_stok_produk enable row level security;
alter table produksi enable row level security;
alter table produksi_detail enable row level security;
alter table master_promo enable row level security;
alter table penjualan enable row level security;
alter table penjualan_detail enable row level security;
alter table pembayaran enable row level security;
alter table pembelian enable row level security;
alter table pembelian_detail enable row level security;
alter table master_kategori_pengeluaran enable row level security;
alter table pengeluaran enable row level security;
alter table kas_ledger enable row level security;
alter table tutup_buku enable row level security;
alter table approval_queue enable row level security;
alter table audit_trail enable row level security;

-- Helper function: ambil role user yang sedang login
create or replace function current_user_role()
returns user_role
language sql
security definer
stable
as $$
  select role from app_users where id = auth.uid();
$$;

-- Default: hanya user yang sudah login & aktif dapat membaca data dasar
create policy "app_users_select_own_or_owner" on app_users
  for select using (
    id = auth.uid() or current_user_role() = 'owner'
  );

create policy "cabang_select_all_authenticated" on cabang
  for select using (auth.role() = 'authenticated');

-- Master data: semua role login boleh baca, hanya admin & owner boleh tulis
create policy "master_produk_select" on master_produk for select using (auth.role() = 'authenticated');
create policy "master_produk_write" on master_produk for all using (current_user_role() in ('owner','admin'));

create policy "master_bahan_baku_select" on master_bahan_baku for select using (auth.role() = 'authenticated');
create policy "master_bahan_baku_write" on master_bahan_baku for all using (current_user_role() in ('owner','admin'));

create policy "resep_produk_select" on resep_produk for select using (auth.role() = 'authenticated');
create policy "resep_produk_write" on resep_produk for all using (current_user_role() in ('owner','admin'));

create policy "master_pelanggan_select" on master_pelanggan for select using (auth.role() = 'authenticated');
create policy "master_pelanggan_write" on master_pelanggan for all using (current_user_role() in ('owner','admin'));

create policy "pelanggan_hp_all" on pelanggan_hp for all using (current_user_role() in ('owner','admin'));
create policy "pelanggan_histori_kategori_select" on pelanggan_histori_kategori for select using (auth.role() = 'authenticated');

create policy "master_stock_point_select" on master_stock_point for select using (auth.role() = 'authenticated');
create policy "master_stock_point_write" on master_stock_point for all using (current_user_role() in ('owner','admin'));

create policy "master_supplier_select" on master_supplier for select using (auth.role() = 'authenticated');
create policy "master_supplier_write" on master_supplier for all using (current_user_role() in ('owner','admin'));

create policy "supplier_bahan_baku_all" on supplier_bahan_baku for all using (current_user_role() in ('owner','admin'));

-- Stok: semua role login boleh lihat; tulis hanya admin/produksi/owner (via backend logic)
create policy "stok_bahan_baku_select" on stok_bahan_baku for select using (auth.role() = 'authenticated');
create policy "stok_bahan_baku_write" on stok_bahan_baku for all using (current_user_role() in ('owner','admin','produksi'));

create policy "mutasi_stok_bahan_baku_select" on mutasi_stok_bahan_baku for select using (auth.role() = 'authenticated');
create policy "mutasi_stok_bahan_baku_insert" on mutasi_stok_bahan_baku for insert with check (current_user_role() in ('owner','admin','produksi'));

create policy "stok_produk_select" on stok_produk for select using (auth.role() = 'authenticated');
create policy "stok_produk_write" on stok_produk for all using (current_user_role() in ('owner','admin','produksi'));

create policy "batch_stok_frozen_select" on batch_stok_frozen for select using (auth.role() = 'authenticated');
create policy "batch_stok_frozen_write" on batch_stok_frozen for all using (current_user_role() in ('owner','admin','produksi'));

create policy "mutasi_stok_produk_select" on mutasi_stok_produk for select using (auth.role() = 'authenticated');
create policy "mutasi_stok_produk_insert" on mutasi_stok_produk for insert with check (current_user_role() in ('owner','admin','produksi'));

-- Produksi: role produksi, admin, owner
create policy "produksi_all" on produksi for all using (current_user_role() in ('owner','admin','produksi'));
create policy "produksi_detail_all" on produksi_detail for all using (current_user_role() in ('owner','admin','produksi'));

create policy "master_promo_select" on master_promo for select using (auth.role() = 'authenticated');
create policy "master_promo_write" on master_promo for all using (current_user_role() in ('owner','admin'));

-- Penjualan: admin & owner boleh CRUD (kecuali delete -> dicegah di layer aplikasi), produksi hanya lihat
create policy "penjualan_select" on penjualan for select using (auth.role() = 'authenticated');
create policy "penjualan_insert" on penjualan for insert with check (current_user_role() in ('owner','admin'));
create policy "penjualan_update" on penjualan for update using (current_user_role() in ('owner','admin'));
-- Tidak ada policy DELETE untuk penjualan -> secara default delete diblokir oleh RLS (selain service role)

create policy "penjualan_detail_select" on penjualan_detail for select using (auth.role() = 'authenticated');
create policy "penjualan_detail_insert" on penjualan_detail for insert with check (current_user_role() in ('owner','admin'));
create policy "penjualan_detail_update" on penjualan_detail for update using (current_user_role() in ('owner','admin'));

create policy "pembayaran_select" on pembayaran for select using (auth.role() = 'authenticated');
create policy "pembayaran_insert" on pembayaran for insert with check (current_user_role() in ('owner','admin'));

create policy "pembelian_select" on pembelian for select using (auth.role() = 'authenticated');
create policy "pembelian_insert" on pembelian for insert with check (current_user_role() in ('owner','admin'));
create policy "pembelian_update" on pembelian for update using (current_user_role() in ('owner','admin'));

create policy "pembelian_detail_select" on pembelian_detail for select using (auth.role() = 'authenticated');
create policy "pembelian_detail_insert" on pembelian_detail for insert with check (current_user_role() in ('owner','admin'));

create policy "master_kategori_pengeluaran_select" on master_kategori_pengeluaran for select using (auth.role() = 'authenticated');
create policy "master_kategori_pengeluaran_write" on master_kategori_pengeluaran for all using (current_user_role() in ('owner','admin'));

create policy "pengeluaran_select" on pengeluaran for select using (auth.role() = 'authenticated');
create policy "pengeluaran_insert" on pengeluaran for insert with check (current_user_role() in ('owner','admin'));

create policy "kas_ledger_select" on kas_ledger for select using (auth.role() = 'authenticated');
create policy "kas_ledger_insert" on kas_ledger for insert with check (current_user_role() in ('owner','admin'));

create policy "tutup_buku_select" on tutup_buku for select using (auth.role() = 'authenticated');
create policy "tutup_buku_write" on tutup_buku for all using (current_user_role() = 'owner');

create policy "approval_queue_select" on approval_queue for select using (auth.role() = 'authenticated');
create policy "approval_queue_insert" on approval_queue for insert with check (current_user_role() in ('owner','admin'));
create policy "approval_queue_update" on approval_queue for update using (current_user_role() = 'owner');

create policy "audit_trail_select" on audit_trail for select using (current_user_role() = 'owner');
create policy "audit_trail_insert" on audit_trail for insert with check (auth.role() = 'authenticated');
