// ============================================================
// Master Diskon Controller
// Berbeda dari Master Promo: Diskon dapat dibuat dan dikelola
// oleh Owner MAUPUN Admin. Diskon diterapkan PER PRODUK pada
// baris item transaksi penjualan (bukan di level total nota).
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const { catatAudit } = require('../utils/auditTrail');

async function listDiskon(req, res) {
  const { data, error } = await supabaseAdmin
    .from('master_diskon')
    .select('*, user:dibuat_oleh(nama)')
    .order('created_at', { ascending: false });
  if (error) req.flash('error', 'Gagal memuat diskon: ' + error.message);
  res.render('master/diskon_list', { title: 'Master Diskon', diskonList: data || [] });
}

function formTambahDiskon(req, res) {
  res.render('master/diskon_form', { title: 'Tambah Diskon', diskon: null });
}

async function simpanTambahDiskon(req, res) {
  const { nama_diskon, bentuk_diskon, nilai, is_aktif } = req.body;
  try {
    let nilaiFinal = Number(nilai) || 0;
    if (bentuk_diskon === 'persen') {
      nilaiFinal = Math.min(100, Math.max(0, nilaiFinal));
    }

    const { data, error } = await supabaseAdmin
      .from('master_diskon')
      .insert({
        nama_diskon,
        bentuk_diskon: bentuk_diskon || 'flat',
        nilai: nilaiFinal,
        is_aktif: is_aktif === 'on',
        dibuat_oleh: req.session.user.id,
      })
      .select().single();
    if (error) throw error;

    await catatAudit({ tabel: 'master_diskon', recordId: data.id, aksi: 'create', dataBaru: data, userId: req.session.user.id });
    req.flash('success', 'Diskon berhasil ditambahkan.');
    res.redirect('/master/diskon');
  } catch (err) {
    req.flash('error', 'Gagal menambah diskon: ' + err.message);
    res.redirect('/master/diskon/tambah');
  }
}

async function formEditDiskon(req, res) {
  const { data, error } = await supabaseAdmin.from('master_diskon').select('*').eq('id', req.params.id).single();
  if (error || !data) {
    req.flash('error', 'Diskon tidak ditemukan.');
    return res.redirect('/master/diskon');
  }
  res.render('master/diskon_form', { title: 'Edit Diskon', diskon: data });
}

async function simpanEditDiskon(req, res) {
  const { id } = req.params;
  const { nama_diskon, bentuk_diskon, nilai, is_aktif } = req.body;
  try {
    let nilaiFinal = Number(nilai) || 0;
    if (bentuk_diskon === 'persen') {
      nilaiFinal = Math.min(100, Math.max(0, nilaiFinal));
    }

    const { data: dataLama } = await supabaseAdmin.from('master_diskon').select('*').eq('id', id).single();
    const { data, error } = await supabaseAdmin
      .from('master_diskon')
      .update({
        nama_diskon,
        bentuk_diskon: bentuk_diskon || 'flat',
        nilai: nilaiFinal,
        is_aktif: is_aktif === 'on',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id).select().single();
    if (error) throw error;

    await catatAudit({ tabel: 'master_diskon', recordId: id, aksi: 'update', dataLama, dataBaru: data, userId: req.session.user.id });
    req.flash('success', 'Diskon berhasil diperbarui.');
    res.redirect('/master/diskon');
  } catch (err) {
    req.flash('error', 'Gagal memperbarui diskon: ' + err.message);
    res.redirect(`/master/diskon/${id}/edit`);
  }
}

async function hapusDiskon(req, res) {
  const { id } = req.params;
  try {
    const { data: dataLama } = await supabaseAdmin.from('master_diskon').select('*').eq('id', id).single();
    const { error } = await supabaseAdmin.from('master_diskon').delete().eq('id', id);
    if (error) throw error;
    await catatAudit({ tabel: 'master_diskon', recordId: id, aksi: 'delete', dataLama, userId: req.session.user.id });
    req.flash('success', 'Diskon berhasil dihapus.');
  } catch (err) {
    req.flash('error', 'Gagal menghapus diskon: ' + err.message);
  }
  res.redirect('/master/diskon');
}

module.exports = { listDiskon, formTambahDiskon, simpanTambahDiskon, formEditDiskon, simpanEditDiskon, hapusDiskon };
