// ============================================================
// Penjualan Controller
// Admin cukup pilih pelanggan, produk, jumlah, status produk
// (Fresh/Frozen), metode (Diambil/Dikirim), status bayar.
// Sistem otomatis hitung harga, diskon PER ITEM, promo (potongan
// akhir nota / potongan ongkir), subtotal, total, status bayar.
// Ongkir dipisah dari omzet.
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const { catatAudit } = require('../utils/auditTrail');
const { catatMutasiKas } = require('../utils/kasLedger');
const { ubahStokProduk } = require('../utils/stokHelper');

/**
 * Membalikkan (mengembalikan) mutasi stok produk akibat proses edit penjualan.
 * Stok yang dulu sempat dikurangi akan ditambahkan kembali secara otomatis.
 */
async function balikkanMutasiStokPenjualan(penjualanLama, user) {
  // Ambil detail item produk dari penjualan lama
  const { data: detailLama, error: errDetail } = await supabaseAdmin
    .from('penjualan_detail')
    .select('*')
    .eq('penjualan_id', penjualanLama.id);

  if (errDetail) throw errDetail;

  for (const d of detailLama || []) {
    // Karena penjualan sifatnya MENGURANGI stok (negatif), 
    // maka untuk membalikkannya kita harus MENAMBAHKAN kembali jumlahnya (positif)
    await ubahStokProduk({
      produkId: d.produk_id,
      cabangId: penjualanLama.cabang_id,
      status: penjualanLama.status_produk, // 'fresh' atau 'frozen'
      jumlahPerubahan: Number(d.jumlah), // Nilai positif untuk mengembalikan stok
      referensiTipe: 'koreksi_penjualan',
      referensiId: penjualanLama.id,
      keterangan: `Pembalikan stok karena edit transaksi penjualan ${penjualanLama.nomor_order}`,
      userId: user.id,
      izinkanStokNegatif: true
    });
  }
}

async function listPenjualan(req, res) {
  const user = req.session.user;
  const { status_bayar, tanggal } = req.query;

  // Mendapatkan rentang waktu Waktu Lokal Hari Ini (00:00:00 s.d 23:59:59)
  const tzOffset = new Date().getTimezoneOffset() * 60000;
  const hariIniMulai = new Date(new Date().setHours(0,0,0,0) - tzOffset).toISOString().split('T')[0] + 'T00:00:00.000Z';
  const hariIniSelesai = new Date(new Date().setHours(23,59,59,999) - tzOffset).toISOString().split('T')[0] + 'T23:59:59.999Z';

  try {
    // -----------------------------------------------------------------
    // QUERIES 1: Hanya mengambil penjualan HARI INI (Ditambahkan relasi detail)
    // -----------------------------------------------------------------
    let queryHariIni = supabaseAdmin
      .from('penjualan')
      .select('id, nomor_order, tanggal_order, tanggal_kirim, status_produk, total, status_bayar, is_selesai, pelanggan:pelanggan_id(nama, kategori), cabang:cabang_id(nama), penjualan_detail(jumlah, produk:produk_id(nama_produk))')
      .gte('tanggal_order', hariIniMulai)
      .lte('tanggal_order', hariIniSelesai)
      .order('tanggal_order', { ascending: false });

    if (user.role !== 'owner') queryHariIni = queryHariIni.eq('cabang_id', user.cabangId);
    const { data: penjualanHariIni } = await queryHariIni;

    // -----------------------------------------------------------------
    // QUERIES 2: Mengambil data Riwayat (Ditambahkan relasi detail)
    // -----------------------------------------------------------------
    let queryRiwayat = supabaseAdmin
      .from('penjualan')
      .select('id, nomor_order, tanggal_order, tanggal_kirim, status_produk, total, status_bayar, is_selesai, pelanggan:pelanggan_id(nama, kategori), cabang:cabang_id(nama), penjualan_detail(jumlah, produk:produk_id(nama_produk))')
      .order('tanggal_order', { ascending: false })
      .limit(100);

    if (user.role !== 'owner') queryRiwayat = queryRiwayat.eq('cabang_id', user.cabangId);
    if (status_bayar) queryRiwayat = queryRiwayat.eq('status_bayar', status_bayar);
    
    if (tanggal) {
      const mulai = `${tanggal}T00:00:00.000Z`;
      const selesai = `${tanggal}T23:59:59.999Z`;
      queryRiwayat = queryRiwayat.gte('tanggal_order', mulai).lte('tanggal_order', selesai);
    }

    const { data: penjualanRiwayat, error: errRiwayat } = await queryRiwayat;
    if (errRiwayat) throw errRiwayat;

    res.render('penjualan/list', { 
      title: 'Penjualan', 
      penjualanHariIni: penjualanHariIni || [], 
      penjualanRiwayat: penjualanRiwayat || [], 
      filterStatusBayar: status_bayar || '', 
      filterTanggal: tanggal || '' 
    });

  } catch (error) {
    req.flash('error', 'Gagal memuat data penjualan: ' + error.message);
    res.render('penjualan/list', { 
      title: 'Penjualan', 
      penjualanHariIni: [], 
      penjualanRiwayat: [], 
      filterStatusBayar: '', 
      filterTanggal: '' 
    });
  }
}

