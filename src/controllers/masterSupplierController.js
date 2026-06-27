// ============================================================
// Master Supplier Controller
// Setiap supplier: nomor, nama, HP, alamat, barang utama,
// status utama/cadangan, riwayat pembelian, harga beli terakhir.
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const { catatAudit } = require('../utils/auditTrail');

async function listSupplier(req, res) {
  const { data, error } = await supabaseAdmin
    .from('master_supplier')
    .select('*, supplier_bahan_baku(*, bahan_baku:bahan_baku_id(nama_bahan, satuan))')
    .order('nama');
  if (error) req.flash('error', 'Gagal memuat supplier: ' + error.message);
  res.render('master/supplier_list', { title: 'Master Supplier', supplierList: data || [] });
}

async function formTambahSupplier(req, res) {
  const { data: bahanList } = await supabaseAdmin.from('master_bahan_baku').select('id, nama_bahan, satuan').eq('is_aktif', true).order('nama_bahan');
  res.render('master/supplier_form', { title: 'Tambah Supplier', supplier: null, bahanRelasi: [], bahanList: bahanList || [] });
}

async function simpanTambahSupplier(req, res) {
  const { nama, nomor_hp, alamat, barang_utama, is_supplier_utama } = req.body;
  try {
    const { data: supplier, error } = await supabaseAdmin
      .from('master_supplier')
      .insert({ nama, nomor_hp, alamat, barang_utama, is_supplier_utama: is_supplier_utama === 'on' })
      .select().single();
    if (error) throw error;

    await tautkanBahanBaku(req, supplier.id);

    await catatAudit({ tabel: 'master_supplier', recordId: supplier.id, aksi: 'create', dataBaru: supplier, userId: req.session.user.id });
    req.flash('success', `Supplier berhasil ditambahkan dengan nomor ${supplier.nomor_supplier}.`);
    res.redirect('/master/supplier');
  } catch (err) {
    req.flash('error', 'Gagal menambah supplier: ' + err.message);
    res.redirect('/master/supplier/tambah');
  }
}

async function tautkanBahanBaku(req, supplierId) {
  let bahanIds = req.body.bahan_baku_id;
  let hargaArr = req.body.harga_beli;
  let cadanganArr = req.body.is_cadangan;
  if (!bahanIds) return;
  if (!Array.isArray(bahanIds)) {
    bahanIds = [bahanIds];
    hargaArr = [hargaArr];
    cadanganArr = cadanganArr ? [cadanganArr] : [];
  }

  await supabaseAdmin.from('supplier_bahan_baku').delete().eq('supplier_id', supplierId);

  const rows = bahanIds
    .map((bahanId, idx) => ({
      supplier_id: supplierId,
      bahan_baku_id: bahanId,
      harga_beli_terakhir: hargaArr && hargaArr[idx] ? Number(hargaArr[idx]) : null,
      is_supplier_cadangan: Array.isArray(cadanganArr) ? cadanganArr.includes(String(idx)) : false,
    }))
    .filter(r => r.bahan_baku_id);

  if (rows.length > 0) {
    await supabaseAdmin.from('supplier_bahan_baku').insert(rows);
  }
}

async function formEditSupplier(req, res) {
  const { data: supplier, error } = await supabaseAdmin
    .from('master_supplier')
    .select('*, supplier_bahan_baku(*, bahan_baku:bahan_baku_id(nama_bahan, satuan))')
    .eq('id', req.params.id).single();
  if (error || !supplier) {
    req.flash('error', 'Supplier tidak ditemukan.');
    return res.redirect('/master/supplier');
  }
  const { data: bahanList } = await supabaseAdmin.from('master_bahan_baku').select('id, nama_bahan, satuan').eq('is_aktif', true).order('nama_bahan');

  // Riwayat pembelian dari supplier ini
  const { data: riwayatPembelian } = await supabaseAdmin
    .from('pembelian')
    .select('nomor_pembelian, tanggal_beli, total, status_bayar')
    .eq('supplier_id', supplier.id)
    .order('tanggal_beli', { ascending: false })
    .limit(20);

  res.render('master/supplier_form', {
    title: 'Edit Supplier', supplier,
    bahanRelasi: supplier.supplier_bahan_baku || [],
    bahanList: bahanList || [],
    riwayatPembelian: riwayatPembelian || [],
  });
}

async function simpanEditSupplier(req, res) {
  const { id } = req.params;
  const { nama, nomor_hp, alamat, barang_utama, is_supplier_utama, is_aktif } = req.body;
  try {
    const { data: dataLama } = await supabaseAdmin.from('master_supplier').select('*').eq('id', id).single();
    const { data: dataBaru, error } = await supabaseAdmin
      .from('master_supplier')
      .update({
        nama, nomor_hp, alamat, barang_utama,
        is_supplier_utama: is_supplier_utama === 'on',
        is_aktif: is_aktif === 'on',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id).select().single();
    if (error) throw error;

    await tautkanBahanBaku(req, id);

    await catatAudit({ tabel: 'master_supplier', recordId: id, aksi: 'update', dataLama, dataBaru, userId: req.session.user.id });
    req.flash('success', 'Supplier berhasil diperbarui.');
    res.redirect('/master/supplier');
  } catch (err) {
    req.flash('error', 'Gagal memperbarui supplier: ' + err.message);
    res.redirect(`/master/supplier/${id}/edit`);
  }
}

module.exports = { listSupplier, formTambahSupplier, simpanTambahSupplier, formEditSupplier, simpanEditSupplier };
