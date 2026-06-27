// ============================================================
// Stok Controller
// Menampilkan stok bahan baku, produk Fresh & Frozen (terpisah),
// serta batch Frozen dengan tanggal expired untuk monitoring.
// ============================================================
const { supabaseAdmin } = require('../config/supabase');

async function viewStok(req, res) {
  const user = req.session.user;
  const cabangId = user.role === 'owner' ? (req.query.cabang_id || null) : user.cabangId;

  let queryBahan = supabaseAdmin.from('stok_bahan_baku').select('*, bahan_baku:bahan_baku_id(nama_bahan, satuan, stok_minimum), cabang:cabang_id(nama)');
  let queryProduk = supabaseAdmin.from('stok_produk').select('*, produk:produk_id(nama_produk, satuan), cabang:cabang_id(nama)');
  let queryBatch = supabaseAdmin.from('batch_stok_frozen').select('*, produk:produk_id(nama_produk), cabang:cabang_id(nama)').gt('jumlah_sisa', 0).order('tanggal_expired');

  if (cabangId) {
    queryBahan = queryBahan.eq('cabang_id', cabangId);
    queryProduk = queryProduk.eq('cabang_id', cabangId);
    queryBatch = queryBatch.eq('cabang_id', cabangId);
  }

  const { data: stokBahan } = await queryBahan;
  const { data: stokProdukData } = await queryProduk;
  const { data: batchFrozen } = await queryBatch;

  const stokFresh = (stokProdukData || []).filter(s => s.status === 'fresh');
  const stokFrozen = (stokProdukData || []).filter(s => s.status === 'frozen');

  // Tandai bahan baku yang di bawah stok minimum
  const stokBahanWarning = (stokBahan || []).map(s => ({
    ...s,
    isWarning: s.bahan_baku && Number(s.jumlah) < Number(s.bahan_baku.stok_minimum || 0),
  }));

  res.render('stok/index', {
    title: 'Stok', stokBahan: stokBahanWarning, stokFresh, stokFrozen, batchFrozen: batchFrozen || [], cabangId,
  });
}

module.exports = { viewStok };
