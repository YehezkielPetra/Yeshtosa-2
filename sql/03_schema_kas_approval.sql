-- ============================================================
-- YESHTOSA ERP - DATABASE SCHEMA
-- Bagian 3: Kas, Pengeluaran, Tutup Buku, Approval, Audit Trail
-- Jalankan SETELAH 02_schema_transaksi.sql
-- ============================================================

-- ============================================================
-- KATEGORI PENGELUARAN
-- ============================================================
create table master_kategori_pengeluaran (
  id uuid primary key default uuid_generate_v4(),
  nama text not null unique,
  is_aktif boolean not null default true
);

insert into master_kategori_pengeluaran (nama) values
  ('Operasional'), ('Gaji'), ('Sewa'), ('Listrik & Air'), ('Transport'),
  ('Pemeliharaan'), ('Pemasaran'), ('Lain-lain');

-- ============================================================
-- PENGELUARAN
-- ============================================================
create sequence pengeluaran_nomor_seq start 1;

create table pengeluaran (
  id uuid primary key default uuid_generate_v4(),
  nomor_pengeluaran text not null unique default ('EXP-' || to_char(now(),'YYYYMMDD') || '-' || lpad(nextval('pengeluaran_nomor_seq')::text, 5, '0')),
  cabang_id uuid not null references cabang(id),
  kategori_id uuid references master_kategori_pengeluaran(id),
  jumlah numeric(14,2) not null,
  tanggal timestamptz not null default now(),
  keterangan text,
  dicatat_oleh uuid references app_users(id),
  approval_status approval_status not null default 'approved',
  created_at timestamptz not null default now()
);

-- ============================================================
-- KAS / CASHFLOW LEDGER
-- Saldo kas = modal + penjualan - pembelian - pengeluaran - pajak disisihkan
--             - cadangan usaha - laba distribusi (+/- penyesuaian)
-- Saldo kas BUKAN laba.
-- ============================================================
create table kas_ledger (
  id uuid primary key default uuid_generate_v4(),
  cabang_id uuid not null references cabang(id),
  tanggal timestamptz not null default now(),
  jenis jenis_transaksi_kas not null,
  jumlah numeric(14,2) not null, -- positif = masuk kas, negatif = keluar kas
  saldo_setelah numeric(14,2) not null,
  referensi_tipe text, -- 'penjualan','pembelian','pengeluaran','pembayaran','tutup_buku','manual'
  referensi_id uuid,
  keterangan text,
  dicatat_oleh uuid references app_users(id),
  created_at timestamptz not null default now()
);

create index idx_kas_ledger_cabang_tanggal on kas_ledger(cabang_id, tanggal);

-- ============================================================
-- TUTUP BUKU (Bulanan)
-- ============================================================
create table tutup_buku (
  id uuid primary key default uuid_generate_v4(),
  cabang_id uuid not null references cabang(id),
  periode_bulan int not null,
  periode_tahun int not null,

  total_omzet numeric(14,2) not null default 0,
  total_hpp numeric(14,2) not null default 0,
  total_pengeluaran numeric(14,2) not null default 0,
  total_pembelian numeric(14,2) not null default 0,
  laba_kotor numeric(14,2) not null default 0,
  laba_bersih numeric(14,2) not null default 0,

  persen_cadangan_pajak numeric(5,2) not null default 2.5,
  nominal_cadangan_pajak numeric(14,2) not null default 0,

  persen_cadangan_usaha numeric(5,2) not null default 10,
  nominal_cadangan_usaha numeric(14,2) not null default 0,

  laba_siap_distribusi numeric(14,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','final')),
  ditutup_oleh uuid references app_users(id),
  ditutup_pada timestamptz,
  created_at timestamptz not null default now(),
  unique (cabang_id, periode_bulan, periode_tahun)
);

-- ============================================================
-- APPROVAL QUEUE (untuk perubahan transaksi yang sudah selesai)
-- Admin tidak boleh menghapus transaksi -> hanya ajukan perubahan
-- ============================================================
create table approval_queue (
  id uuid primary key default uuid_generate_v4(),
  tabel_target text not null, -- 'penjualan', 'pembelian', dll
  record_id uuid not null,
  jenis_perubahan text not null check (jenis_perubahan in ('edit','batal')),
  data_lama jsonb not null,
  data_baru jsonb,
  alasan text,
  diajukan_oleh uuid references app_users(id),
  diajukan_pada timestamptz not null default now(),
  status approval_status not null default 'pending',
  ditinjau_oleh uuid references app_users(id),
  ditinjau_pada timestamptz,
  catatan_reviewer text
);

-- ============================================================
-- AUDIT TRAIL (global, mencatat semua perubahan penting)
-- Mencatat: nilai lama, nilai baru, tanggal, jam, user
-- ============================================================
create table audit_trail (
  id uuid primary key default uuid_generate_v4(),
  tabel_target text not null,
  record_id uuid not null,
  aksi text not null check (aksi in ('create','update','delete','approve','reject')),
  data_lama jsonb,
  data_baru jsonb,
  user_id uuid references app_users(id),
  created_at timestamptz not null default now()
);

create index idx_audit_trail_tabel_record on audit_trail(tabel_target, record_id);
create index idx_kas_ledger_jenis on kas_ledger(jenis);
