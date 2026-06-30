-- ============================================================
-- YESHTOSA ERP - MIGRATION TAMBAHAN
-- Bagian 10: HPP Produksi & Resep Multi-Bahan Dinamis
--
-- Resep (tabel resep_produk) SUDAH ADA sejak skema awal — fitur
-- ini memanfaatkan tabel itu sepenuhnya, bukan membuat ulang.
-- Owner mengelola gramasi per pcs lewat menu Resep Produk yang
-- baru (lihat di bawah), bukan hardcode di kode aplikasi.
-- ============================================================

-- Kolom baru untuk mencatat total nilai modal Rupiah bahan baku
-- yang terpakai pada satu sesi produksi (HPP produksi).
alter table produksi add column if not exists total_biaya_bahan numeric(14,2) not null default 0;

-- Index agar lookup resep per produk (dipakai berulang kali saat
-- produksi multi-ukuran dalam satu sesi) tetap cepat.
create index if not exists idx_resep_produk_produk on resep_produk(produk_id);
