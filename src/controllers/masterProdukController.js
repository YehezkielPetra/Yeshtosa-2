// ============================================================
// Master Produk Controller
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const { catatAudit } = require('../utils/auditTrail');

async function listProduk(req, res) {
  const { data, error } = await supabaseAdmin
    .from('master_produk')
    .select('*')
    .order('nama_produk');
  if (error) {
    req.flash('error', 'Gagal memuat data produk: ' + error.message);
  }
  res.render('master/produk_list', { title: 'Master Produk', produkList: data || [] });
}

function formTambahProduk(req, res) {
  res.render('master/produk_form', { title: 'Tambah Produk', produk: null });
}

async function simpanTambahProduk(req, res) {
  const { kode_produk, nama_produk, kategori, satuan, harga_jual_default, harga_jual_reseller, harga_jual_stock_point, umur_simpan_frozen_hari } = req.body;
  try {
    const { data, error } = await supabaseAdmin
      .from('master_produk')
      .insert({
        kode_produk, nama_produk, kategori, satuan: satuan || 'pcs',
        harga_jual_default: harga_jual_default || 0,
        harga_jual_reseller: harga_jual_reseller || null,
        harga_jual_stock_point: harga_jual_stock_point || null,
        umur_simpan_frozen_hari: umur_simpan_frozen_hari || 30,
      })
      .select()
      .single();
    if (error) throw error;

    await catatAudit({ tabel: 'master_produk', recordId: data.id, aksi: 'create', dataBaru: data, userId: req.session.user.id });
    req.flash('success', 'Produk berhasil ditambahkan.');
    res.redirect('/master/produk');
  } catch (err) {
    req.flash('error', 'Gagal menambah produk: ' + err.message);
    res.redirect('/master/produk/tambah');
  }
}

async function formEditProduk(req, res) {
  const { data, error } = await supabaseAdmin.from('master_produk').select('*').eq('id', req.params.id).single();
  if (error || !data) {
    req.flash('error', 'Produk tidak ditemukan.');
    return res.redirect('/master/produk');
  }
  res.render('master/produk_form', { title: 'Edit Produk', produk: data });
}

async function simpanEditProduk(req, res) {
  const { id } = req.params;
  const { kode_produk, nama_produk, kategori, satuan, harga_jual_default, harga_jual_reseller, harga_jual_stock_point, umur_simpan_frozen_hari, is_aktif } = req.body;
  try {
    const { data: dataLama } = await supabaseAdmin.from('master_produk').select('*').eq('id', id).single();

    const { data, error } = await supabaseAdmin
      .from('master_produk')
      .update({
        kode_produk, nama_produk, kategori, satuan,
        harga_jual_default: harga_jual_default || 0,
        harga_jual_reseller: harga_jual_reseller || null,
        harga_jual_stock_point: harga_jual_stock_point || null,
        umur_simpan_frozen_hari: umur_simpan_frozen_hari || 30,
        is_aktif: is_aktif === 'on',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    await catatAudit({ tabel: 'master_produk', recordId: id, aksi: 'update', dataLama, dataBaru: data, userId: req.session.user.id });
    req.flash('success', 'Produk berhasil diperbarui.');
    res.redirect('/master/produk');
  } catch (err) {
    req.flash('error', 'Gagal memperbarui produk: ' + err.message);
    res.redirect(`/master/produk/${id}/edit`);
  }
}

module.exports = { listProduk, formTambahProduk, simpanTambahProduk, formEditProduk, simpanEditProduk };