async function formTambahPenjualan(req, res) {
  const user = req.session.user;
  const { data: pelangganList } = await supabaseAdmin.from('master_pelanggan').select('id, nomor_pelanggan, nama, kategori').eq('is_aktif', true).order('nama');
  const { data: produkList } = await supabaseAdmin.from('master_produk').select('*').eq('is_aktif', true).order('nama_produk');

  const { data: promoData } = await supabaseAdmin.from('master_promo_v2').select('*').eq('is_aktif', true);
  const promoAkhirList = (promoData || []).filter(p => p.tipe_promo === 'potongan_akhir');
  const promoOngkirList = (promoData || []).filter(p => p.tipe_promo === 'potongan_ongkir');

  const cabangId = user.role === 'owner' ? (req.query.cabang_id || user.cabangId) : user.cabangId;
  const { data: stokList } = await supabaseAdmin.from('stok_produk').select('produk_id, status, jumlah').eq('cabang_id', cabangId);

  let pelangganListFinal = pelangganList || [];
  const { pelanggan_baru_id } = req.query;
  if (pelanggan_baru_id && !pelangganListFinal.some(p => p.id === pelanggan_baru_id)) {
    const { data: pelangganBaru } = await supabaseAdmin
      .from('master_pelanggan').select('id, nomor_pelanggan, nama, kategori').eq('id', pelanggan_baru_id).maybeSingle();
    if (pelangganBaru) pelangganListFinal = [pelangganBaru, ...pelangganListFinal];
  }

  res.render('penjualan/form', {
    title: 'Tambah Penjualan', penjualan: null, detailList: [],
    pelangganList: pelangganListFinal, produkList: produkList || [],
    promoAkhirList: promoAkhirList || [], promoOngkirList: promoOngkirList || [],
    stokList: stokList || [], cabangId,
    pelangganBaruId: pelanggan_baru_id || '',
  });
}

async function cekStokPenjualan(req, res) {
  const { items, status_produk, cabang_id } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.json({ kurang: [] });
  }

  const produkIds = items.map(i => i.produk_id).filter(Boolean);
  const { data: stokData } = await supabaseAdmin
    .from('stok_produk')
    .select('produk_id, jumlah')
    .eq('cabang_id', cabang_id)
    .eq('status', status_produk || 'fresh')
    .in('produk_id', produkIds);

  const { data: produkData } = await supabaseAdmin
    .from('master_produk').select('id, nama_produk').in('id', produkIds);
  const namaMap = new Map((produkData || []).map(p => [p.id, p.nama_produk]));

  const stokMap = new Map((stokData || []).map(s => [s.produk_id, Number(s.jumlah)]));
  const kurang = [];
  for (const item of items) {
    const tersedia = stokMap.get(item.produk_id) || 0;
    const diminta = Number(item.jumlah) || 0;
    if (diminta > tersedia) {
      kurang.push({
        produk_id: item.produk_id,
        nama_produk: namaMap.get(item.produk_id) || 'Produk',
        tersedia,
        diminta,
        kekurangan: diminta - tersedia,
      });
    }
  }

  res.json({ kurang });
}

function hargaUntukKategori(produk, kategori) {
  if (kategori === 'reseller' && produk.harga_jual_reseller) return Number(produk.harga_jual_reseller);
  if (kategori === 'stock_point' && produk.harga_jual_stock_point) return Number(produk.harga_jual_stock_point);
  return Number(produk.harga_jual_default);
}

