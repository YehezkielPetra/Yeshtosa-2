// ============================================================
// Dashboard Controller (umum - admin & produksi)
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const dayjs = require('dayjs');

async function getDashboard(req, res) {
  const user = req.session.user;
  const cabangId = user.cabangId;
  const isAdmin = user.role === 'admin';

  try {
    const today = dayjs().format('YYYY-MM-DD');
    const startOfMonth = dayjs().startOf('month').toISOString();

    // Pesanan hari ini — sertakan detail item produk untuk ditampilkan
    // sebagai card per pelanggan, bukan daftar tabel sederhana.
    const mulaiHariIni = new Date(`${today}T00:00:00`);
    const selesaiHariIni = new Date(`${today}T23:59:59.999`);
    const { data: pesananHariIni } = await supabaseAdmin
      .from('penjualan')
      .select('id, nomor_order, total, status_bayar, is_selesai, tanggal_order, pelanggan:pelanggan_id(nama), penjualan_detail(jumlah, produk:produk_id(nama_produk, satuan))')
      .eq('cabang_id', cabangId)
      .gte('tanggal_order', mulaiHariIni.toISOString())
      .lte('tanggal_order', selesaiHariIni.toISOString())
      .order('tanggal_order', { ascending: false });

    // Ringkasan rekap pesanan hari ini: total pesanan & total item terjual,
    // supaya owner/admin bisa lihat rekap cepat di luar kumpulan card.
    const totalPesananHariIni = (pesananHariIni || []).length;
    const totalItemHariIni = (pesananHariIni || []).reduce((sum, p) => {
      return sum + (p.penjualan_detail || []).reduce((s, d) => s + Number(d.jumlah), 0);
    }, 0);

    // Rincian item terjual per nama produk (untuk ditampilkan sebagai
    // breakdown di sebelah Total Item Terjual), diurutkan dari yang
    // terjual paling banyak.
    const rincianItemMap = new Map();
    (pesananHariIni || []).forEach(p => {
      (p.penjualan_detail || []).forEach(d => {
        const namaProduk = d.produk ? d.produk.nama_produk : 'Lainnya';
        rincianItemMap.set(namaProduk, (rincianItemMap.get(namaProduk) || 0) + Number(d.jumlah));
      });
    });
    const rincianItemHariIni = Array.from(rincianItemMap, ([nama, jumlah]) => ({ nama, jumlah }))
      .sort((a, b) => b.jumlah - a.jumlah);

    // Stok produk
    const { data: stokProduk } = await supabaseAdmin
      .from('stok_produk')
      .select('jumlah, status, produk:produk_id(nama_produk)')
      .eq('cabang_id', cabangId);

    const stokFresh = (stokProduk || []).filter(s => s.status === 'fresh');
    const stokFrozen = (stokProduk || []).filter(s => s.status === 'frozen');

    // ============================================================
    // Data finansial sensitif (Saldo Kas, Omzet, Piutang) HANYA
    // dihitung & dikirim untuk role non-admin (owner/produksi).
    // Untuk admin, nilai di-set 0/null dan tidak pernah dihitung
    // dari database sama sekali (privilege limiting).
    // ============================================================
    let totalOmzetBulanIni = 0;
    let piutang = [];
    let totalPiutang = 0;
    let saldoKas = 0;

    if (!isAdmin) {
      const { data: omzetBulanIni } = await supabaseAdmin
        .from('penjualan')
        .select('total')
        .eq('cabang_id', cabangId)
        .gte('tanggal_order', startOfMonth);
      totalOmzetBulanIni = (omzetBulanIni || []).reduce((sum, p) => sum + Number(p.total), 0);

      const { data: piutangData } = await supabaseAdmin
        .from('penjualan')
        .select('id, total, total_dibayar, pelanggan:pelanggan_id(nama)')
        .eq('cabang_id', cabangId)
        .or('status_bayar.eq.belum_bayar,status_bayar.eq.sebagian')
        .gt('total', 0);
      piutang = piutangData || [];
      totalPiutang = piutang.reduce((sum, p) => sum + (Number(p.total) - Number(p.total_dibayar)), 0);

      const { data: kasTerakhir } = await supabaseAdmin
        .from('kas_ledger')
        .select('saldo_setelah')
        .eq('cabang_id', cabangId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      saldoKas = kasTerakhir ? Number(kasTerakhir.saldo_setelah) : 0;
    }

    res.render('dashboard/index', {
      title: 'Dashboard',
      pesananHariIni: pesananHariIni || [],
      totalPesananHariIni,
      totalItemHariIni,
      rincianItemHariIni,
      totalOmzetBulanIni,
      stokFresh,
      stokFrozen,
      piutang,
      totalPiutang,
      saldoKas,
    });
  } catch (err) {
    console.error('[dashboard] error:', err.message);
    req.flash('error', 'Gagal memuat dashboard.');
    res.render('dashboard/index', {
      title: 'Dashboard',
      pesananHariIni: [], totalPesananHariIni: 0, totalItemHariIni: 0, rincianItemHariIni: [],
      totalOmzetBulanIni: 0, stokFresh: [], stokFrozen: [],
      piutang: [], totalPiutang: 0, saldoKas: 0,
    });
  }
}

module.exports = { getDashboard };
