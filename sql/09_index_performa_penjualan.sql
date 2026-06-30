-- ============================================================
-- YESHTOSA ERP - MIGRATION TAMBAHAN
-- Bagian 9: Index Performa untuk Filter Penjualan
--
-- Mengatasi query lambat saat memfilter Penjualan berdasarkan
-- tanggal (terutama untuk role non-owner yang juga memfilter
-- cabang_id secara bersamaan).
-- ============================================================

-- Composite index: query Admin selalu filter cabang_id + tanggal_order
-- bersamaan. Index gabungan ini jauh lebih efisien daripada Postgres
-- menggabungkan 2 index terpisah (bitmap scan).
create index if not exists idx_penjualan_cabang_tanggal on penjualan(cabang_id, tanggal_order desc);

-- Composite index serupa untuk status_bayar + tanggal_order
-- (kombinasi filter yang juga sering dipakai di halaman Penjualan).
create index if not exists idx_penjualan_status_tanggal on penjualan(status_bayar, tanggal_order desc);

-- Pastikan statistik query planner up to date setelah index baru dibuat.
analyze penjualan;
