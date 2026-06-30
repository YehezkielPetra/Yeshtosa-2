// ============================================================
// Produksi Controller
// Produksi mengikuti pesanan. Fresh yang tidak habis otomatis
// dapat dipindahkan jadi Frozen (dengan umur simpan/batch).
// Stok bahan baku otomatis berkurang sesuai resep produk.
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const { catatAudit } = require('../utils/auditTrail');
const { ubahStokBahanBaku, ubahStokProduk, konversiFreshKeFrozen } = require('../utils/stokHelper');

/**
 * Mengambil harga beli terakhir termurah/terbaru untuk satu bahan baku
 * dari relasi supplier_bahan_baku. Jika bahan baku dipasok beberapa
 * supplier, dipakai nilai yang paling baru diperbarui (updated_at).
 */
async function ambilHargaBeliTerakhir(bahanBakuId) {
  const { data } = await supabaseAdmin
    .from('supplier_bahan_baku')
    .select('harga_beli_terakhir, updated_at')
    .eq('bahan_baku_id', bahanBakuId)
    .not('harga_beli_terakhir', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? Number(data.harga_beli_terakhir) : 0;
}

/**
 * Memproses satu baris item produksi (1 produk + jumlah pcs):
 * - insert ke produksi_detail
 * - tambah stok produk jadi (Fresh/Frozen)
 * - loop SEMUA bahan baku di resep produk ini (resep_produk),
 *   kurangi stok masing-masing secara proporsional terhadap jumlah
 *   pcs yang dicetak, dan akumulasi nilai Rupiah-nya berdasarkan
 *   harga_beli_terakhir dari supplier_bahan_baku (untuk HPP).
 * - Produk yang resepnya tidak mencantumkan suatu bahan (misal
 *   Gogos Tanpa Isi tanpa Ikan Tuna/Bawang Merah) otomatis TIDAK
 *   memotong bahan itu, karena loop hanya berjalan atas baris
 *   resep yang benar-benar ada di database untuk produk tersebut.
 *
 * Mengembalikan total biaya bahan (Rupiah) untuk baris item ini,
 * supaya bisa diakumulasikan ke total_biaya_bahan pada header produksi.
 */
async function prosesItemProduksi({ produksiId, produkId, jumlah, cabangId, statusHasil, nomorProduksi, userId, keteranganSuffix = '' }) {
  await supabaseAdmin.from('produksi_detail').insert({ produksi_id: produksiId, produk_id: produkId, jumlah });

  await ubahStokProduk({
    produkId, cabangId, status: statusHasil,
    jumlahPerubahan: jumlah, referensiTipe: 'produksi', referensiId: produksiId,
    keterangan: `Produksi ${nomorProduksi}${keteranganSuffix}`, userId,
  });

  const { data: resep } = await supabaseAdmin.from('resep_produk').select('*').eq('produk_id', produkId);

  let biayaBahanBarisIni = 0;
  for (const r of resep || []) {
    const jumlahBahanTerpakai = Number(r.jumlah_per_unit) * jumlah;

    await ubahStokBahanBaku({
      bahanBakuId: r.bahan_baku_id, cabangId,
      jumlahPerubahan: -jumlahBahanTerpakai,
      referensiTipe: 'produksi', referensiId: produksiId,
      keterangan: `Pakai bahan untuk produksi ${nomorProduksi}${keteranganSuffix}`, userId,
    });

    const hargaTerakhir = await ambilHargaBeliTerakhir(r.bahan_baku_id);
    biayaBahanBarisIni += jumlahBahanTerpakai * hargaTerakhir;
  }

  return biayaBahanBarisIni;
}

async function listProduksi(req, res) {
  const user = req.session.user;
  // select('*', ...) otomatis menyertakan kolom total_biaya_bahan (HPP)
  // yang baru ditambahkan ke tabel produksi.
  let query = supabaseAdmin
    .from('produksi')
    .select('*, cabang:cabang_id(nama), produksi_detail(*, produk:produk_id(nama_produk, satuan))')
    .eq('is_dibatalkan', false)
    .order('tanggal_produksi', { ascending: false })
    .limit(100);
  if (user.role !== 'owner') query = query.eq('cabang_id', user.cabangId);

  const { data, error } = await query;
  if (error) req.flash('error', 'Gagal memuat data produksi: ' + error.message);
  res.render('produksi/list', { title: 'Produksi', produksiList: data || [] });
}

async function formTambahProduksi(req, res) {
  const { data: produkList } = await supabaseAdmin.from('master_produk').select('*').eq('is_aktif', true).order('nama_produk');

  // Pesanan yang belum selesai bisa dijadikan referensi produksi
  const user = req.session.user;
  let queryPesanan = supabaseAdmin
    .from('penjualan')
    .select('id, nomor_order, status_produk, pelanggan:pelanggan_id(nama)')
    .eq('is_selesai', false)
    .order('tanggal_order', { ascending: false });
  if (user.role !== 'owner') queryPesanan = queryPesanan.eq('cabang_id', user.cabangId);
  const { data: pesananList } = await queryPesanan;

  res.render('produksi/form', { title: 'Catat Produksi', produkList: produkList || [], pesananList: pesananList || [] });
}

async function simpanTambahProduksi(req, res) {
  const user = req.session.user;
  const { cabang_id, tanggal_produksi, status_hasil, pesanan_terkait_id, catatan } = req.body;
  let produkIds = req.body.produk_id;
  let jumlahArr = req.body.jumlah;

  if (!produkIds) {
    req.flash('error', 'Minimal 1 produk harus diisi.');
    return res.redirect('/produksi/tambah');
  }
  if (!Array.isArray(produkIds)) {
    produkIds = [produkIds];
    jumlahArr = [jumlahArr];
  }

  const cabangFinal = cabang_id || user.cabangId;

  try {
    const { data: produksi, error: errInsert } = await supabaseAdmin
      .from('produksi')
      .insert({
        cabang_id: cabangFinal,
        tanggal_produksi: tanggal_produksi || new Date().toISOString().slice(0, 10),
        status_hasil: status_hasil || 'fresh',
        pesanan_terkait_id: pesanan_terkait_id || null,
        catatan,
        dibuat_oleh: user.id,
      })
      .select().single();
    if (errInsert) throw errInsert;

    // Loop semua item (bisa multi-ukuran dalam satu sesi produksi,
    // misal Besar=10, Sedang=14, Kecil=18, Tanpa Isi=24 sekaligus).
    // Setiap item memotong SEMUA bahan baku sesuai resepnya masing-
    // masing dan akumulasi nilai Rupiah-nya untuk HPP produksi.
    let totalBiayaBahan = 0;
    for (let i = 0; i < produkIds.length; i++) {
      const produkId = produkIds[i];
      const jumlah = Number(jumlahArr[i]);
      if (!jumlah || jumlah <= 0) continue;

      const biayaBarisIni = await prosesItemProduksi({
        produksiId: produksi.id, produkId, jumlah,
        cabangId: cabangFinal, statusHasil: status_hasil || 'fresh',
        nomorProduksi: produksi.nomor_produksi, userId: user.id,
      });
      totalBiayaBahan += biayaBarisIni;
    }

    // Simpan akumulasi total biaya bahan (HPP) ke header produksi.
    await supabaseAdmin.from('produksi').update({ total_biaya_bahan: totalBiayaBahan }).eq('id', produksi.id);

    await catatAudit({ tabel: 'produksi', recordId: produksi.id, aksi: 'create', dataBaru: { ...produksi, total_biaya_bahan: totalBiayaBahan }, userId: user.id });
    req.flash('success', `Produksi ${produksi.nomor_produksi} berhasil dicatat. Total biaya bahan: Rp${Math.round(totalBiayaBahan).toLocaleString('id-ID')}.`);
    res.redirect('/produksi');
  } catch (err) {
    console.error('[produksi create] error:', err.message);
    req.flash('error', 'Gagal mencatat produksi: ' + err.message);
    res.redirect('/produksi/tambah');
  }
}

// --- Konversi Fresh yang tidak habis menjadi Frozen ---
async function formKonversiFrozen(req, res) {
  const user = req.session.user;
  const cabangId = user.cabangId;
  const { data: stokFresh } = await supabaseAdmin
    .from('stok_produk')
    .select('*, produk:produk_id(nama_produk, satuan, umur_simpan_frozen_hari)')
    .eq('cabang_id', cabangId).eq('status', 'fresh').gt('jumlah', 0);
  res.render('produksi/konversi_frozen', { title: 'Konversi Fresh ke Frozen', stokFresh: stokFresh || [] });
}

async function simpanKonversiFrozen(req, res) {
  const user = req.session.user;
  const { produk_id, jumlah, umur_simpan_frozen_hari } = req.body;
  try {
    await konversiFreshKeFrozen({
      produkId: produk_id, cabangId: user.cabangId, jumlah: Number(jumlah),
      umurSimpanHari: umur_simpan_frozen_hari || 30, userId: user.id,
    });
    req.flash('success', 'Stok Fresh berhasil dikonversi menjadi Frozen.');
    res.redirect('/produksi/konversi-frozen');
  } catch (err) {
    req.flash('error', 'Gagal melakukan konversi: ' + err.message);
    res.redirect('/produksi/konversi-frozen');
  }
}

// --- Edit Produksi ---
async function formEditProduksi(req, res) {
  const { id } = req.params;
  const { data: produksi, error } = await supabaseAdmin
    .from('produksi')
    .select('*, produksi_detail(*, produk:produk_id(nama_produk, satuan))')
    .eq('id', id).single();
  if (error || !produksi) {
    req.flash('error', 'Data produksi tidak ditemukan.');
    return res.redirect('/produksi');
  }
  if (produksi.is_dibatalkan) {
    req.flash('error', 'Produksi yang sudah dibatalkan tidak dapat diedit.');
    return res.redirect('/produksi');
  }

  const { data: produkList } = await supabaseAdmin.from('master_produk').select('*').eq('is_aktif', true).order('nama_produk');
  const user = req.session.user;
  let queryPesanan = supabaseAdmin
    .from('penjualan')
    .select('id, nomor_order, status_produk, pelanggan:pelanggan_id(nama)')
    .eq('is_selesai', false)
    .order('tanggal_order', { ascending: false });
  if (user.role !== 'owner') queryPesanan = queryPesanan.eq('cabang_id', user.cabangId);
  const { data: pesananList } = await queryPesanan;

  res.render('produksi/form', {
    title: 'Edit Produksi', produksi, produkList: produkList || [], pesananList: pesananList || [],
  });
}

/**
 * Membalik semua mutasi stok (produk jadi & bahan baku) dari satu produksi.
 * Dipakai saat edit (sebelum menerapkan data baru) maupun saat pembatalan.
 */
async function balikkanMutasiProduksi(produksi, user) {
  const { data: detailLama } = await supabaseAdmin
    .from('produksi_detail').select('*').eq('produksi_id', produksi.id);

  for (const d of detailLama || []) {
    // Kembalikan stok produk jadi (kurangi sejumlah yang dulu ditambahkan)
    await ubahStokProduk({
      produkId: d.produk_id, cabangId: produksi.cabang_id, status: produksi.status_hasil,
      jumlahPerubahan: -Number(d.jumlah), referensiTipe: 'koreksi_produksi', referensiId: produksi.id,
      keterangan: `Pembalikan stok karena edit/batal produksi ${produksi.nomor_produksi}`, userId: user.id,
      izinkanStokNegatif: true
    });

    // Kembalikan bahan baku yang dulu terpakai (tambahkan kembali)
    const { data: resep } = await supabaseAdmin.from('resep_produk').select('*').eq('produk_id', d.produk_id);
    for (const r of resep || []) {
      await ubahStokBahanBaku({
        bahanBakuId: r.bahan_baku_id, cabangId: produksi.cabang_id,
        jumlahPerubahan: Number(r.jumlah_per_unit) * Number(d.jumlah),
        referensiTipe: 'koreksi_produksi', referensiId: produksi.id,
        keterangan: `Pembalikan bahan baku karena edit/batal produksi ${produksi.nomor_produksi}`, userId: user.id,
      });
    }
  }

  // Hapus detail lama agar bisa diisi ulang dengan data baru (khusus untuk edit)
  await supabaseAdmin.from('produksi_detail').delete().eq('produksi_id', produksi.id);
}

async function simpanEditProduksi(req, res) {
  const { id } = req.params;
  const user = req.session.user;
  const { tanggal_produksi, status_hasil, pesanan_terkait_id, catatan } = req.body;
  let produkIds = req.body.produk_id;
  let jumlahArr = req.body.jumlah;

  if (!produkIds) {
    req.flash('error', 'Minimal 1 produk harus diisi.');
    return res.redirect(`/produksi/${id}/edit`);
  }
  if (!Array.isArray(produkIds)) {
    produkIds = [produkIds];
    jumlahArr = [jumlahArr];
  }

  try {
    const { data: produksiLama, error: errLama } = await supabaseAdmin.from('produksi').select('*').eq('id', id).single();
    if (errLama || !produksiLama) throw new Error('Data produksi tidak ditemukan');
    if (produksiLama.is_dibatalkan) throw new Error('Produksi yang sudah dibatalkan tidak dapat diedit');

    // 1. Balikkan dulu seluruh mutasi stok dari versi lama
    await balikkanMutasiProduksi(produksiLama, user);

    // 2. Update header produksi
    const { data: produksiBaru, error: errUpdate } = await supabaseAdmin
      .from('produksi')
      .update({
        tanggal_produksi: tanggal_produksi || produksiLama.tanggal_produksi,
        status_hasil: status_hasil || produksiLama.status_hasil,
        pesanan_terkait_id: pesanan_terkait_id || null,
        catatan,
      })
      .eq('id', id).select().single();
    if (errUpdate) throw errUpdate;

    // 3. Terapkan mutasi stok baru sesuai item yang diisi ulang,
    //    sekaligus hitung ulang total biaya bahan (HPP) dari awal.
    let totalBiayaBahan = 0;
    for (let i = 0; i < produkIds.length; i++) {
      const produkId = produkIds[i];
      const jumlah = Number(jumlahArr[i]);
      if (!jumlah || jumlah <= 0) continue;

      const biayaBarisIni = await prosesItemProduksi({
        produksiId: id, produkId, jumlah,
        cabangId: produksiBaru.cabang_id, statusHasil: produksiBaru.status_hasil,
        nomorProduksi: produksiBaru.nomor_produksi, userId: user.id,
        keteranganSuffix: ' (hasil edit)',
      });
      totalBiayaBahan += biayaBarisIni;
    }

    await supabaseAdmin.from('produksi').update({ total_biaya_bahan: totalBiayaBahan }).eq('id', id);

    await catatAudit({ tabel: 'produksi', recordId: id, aksi: 'update', dataLama: produksiLama, dataBaru: { ...produksiBaru, total_biaya_bahan: totalBiayaBahan }, userId: user.id });
    req.flash('success', `Produksi ${produksiBaru.nomor_produksi} berhasil diperbarui.`);
    res.redirect('/produksi');
  } catch (err) {
    console.error('[produksi edit] error:', err.message);
    req.flash('error', 'Gagal memperbarui produksi: ' + err.message);
    res.redirect(`/produksi/${id}/edit`);
  }
}

// --- Batalkan Produksi (soft-delete, stok otomatis dikembalikan) ---
async function batalkanProduksi(req, res) {
  const { id } = req.params;
  const { alasan } = req.body;
  const user = req.session.user;

  try {
    const { data: produksi, error: errFind } = await supabaseAdmin.from('produksi').select('*').eq('id', id).single();
    if (errFind || !produksi) throw new Error('Data produksi tidak ditemukan');
    if (produksi.is_dibatalkan) throw new Error('Produksi ini sudah dibatalkan sebelumnya');

    // Kembalikan seluruh stok yang terpengaruh
    await balikkanMutasiProduksi(produksi, user);

    const { data: produksiUpdated, error: errUpdate } = await supabaseAdmin
      .from('produksi')
      .update({
        is_dibatalkan: true,
        dibatalkan_oleh: user.id,
        dibatalkan_pada: new Date().toISOString(),
        alasan_pembatalan: alasan || null,
      })
      .eq('id', id).select().single();
    if (errUpdate) throw errUpdate;

    await catatAudit({ tabel: 'produksi', recordId: id, aksi: 'update', dataLama: produksi, dataBaru: produksiUpdated, userId: user.id });
    req.flash('success', `Produksi ${produksi.nomor_produksi} berhasil dibatalkan dan stok telah dikembalikan.`);
    res.redirect('/produksi');
  } catch (err) {
    req.flash('error', 'Gagal membatalkan produksi: ' + err.message);
    res.redirect('/produksi');
  }
}

module.exports = {
  listProduksi, formTambahProduksi, simpanTambahProduksi, formKonversiFrozen, simpanKonversiFrozen,
  formEditProduksi, simpanEditProduksi, batalkanProduksi,
};
