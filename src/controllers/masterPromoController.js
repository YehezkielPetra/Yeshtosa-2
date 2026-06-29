// ============================================================
// Master Promo Controller (v2)
// Dua jenis promo: potongan_akhir (memotong total akhir nota)
// dan potongan_ongkir (memotong biaya pengiriman). Masing-masing
// bisa berbentuk flat (nominal Rupiah) atau persen. Hanya Owner
// yang dapat mengelola promo.
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const { catatAudit } = require('../utils/auditTrail');

async function listPromo(req, res) {
  const { data, error } = await supabaseAdmin
    .from('master_promo_v2')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) req.flash('error', 'Gagal memuat promo: ' + error.message);
  res.render('master/promo_list', { title: 'Master Promo', promoList: data || [] });
}

function formTambahPromo(req, res) {
  res.render('master/promo_form', { title: 'Tambah Promo', promo: null });
}

async function simpanTambahPromo(req, res) {
  const { nama_promo, tipe_promo, bentuk_potongan, nominal_potongan, is_aktif } = req.body;
  try {
    let nilai = Number(nominal_potongan) || 0;
    if (bentuk_potongan === 'persen') {
      nilai = Math.min(100, Math.max(0, nilai)); // clamp 0-100
    }

    const { data, error } = await supabaseAdmin
      .from('master_promo_v2')
      .insert({
        nama_promo,
        tipe_promo,
        bentuk_potongan: bentuk_potongan || 'flat',
        nominal_potongan: nilai,
        is_aktif: is_aktif === 'on',
      })
      .select().single();
    if (error) throw error;

    await catatAudit({ tabel: 'master_promo_v2', recordId: data.id, aksi: 'create', dataBaru: data, userId: req.session.user.id });
    req.flash('success', 'Promo berhasil ditambahkan.');
    res.redirect('/master/promo');
  } catch (err) {
    req.flash('error', 'Gagal menambah promo: ' + err.message);
    res.redirect('/master/promo/tambah');
  }
}

async function formEditPromo(req, res) {
  const { data, error } = await supabaseAdmin.from('master_promo_v2').select('*').eq('id', req.params.id).single();
  if (error || !data) {
    req.flash('error', 'Promo tidak ditemukan.');
    return res.redirect('/master/promo');
  }
  res.render('master/promo_form', { title: 'Edit Promo', promo: data });
}

async function simpanEditPromo(req, res) {
  const { id } = req.params;
  const { nama_promo, tipe_promo, bentuk_potongan, nominal_potongan, is_aktif } = req.body;
  try {
    let nilai = Number(nominal_potongan) || 0;
    if (bentuk_potongan === 'persen') {
      nilai = Math.min(100, Math.max(0, nilai));
    }

    const { data: dataLama } = await supabaseAdmin.from('master_promo_v2').select('*').eq('id', id).single();
    const { data, error } = await supabaseAdmin
      .from('master_promo_v2')
      .update({
        nama_promo, tipe_promo,
        bentuk_potongan: bentuk_potongan || 'flat',
        nominal_potongan: nilai,
        is_aktif: is_aktif === 'on',
      })
      .eq('id', id).select().single();
    if (error) throw error;

    await catatAudit({ tabel: 'master_promo_v2', recordId: id, aksi: 'update', dataLama, dataBaru: data, userId: req.session.user.id });
    req.flash('success', 'Promo berhasil diperbarui.');
    res.redirect('/master/promo');
  } catch (err) {
    req.flash('error', 'Gagal memperbarui promo: ' + err.message);
    res.redirect(`/master/promo/${id}/edit`);
  }
}

module.exports = { listPromo, formTambahPromo, simpanTambahPromo, formEditPromo, simpanEditPromo };