function susunDetailRows(body, produkMap, kategoriPelanggan) {
  let produkIds = body.produk_id;
  let jumlahArr = body.jumlah;
  let diskonBentukArr = body.diskon_bentuk;
  let diskonNilaiArr = body.diskon_nilai;

  if (!produkIds) return [];
  if (!Array.isArray(produkIds)) {
    produkIds = [produkIds];
    jumlahArr = [jumlahArr];
    diskonBentukArr = [diskonBentukArr];
    diskonNilaiArr = [diskonNilaiArr];
  }

  const detailRows = [];
  for (let i = 0; i < produkIds.length; i++) {
    const produk = produkMap.get(produkIds[i]);
    if (!produk) continue;
    const jumlah = Number(jumlahArr[i]);
    if (!jumlah || jumlah <= 0) continue;

    const hargaSatuan = hargaUntukKategori(produk, kategoriPelanggan);
    const bentukDiskon = diskonBentukArr ? diskonBentukArr[i] : 'flat';
    const nilaiDiskon = Number(diskonNilaiArr ? diskonNilaiArr[i] : 0) || 0;

    let diskonPerSatuan = 0;
    if (nilaiDiskon > 0) {
      diskonPerSatuan = bentukDiskon === 'persen'
        ? (hargaSatuan * Math.min(100, nilaiDiskon)) / 100
        : nilaiDiskon;
    }

    const hargaSetelahDiskon = Math.max(0, hargaSatuan - diskonPerSatuan);
    const subtotalItem = hargaSetelahDiskon * jumlah;

    detailRows.push({
      produk_id: produk.id,
      jumlah,
      harga_satuan: hargaSatuan,
      diskon_nominal: diskonPerSatuan,
      subtotal: subtotalItem,
    });
  }
  return detailRows;
}

function hitungPotonganPromo(promo, basis) {
  if (!promo) return 0;
  if (promo.bentuk_potongan === 'persen') {
    const persen = Math.min(100, Math.max(0, Number(promo.nominal_potongan)));
    return (Number(basis) * persen) / 100;
  }
  return Number(promo.nominal_potongan) || 0;
}

