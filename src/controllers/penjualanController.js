// ============================================================
// Penjualan Controller
// Admin cukup pilih pelanggan, produk, jumlah, status produk
// (Fresh/Frozen), metode (Diambil/Dikirim), status bayar.
// Sistem otomatis hitung harga, promo, diskon, subtotal, total,
// status bayar & ongkir. Ongkir dipisah dari omzet.
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const { catatAudit } = require('../utils/auditTrail');
const { catatMutasiKas } = require('../utils/kasLedger');
const { ubahStokProduk } = require('../utils/stokHelper');

async function listPenjualan(req, res) {
  const user = req.session.user;
  const { status_bayar, tanggal } = req.query;

  let query = supabaseAdmin
    .from('penjualan')
    .select('*, pelanggan:pelanggan_id(nama, kategori), cabang:cabang_id(nama)')
    .order('tanggal_order', { ascending: false })
    .limit(100);

  if (user.role !== 'owner') query = query.eq('cabang_id', user.cabangId);
  if (status_bayar) query = query.eq('status_bayar', status_bayar);
  if (tanggal) query = query.gte('tanggal_order', `${tanggal}T00:00:00`).lte('tanggal_order', `${tanggal}T23:59:59`);

  const { data, error } = await query;
  if (error) req.flash('error', 'Gagal memuat penjualan: ' + error.message);

  res.render('penjualan/list', { title: 'Penjualan', penjualanList: data || [], filterStatusBayar: status_bayar || '', filterTanggal: tanggal || '' });
}

async function formTambahPenjualan(req, res) {
  const user = req.session.user;
  const { data: pelangganList } = await supabaseAdmin.from('master_pelanggan').select('id, nomor_pelanggan, nama, kategori').eq('is_aktif', true).order('nama');
  const { data: produkList } = await supabaseAdmin.from('master_produk').select('*').eq('is_aktif', true).order('nama_produk');
  const { data: promoList } = await supabaseAdmin.from('master_promo').select('*').eq('is_aktif', true);

  // Stok tersedia per produk (Fresh & Frozen) di cabang user
  const cabangId = user.role === 'owner' ? (req.query.cabang_id || user.cabangId) : user.cabangId;
  const { data: stokList } = await supabaseAdmin.from('stok_produk').select('produk_id, status, jumlah').eq('cabang_id', cabangId);

  res.render('penjualan/form', {
    title: 'Tambah Penjualan', penjualan: null, detailList: [],
    pelangganList: pelangganList || [], produkList: produkList || [],
    promoList: promoList || [], stokList: stokList || [], cabangId,
  });
}

function hargaUntukKategori(produk, kategori) {
  if (kategori === 'reseller' && produk.harga_jual_reseller) return Number(produk.harga_jual_reseller);
  if (kategori === 'stock_point' && produk.harga_jual_stock_point) return Number(produk.harga_jual_stock_point);
  return Number(produk.harga_jual_default);
}

