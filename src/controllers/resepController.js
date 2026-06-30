// ============================================================
// Resep Produk Controller
// Mengelola gramasi/koefisien bahan baku per 1 pcs produk jadi.
// Data resep TIDAK di-hardcode di kode aplikasi — semuanya
// disimpan di tabel resep_produk dan dapat diubah Owner kapan
// saja lewat halaman ini, sesuai kebutuhan dapur yang berubah.
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const { catatAudit } = require('../utils/auditTrail');

async function listResep(req, res) {
  const { data: produkList, error } = await supabaseAdmin
    .from('master_produk')
    .select('*, resep_produk(*, bahan_baku:bahan_baku_id(nama_bahan, satuan))')
    .eq('is_aktif', true)
    .order('nama_produk');
  if (error) req.flash('error', 'Gagal memuat resep: ' + error.message);
  res.render('master/resep_list', { title: 'Resep Produk', produkList: produkList || [] });
}

async function formEditResep(req, res) {
  const { id } = req.params; // produk_id
  const { data: produk, error } = await supabaseAdmin
    .from('master_produk')
    .select('*, resep_produk(*, bahan_baku:bahan_baku_id(nama_bahan, satuan))')
    .eq('id', id).single();
  if (error || !produk) {
    req.flash('error', 'Produk tidak ditemukan.');
    return res.redirect('/master/resep');
  }
  const { data: bahanList } = await supabaseAdmin.from('master_bahan_baku').select('id, nama_bahan, satuan').eq('is_aktif', true).order('nama_bahan');

  res.render('master/resep_form', { title: `Resep — ${produk.nama_produk}`, produk, bahanList: bahanList || [] });
}

async function simpanResep(req, res) {
  const { id } = req.params; // produk_id
  let bahanIds = req.body.bahan_baku_id;
  let jumlahArr = req.body.jumlah_per_unit;

  try {
    if (!bahanIds) {
      // Tidak ada bahan baku diisi — kosongkan resep produk ini.
      await supabaseAdmin.from('resep_produk').delete().eq('produk_id', id);
      req.flash('success', 'Resep berhasil diperbarui (dikosongkan).');
      return res.redirect('/master/resep');
    }
    if (!Array.isArray(bahanIds)) {
      bahanIds = [bahanIds];
      jumlahArr = [jumlahArr];
    }

    const { data: resepLama } = await supabaseAdmin.from('resep_produk').select('*').eq('produk_id', id);

    // Strategi sederhana & aman: hapus semua baris resep produk ini,
    // lalu insert ulang sesuai input terbaru dari form. Resep tidak
    // punya riwayat transaksi yang perlu dijaga, jadi pendekatan ini
    // aman dan menghindari kerumitan upsert per baris.
    await supabaseAdmin.from('resep_produk').delete().eq('produk_id', id);

    const rows = bahanIds
      .map((bahanId, idx) => ({
        produk_id: id,
        bahan_baku_id: bahanId,
        jumlah_per_unit: Number(jumlahArr[idx]) || 0,
      }))
      .filter(r => r.bahan_baku_id && r.jumlah_per_unit > 0);

    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from('resep_produk').insert(rows);
      if (error) throw error;
    }

    await catatAudit({ tabel: 'resep_produk', recordId: id, aksi: 'update', dataLama: resepLama, dataBaru: rows, userId: req.session.user.id });
    req.flash('success', 'Resep berhasil diperbarui.');
    res.redirect('/master/resep');
  } catch (err) {
    req.flash('error', 'Gagal menyimpan resep: ' + err.message);
    res.redirect(`/master/resep/${id}/edit`);
  }
}

module.exports = { listResep, formEditResep, simpanResep };
