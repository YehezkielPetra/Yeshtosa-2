-- ============================================================
-- YESHTOSA ERP - DATABASE SCHEMA
-- Bagian 1: Extensions, Users/Auth, Master Data
-- Jalankan file ini PERTAMA di Supabase SQL Editor
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- ENUM TYPES
-- ============================================================
create type user_role as enum ('owner', 'admin', 'produksi');
create type cabang_kode as enum ('makassar', 'tangerang');
create type kategori_pelanggan as enum ('konsumen', 'reseller', 'stock_point');
create type status_fresh_frozen as enum ('fresh', 'frozen');
create type metode_ambil_kirim as enum ('diambil', 'dikirim');
create type status_bayar as enum ('belum_bayar', 'sebagian', 'lunas');
create type status_ongkir_enum as enum ('belum_diketahui', 'estimasi', 'aktual', 'sudah_dibayar');
create type approval_status as enum ('pending', 'approved', 'rejected');
create type jenis_transaksi_kas as enum (
  'modal', 'penjualan', 'pembelian', 'pengeluaran', 'pembayaran_masuk',
  'pembayaran_keluar', 'ongkir', 'pajak_disisihkan', 'cadangan_usaha',
  'laba_distribusi', 'penyesuaian'
);

-- ============================================================
-- CABANG (Lokasi usaha)
-- ============================================================
create table cabang (
  id uuid primary key default uuid_generate_v4(),
  kode cabang_kode not null unique,
  nama text not null,
  alamat text,
  is_aktif boolean not null default true,
  created_at timestamptz not null default now()
);

insert into cabang (kode, nama, alamat) values
  ('makassar', 'Yeshtosa Makassar (Pusat)', null),
  ('tangerang', 'Yeshtosa Tangerang (Cabang)', null);

-- ============================================================
-- USERS (terhubung ke Supabase Auth via auth.users.id)
-- ============================================================
create table app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  nama text not null,
  role user_role not null,
  cabang_id uuid references cabang(id),
  is_aktif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- MASTER PRODUK
-- ============================================================
create table master_produk (
  id uuid primary key default uuid_generate_v4(),
  kode_produk text not null unique,
  nama_produk text not null,
  kategori text,
  satuan text not null default 'pcs',
  harga_jual_default numeric(14,2) not null default 0,
  harga_jual_reseller numeric(14,2),
  harga_jual_stock_point numeric(14,2),
  umur_simpan_frozen_hari int default 30,
  is_aktif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- MASTER BAHAN BAKU
-- ============================================================
create table master_bahan_baku (
  id uuid primary key default uuid_generate_v4(),
  kode_bahan text not null unique,
  nama_bahan text not null,
  satuan text not null,
  stok_minimum numeric(14,2) default 0,
  is_aktif boolean not null default true,
  created_at timestamptz not null default now()
);

-- Resep produk: bahan baku apa saja yang dipakai per 1 unit produk
create table resep_produk (
  id uuid primary key default uuid_generate_v4(),
  produk_id uuid not null references master_produk(id) on delete cascade,
  bahan_baku_id uuid not null references master_bahan_baku(id) on delete cascade,
  jumlah_per_unit numeric(14,4) not null,
  unique (produk_id, bahan_baku_id)
);

-- ============================================================
-- MASTER PELANGGAN
-- Nomor permanen, nama/HP dapat berubah, histori kategori tersimpan
-- ============================================================
create sequence pelanggan_nomor_seq start 1;

create table master_pelanggan (
  id uuid primary key default uuid_generate_v4(),
  nomor_pelanggan text not null unique default ('PL-' || lpad(nextval('pelanggan_nomor_seq')::text, 6, '0')),
  nama text not null,
  kategori kategori_pelanggan not null default 'konsumen',
  alamat text,
  cabang_id uuid references cabang(id),
  is_aktif boolean not null default true,
  catatan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table pelanggan_hp (
  id uuid primary key default uuid_generate_v4(),
  pelanggan_id uuid not null references master_pelanggan(id) on delete cascade,
  nomor_hp text not null,
  is_utama boolean not null default false,
  created_at timestamptz not null default now()
);

-- Histori perubahan kategori pelanggan (wajib tersimpan, riwayat transaksi tidak hilang)
create table pelanggan_histori_kategori (
  id uuid primary key default uuid_generate_v4(),
  pelanggan_id uuid not null references master_pelanggan(id) on delete cascade,
  kategori_lama kategori_pelanggan,
  kategori_baru kategori_pelanggan not null,
  diubah_oleh uuid references app_users(id),
  diubah_pada timestamptz not null default now(),
  catatan text
);

-- ============================================================
-- MASTER STOCK POINT (lokasi titip jual / mitra)
-- ============================================================
create table master_stock_point (
  id uuid primary key default uuid_generate_v4(),
  pelanggan_id uuid not null references master_pelanggan(id),
  nama_lokasi text not null,
  alamat text,
  pic_nama text,
  pic_hp text,
  is_aktif boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- MASTER SUPPLIER
-- ============================================================
create sequence supplier_nomor_seq start 1;

create table master_supplier (
  id uuid primary key default uuid_generate_v4(),
  nomor_supplier text not null unique default ('SP-' || lpad(nextval('supplier_nomor_seq')::text, 6, '0')),
  nama text not null,
  nomor_hp text,
  alamat text,
  barang_utama text,
  is_supplier_utama boolean not null default false,
  is_aktif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Relasi supplier <-> bahan baku yang dipasok, termasuk harga beli terakhir
create table supplier_bahan_baku (
  id uuid primary key default uuid_generate_v4(),
  supplier_id uuid not null references master_supplier(id) on delete cascade,
  bahan_baku_id uuid not null references master_bahan_baku(id) on delete cascade,
  harga_beli_terakhir numeric(14,2),
  is_supplier_cadangan boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (supplier_id, bahan_baku_id)
);

create index idx_pelanggan_hp_pelanggan on pelanggan_hp(pelanggan_id);
create index idx_supplier_bahan_supplier on supplier_bahan_baku(supplier_id);
create index idx_resep_produk on resep_produk(produk_id);
