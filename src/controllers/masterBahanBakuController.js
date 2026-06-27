// ============================================================
// Master Bahan Baku Controller
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const { catatAudit } = require('../utils/auditTrail');

async function listBahanBaku(req, res) {
  const { data, error } = await supabaseAdmin.from('master_bahan_baku').select('*').order('nama_bahan');
  if (error) req.flash('error', 'Gagal memuat bahan baku: ' + error.message);
  res.render('master/bahan_baku_list', { title: 'Master Bahan Baku', bahanList: data || [] });
}

function formTambahBahanBaku(req, res) {
  res.render('master/bahan_baku_form', { title: 'Tambah Bahan Baku', bahan: null });
}

async function simpanTambahBahanBaku(req, res) {
  const { kode_bahan, nama_bahan, satuan, stok_minimum } = req.body;
  try {
    const { data, error } = await supabaseAdmin
      .from('master_bahan_baku')
      .insert({ kode_bahan, nama_bahan, satuan, stok_minimum: stok_minimum || 0 })
      .select().single();
    if (error) throw error;
    await catatAudit({ tabel: 'master_bahan_baku', recordId: data.id, aksi: 'create', dataBaru: data, userId: req.session.user.id });
    req.flash('success', 'Bahan baku berhasil ditambahkan.');
    res.redirect('/master/bahan-baku');
  } catch (err) {
    req.flash('error', 'Gagal menambah bahan baku: ' + err.message);
    res.redirect('/master/bahan-baku/tambah');
  }
}

async function formEditBahanBaku(req, res) {
  const { data, error } = await supabaseAdmin.from('master_bahan_baku').select('*').eq('id', req.params.id).single();
  if (error || !data) {
    req.flash('error', 'Bahan baku tidak ditemukan.');
    return res.redirect('/master/bahan-baku');
  }
  res.render('master/bahan_baku_form', { title: 'Edit Bahan Baku', bahan: data });
}

async function simpanEditBahanBaku(req, res) {
  const { id } = req.params;
  const { kode_bahan, nama_bahan, satuan, stok_minimum, is_aktif } = req.body;
  try {
    const { data: dataLama } = await supabaseAdmin.from('master_bahan_baku').select('*').eq('id', id).single();
    const { data, error } = await supabaseAdmin
      .from('master_bahan_baku')
      .update({ kode_bahan, nama_bahan, satuan, stok_minimum: stok_minimum || 0, is_aktif: is_aktif === 'on' })
      .eq('id', id).select().single();
    if (error) throw error;
    await catatAudit({ tabel: 'master_bahan_baku', recordId: id, aksi: 'update', dataLama, dataBaru: data, userId: req.session.user.id });
    req.flash('success', 'Bahan baku berhasil diperbarui.');
    res.redirect('/master/bahan-baku');
  } catch (err) {
    req.flash('error', 'Gagal memperbarui bahan baku: ' + err.message);
    res.redirect(`/master/bahan-baku/${id}/edit`);
  }
}

module.exports = { listBahanBaku, formTambahBahanBaku, simpanTambahBahanBaku, formEditBahanBaku, simpanEditBahanBaku };
