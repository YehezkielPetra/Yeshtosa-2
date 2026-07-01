// ============================================================
// Pembelian Controller
// Mencatat pembelian bahan baku dari supplier. Otomatis update
// stok bahan baku, harga beli terakhir di relasi supplier, dan
// mutasi kas (jika dibayar langsung).
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const { catatAudit } = require('../utils/auditTrail');
const { catatMutasiKas } = require('../utils/kasLedger');
const { ubahStokBahanBaku } = require('../utils/stokHelper');

async function listPembelian(req, res) {
  const user = req.session.user;
  let query = supabaseAdmin
    .from('pembelian')
    .select('*, supplier:supplier_id(nama), cabang:cabang_id(nama)')
    // FIX 1: Mengubah 'tanggal_beli' menjadi nama kolom yang benar 'tanggal_pembelian'
    .order('tanggal_pembelian', { ascending: false })
    .limit(100);
  if (user.role !== 'owner') query = query.eq('cabang_id', user.cabangId);

  const { data, error } = await query;
  if (error) req.flash('error', 'Gagal memuat pembelian: ' + error.message);
  res.render('pembelian/list', { title: 'Pembelian', pembelianList: data || [] });
}

async function formTambahPembelian(req, res) {
  const { data: supplierList } = await supabaseAdmin.from('master_supplier').select('id, nomor_supplier, nama').eq('is_aktif', true).order('nama');
  const { data: bahanList } = await supabaseAdmin.from('master_bahan_baku').select('*').eq('is_aktif', true).order('nama_bahan');

  // Relasi supplier -> bahan baku yang dipasoknya (untuk filter dropdown
  // item di frontend: hanya tampilkan bahan baku milik supplier terpilih).
  const { data: supplierBahanList } = await supabaseAdmin
    .from('supplier_bahan_baku')
    .select('supplier_id, bahan_baku_id, harga_beli_terakhir');

  res.render('pembelian/form', {
    title: 'Tambah Pembelian',
    supplierList: supplierList || [],
    bahanList: bahanList || [],
    supplierBahanList: supplierBahanList || [],
  });
}

