-- ============================================================
-- YESHTOSA ERP - MIGRATION TAMBAHAN
-- Bagian 6: Edit & Pembatalan Produksi
-- Jalankan ini SETELAH 01-05 jika tabel produksi sudah ada.
-- ============================================================

alter table produksi add column if not exists is_dibatalkan boolean not null default false;
alter table produksi add column if not exists dibatalkan_oleh uuid references app_users(id);
alter table produksi add column if not exists dibatalkan_pada timestamptz;
alter table produksi add column if not exists alasan_pembatalan text;