async function simpanTambahPenjualan(req, res) {
  const user = req.session.user;
  const {
    pelanggan_id, cabang_id, status_produk, metode_ambil_kirim,
    status_bayar, total_dibayar,
    promo_v2_id, promo_ongkir_id,
    status_ongkir, ongkir_estimasi, ongkir_aktual, ongkir_dibayar_oleh, catatan,
    tanggal_order, tanggal_kirim, jam_kirim, konfirmasi_stok_kurang,
  } = req.body;

  if (!req.body.produk_id) {
    req.flash('error', 'Minimal 1 produk harus dipilih.');
    return res.redirect('/penjualan/tambah');
  }

  const cabangFinal = cabang_id || user.cabangId;
  const izinkanStokNegatif = (user.role === 'owner') || (konfirmasi_stok_kurang === '1');

  try {
    const { data: pelanggan, error: errPelanggan } = await supabaseAdmin
      .from('master_pelanggan').select('*').eq('id', pelanggan_id).single();
    if (errPelanggan || !pelanggan) throw new Error('Pelanggan tidak ditemukan');

    let produkIdsForQuery = req.body.produk_id;
    if (!Array.isArray(produkIdsForQuery)) produkIdsForQuery = [produkIdsForQuery];
    const { data: produkData, error: errProduk } = await supabaseAdmin
      .from('master_produk').select('*').in('id', produkIdsForQuery);
    if (errProduk) throw errProduk;
    const produkMap = new Map(produkData.map(p => [p.id, p]));

    const detailRows = susunDetailRows(req.body, produkMap, pelanggan.kategori);
    if (detailRows.length === 0) throw new Error('Tidak ada item produk yang valid.');

    const subtotalKeseluruhan = detailRows.reduce((s, d) => s + (d.harga_satuan * d.jumlah), 0);
    const totalDiskonItem = detailRows.reduce((s, d) => s + (d.diskon_nominal * d.jumlah), 0);
    let totalSetelahDiskonItem = detailRows.reduce((s, d) => s + d.subtotal, 0);

    let potonganAkhir = 0;
    if (promo_v2_id) {
      const { data: promo } = await supabaseAdmin.from('master_promo_v2').select('*').eq('id', promo_v2_id).eq('tipe_promo', 'potongan_akhir').maybeSingle();
      potonganAkhir = hitungPotonganPromo(promo, totalSetelahDiskonItem);
    }

    const totalAkhir = Math.max(0, totalSetelahDiskonItem - potonganAkhir);

    let potonganOngkir = 0;
    if (promo_ongkir_id) {
      const { data: promo } = await supabaseAdmin.from('master_promo_v2').select('*').eq('id', promo_ongkir_id).eq('tipe_promo', 'potongan_ongkir').maybeSingle();
      potonganOngkir = hitungPotonganPromo(promo, Number(ongkir_aktual) || 0);
    }
    const ongkirAktualSetelahPotongan = Math.max(0, (Number(ongkir_aktual) || 0) - potonganOngkir);

    const dibayar = Number(total_dibayar) || 0;
    let statusBayarFinal = status_bayar || 'belum_bayar';
    if (dibayar >= totalAkhir && totalAkhir > 0) statusBayarFinal = 'lunas';
    else if (dibayar > 0 && dibayar < totalAkhir) statusBayarFinal = 'sebagian';

    const { data: penjualan, error: errInsert } = await supabaseAdmin
      .from('penjualan')
      .insert({
        cabang_id: cabangFinal,
        pelanggan_id,
        tanggal_order: tanggal_order ? new Date(tanggal_order).toISOString() : new Date().toISOString(),
        status_produk: status_produk || 'fresh',
        metode_ambil_kirim: metode_ambil_kirim || 'diambil',
        
        // PERBAIKAN: Langsung simpan nilai tanggal & jam tanpa peduli apa metodenya
        tanggal_kirim: tanggal_kirim ? tanggal_kirim : null,
        jam_kirim: jam_kirim ? jam_kirim : null,
        
        subtotal: subtotalKeseluruhan,
        diskon_nominal: totalDiskonItem + potonganAkhir,
        promo_v2_id: promo_v2_id || null,
        promo_ongkir_id: promo_ongkir_id || null,
        total: totalAkhir,
        status_bayar: statusBayarFinal,
        total_dibayar: dibayar,
        status_ongkir: status_ongkir || 'belum_diketahui',
        ongkir_estimasi: ongkir_estimasi || 0,
        ongkir_aktual: ongkirAktualSetelahPotongan,
        ongkir_dibayar_oleh: ongkir_dibayar_oleh || 'pelanggan',
        catatan,
        dibuat_oleh: user.id,
      })
      .select().single();
    if (errInsert) throw errInsert;

    const detailToInsert = detailRows.map(d => ({ ...d, penjualan_id: penjualan.id }));
    const { error: errDetail } = await supabaseAdmin.from('penjualan_detail').insert(detailToInsert);
    if (errDetail) throw errDetail;

    for (const d of detailRows) {
      await ubahStokProduk({
        produkId: d.produk_id, cabangId: cabangFinal, status: status_produk || 'fresh',
        jumlahPerubahan: -d.jumlah, referensiTipe: 'penjualan', referensiId: penjualan.id,
        keterangan: `Penjualan ${penjualan.nomor_order}`, userId: user.id,
        izinkanStokNegatif,
      });
    }

    if (dibayar > 0) {
      await catatMutasiKas({
        cabangId: cabangFinal, jenis: 'penjualan', jumlah: dibayar,
        referensiTipe: 'penjualan', referensiId: penjualan.id,
        keterangan: `Pembayaran awal penjualan ${penjualan.nomor_order}`, userId: user.id,
      });
    }

    if (status_ongkir === 'sudah_dibayar' && ongkirAktualSetelahPotongan > 0 && ongkir_dibayar_oleh === 'pelanggan') {
      await catatMutasiKas({
        cabangId: cabangFinal, jenis: 'ongkir', jumlah: ongkirAktualSetelahPotongan,
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

async function formEditPenjualan(req, res) {
  const { id } = req.params;
  const user = req.session.user;

  const { data: penjualan, error } = await supabaseAdmin
    .from('penjualan')
    .select('*, pelanggan:pelanggan_id(nama, kategori), penjualan_detail(*, produk:produk_id(nama_produk, satuan))')
    .eq('id', id).single();
  if (error || !penjualan) {
    req.flash('error', 'Penjualan tidak ditemukan.');
    return res.redirect('/penjualan');
  }

  const { data: pelangganList } = await supabaseAdmin.from('master_pelanggan').select('id, nomor_pelanggan, nama, kategori').eq('is_aktif', true).order('nama');
  const { data: produkList } = await supabaseAdmin.from('master_produk').select('*').eq('is_aktif', true).order('nama_produk');
  const { data: promoData } = await supabaseAdmin.from('master_promo_v2').select('*').eq('is_aktif', true);
  const promoAkhirList = (promoData || []).filter(p => p.tipe_promo === 'potongan_akhir');
  const promoOngkirList = (promoData || []).filter(p => p.tipe_promo === 'potongan_ongkir');
  const { data: stokList } = await supabaseAdmin.from('stok_produk').select('produk_id, status, jumlah').eq('cabang_id', penjualan.cabang_id);

  res.render('penjualan/form', {
    title: 'Edit Penjualan', penjualan,
    pelangganList: pelangganList || [], produkList: produkList || [],
    promoAkhirList: promoAkhirList || [], promoOngkirList: promoOngkirList || [],
    stokList: stokList || [], cabangId: penjualan.cabang_id,
    pelangganBaruId: '', isEdit: true, isAdminPengajuan: user.role === 'admin',
  });
}

async function simpanEditPenjualan(req, res) {
  const { id } = req.params;
  const user = req.session.user;
  const {
    pelanggan_id, status_produk, metode_ambil_kirim,
    status_bayar, total_dibayar, promo_v2_id, promo_ongkir_id,
    status_ongkir, ongkir_estimasi, ongkir_aktual, ongkir_dibayar_oleh, catatan,
    tanggal_order, tanggal_kirim, jam_kirim, alasan_perubahan,
  } = req.body;

  try {
    const { data: penjualanLama, error: errLama } = await supabaseAdmin
      .from('penjualan')
      .select('*, penjualan_detail(*)')
      .eq('id', id).single();
    if (errLama || !penjualanLama) throw new Error('Penjualan tidak ditemukan');

    const { data: pelanggan } = await supabaseAdmin.from('master_pelanggan').select('*').eq('id', pelanggan_id).single();

    let produkIdsForQuery = req.body.produk_id;
    if (!Array.isArray(produkIdsForQuery)) produkIdsForQuery = [produkIdsForQuery];
    const { data: produkData } = await supabaseAdmin.from('master_produk').select('*').in('id', produkIdsForQuery);
    const produkMap = new Map((produkData || []).map(p => [p.id, p]));

    const detailRows = susunDetailRows(req.body, produkMap, pelanggan ? pelanggan.kategori : 'konsumen');
    const subtotalKeseluruhan = detailRows.reduce((s, d) => s + (d.harga_satuan * d.jumlah), 0);
    const totalDiskonItem = detailRows.reduce((s, d) => s + (d.diskon_nominal * d.jumlah), 0);
    const totalSetelahDiskonItem = detailRows.reduce((s, d) => s + d.subtotal, 0);

    let potonganAkhir = 0;
    if (promo_v2_id) {
      const { data: promo } = await supabaseAdmin.from('master_promo_v2').select('*').eq('id', promo_v2_id).eq('tipe_promo', 'potongan_akhir').maybeSingle();
      potonganAkhir = hitungPotonganPromo(promo, totalSetelahDiskonItem);
    }
    const totalAkhir = Math.max(0, totalSetelahDiskonItem - potonganAkhir);

    let potonganOngkir = 0;
    if (promo_ongkir_id) {
      const { data: promo } = await supabaseAdmin.from('master_promo_v2').select('*').eq('id', promo_ongkir_id).eq('tipe_promo', 'potongan_ongkir').maybeSingle();
      potonganOngkir = hitungPotonganPromo(promo, Number(ongkir_aktual) || 0);
    }
    const ongkirAktualSetelahPotongan = Math.max(0, (Number(ongkir_aktual) || 0) - potonganOngkir);

    const dibayar = Number(total_dibayar) || 0;
    let statusBayarFinal = status_bayar || 'belum_bayar';
    if (dibayar >= totalAkhir && totalAkhir > 0) statusBayarFinal = 'lunas';
    else if (dibayar > 0 && dibayar < totalAkhir) statusBayarFinal = 'sebagian';

    const dataHeaderBaru = {
      pelanggan_id,
      tanggal_order: tanggal_order ? new Date(tanggal_order).toISOString() : penjualanLama.tanggal_order,
      status_produk: status_produk || 'fresh',
      metode_ambil_kirim: metode_ambil_kirim || 'diambil',
      
      // PERBAIKAN: Selalu perbarui nilai tanggal & jam kirim/ambil dari formulir
      tanggal_kirim: tanggal_kirim ? tanggal_kirim : null,
      jam_kirim: jam_kirim ? jam_kirim : null,
      
      subtotal: subtotalKeseluruhan,
      diskon_nominal: totalDiskonItem + potonganAkhir,
      promo_v2_id: promo_v2_id || null,
      promo_ongkir_id: promo_ongkir_id || null,
      total: totalAkhir,
      status_bayar: statusBayarFinal,
      total_dibayar: dibayar,
      status_ongkir: status_ongkir || 'belum_diketahui',
      ongkir_estimasi: ongkir_estimasi || 0,
      ongkir_aktual: ongkirAktualSetelahPotongan,
      ongkir_dibayar_oleh: ongkir_dibayar_oleh || 'pelanggan',
      catatan,
    };

    if (user.role === 'owner') {
      // 1. Kembalikan stok lama ke gudang terlebih dahulu
      await balikkanMutasiStokPenjualan(penjualanLama, user);

      // Owner: perubahan langsung diterapkan
      const { data: penjualanBaru, error: errUpdate } = await supabaseAdmin
        .from('penjualan').update(dataHeaderBaru).eq('id', id).select().single();
      if (errUpdate) throw errUpdate;

      // Ganti seluruh detail (hapus lama, insert baru)
      await supabaseAdmin.from('penjualan_detail').delete().eq('penjualan_id', id);
      const detailToInsert = detailRows.map(d => ({ ...d, penjualan_id: id }));
      if (detailToInsert.length > 0) {
        await supabaseAdmin.from('penjualan_detail').insert(detailToInsert);
      }

      // 2. Potong stok berdasarkan item baru hasil edit Owner
      for (const d of detailRows) {
        await ubahStokProduk({
          produkId: d.produk_id, 
          cabangId: penjualanLama.cabang_id, 
          // Perbaikan Pengunci Status: Gunakan data dari header baru yang sudah divalidasi
          status: dataHeaderBaru.status_produk, 
          jumlahPerubahan: -d.jumlah, 
          referensiTipe: 'penjualan', 
          referensiId: id,
          keterangan: `Penjualan ${penjualanLama.nomor_order} (Hasil Edit Owner)`, 
          userId: user.id,
          izinkanStokNegatif: true,
        });
      }

      await catatAudit({ tabel: 'penjualan', recordId: id, aksi: 'update', dataLama: penjualanLama, dataBaru: penjualanBaru, userId: user.id });
      req.flash('success', `Penjualan ${penjualanLama.nomor_order} berhasil diperbarui.`);
      return res.redirect(`/penjualan/${id}`);
    }

    // Admin: masuk Approval Queue, tidak langsung mengubah data
    const dataBaruLengkap = { header: dataHeaderBaru, detail: detailRows };
    const dataLamaLengkap = { header: penjualanLama, detail: penjualanLama.penjualan_detail };

    const { error: errQueue } = await supabaseAdmin.from('approval_queue').insert({
      tabel_target: 'penjualan',
      record_id: id,
      jenis_perubahan: 'edit',
      data_lama: dataLamaLengkap,
      data_baru: dataBaruLengkap,
      alasan: alasan_perubahan || null,
      diajukan_oleh: user.id,
    });
    if (errQueue) throw errQueue;

    req.flash('success', 'Perubahan berhasil diajukan, menunggu persetujuan Owner.');
    res.redirect('/penjualan');
  } catch (err) {
    console.error('[penjualan edit] error:', err.message);
    req.flash('error', 'Gagal menyimpan perubahan: ' + err.message);
    res.redirect(`/penjualan/${id}/edit`);
  }
}

module.exports = {
  listPenjualan, formTambahPenjualan, simpanTambahPenjualan, detailPenjualan, tandaiSelesai,
  cekStokPenjualan, formEditPenjualan, simpanEditPenjualan, susunDetailRows,
};