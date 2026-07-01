// ============================================================
// Resep Produk Controller (Berbasis Batch)
// Mengelola takaran bahan baku per batch adonan (Beras / Ikan)
// beserta target hasil pcs gogos yang diperoleh dari batch tersebut.
// Data ini disimpan dinamis untuk mengotomatisasi pemotongan stok produksi.
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const { catatAudit } = require('../utils/auditTrail');

// ============================================================
// PERBAIKAN: Tambahkan tipe_blok ke dalam select queries
// ============================================================

async function listResep(req, res) {
  // Tambahkan tipe_blok di dalam relasi resep_produk(*)
  const { data: produkList, error } = await supabaseAdmin
    .from('master_produk')
    .select('*, resep_produk(id, produk_id, bahan_baku_id, jumlah_per_batch, target_hasil_pcs, jumlah_per_unit, tipe_blok, bahan_baku:bahan_baku_id(nama_bahan, satuan))')
    .eq('is_aktif', true)
    .order('nama_produk');
  if (error) req.flash('error', 'Gagal memuat resep: ' + error.message);
  res.render('master/resep_list', { title: 'Resep Produk', produkList: produkList || [] });
}

async function formEditResep(req, res) {
  const { id } = req.params; // produk_id
  
  // 1. Ambil data produk yang sedang diedit beserta resepnya (Kodingan Anda)
  const { data: produk, error } = await supabaseAdmin
    .from('master_produk')
    .select('*, resep_produk(id, produk_id, bahan_baku_id, jumlah_per_batch, target_hasil_pcs, jumlah_per_unit, tipe_blok, bahan_baku:bahan_baku_id(nama_bahan, satuan))')
    .eq('id', id)
    .single();
    
  if (error || !produk) {
    req.flash('error', 'Produk tidak ditemukan.');
    return res.redirect('/master/resep');
  }

  // 2. KUNCI UTAMA: Ambil daftar semua produk aktif untuk mengisi dropdown salin resep di EJS
  const { data: produkList } = await supabaseAdmin
    .from('master_produk')
    .select('id, nama_produk')
    .eq('is_aktif', true)
    .order('nama_produk');
  
  // 3. Ambil data master bahan baku untuk pilihan select option (Kodingan Anda)
  const { data: bahanList } = await supabaseAdmin
    .from('master_bahan_baku')
    .select('id, nama_bahan, satuan')
    .eq('is_aktif', true)
    .order('nama_bahan');

  // 4. Kirimkan produkList ke halaman EJS agar perulangan di dropdown tidak crash
  res.render('master/resep_form', { 
    title: `Resep — ${produk.nama_produk}`, 
    produk, 
    bahanList: bahanList || [] ,
    produkList: produkList || [] // <-- DISISIPKAN DI SINI
  });
}

async function simpanResep(req, res) {
  const { id } = req.params; // produk_id
  let bahanIds = req.body.bahan_baku_id;
  let jumlahBatchArr = req.body.jumlah_per_batch;
  let targetHasilArr = req.body.target_hasil_pcs;
  let tipeBlokArr = req.body.tipe_blok; // <-- TANGKAP INPUT BARU DARI EJS

  try {
    if (!bahanIds) {
      // Tidak ada bahan baku diisi — kosongkan resep produk ini.
      await supabaseAdmin.from('resep_produk').delete().eq('produk_id', id);
      req.flash('success', 'Resep berhasil diperbarui (dikosongkan).');
      return res.redirect('/master/resep');
    }

    // Normalisasi semua input menjadi Array jika hanya ada 1 baris yang diinput
    if (!Array.isArray(bahanIds)) {
      bahanIds = [bahanIds];
      jumlahBatchArr = [jumlahBatchArr];
      targetHasilArr = [targetHasilArr];
      tipeBlokArr = [tipeBlokArr]; // <-- Ikut dinormalisasi
    }

    const { data: resepLama } = await supabaseAdmin.from('resep_produk').select('*').eq('produk_id', id);

    // Hapus resep lama, ganti dengan struktur data batch terbaru
    await supabaseAdmin.from('resep_produk').delete().eq('produk_id', id);

    const rows = bahanIds
      .map((bahanId, idx) => {
        const jmlBatch = Number(jumlahBatchArr[idx]) || 0;
        const targetHasil = Number(targetHasilArr[idx]) || 1;
        const tipeBlok = tipeBlokArr[idx] || 'nasi'; // <-- Ambil nilai tipe_blok ('nasi' / 'ikan')
        
        // Perhitungan nilai konversi untuk core stok otomatis harian
        const kgPerPcs = jmlBatch / targetHasil;

        return {
          produk_id: id,
          bahan_baku_id: bahanId,
          jumlah_per_batch: jmlBatch,
          target_hasil_pcs: targetHasil,
          jumlah_per_unit: kgPerPcs,
          tipe_blok: tipeBlok // <-- MASUKKAN KE OBJEK INSERT SUPABASE
        };
      })
      .filter(r => r.bahan_baku_id && r.jumlah_per_batch > 0);

    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from('resep_produk').insert(rows);
      if (error) throw error;
    }

    // Catat riwayat perubahan ke Audit Trail
    await catatAudit({ 
      tabel: 'resep_produk', 
      recordId: id, 
      aksi: 'update', 
      dataLama: resepLama, 
      dataBaru: rows, 
      userId: req.session.user.id 
    });

    req.flash('success', 'Resep berbasis Batch berhasil diperbarui.');
    res.redirect('/master/resep');
  } catch (err) {
    req.flash('error', 'Gagal menyimpan resep: ' + err.message);
    res.redirect(`/master/resep/${id}/edit`);
  }
}

async function apiGetResepDetail(req, res) {
  const { id } = req.params; // produk_id asal yang mau dikopi
  
  try {
    const { data: resep, error } = await supabaseAdmin
      .from('resep_produk')
      .select(`
        id, 
        bahan_baku_id, 
        jumlah_per_batch, 
        target_hasil_pcs, 
        jumlah_per_unit, 
        tipe_blok, 
        bahan_baku:master_bahan_baku(nama_bahan, satuan)
      `) // <-- PERBAIKAN: Mengubah nama join dari bahan_baku_id menjadi master_bahan_baku
      .eq('produk_id', id);

    if (error) throw error;

    return res.json({ success: true, resep: resep || [] });
  } catch (err) {
    console.error('[API Get Resep Error]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { listResep, formEditResep, simpanResep, apiGetResepDetail };