async function simpanTambahPembelian(req, res) {
  const user = req.session.user;
  const { cabang_id, supplier_id, status_bayar, total_dibayar, catatan, tanggal_pembelian } = req.body;
  let bahanIds = req.body.bahan_baku_id;
  let jumlahArr = req.body.jumlah;
  let hargaArr = req.body.harga_satuan;

  if (!bahanIds) {
    req.flash('error', 'Minimal 1 bahan baku harus diisi.');
    return res.redirect('/pembelian/tambah');
  }
  if (!Array.isArray(bahanIds)) {
    bahanIds = [bahanIds];
    jumlahArr = [jumlahArr];
    hargaArr = [hargaArr];
  }

  const cabangFinal = cabang_id || user.cabangId;

  try {
    let totalPembelian = 0;
    const detailRows = [];
    for (let i = 0; i < bahanIds.length; i++) {
      const jumlah = Number(jumlahArr[i]);
      const harga = Number(hargaArr[i]);
      if (!jumlah || jumlah <= 0) continue;
      const subtotal = jumlah * harga;
      totalPembelian += subtotal;
      detailRows.push({ bahan_baku_id: bahanIds[i], jumlah, harga_satuan: harga, subtotal });
    }
    if (detailRows.length === 0) throw new Error('Tidak ada item bahan baku yang valid.');

    const dibayar = Number(total_dibayar) || 0;
    let statusBayarFinal = status_bayar || 'belum_bayar';
    if (dibayar >= totalPembelian && totalPembelian > 0) statusBayarFinal = 'lunas';
    else if (dibayar > 0 && dibayar < totalPembelian) statusBayarFinal = 'sebagian';

    const { data: pembelian, error: errInsert } = await supabaseAdmin
      .from('pembelian')
      .insert({
        cabang_id: cabangFinal,
        supplier_id,
        tanggal_pembelian: tanggal_pembelian ? new Date(tanggal_pembelian).toISOString() : new Date().toISOString(),
        total: totalPembelian, // FIX 2: Mengubah dari 'totalAkhir' menjadi 'totalPembelian'
        status_bayar: statusBayarFinal,
        total_dibayar: dibayar,
        catatan,
        dibuat_oleh: user.id
      })
      .select().single();

    if (errInsert) throw errInsert;

    const detailToInsert = detailRows.map(d => ({ ...d, pembelian_id: pembelian.id }));
    await supabaseAdmin.from('pembelian_detail').insert(detailToInsert);

    // Tambah stok bahan baku & update harga beli terakhir
    for (const d of detailRows) {
      await ubahStokBahanBaku({
        bahanBakuId: d.bahan_baku_id, cabangId: cabangFinal, jumlahPerubahan: d.jumlah,
        referensiTipe: 'pembelian', referensiId: pembelian.id,
        keterangan: `Pembelian ${pembelian.nomor_pembelian}`, userId: user.id,
      });

      const { data: existingRelasi } = await supabaseAdmin
        .from('supplier_bahan_baku').select('*').eq('supplier_id', supplier_id).eq('bahan_baku_id', d.bahan_baku_id).maybeSingle();
      if (existingRelasi) {
        await supabaseAdmin.from('supplier_bahan_baku')
          .update({ harga_beli_terakhir: d.harga_satuan, updated_at: new Date().toISOString() })
          .eq('id', existingRelasi.id);
      } else {
        await supabaseAdmin.from('supplier_bahan_baku')
          .insert({ supplier_id, bahan_baku_id: d.bahan_baku_id, harga_beli_terakhir: d.harga_satuan });
      }
    }

    if (dibayar > 0) {
      await catatMutasiKas({
        cabangId: cabangFinal, jenis: 'pembelian', jumlah: -dibayar,
        referensiTipe: 'pembelian', referensiId: pembelian.id,
        keterangan: `Pembayaran pembelian ${pembelian.nomor_pembelian}`, userId: user.id,
      });
    }

    await catatAudit({ tabel: 'pembelian', recordId: pembelian.id, aksi: 'create', dataBaru: pembelian, userId: user.id });
    req.flash('success', `Pembelian ${pembelian.nomor_pembelian} berhasil disimpan.`);
    res.redirect('/pembelian');
  } catch (err) {
    console.error('[pembelian create] error:', err.message);
    req.flash('error', 'Gagal menyimpan pembelian: ' + err.message);
    res.redirect('/pembelian/tambah');
  }
}

async function detailPembelian(req, res) {
  const { id } = req.params;
  const { data: pembelian, error } = await supabaseAdmin
    .from('pembelian')
    .select('*, supplier:supplier_id(*), cabang:cabang_id(nama), pembelian_detail(*, bahan_baku:bahan_baku_id(nama_bahan, satuan))')
    .eq('id', id).single();
  if (error || !pembelian) {
    req.flash('error', 'Pembelian tidak ditemukan.');
    return res.redirect('/pembelian');
  }
  res.render('pembelian/detail', { title: `Detail ${pembelian.nomor_pembelian}`, pembelian });
}

async function balikkanMutasiPembelian(pembelianLama, user) {
  const { data: detailLama } = await supabaseAdmin
    .from('pembelian_detail').select('*').eq('pembelian_id', pembelianLama.id);

  for (const d of detailLama || []) {
    await ubahStokBahanBaku({
      bahanBakuId: d.bahan_baku_id, cabangId: pembelianLama.cabang_id,
      jumlahPerubahan: -Number(d.jumlah), referensiTipe: 'koreksi_pembelian', referensiId: pembelianLama.id,
      keterangan: `Pembalikan stok karena edit pembelian ${pembelianLama.nomor_pembelian}`, userId: user.id,
    });
  }

  if (Number(pembelianLama.total_dibayar) > 0) {
    await catatMutasiKas({
      cabangId: pembelianLama.cabang_id, jenis: 'penyesuaian', jumlah: Number(pembelianLama.total_dibayar),
      referensiTipe: 'koreksi_pembelian', referensiId: pembelianLama.id,
      keterangan: `Pembalikan pembayaran karena edit pembelian ${pembelianLama.nomor_pembelian}`, userId: user.id,
    });
  }

  await supabaseAdmin.from('pembelian_detail').delete().eq('pembelian_id', pembelianLama.id);
}

