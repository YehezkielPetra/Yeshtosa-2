// ============================================================
// Resep Produk Controller (Berbasis Batch)
// Mengelola takaran bahan baku per batch adonan (Beras / Ikan)
// beserta target hasil pcs gogos yang diperoleh dari batch tersebut.
// Data ini disimpan dinamis untuk mengotomatisasi pemotongan stok produksi.
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
  const { data: bahanList } = await supabaseAdmin
    .from('master_bahan_baku')
    .select('id, nama_bahan, satuan')
    .eq('is_aktif', true)
    .order('nama_bahan');

  res.render('master/resep_form', { title: `Resep — ${produk.nama_produk}`, produk, bahanList: bahanList || [] });
}

async function simpanResep(req, res) {
  const { id } = req.params; // produk_id
  let bahanIds = req.body.bahan_baku_id;
  let jumlahBatchArr = req.body.jumlah_per_batch;
  let targetHasilArr = req.body.target_hasil_pcs;

  try {
    if (!bahanIds) {
      // Tidak ada bahan baku diisi — kosongkan resep produk ini.
      await supabaseAdmin.from('resep_produk').delete().eq('produk_id', id);
      req.flash('success', 'Resep berhasil diperbarui (dikosongkan).');
      return res.redirect('/master/resep');
    }
    if (!Array.isArray(bahanIds)) {
      bahanIds = [bahanIds];
      jumlahBatchArr = [jumlahBatchArr];
      targetHasilArr = [targetHasilArr];
    }

    const { data: resepLama } = await supabaseAdmin.from('resep_produk').select('*').eq('produk_id', id);

    // Hapus resep lama, ganti dengan struktur data batch terbaru
    await supabaseAdmin.from('resep_produk').delete().eq('produk_id', id);

    const rows = bahanIds
      .map((bahanId, idx) => {
        const jmlBatch = Number(jumlahBatchArr[idx]) || 0;
        const targetHasil = Number(targetHasilArr[idx]) || 1;
        
        // Agar sistem harian tetap bekerja presisi tanpa membongkar total core database,
        // kita simpan nilai konversi per unit (jumlah_per_unit) = jumlah_per_batch / target_hasil_pcs
        const kgPerPcs = jmlBatch / targetHasil;

        return {
          produk_id: id,
          bahan_baku_id: bahanId,
          jumlah_per_batch: jmlBatch,
          target_hasil_pcs: targetHasil,
          jumlah_per_unit: kgPerPcs // Tetap isi untuk kompatibilitas core stok otomatis harian
        };
      })
      .filter(r => r.bahan_baku_id && r.jumlah_per_batch > 0);

    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from('resep_produk').insert(rows);
      if (error) throw error;
    }

    await catatAudit({ tabel: 'resep_produk', recordId: id, aksi: 'update', dataLama: resepLama, dataBaru: rows, userId: req.session.user.id });
    req.flash('success', 'Resep berbasis Batch berhasil diperbarui.');
    res.redirect('/master/resep');
  } catch (err) {
    req.flash('error', 'Gagal menyimpan resep: ' + err.message);
    res.redirect(`/master/resep/${id}/edit`);
  }
}

module.exports = { listResep, formEditResep, simpanResep };