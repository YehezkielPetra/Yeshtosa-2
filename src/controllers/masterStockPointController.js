// ============================================================
// Master Stock Point Controller
// Stock Point adalah pelanggan berkategori 'stock_point' yang
// punya lokasi titip jual & PIC.
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const { catatAudit } = require('../utils/auditTrail');

async function listStockPoint(req, res) {
  const { data, error } = await supabaseAdmin
    .from('master_stock_point')
    .select('*, pelanggan:pelanggan_id(nomor_pelanggan, nama, kategori)')
    .order('nama_lokasi');
  if (error) req.flash('error', 'Gagal memuat stock point: ' + error.message);
  res.render('master/stock_point_list', { title: 'Master Stock Point', stockPointList: data || [] });
}

async function formTambahStockPoint(req, res) {
  const { data: pelangganList } = await supabaseAdmin
    .from('master_pelanggan')
    .select('id, nomor_pelanggan, nama')
    .eq('kategori', 'stock_point')
    .eq('is_aktif', true)
    .order('nama');
  res.render('master/stock_point_form', { title: 'Tambah Stock Point', stockPoint: null, pelangganList: pelangganList || [] });
}

async function simpanTambahStockPoint(req, res) {
  const { pelanggan_id, nama_lokasi, alamat, pic_nama, pic_hp } = req.body;
  try {
    const { data, error } = await supabaseAdmin
      .from('master_stock_point')
      .insert({ pelanggan_id, nama_lokasi, alamat, pic_nama, pic_hp })
      .select().single();
    if (error) throw error;
    await catatAudit({ tabel: 'master_stock_point', recordId: data.id, aksi: 'create', dataBaru: data, userId: req.session.user.id });
    req.flash('success', 'Stock Point berhasil ditambahkan.');
    res.redirect('/master/stock-point');
  } catch (err) {
    req.flash('error', 'Gagal menambah stock point: ' + err.message);
    res.redirect('/master/stock-point/tambah');
  }
}

async function formEditStockPoint(req, res) {
  const { data: stockPoint, error } = await supabaseAdmin.from('master_stock_point').select('*').eq('id', req.params.id).single();
  if (error || !stockPoint) {
    req.flash('error', 'Stock point tidak ditemukan.');
    return res.redirect('/master/stock-point');
  }
  const { data: pelangganList } = await supabaseAdmin
    .from('master_pelanggan').select('id, nomor_pelanggan, nama').eq('kategori', 'stock_point').order('nama');
  res.render('master/stock_point_form', { title: 'Edit Stock Point', stockPoint, pelangganList: pelangganList || [] });
}

async function simpanEditStockPoint(req, res) {
  const { id } = req.params;
  const { pelanggan_id, nama_lokasi, alamat, pic_nama, pic_hp, is_aktif } = req.body;
  try {
    const { data: dataLama } = await supabaseAdmin.from('master_stock_point').select('*').eq('id', id).single();
    const { data, error } = await supabaseAdmin
      .from('master_stock_point')
      .update({ pelanggan_id, nama_lokasi, alamat, pic_nama, pic_hp, is_aktif: is_aktif === 'on' })
      .eq('id', id).select().single();
    if (error) throw error;
    await catatAudit({ tabel: 'master_stock_point', recordId: id, aksi: 'update', dataLama, dataBaru: data, userId: req.session.user.id });
    req.flash('success', 'Stock point berhasil diperbarui.');
    res.redirect('/master/stock-point');
  } catch (err) {
    req.flash('error', 'Gagal memperbarui stock point: ' + err.message);
    res.redirect(`/master/stock-point/${id}/edit`);
  }
}

module.exports = { listStockPoint, formTambahStockPoint, simpanTambahStockPoint, formEditStockPoint, simpanEditStockPoint };
