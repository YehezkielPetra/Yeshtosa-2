// ============================================================
// Pengeluaran Controller
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const { catatAudit } = require('../utils/auditTrail');
const { catatMutasiKas } = require('../utils/kasLedger');

async function listPengeluaran(req, res) {
  const user = req.session.user;
  let query = supabaseAdmin
    .from('pengeluaran')
    .select('*, kategori:kategori_id(nama), cabang:cabang_id(nama)')
    .order('tanggal', { ascending: false })
    .limit(100);
  if (user.role !== 'owner') query = query.eq('cabang_id', user.cabangId);

  const { data, error } = await query;
  if (error) req.flash('error', 'Gagal memuat pengeluaran: ' + error.message);
  res.render('pengeluaran/list', { title: 'Pengeluaran', pengeluaranList: data || [] });
}

async function formTambahPengeluaran(req, res) {
  const { data: kategoriList } = await supabaseAdmin.from('master_kategori_pengeluaran').select('*').eq('is_aktif', true).order('nama');
  res.render('pengeluaran/form', { title: 'Tambah Pengeluaran', kategoriList: kategoriList || [] });
}

async function simpanTambahPengeluaran(req, res) {
  const user = req.session.user;
  const { cabang_id, kategori_id, jumlah, tanggal, keterangan } = req.body;
  const cabangFinal = cabang_id || user.cabangId;

  try {
    const { data: pengeluaran, error } = await supabaseAdmin
      .from('pengeluaran')
      .insert({
        cabang_id: cabangFinal, kategori_id: kategori_id || null, jumlah: Number(jumlah),
        tanggal: tanggal ? new Date(tanggal).toISOString() : new Date().toISOString(),
        keterangan, dicatat_oleh: user.id,
      })
      .select().single();
    if (error) throw error;

    await catatMutasiKas({
      cabangId: cabangFinal, jenis: 'pengeluaran', jumlah: -Number(jumlah),
      referensiTipe: 'pengeluaran', referensiId: pengeluaran.id,
      keterangan: `Pengeluaran ${pengeluaran.nomor_pengeluaran}: ${keterangan || ''}`, userId: user.id,
    });

    await catatAudit({ tabel: 'pengeluaran', recordId: pengeluaran.id, aksi: 'create', dataBaru: pengeluaran, userId: user.id });
    req.flash('success', `Pengeluaran ${pengeluaran.nomor_pengeluaran} berhasil dicatat.`);
    res.redirect('/pengeluaran');
  } catch (err) {
    req.flash('error', 'Gagal mencatat pengeluaran: ' + err.message);
    res.redirect('/pengeluaran/tambah');
  }
}

module.exports = { listPengeluaran, formTambahPengeluaran, simpanTambahPengeluaran };
