// ============================================================
// Produksi Controller
// Produksi mengikuti pesanan. Fresh yang tidak habis otomatis
// dapat dipindahkan jadi Frozen (dengan umur simpan/batch).
// Stok bahan baku otomatis berkurang sesuai resep produk.
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const { catatAudit } = require('../utils/auditTrail');
const { ubahStokBahanBaku, ubahStokProduk, konversiFreshKeFrozen } = require('../utils/stokHelper');

async function listProduksi(req, res) {
  const user = req.session.user;
  let query = supabaseAdmin
    .from('produksi')
    .select('*, cabang:cabang_id(nama), produksi_detail(*, produk:produk_id(nama_produk, satuan))')
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

    for (let i = 0; i < produkIds.length; i++) {
      const produkId = produkIds[i];
      const jumlah = Number(jumlahArr[i]);
      if (!jumlah || jumlah <= 0) continue;

      await supabaseAdmin.from('produksi_detail').insert({ produksi_id: produksi.id, produk_id: produkId, jumlah });

      // Tambah stok produk jadi
      await ubahStokProduk({
        produkId, cabangId: cabangFinal, status: status_hasil || 'fresh',
        jumlahPerubahan: jumlah, referensiTipe: 'produksi', referensiId: produksi.id,
        keterangan: `Produksi ${produksi.nomor_produksi}`, userId: user.id,
      });

      // Kurangi bahan baku sesuai resep
      const { data: resep } = await supabaseAdmin.from('resep_produk').select('*').eq('produk_id', produkId);
      for (const r of resep || []) {
        await ubahStokBahanBaku({
          bahanBakuId: r.bahan_baku_id, cabangId: cabangFinal,
          jumlahPerubahan: -(Number(r.jumlah_per_unit) * jumlah),
          referensiTipe: 'produksi', referensiId: produksi.id,
          keterangan: `Pakai bahan untuk produksi ${produksi.nomor_produksi}`, userId: user.id,
        });
      }
    }

    await catatAudit({ tabel: 'produksi', recordId: produksi.id, aksi: 'create', dataBaru: produksi, userId: user.id });
    req.flash('success', `Produksi ${produksi.nomor_produksi} berhasil dicatat.`);
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

module.exports = { listProduksi, formTambahProduksi, simpanTambahProduksi, formKonversiFrozen, simpanKonversiFrozen };