async function simpanTambahPenjualan(req, res) {
  const user = req.session.user;
  const {
    pelanggan_id, cabang_id, status_produk, metode_ambil_kirim,
    status_bayar, total_dibayar, promo_id, diskon_nominal,
    status_ongkir, ongkir_estimasi, ongkir_aktual, ongkir_dibayar_oleh, catatan,
  } = req.body;

  let produkIds = req.body.produk_id;
  let jumlahArr = req.body.jumlah;
  if (!produkIds) {
    req.flash('error', 'Minimal 1 produk harus dipilih.');
    return res.redirect('/penjualan/tambah');
  }
  if (!Array.isArray(produkIds)) {
    produkIds = [produkIds];
    jumlahArr = [jumlahArr];
  }

  const cabangFinal = cabang_id || user.cabangId;

  try {
    // Ambil data pelanggan untuk tentukan harga sesuai kategori
    const { data: pelanggan, error: errPelanggan } = await supabaseAdmin
      .from('master_pelanggan').select('*').eq('id', pelanggan_id).single();
    if (errPelanggan || !pelanggan) throw new Error('Pelanggan tidak ditemukan');

    // Ambil data produk yang dipilih
    const { data: produkData, error: errProduk } = await supabaseAdmin
      .from('master_produk').select('*').in('id', produkIds);
    if (errProduk) throw errProduk;
    const produkMap = new Map(produkData.map(p => [p.id, p]));

    // Hitung subtotal per item & total keseluruhan
    let subtotalKeseluruhan = 0;
    const detailRows = [];
    for (let i = 0; i < produkIds.length; i++) {
      const produk = produkMap.get(produkIds[i]);
      if (!produk) continue;
      const jumlah = Number(jumlahArr[i]);
      if (!jumlah || jumlah <= 0) continue;
      const hargaSatuan = hargaUntukKategori(produk, pelanggan.kategori);
      const subtotalItem = hargaSatuan * jumlah;
      subtotalKeseluruhan += subtotalItem;
      detailRows.push({ produk_id: produk.id, jumlah, harga_satuan: hargaSatuan, diskon_nominal: 0, subtotal: subtotalItem });
    }

    if (detailRows.length === 0) throw new Error('Tidak ada item produk yang valid.');

    // Terapkan promo (jika ada) di atas subtotal keseluruhan
    let diskonTotal = Number(diskon_nominal) || 0;
    if (promo_id) {
      const { data: promo } = await supabaseAdmin.from('master_promo').select('*').eq('id', promo_id).single();
      if (promo) {
        diskonTotal += promo.tipe === 'persen' ? (subtotalKeseluruhan * Number(promo.nilai) / 100) : Number(promo.nilai);
      }
    }

    const totalAkhir = Math.max(0, subtotalKeseluruhan - diskonTotal);
    const dibayar = Number(total_dibayar) || 0;
    let statusBayarFinal = status_bayar || 'belum_bayar';
    if (dibayar >= totalAkhir && totalAkhir > 0) statusBayarFinal = 'lunas';
    else if (dibayar > 0 && dibayar < totalAkhir) statusBayarFinal = 'sebagian';

    // Simpan header penjualan
    const { data: penjualan, error: errInsert } = await supabaseAdmin
      .from('penjualan')
      .insert({
        cabang_id: cabangFinal,
        pelanggan_id,
        status_produk: status_produk || 'fresh',
        metode_ambil_kirim: metode_ambil_kirim || 'diambil',
        subtotal: subtotalKeseluruhan,
        diskon_nominal: diskonTotal,
        promo_id: promo_id || null,
        total: totalAkhir,
        status_bayar: statusBayarFinal,
        total_dibayar: dibayar,
        status_ongkir: status_ongkir || 'belum_diketahui',
        ongkir_estimasi: ongkir_estimasi || 0,
        ongkir_aktual: ongkir_aktual || 0,
        ongkir_dibayar_oleh: ongkir_dibayar_oleh || 'pelanggan',
        catatan,
        dibuat_oleh: user.id,
      })
      .select().single();
    if (errInsert) throw errInsert;

    // Simpan detail
    const detailToInsert = detailRows.map(d => ({ ...d, penjualan_id: penjualan.id }));
    const { error: errDetail } = await supabaseAdmin.from('penjualan_detail').insert(detailToInsert);
    if (errDetail) throw errDetail;

    // Kurangi stok produk sesuai status Fresh/Frozen
    for (const d of detailRows) {
      await ubahStokProduk({
        produkId: d.produk_id, cabangId: cabangFinal, status: status_produk || 'fresh',
        jumlahPerubahan: -d.jumlah, referensiTipe: 'penjualan', referensiId: penjualan.id,
        keterangan: `Penjualan ${penjualan.nomor_order}`, userId: user.id,
      });
    }

    // Catat ke kas ledger jika ada pembayaran masuk
    if (dibayar > 0) {
      await catatMutasiKas({
        cabangId: cabangFinal, jenis: 'penjualan', jumlah: dibayar,
        referensiTipe: 'penjualan', referensiId: penjualan.id,
        keterangan: `Pembayaran awal penjualan ${penjualan.nomor_order}`, userId: user.id,
      });
    }

    // Ongkir yang sudah dibayar dicatat terpisah dari omzet
    if (status_ongkir === 'sudah_dibayar' && Number(ongkir_aktual) > 0 && ongkir_dibayar_oleh === 'pelanggan') {
      await catatMutasiKas({
        cabangId: cabangFinal, jenis: 'ongkir', jumlah: Number(ongkir_aktual),
        referensiTipe: 'penjualan', referensiId: penjualan.id,
        keterangan: `Ongkir penjualan ${penjualan.nomor_order} (terpisah dari omzet)`, userId: user.id,
      });
    }

    await catatAudit({ tabel: 'penjualan', recordId: penjualan.id, aksi: 'create', dataBaru: penjualan, userId: user.id });
    req.flash('success', `Penjualan ${penjualan.nomor_order} berhasil disimpan.`);
    res.redirect('/penjualan');
  } catch (err) {
    console.error('[penjualan create] error:', err.message);
    req.flash('error', 'Gagal menyimpan penjualan: ' + err.message);
    res.redirect('/penjualan/tambah');
  }
}

async function detailPenjualan(req, res) {
  const { id } = req.params;
  const { data: penjualan, error } = await supabaseAdmin
    .from('penjualan')
    .select('*, pelanggan:pelanggan_id(*), cabang:cabang_id(nama), penjualan_detail(*, produk:produk_id(nama_produk, satuan))')
    .eq('id', id).single();
  if (error || !penjualan) {
    req.flash('error', 'Penjualan tidak ditemukan.');
    return res.redirect('/penjualan');
  }
  const { data: pembayaranList } = await supabaseAdmin
    .from('pembayaran').select('*, user:dicatat_oleh(nama)').eq('penjualan_id', id).order('tanggal_bayar', { ascending: false });

  res.render('penjualan/detail', { title: `Detail ${penjualan.nomor_order}`, penjualan, pembayaranList: pembayaranList || [] });
}

async function tandaiSelesai(req, res) {
  const { id } = req.params;
  try {
    const { data: dataLama } = await supabaseAdmin.from('penjualan').select('*').eq('id', id).single();
    const { data, error } = await supabaseAdmin.from('penjualan').update({ is_selesai: true, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    await catatAudit({ tabel: 'penjualan', recordId: id, aksi: 'update', dataLama, dataBaru: data, userId: req.session.user.id });
    req.flash('success', 'Order ditandai selesai.');
  } catch (err) {
    req.flash('error', 'Gagal menandai selesai: ' + err.message);
  }
  res.redirect(`/penjualan/${id}`);
}

module.exports = { listPenjualan, formTambahPenjualan, simpanTambahPenjualan, detailPenjualan, tandaiSelesai };
