// ============================================================
// Tutup Buku Controller
// Setiap akhir bulan: hitung laba, cadangan usaha, cadangan
// pajak, dan laba siap distribusi (yang dikeluarkan dari kas).
// Saldo bulan berikutnya jadi bersih. Hanya Owner yang berhak
// melakukan tutup buku final.
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const { catatAudit } = require('../utils/auditTrail');
const { catatMutasiKas } = require('../utils/kasLedger');
const dayjs = require('dayjs');

async function listTutupBuku(req, res) {
  const { data, error } = await supabaseAdmin
    .from('tutup_buku')
    .select('*, cabang:cabang_id(nama)')
    .order('periode_tahun', { ascending: false })
    .order('periode_bulan', { ascending: false });
  if (error) req.flash('error', 'Gagal memuat tutup buku: ' + error.message);
  res.render('laporan/tutup_buku_list', { title: 'Tutup Buku', tutupBukuList: data || [] });
}

async function formTutupBuku(req, res) {
  const { data: cabangList } = await supabaseAdmin.from('cabang').select('id, nama').eq('is_aktif', true);
  const bulanLalu = dayjs().subtract(1, 'month');
  res.render('laporan/tutup_buku_form', {
    title: 'Tutup Buku Bulanan', cabangList: cabangList || [],
    defaultBulan: bulanLalu.month() + 1, defaultTahun: bulanLalu.year(),
  });
}

