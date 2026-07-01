// ============================================================
// Approval Controller
// Semua perubahan transaksi yang telah selesai harus diverifikasi
// owner. Admin tidak boleh menghapus transaksi secara langsung;
// hanya bisa mengajukan permintaan edit/batal yang masuk queue.
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const { catatAudit } = require('../utils/auditTrail');
const { balikkanMutasiPembelian, terapkanDataPembelianBaru } = require('./pembelianController');

async function listApproval(req, res) {
  const { status } = req.query;
  let query = supabaseAdmin
    .from('approval_queue')
    .select('*, diajukan:diajukan_oleh(nama), ditinjau:ditinjau_oleh(nama)')
    .order('diajukan_pada', { ascending: false });
  if (status) query = query.eq('status', status);
  else query = query.eq('status', 'pending');

  const { data, error } = await query;
  if (error) req.flash('error', 'Gagal memuat approval queue: ' + error.message);
  res.render('laporan/approval_list', { title: 'Persetujuan Perubahan Transaksi', approvalList: data || [], filterStatus: status || 'pending' });
}

/**
 * Admin mengajukan permintaan edit/batal untuk transaksi yang sudah selesai.
 * Body: tabel_target, record_id, jenis_perubahan ('edit'|'batal'), data_baru (JSON string opsional), alasan
 */
async function ajukanPerubahan(req, res) {
  const user = req.session.user;
  const { tabel_target, record_id, jenis_perubahan, data_baru, alasan } = req.body;

  try {
    const { data: dataLama, error: errLama } = await supabaseAdmin
      .from(tabel_target).select('*').eq('id', record_id).single();
    if (errLama || !dataLama) throw new Error('Data transaksi tidak ditemukan.');

    let parsedDataBaru = null;
    if (data_baru) {
      try { parsedDataBaru = JSON.parse(data_baru); } catch { parsedDataBaru = null; }
    }

    const { data: pengajuan, error } = await supabaseAdmin
      .from('approval_queue')
      .insert({
        tabel_target, record_id, jenis_perubahan,
        data_lama: dataLama, data_baru: parsedDataBaru, alasan,
        diajukan_oleh: user.id,
      })
      .select().single();
    if (error) throw error;

    req.flash('success', 'Pengajuan perubahan berhasil dikirim dan menunggu persetujuan Owner.');
    res.redirect('back');
  } catch (err) {
    req.flash('error', 'Gagal mengajukan perubahan: ' + err.message);
    res.redirect('back');
  }
}

