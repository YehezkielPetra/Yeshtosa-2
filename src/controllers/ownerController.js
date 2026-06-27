// ============================================================
// Owner Dashboard Controller
// Owner dapat melihat: Kas, Omzet, Estimasi laba, Fresh, Frozen,
// Pesanan, Pembayaran, Piutang, Pelanggan tidak aktif,
// Reseller terbaik, Stock Point terbaik, Margin.
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const dayjs = require('dayjs');

async function getOwnerDashboard(req, res) {
  try {
    const startOfMonth = dayjs().startOf('month').toISOString();
    const ninetyDaysAgo = dayjs().subtract(90, 'day').toISOString();

    // --- Kas per cabang ---
    const { data: cabangList } = await supabaseAdmin.from('cabang').select('id, kode, nama');
    const kasPerCabang = [];
    for (const c of cabangList || []) {
      const { data: kasTerakhir } = await supabaseAdmin
        .from('kas_ledger')
        .select('saldo_setelah')
        .eq('cabang_id', c.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      kasPerCabang.push({ ...c, saldo: kasTerakhir ? Number(kasTerakhir.saldo_setelah) : 0 });
    }
    const totalKas = kasPerCabang.reduce((sum, c) => sum + c.saldo, 0);

    // --- Omzet bulan ini (semua cabang) ---
    const { data: penjualanBulanIni } = await supabaseAdmin
      .from('penjualan')
      .select('total, subtotal, cabang_id')
      .gte('tanggal_order', startOfMonth);
    const totalOmzet = (penjualanBulanIni || []).reduce((sum, p) => sum + Number(p.total), 0);

    // --- Estimasi laba kotor bulan ini (omzet - pembelian bahan baku) ---
    const { data: pembelianBulanIni } = await supabaseAdmin
      .from('pembelian')
      .select('total')
      .gte('tanggal_beli', startOfMonth);
    const totalPembelian = (pembelianBulanIni || []).reduce((sum, p) => sum + Number(p.total), 0);

    const { data: pengeluaranBulanIni } = await supabaseAdmin
      .from('pengeluaran')
      .select('jumlah')
      .gte('tanggal', startOfMonth);
    const totalPengeluaran = (pengeluaranBulanIni || []).reduce((sum, p) => sum + Number(p.jumlah), 0);

    const estimasiLaba = totalOmzet - totalPembelian - totalPengeluaran;
    const margin = totalOmzet > 0 ? ((estimasiLaba / totalOmzet) * 100).toFixed(1) : 0;

    // --- Stok Fresh & Frozen (semua cabang, agregat per produk) ---
    const { data: stokProduk } = await supabaseAdmin
      .from('stok_produk')
      .select('jumlah, status, produk:produk_id(nama_produk), cabang:cabang_id(nama)');
    const stokFresh = (stokProduk || []).filter(s => s.status === 'fresh');
    const stokFrozen = (stokProduk || []).filter(s => s.status === 'frozen');

    // --- Pesanan & Pembayaran terbaru ---
    const { data: pesananTerbaru } = await supabaseAdmin
      .from('penjualan')
      .select('nomor_order, total, status_bayar, is_selesai, tanggal_order, pelanggan:pelanggan_id(nama), cabang:cabang_id(nama)')
      .order('tanggal_order', { ascending: false })
      .limit(10);

    const { data: pembayaranTerbaru } = await supabaseAdmin
      .from('pembayaran')
      .select('nomor_pembayaran, jumlah_bayar, tanggal_bayar, penjualan:penjualan_id(nomor_order)')
      .order('tanggal_bayar', { ascending: false })
      .limit(10);

    // --- Piutang ---
    const { data: piutangData } = await supabaseAdmin
      .from('penjualan')
      .select('nomor_order, total, total_dibayar, pelanggan:pelanggan_id(nama)')
      .neq('status_bayar', 'lunas');
    const totalPiutang = (piutangData || []).reduce((sum, p) => sum + (Number(p.total) - Number(p.total_dibayar)), 0);

    // --- Pelanggan tidak aktif (tidak ada transaksi 90 hari) ---
    const { data: semuaPelanggan } = await supabaseAdmin
      .from('master_pelanggan')
      .select('id, nama, kategori')
      .eq('is_aktif', true);

    const { data: transaksiBaru } = await supabaseAdmin
      .from('penjualan')
      .select('pelanggan_id')
      .gte('tanggal_order', ninetyDaysAgo);
    const pelangganAktifIds = new Set((transaksiBaru || []).map(t => t.pelanggan_id));
    const pelangganTidakAktif = (semuaPelanggan || []).filter(p => !pelangganAktifIds.has(p.id));

    // --- Reseller terbaik (berdasarkan total penjualan) ---
    const { data: resellerList } = await supabaseAdmin
      .from('master_pelanggan')
      .select('id, nama')
      .eq('kategori', 'reseller');

    const resellerPerforma = [];
    for (const r of resellerList || []) {
      const { data: trx } = await supabaseAdmin
        .from('penjualan')
        .select('total')
        .eq('pelanggan_id', r.id)
        .gte('tanggal_order', startOfMonth);
      const total = (trx || []).reduce((s, t) => s + Number(t.total), 0);
      if (total > 0) resellerPerforma.push({ nama: r.nama, total });
    }
    resellerPerforma.sort((a, b) => b.total - a.total);

    // --- Stock Point terbaik ---
    const { data: stockPointList } = await supabaseAdmin
      .from('master_pelanggan')
      .select('id, nama')
      .eq('kategori', 'stock_point');

    const stockPointPerforma = [];
    for (const sp of stockPointList || []) {
      const { data: trx } = await supabaseAdmin
        .from('penjualan')
        .select('total')
        .eq('pelanggan_id', sp.id)
        .gte('tanggal_order', startOfMonth);
      const total = (trx || []).reduce((s, t) => s + Number(t.total), 0);
      if (total > 0) stockPointPerforma.push({ nama: sp.nama, total });
    }
    stockPointPerforma.sort((a, b) => b.total - a.total);

    res.render('owner/dashboard', {
      title: 'Dashboard Owner',
      kasPerCabang,
      totalKas,
      totalOmzet,
      estimasiLaba,
      margin,
      stokFresh,
      stokFrozen,
      pesananTerbaru: pesananTerbaru || [],
      pembayaranTerbaru: pembayaranTerbaru || [],
      totalPiutang,
      piutangData: piutangData || [],
      pelangganTidakAktif,
      resellerPerforma: resellerPerforma.slice(0, 10),
      stockPointPerforma: stockPointPerforma.slice(0, 10),
    });
  } catch (err) {
    console.error('[owner dashboard] error:', err.message);
    req.flash('error', 'Gagal memuat dashboard owner: ' + err.message);
    res.redirect('/dashboard');
  }
}

module.exports = { getOwnerDashboard };