async function terapkanDataPembelianBaru({ pembelianId, supplierId, cabangId, headerBaru, detailRows, nomorPembelian, user, keteranganSuffix = '' }) {
  const { error: errUpdate } = await supabaseAdmin.from('pembelian').update(headerBaru).eq('id', pembelianId);
  if (errUpdate) throw errUpdate;

  const detailToInsert = detailRows.map(d => ({ ...d, pembelian_id: pembelianId }));
  if (detailToInsert.length > 0) {
    await supabaseAdmin.from('pembelian_detail').insert(detailToInsert);
  }

  for (const d of detailRows) {
    await ubahStokBahanBaku({
      bahanBakuId: d.bahan_baku_id, cabangId, jumlahPerubahan: d.jumlah,
      referensiTipe: 'pembelian', referensiId: pembelianId,
      keterangan: `Pembelian ${nomorPembelian}${keteranganSuffix}`, userId: user.id,
    });

    const { data: existingRelasi } = await supabaseAdmin
      .from('supplier_bahan_baku').select('*').eq('supplier_id', supplierId).eq('bahan_baku_id', d.bahan_baku_id).maybeSingle();
    if (existingRelasi) {
      await supabaseAdmin.from('supplier_bahan_baku')
        .update({ harga_beli_terakhir: d.harga_satuan, updated_at: new Date().toISOString() })
        .eq('id', existingRelasi.id);
    } else {
      await supabaseAdmin.from('supplier_bahan_baku')
        .insert({ supplier_id: supplierId, bahan_baku_id: d.bahan_baku_id, harga_beli_terakhir: d.harga_satuan });
    }
  }

  if (Number(headerBaru.total_dibayar) > 0) {
    await catatMutasiKas({
      cabangId, jenis: 'pembelian', jumlah: -Number(headerBaru.total_dibayar),
      referensiTipe: 'pembelian', referensiId: pembelianId,
      keterangan: `Pembayaran pembelian ${nomorPembelian}${keteranganSuffix}`, userId: user.id,
    });
  }
}

function susunPembelianDariBody(body) {
  const { total_dibayar, status_bayar, catatan, tanggal_pembelian } = body;
  let bahanIds = body.bahan_baku_id;
  let jumlahArr = body.jumlah;
  let hargaArr = body.harga_satuan;

  if (!bahanIds) return null;
  if (!Array.isArray(bahanIds)) {
    bahanIds = [bahanIds];
    jumlahArr = [jumlahArr];
    hargaArr = [hargaArr];
  }

  let total = 0;
  const detailRows = [];
  for (let i = 0; i < bahanIds.length; i++) {
    const jumlah = Number(jumlahArr[i]);
    const harga = Number(hargaArr[i]);
    if (!jumlah || jumlah <= 0) continue;
    const subtotal = jumlah * harga;
    total += subtotal;
    detailRows.push({ bahan_baku_id: bahanIds[i], jumlah, harga_satuan: harga, subtotal });
  }
  if (detailRows.length === 0) return null;

  const dibayar = Number(total_dibayar) || 0;
  let statusBayarFinal = status_bayar || 'belum_bayar';
  if (dibayar >= total && total > 0) statusBayarFinal = 'lunas';
  else if (dibayar > 0 && dibayar < total) statusBayarFinal = 'sebagian';

  return { detailRows, total, dibayar, statusBayarFinal, catatan, tanggal_pembelian };
}

