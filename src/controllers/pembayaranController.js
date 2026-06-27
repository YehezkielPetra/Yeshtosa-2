// ============================================================
// Pembayaran Controller
// Mencatat pembayaran (cicilan/pelunasan) dari pelanggan atas
// suatu order penjualan, otomatis update status_bayar & kas.
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const { catatAudit } = require('../utils/auditTrail');
const { catatMutasiKas } = require('../utils/kasLedger');

async function listPembayaran(req, res) {
  const { data, error } = await supabaseAdmin
    .from('pembayaran')
    .select('*, penjualan:penjualan_id(nomor_order, total, status_bayar, pelanggan:pelanggan_id(nama))')
    .order('tanggal_bayar', { ascending: false })
    .limit(100);
  if (error) req.flash('error', 'Gagal memuat pembayaran: ' + error.message);
  res.render('pembayaran/list', { title: 'Pembayaran', pembayaranList: data || [] });
}

async function formTambahPembayaran(req, res) {
  const user = req.session.user;
  let query = supabaseAdmin
    .from('penjualan')
    .select('id, nomor_order, total, total_dibayar, status_bayar, pelanggan:pelanggan_id(nama)')
    .neq('status_bayar', 'lunas')
    .order('tanggal_order', { ascending: false });
  if (user.role !== 'owner') query = query.eq('cabang_id', user.cabangId);

  const { data: penjualanBelumLunas } = await query;
  res.render('pembayaran/form', { title: 'Catat Pembayaran', penjualanBelumLunas: penjualanBelumLunas || [], penjualanTerpilih: req.query.penjualan_id || '' });
}

async function simpanTambahPembayaran(req, res) {
  const { penjualan_id, jumlah_bayar, metode, catatan } = req.body;
  const user = req.session.user;

  try {
    const { data: penjualan, error: errPenjualan } = await supabaseAdmin.from('penjualan').select('*').eq('id', penjualan_id).single();
    if (errPenjualan || !penjualan) throw new Error('Order penjualan tidak ditemukan');

    const jumlah = Number(jumlah_bayar);
    if (!jumlah || jumlah <= 0) throw new Error('Jumlah pembayaran tidak valid');

    const sisaTagihan = Number(penjualan.total) - Number(penjualan.total_dibayar);
    if (jumlah > sisaTagihan + 0.01) {
      throw new Error(`Jumlah pembayaran (${jumlah}) melebihi sisa tagihan (${sisaTagihan})`);
    }

    const { data: pembayaran, error: errInsert } = await supabaseAdmin
      .from('pembayaran')
      .insert({ penjualan_id, jumlah_bayar: jumlah, metode: metode || 'cash', catatan, dicatat_oleh: user.id })
      .select().single();
    if (errInsert) throw errInsert;

    const totalDibayarBaru = Number(penjualan.total_dibayar) + jumlah;
    const statusBayarBaru = totalDibayarBaru >= Number(penjualan.total) ? 'lunas' : 'sebagian';

    const { data: dataLama } = await supabaseAdmin.from('penjualan').select('*').eq('id', penjualan_id).single();
    const { data: penjualanUpdated } = await supabaseAdmin
      .from('penjualan')
      .update({ total_dibayar: totalDibayarBaru, status_bayar: statusBayarBaru, updated_at: new Date().toISOString() })
      .eq('id', penjualan_id).select().single();

    await catatAudit({ tabel: 'penjualan', recordId: penjualan_id, aksi: 'update', dataLama, dataBaru: penjualanUpdated, userId: user.id });

    await catatMutasiKas({
      cabangId: penjualan.cabang_id, jenis: 'pembayaran_masuk', jumlah,
      referensiTipe: 'pembayaran', referensiId: pembayaran.id,
      keterangan: `Pembayaran ${pembayaran.nomor_pembayaran} untuk order ${penjualan.nomor_order}`,
      userId: user.id,
    });

    req.flash('success', `Pembayaran ${pembayaran.nomor_pembayaran} berhasil dicatat.`);
    res.redirect(`/penjualan/${penjualan_id}`);
  } catch (err) {
    req.flash('error', 'Gagal mencatat pembayaran: ' + err.message);
    res.redirect('/pembayaran/tambah');
  }
}

module.exports = { listPembayaran, formTambahPembayaran, simpanTambahPembayaran };