async function setujuiPerubahan(req, res) {
  const user = req.session.user;
  const { id } = req.params;

  try {
    const { data: pengajuan, error: errFind } = await supabaseAdmin.from('approval_queue').select('*').eq('id', id).single();
    if (errFind || !pengajuan) throw new Error('Pengajuan tidak ditemukan.');
    if (pengajuan.status !== 'pending') throw new Error('Pengajuan ini sudah ditinjau sebelumnya.');

    if (pengajuan.jenis_perubahan === 'edit' && pengajuan.data_baru) {
      if (pengajuan.tabel_target === 'penjualan' && pengajuan.data_baru.header) {
        // Struktur khusus penjualan: { header, detail } — timpa header
        // dan ganti seluruh baris penjualan_detail dengan data usulan Admin.
        const { error: errUpdateHeader } = await supabaseAdmin
          .from('penjualan')
          .update(pengajuan.data_baru.header)
          .eq('id', pengajuan.record_id);
        if (errUpdateHeader) throw errUpdateHeader;

        await supabaseAdmin.from('penjualan_detail').delete().eq('penjualan_id', pengajuan.record_id);
        const detailToInsert = (pengajuan.data_baru.detail || []).map(d => ({ ...d, penjualan_id: pengajuan.record_id }));
        if (detailToInsert.length > 0) {
          const { error: errDetail } = await supabaseAdmin.from('penjualan_detail').insert(detailToInsert);
          if (errDetail) throw errDetail;
        }
      } else if (pengajuan.tabel_target === 'pembelian' && pengajuan.data_baru.header) {
        // Struktur khusus pembelian: { header, detail }. Berbeda dari
        // penjualan, pembelian menyentuh stok bahan baku & kas secara
        // langsung, sehingga saat disetujui: balikkan dulu mutasi lama
        // (berdasarkan kondisi TERKINI, bukan snapshot lama), lalu
        // terapkan mutasi baru sesuai usulan Admin.
        const { data: pembelianTerkini, error: errTerkini } = await supabaseAdmin
          .from('pembelian').select('*, pembelian_detail(*)').eq('id', pengajuan.record_id).single();
        if (errTerkini || !pembelianTerkini) throw new Error('Pembelian tidak ditemukan.');

        await balikkanMutasiPembelian(pembelianTerkini, user);
        await terapkanDataPembelianBaru({
          pembelianId: pengajuan.record_id,
          supplierId: pengajuan.data_baru.header.supplier_id || pembelianTerkini.supplier_id,
          cabangId: pembelianTerkini.cabang_id,
          headerBaru: pengajuan.data_baru.header,
          detailRows: pengajuan.data_baru.detail || [],
          nomorPembelian: pembelianTerkini.nomor_pembelian,
          user,
          keteranganSuffix: ' (hasil persetujuan pengajuan Admin)',
        });
      } else {
        // Tabel lain: update langsung dengan objek data_baru
        const { error: errUpdate } = await supabaseAdmin
          .from(pengajuan.tabel_target)
          .update(pengajuan.data_baru)
          .eq('id', pengajuan.record_id);
        if (errUpdate) throw errUpdate;
      }

      await catatAudit({
        tabel: pengajuan.tabel_target, recordId: pengajuan.record_id, aksi: 'approve',
        dataLama: pengajuan.data_lama, dataBaru: pengajuan.data_baru, userId: user.id,
      });
    } else if (pengajuan.jenis_perubahan === 'batal') {
      // "Batal" tidak menghapus baris, melainkan tandai status pembatalan
      // agar riwayat tetap utuh dan tidak benar-benar terhapus.
      const catatanLama = pengajuan.data_lama && pengajuan.data_lama.header
        ? (pengajuan.data_lama.header.catatan || '')
        : (pengajuan.data_lama.catatan || '');
      const { error: errUpdate } = await supabaseAdmin
        .from(pengajuan.tabel_target)
        .update({ catatan: `[DIBATALKAN OLEH OWNER pada ${new Date().toISOString()}] ${catatanLama}` })
        .eq('id', pengajuan.record_id);
      if (errUpdate) throw errUpdate;
      await catatAudit({
        tabel: pengajuan.tabel_target, recordId: pengajuan.record_id, aksi: 'approve',
        dataLama: pengajuan.data_lama, dataBaru: { dibatalkan: true }, userId: user.id,
      });
    }

    await supabaseAdmin.from('approval_queue').update({
      status: 'approved', ditinjau_oleh: user.id, ditinjau_pada: new Date().toISOString(),
    }).eq('id', id);

    req.flash('success', 'Pengajuan disetujui dan perubahan telah diterapkan.');
  } catch (err) {
    req.flash('error', 'Gagal menyetujui pengajuan: ' + err.message);
  }
  res.redirect('/laporan/approval');
}

async function tolakPerubahan(req, res) {
  const user = req.session.user;
  const { id } = req.params;
  const { catatan_reviewer } = req.body;
  try {
    await supabaseAdmin.from('approval_queue').update({
      status: 'rejected', ditinjau_oleh: user.id, ditinjau_pada: new Date().toISOString(), catatan_reviewer,
    }).eq('id', id);
    req.flash('success', 'Pengajuan ditolak.');
  } catch (err) {
    req.flash('error', 'Gagal menolak pengajuan: ' + err.message);
  }
  res.redirect('/laporan/approval');
}

module.exports = { listApproval, ajukanPerubahan, setujuiPerubahan, tolakPerubahan };
