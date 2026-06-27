// ============================================================
// Dashboard Controller (umum - admin & produksi)
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const dayjs = require('dayjs');

async function getDashboard(req, res) {
  const user = req.session.user;
  const cabangId = user.cabangId;

  try {
    const today = dayjs().format('YYYY-MM-DD');
    const startOfMonth = dayjs().startOf('month').toISOString();

    // Pesanan hari ini
    const { data: pesananHariIni } = await supabaseAdmin
      .from('penjualan')
      .select('id, nomor_order, total, status_bayar, is_selesai, pelanggan:pelanggan_id(nama)')
      .eq('cabang_id', cabangId)
      .gte('tanggal_order', `${today}T00:00:00`)
      .order('tanggal_order', { ascending: false });

    // Omzet bulan ini
    const { data: omzetBulanIni } = await supabaseAdmin
      .from('penjualan')
      .select('total')
      .eq('cabang_id', cabangId)
      .gte('tanggal_order', startOfMonth);
    const totalOmzetBulanIni = (omzetBulanIni || []).reduce((sum, p) => sum + Number(p.total), 0);

    // Stok produk
    const { data: stokProduk } = await supabaseAdmin
      .from('stok_produk')
      .select('jumlah, status, produk:produk_id(nama_produk)')
      .eq('cabang_id', cabangId);

    const stokFresh = (stokProduk || []).filter(s => s.status === 'fresh');
    const stokFrozen = (stokProduk || []).filter(s => s.status === 'frozen');

    // Piutang (penjualan belum lunas)
    const { data: piutang } = await supabaseAdmin
      .from('penjualan')
      .select('id, total, total_dibayar, pelanggan:pelanggan_id(nama)')
      .eq('cabang_id', cabangId)
      .neq('status_bayar', 'lunas');
    const totalPiutang = (piutang || []).reduce((sum, p) => sum + (Number(p.total) - Number(p.total_dibayar)), 0);

    // Saldo kas
    const { data: kasTerakhir } = await supabaseAdmin
      .from('kas_ledger')
      .select('saldo_setelah')
      .eq('cabang_id', cabangId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    res.render('dashboard/index', {
      title: 'Dashboard',
      pesananHariIni: pesananHariIni || [],
      totalOmzetBulanIni,
      stokFresh,
      stokFrozen,
      piutang: piutang || [],
      totalPiutang,
      saldoKas: kasTerakhir ? Number(kasTerakhir.saldo_setelah) : 0,
    });
  } catch (err) {
    console.error('[dashboard] error:', err.message);
    req.flash('error', 'Gagal memuat dashboard.');
    res.render('dashboard/index', {
      title: 'Dashboard',
      pesananHariIni: [], totalOmzetBulanIni: 0, stokFresh: [], stokFrozen: [],
      piutang: [], totalPiutang: 0, saldoKas: 0,
    });
  }
}

module.exports = { getDashboard };