async function formEditPembelian(req, res) {
  const { id } = req.params;
  const user = req.session.user;

  const { data: pembelian, error } = await supabaseAdmin
    .from('pembelian')
    .select('*, pembelian_detail(*, bahan_baku:bahan_baku_id(nama_bahan, satuan))')
    .eq('id', id).single();
  if (error || !pembelian) {
    req.flash('error', 'Pembelian tidak ditemukan.');
    return res.redirect('/pembelian');
  }

  const { data: supplierList } = await supabaseAdmin.from('master_supplier').select('id, nomor_supplier, nama').eq('is_aktif', true).order('nama');
  const { data: bahanList } = await supabaseAdmin.from('master_bahan_baku').select('*').eq('is_aktif', true).order('nama_bahan');
  const { data: supplierBahanList } = await supabaseAdmin
    .from('supplier_bahan_baku')
    .select('supplier_id, bahan_baku_id, harga_beli_terakhir');

  res.render('pembelian/form', {
    title: 'Edit Pembelian', pembelian,
    supplierList: supplierList || [], bahanList: bahanList || [], supplierBahanList: supplierBahanList || [],
    isEdit: true, isAdminPengajuan: user.role === 'admin',
  });
}

async function simpanEditPembelian(req, res) {
  const { id } = req.params;
  const user = req.session.user;
  const { alasan_perubahan } = req.body;

  const susunan = susunPembelianDariBody(req.body);
  if (!susunan) {
    req.flash('error', 'Minimal 1 bahan baku harus diisi.');
    return res.redirect(`/pembelian/${id}/edit`);
  }
  const { detailRows, total, dibayar, statusBayarFinal, catatan, tanggal_pembelian } = susunan;

  try {
    const { data: pembelianLama, error: errLama } = await supabaseAdmin
      .from('pembelian').select('*, pembelian_detail(*)').eq('id', id).single();
    if (errLama || !pembelianLama) throw new Error('Pembelian tidak ditemukan.');

    // FIX 3: Mengakomodasi tanggal_pembelian dari form edit ke database
    const headerBaru = {
      supplier_id: req.body.supplier_id || pembelianLama.supplier_id,
      tanggal_pembelian: tanggal_pembelian ? new Date(tanggal_pembelian).toISOString() : pembelianLama.tanggal_pembelian,
      total, status_bayar: statusBayarFinal, total_dibayar: dibayar, catatan,
    };

    if (user.role === 'owner') {
      await balikkanMutasiPembelian(pembelianLama, user);
      await terapkanDataPembelianBaru({
        pembelianId: id, supplierId: headerBaru.supplier_id, cabangId: pembelianLama.cabang_id,
        headerBaru, detailRows, nomorPembelian: pembelianLama.nomor_pembelian, user,
        keteranganSuffix: ' (hasil edit)',
      });

      await catatAudit({ tabel: 'pembelian', recordId: id, aksi: 'update', dataLama: pembelianLama, dataBaru: { ...pembelianLama, ...headerBaru }, userId: user.id });
      req.flash('success', `Pembelian ${pembelianLama.nomor_pembelian} berhasil diperbarui.`);
      return res.redirect(`/pembelian/${id}`);
    }

    const dataBaruLengkap = { header: headerBaru, detail: detailRows };
    const dataLamaLengkap = { header: pembelianLama, detail: pembelianLama.pembelian_detail };

    const { error: errQueue } = await supabaseAdmin.from('approval_queue').insert({
      tabel_target: 'pembelian',
      record_id: id,
      jenis_perubahan: 'edit',
      data_lama: dataLamaLengkap,
      data_baru: dataBaruLengkap,
      alasan: alasan_perubahan || null,
      diajukan_oleh: user.id,
    });
    if (errQueue) throw errQueue;

    req.flash('success', 'Perubahan pembelian berhasil diajukan, menunggu persetujuan Owner.');
    res.redirect('/pembelian');
  } catch (err) {
    console.error('[pembelian edit] error:', err.message);
    req.flash('error', 'Gagal menyimpan perubahan: ' + err.message);
    res.redirect(`/pembelian/${id}/edit`);
  }
}

module.exports = {
  listPembelian, formTambahPembelian, simpanTambahPembelian, detailPembelian,
  formEditPembelian, simpanEditPembelian, balikkanMutasiPembelian, terapkanDataPembelianBaru,
};