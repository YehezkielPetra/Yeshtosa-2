// ============================================================
// Laporan & Analisis Controller
// Konsumen: cukup lihat pelanggan tidak aktif (tanpa grafik).
// Reseller: grafik perkembangan, ranking, penjualan.
// Stock Point: perputaran stok, penjualan, margin, kinerja.
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const dayjs = require('dayjs');

async function analisisKonsumen(req, res) {
  const hariTidakAktif = Number(req.query.hari) || 90;
  const batasTanggal = dayjs().subtract(hariTidakAktif, 'day').toISOString();

  const { data: semuaKonsumen } = await supabaseAdmin
    .from('master_pelanggan').select('id, nomor_pelanggan, nama, alamat')
    .eq('kategori', 'konsumen').eq('is_aktif', true);

  const { data: transaksiBaru } = await supabaseAdmin
    .from('penjualan').select('pelanggan_id, tanggal_order').gte('tanggal_order', batasTanggal);
  const aktifIds = new Set((transaksiBaru || []).map(t => t.pelanggan_id));

  const tidakAktif = (semuaKonsumen || []).filter(p => !aktifIds.has(p.id));

  res.render('laporan/analisis_konsumen', { title: 'Analisis Konsumen', tidakAktif, hariTidakAktif });
}

async function analisisReseller(req, res) {
  const { data: resellerList } = await supabaseAdmin
    .from('master_pelanggan').select('id, nomor_pelanggan, nama').eq('kategori', 'reseller').eq('is_aktif', true);

  const enamBulanLalu = dayjs().subtract(6, 'month').startOf('month').toISOString();
  const hasil = [];

  for (const r of resellerList || []) {
    const { data: trx } = await supabaseAdmin
      .from('penjualan').select('total, tanggal_order').eq('pelanggan_id', r.id).gte('tanggal_order', enamBulanLalu);

    const totalPenjualan = (trx || []).reduce((s, t) => s + Number(t.total), 0);

    // Grafik perkembangan per bulan (6 bulan terakhir)
    const perBulan = {};
    for (let i = 5; i >= 0; i--) {
      const key = dayjs().subtract(i, 'month').format('YYYY-MM');
      perBulan[key] = 0;
    }
    for (const t of trx || []) {
      const key = dayjs(t.tanggal_order).format('YYYY-MM');
      if (perBulan[key] !== undefined) perBulan[key] += Number(t.total);
    }

    hasil.push({ ...r, totalPenjualan, grafikBulanan: perBulan, jumlahTransaksi: (trx || []).length });
  }

  hasil.sort((a, b) => b.totalPenjualan - a.totalPenjualan);
  hasil.forEach((r, idx) => { r.ranking = idx + 1; });

  res.render('laporan/analisis_reseller', { title: 'Analisis Reseller', resellerData: hasil });
}

async function analisisStockPoint(req, res) {
  const { data: stockPointList } = await supabaseAdmin
    .from('master_stock_point')
    .select('*, pelanggan:pelanggan_id(id, nomor_pelanggan, nama)')
    .eq('is_aktif', true);

  const startOfMonth = dayjs().startOf('month').toISOString();
  const hasil = [];

  for (const sp of stockPointList || []) {
    if (!sp.pelanggan) continue;
    const { data: trx } = await supabaseAdmin
      .from('penjualan').select('total, subtotal').eq('pelanggan_id', sp.pelanggan.id).gte('tanggal_order', startOfMonth);

    const totalPenjualan = (trx || []).reduce((s, t) => s + Number(t.total), 0);
    const totalSubtotal = (trx || []).reduce((s, t) => s + Number(t.subtotal), 0);
    const margin = totalSubtotal > 0 ? (((totalSubtotal - totalPenjualan) / totalSubtotal) * -100).toFixed(1) : 0;

    hasil.push({
      nama_lokasi: sp.nama_lokasi, pelanggan: sp.pelanggan,
      totalPenjualan, jumlahTransaksi: (trx || []).length, margin,
    });
  }

  hasil.sort((a, b) => b.totalPenjualan - a.totalPenjualan);

  res.render('laporan/analisis_stock_point', { title: 'Analisis Stock Point', stockPointData: hasil });
}

module.exports = { analisisKonsumen, analisisReseller, analisisStockPoint };