async function hitungPreviewTutupBuku(req, res) {
  const { cabang_id, bulan, tahun, persen_cadangan_pajak, persen_cadangan_usaha } = req.body;
  try {
    const hasil = await hitungLaba({ cabangId: cabang_id, bulan: Number(bulan), tahun: Number(tahun) });
    const persenPajak = Number(persen_cadangan_pajak) || 2.5;
    const persenCadangan = Number(persen_cadangan_usaha) || 10;

    const nominalPajak = hasil.labaBersih > 0 ? hasil.labaBersih * persenPajak / 100 : 0;
    const nominalCadangan = hasil.labaBersih > 0 ? hasil.labaBersih * persenCadangan / 100 : 0;
    const labaSiapDistribusi = hasil.labaBersih - nominalPajak - nominalCadangan;

    res.json({
      ...hasil, persenPajak, persenCadangan, nominalPajak, nominalCadangan, labaSiapDistribusi,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function hitungLaba({ cabangId, bulan, tahun }) {
  const startDate = dayjs(`${tahun}-${bulan}-01`).startOf('month');
  const endDate = startDate.endOf('month');

  const { data: penjualanData } = await supabaseAdmin
    .from('penjualan').select('total').eq('cabang_id', cabangId)
    .gte('tanggal_order', startDate.toISOString()).lte('tanggal_order', endDate.toISOString());
  const totalOmzet = (penjualanData || []).reduce((s, p) => s + Number(p.total), 0);

  const { data: pembelianData } = await supabaseAdmin
    .from('pembelian').select('total').eq('cabang_id', cabangId)
    .gte('tanggal_beli', startDate.toISOString()).lte('tanggal_beli', endDate.toISOString());
  const totalPembelian = (pembelianData || []).reduce((s, p) => s + Number(p.total), 0);

  const { data: pengeluaranData } = await supabaseAdmin
    .from('pengeluaran').select('jumlah').eq('cabang_id', cabangId)
    .gte('tanggal', startDate.toISOString()).lte('tanggal', endDate.toISOString());
  const totalPengeluaran = (pengeluaranData || []).reduce((s, p) => s + Number(p.jumlah), 0);

  const labaKotor = totalOmzet - totalPembelian;
  const labaBersih = labaKotor - totalPengeluaran;

  return { totalOmzet, totalHpp: totalPembelian, totalPembelian, totalPengeluaran, labaKotor, labaBersih };
}

async function simpanTutupBuku(req, res) {
  const user = req.session.user;
  const { cabang_id, bulan, tahun, persen_cadangan_pajak, persen_cadangan_usaha } = req.body;

  try {
    // Cek apakah sudah pernah final untuk periode ini
    const { data: existing } = await supabaseAdmin
      .from('tutup_buku').select('*').eq('cabang_id', cabang_id)
      .eq('periode_bulan', bulan).eq('periode_tahun', tahun).eq('status', 'final').maybeSingle();
    if (existing) throw new Error('Periode ini sudah ditutup secara final sebelumnya.');

    const hasil = await hitungLaba({ cabangId: cabang_id, bulan: Number(bulan), tahun: Number(tahun) });
    const persenPajak = Number(persen_cadangan_pajak) || 2.5;
    const persenCadangan = Number(persen_cadangan_usaha) || 10;
    const nominalPajak = hasil.labaBersih > 0 ? hasil.labaBersih * persenPajak / 100 : 0;
    const nominalCadangan = hasil.labaBersih > 0 ? hasil.labaBersih * persenCadangan / 100 : 0;
    const labaSiapDistribusi = hasil.labaBersih - nominalPajak - nominalCadangan;

    const { data: tutupBuku, error } = await supabaseAdmin
      .from('tutup_buku')
      .insert({
        cabang_id, periode_bulan: bulan, periode_tahun: tahun,
        total_omzet: hasil.totalOmzet, total_hpp: hasil.totalHpp,
        total_pengeluaran: hasil.totalPengeluaran, total_pembelian: hasil.totalPembelian,
        laba_kotor: hasil.labaKotor, laba_bersih: hasil.labaBersih,
        persen_cadangan_pajak: persenPajak, nominal_cadangan_pajak: nominalPajak,
        persen_cadangan_usaha: persenCadangan, nominal_cadangan_usaha: nominalCadangan,
        laba_siap_distribusi: labaSiapDistribusi,
        status: 'final', ditutup_oleh: user.id, ditutup_pada: new Date().toISOString(),
      })
      .select().single();
    if (error) throw error;

    // Keluarkan cadangan pajak, cadangan usaha, dan laba siap distribusi dari kas usaha
    if (nominalPajak > 0) {
      await catatMutasiKas({
        cabangId: cabang_id, jenis: 'pajak_disisihkan', jumlah: -nominalPajak,
        referensiTipe: 'tutup_buku', referensiId: tutupBuku.id,
        keterangan: `Cadangan pajak periode ${bulan}/${tahun}`, userId: user.id,
      });
    }
    if (nominalCadangan > 0) {
      await catatMutasiKas({
        cabangId: cabang_id, jenis: 'cadangan_usaha', jumlah: -nominalCadangan,
        referensiTipe: 'tutup_buku', referensiId: tutupBuku.id,
        keterangan: `Cadangan usaha periode ${bulan}/${tahun}`, userId: user.id,
      });
    }
    if (labaSiapDistribusi > 0) {
      await catatMutasiKas({
        cabangId: cabang_id, jenis: 'laba_distribusi', jumlah: -labaSiapDistribusi,
        referensiTipe: 'tutup_buku', referensiId: tutupBuku.id,
        keterangan: `Laba siap distribusi periode ${bulan}/${tahun} (dikeluarkan dari kas usaha)`, userId: user.id,
      });
    }

    await catatAudit({ tabel: 'tutup_buku', recordId: tutupBuku.id, aksi: 'create', dataBaru: tutupBuku, userId: user.id });
    req.flash('success', `Tutup buku periode ${bulan}/${tahun} berhasil dilakukan. Saldo bulan berikutnya sudah bersih.`);
    res.redirect('/laporan/tutup-buku');
  } catch (err) {
    req.flash('error', 'Gagal melakukan tutup buku: ' + err.message);
    res.redirect('/laporan/tutup-buku/baru');
  }
}

module.exports = { listTutupBuku, formTutupBuku, hitungPreviewTutupBuku, simpanTutupBuku };
