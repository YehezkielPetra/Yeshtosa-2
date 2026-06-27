-- ============================================================
-- YESHTOSA ERP - DATABASE SCHEMA
-- Bagian 2: Stok, Penjualan, Produksi, Pembelian
-- Jalankan SETELAH 01_schema_master.sql
-- ============================================================

-- ============================================================
-- STOK BAHAN BAKU (per cabang)
-- ============================================================
create table stok_bahan_baku (
  id uuid primary key default uuid_generate_v4(),
  bahan_baku_id uuid not null references master_bahan_baku(id),
  cabang_id uuid not null references cabang(id),
  jumlah numeric(14,4) not null default 0,
  updated_at timestamptz not null default now(),
  unique (bahan_baku_id, cabang_id)
);

-- Mutasi stok bahan baku (audit semua perubahan stok)
create table mutasi_stok_bahan_baku (
  id uuid primary key default uuid_generate_v4(),
  bahan_baku_id uuid not null references master_bahan_baku(id),
  cabang_id uuid not null references cabang(id),
  jumlah_perubahan numeric(14,4) not null, -- positif = masuk, negatif = keluar
  jumlah_sebelum numeric(14,4) not null,
  jumlah_sesudah numeric(14,4) not null,
  referensi_tipe text not null, -- 'pembelian', 'produksi', 'penyesuaian'
  referensi_id uuid,
  keterangan text,
  dibuat_oleh uuid references app_users(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- STOK PRODUK JADI (Fresh & Frozen dipisah, per cabang)
-- ============================================================
create table stok_produk (
  id uuid primary key default uuid_generate_v4(),
  produk_id uuid not null references master_produk(id),
  cabang_id uuid not null references cabang(id),
  status status_fresh_frozen not null,
  jumlah numeric(14,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (produk_id, cabang_id, status)
);

-- Batch produksi Frozen punya umur simpan -> perlu tanggal expired per batch
create table batch_stok_frozen (
  id uuid primary key default uuid_generate_v4(),
  produk_id uuid not null references master_produk(id),
  cabang_id uuid not null references cabang(id),
  jumlah_awal numeric(14,2) not null,
  jumlah_sisa numeric(14,2) not null,
  tanggal_produksi date not null,
  tanggal_expired date not null,
  sumber text not null default 'produksi', -- 'produksi' langsung atau 'konversi_fresh'
  created_at timestamptz not null default now()
);

create table mutasi_stok_produk (
  id uuid primary key default uuid_generate_v4(),
  produk_id uuid not null references master_produk(id),
  cabang_id uuid not null references cabang(id),
  status status_fresh_frozen not null,
  jumlah_perubahan numeric(14,2) not null,
  jumlah_sebelum numeric(14,2) not null,
  jumlah_sesudah numeric(14,2) not null,
  referensi_tipe text not null, -- 'produksi','penjualan','konversi_fresh_ke_frozen','penyesuaian'
  referensi_id uuid,
  keterangan text,
  dibuat_oleh uuid references app_users(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- PRODUKSI
-- ============================================================
create sequence produksi_nomor_seq start 1;

create table produksi (
  id uuid primary key default uuid_generate_v4(),
  nomor_produksi text not null unique default ('PRD-' || to_char(now(),'YYYYMMDD') || '-' || lpad(nextval('produksi_nomor_seq')::text, 5, '0')),
  cabang_id uuid not null references cabang(id),
  tanggal_produksi date not null default current_date,
  status_hasil status_fresh_frozen not null default 'fresh',
  pesanan_terkait_id uuid, -- referensi penjualan.id jika produksi karena pesanan, null jika stok umum
  dibuat_oleh uuid references app_users(id),
  catatan text,
  created_at timestamptz not null default now()
);

create table produksi_detail (
  id uuid primary key default uuid_generate_v4(),
  produksi_id uuid not null references produksi(id) on delete cascade,
  produk_id uuid not null references master_produk(id),
  jumlah numeric(14,2) not null
);

-- ============================================================
-- MASTER PROMO / DISKON
-- ============================================================
create table master_promo (
  id uuid primary key default uuid_generate_v4(),
  nama_promo text not null,
  tipe text not null check (tipe in ('persen','nominal')),
  nilai numeric(14,2) not null,
  berlaku_mulai date,
  berlaku_sampai date,
  is_aktif boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- PENJUALAN
-- ============================================================
create sequence penjualan_nomor_seq start 1;

create table penjualan (
  id uuid primary key default uuid_generate_v4(),
  nomor_order text not null unique default ('SO-' || to_char(now(),'YYYYMMDD') || '-' || lpad(nextval('penjualan_nomor_seq')::text, 5, '0')),
  cabang_id uuid not null references cabang(id),
  pelanggan_id uuid not null references master_pelanggan(id),
  tanggal_order timestamptz not null default now(),
  status_produk status_fresh_frozen not null default 'fresh',
  metode_ambil_kirim metode_ambil_kirim not null default 'diambil',

  subtotal numeric(14,2) not null default 0,
  diskon_nominal numeric(14,2) not null default 0,
  promo_id uuid references master_promo(id),
  total numeric(14,2) not null default 0,

  status_bayar status_bayar not null default 'belum_bayar',
  total_dibayar numeric(14,2) not null default 0,

  -- Ongkir dipisah total dari omzet
  status_ongkir status_ongkir_enum not null default 'belum_diketahui',
  ongkir_estimasi numeric(14,2) default 0,
  ongkir_aktual numeric(14,2) default 0,
  ongkir_dibayar_oleh text check (ongkir_dibayar_oleh in ('pelanggan','yeshtosa') ) default 'pelanggan',

  is_selesai boolean not null default false,
  approval_status approval_status not null default 'approved', -- order baru otomatis approved; perubahan setelah selesai butuh approval
  catatan text,
  dibuat_oleh uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table penjualan_detail (
  id uuid primary key default uuid_generate_v4(),
  penjualan_id uuid not null references penjualan(id) on delete cascade,
  produk_id uuid not null references master_produk(id),
  jumlah numeric(14,2) not null,
  harga_satuan numeric(14,2) not null,
  diskon_nominal numeric(14,2) not null default 0,
  subtotal numeric(14,2) not null
);

-- ============================================================
-- PEMBAYARAN (cicilan / pelunasan dari pelanggan)
-- ============================================================
create sequence pembayaran_nomor_seq start 1;

create table pembayaran (
  id uuid primary key default uuid_generate_v4(),
  nomor_pembayaran text not null unique default ('PAY-' || to_char(now(),'YYYYMMDD') || '-' || lpad(nextval('pembayaran_nomor_seq')::text, 5, '0')),
  penjualan_id uuid not null references penjualan(id),
  jumlah_bayar numeric(14,2) not null,
  metode text default 'cash',
  tanggal_bayar timestamptz not null default now(),
  dicatat_oleh uuid references app_users(id),
  catatan text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- PEMBELIAN (dari supplier)
-- ============================================================
create sequence pembelian_nomor_seq start 1;

create table pembelian (
  id uuid primary key default uuid_generate_v4(),
  nomor_pembelian text not null unique default ('PO-' || to_char(now(),'YYYYMMDD') || '-' || lpad(nextval('pembelian_nomor_seq')::text, 5, '0')),
  cabang_id uuid not null references cabang(id),
  supplier_id uuid not null references master_supplier(id),
  tanggal_beli timestamptz not null default now(),
  total numeric(14,2) not null default 0,
  status_bayar status_bayar not null default 'belum_bayar',
  total_dibayar numeric(14,2) not null default 0,
  dibuat_oleh uuid references app_users(id),
  catatan text,
  created_at timestamptz not null default now()
);

create table pembelian_detail (
  id uuid primary key default uuid_generate_v4(),
  pembelian_id uuid not null references pembelian(id) on delete cascade,
  bahan_baku_id uuid not null references master_bahan_baku(id),
  jumlah numeric(14,4) not null,
  harga_satuan numeric(14,2) not null,
  subtotal numeric(14,2) not null
);

create index idx_penjualan_pelanggan on penjualan(pelanggan_id);
create index idx_penjualan_cabang on penjualan(cabang_id);
create index idx_penjualan_tanggal on penjualan(tanggal_order);
create index idx_pembelian_supplier on pembelian(supplier_id);
create index idx_pembayaran_penjualan on pembayaran(penjualan_id);
