// ============================================================
// Master Pelanggan Controller
// Nomor pelanggan otomatis & permanen. Nama/HP dapat berubah.
// Kategori dapat berubah tanpa menghilangkan riwayat transaksi,
// dan setiap perubahan kategori WAJIB tercatat di histori.
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const { catatAudit } = require('../utils/auditTrail');

async function listPelanggan(req, res) {
  const { kategori, q } = req.query;
  let query = supabaseAdmin.from('master_pelanggan').select('*, pelanggan_hp(*)').order('nama');
  if (kategori) query = query.eq('kategori', kategori);
  if (q) query = query.ilike('nama', `%${q}%`);

  const { data, error } = await query;
  if (error) req.flash('error', 'Gagal memuat pelanggan: ' + error.message);

  res.render('master/pelanggan_list', {
    title: 'Master Pelanggan',
    pelangganList: data || [],
    filterKategori: kategori || '',
    q: q || '',
  });
}

function formTambahPelanggan(req, res) {
  const { nama, kembali_ke } = req.query;
  res.render('master/pelanggan_form', {
    title: 'Tambah Pelanggan',
    pelanggan: null,
    hpList: [],
    namaAwal: nama || '',
    kembaliKe: kembali_ke || '',
  });
}

async function simpanTambahPelanggan(req, res) {
  const { nama, kategori, alamat, cabang_id, catatan, kembali_ke } = req.body;
  let nomorHpArr = req.body.nomor_hp;
  if (!nomorHpArr) nomorHpArr = [];
  if (!Array.isArray(nomorHpArr)) nomorHpArr = [nomorHpArr];
  nomorHpArr = nomorHpArr.filter(n => n && n.trim() !== '');

  try {
    const { data: pelanggan, error } = await supabaseAdmin
      .from('master_pelanggan')
      .insert({ nama, kategori: kategori || 'konsumen', alamat, cabang_id: cabang_id || null, catatan })
      .select().single();
    if (error) throw error;

    if (nomorHpArr.length > 0) {
      const rows = nomorHpArr.map((hp, idx) => ({
        pelanggan_id: pelanggan.id,
        nomor_hp: hp.trim(),
        is_utama: idx === 0,
      }));
      await supabaseAdmin.from('pelanggan_hp').insert(rows);
    }

    // Catat histori kategori awal
    await supabaseAdmin.from('pelanggan_histori_kategori').insert({
      pelanggan_id: pelanggan.id,
      kategori_lama: null,
      kategori_baru: pelanggan.kategori,
      diubah_oleh: req.session.user.id,
      catatan: 'Pelanggan baru dibuat',
    });

    await catatAudit({ tabel: 'master_pelanggan', recordId: pelanggan.id, aksi: 'create', dataBaru: pelanggan, userId: req.session.user.id });
    req.flash('success', `Pelanggan berhasil ditambahkan dengan nomor ${pelanggan.nomor_pelanggan}.`);

    // Jika admin datang dari form penjualan (tombol "Tambah Pelanggan Baru"),
    // arahkan balik ke form tambah penjualan dengan pelanggan baru otomatis dipilih.
    if (kembali_ke === 'penjualan') {
      return res.redirect(`/penjualan/tambah?pelanggan_baru_id=${pelanggan.id}&pelanggan_baru_label=${encodeURIComponent(pelanggan.nomor_pelanggan + ' · ' + pelanggan.nama + ' (' + pelanggan.kategori.replace('_',' ') + ')')}`);
    }
    res.redirect('/master/pelanggan');
  } catch (err) {
    req.flash('error', 'Gagal menambah pelanggan: ' + err.message);
    res.redirect('/master/pelanggan/tambah');
  }
}

async function formEditPelanggan(req, res) {
  const { data: pelanggan, error } = await supabaseAdmin.from('master_pelanggan').select('*').eq('id', req.params.id).single();
  if (error || !pelanggan) {
    req.flash('error', 'Pelanggan tidak ditemukan.');
    return res.redirect('/master/pelanggan');
  }
  const { data: hpList } = await supabaseAdmin.from('pelanggan_hp').select('*').eq('pelanggan_id', pelanggan.id).order('is_utama', { ascending: false });
  const { data: histori } = await supabaseAdmin
    .from('pelanggan_histori_kategori')
    .select('*, user:diubah_oleh(nama)')
    .eq('pelanggan_id', pelanggan.id)
    .order('diubah_pada', { ascending: false });

  res.render('master/pelanggan_form', { title: 'Edit Pelanggan', pelanggan, hpList: hpList || [], historiKategori: histori || [] });
}

async function simpanEditPelanggan(req, res) {
  const { id } = req.params;
  const { nama, kategori, alamat, cabang_id, catatan, is_aktif } = req.body;
  let nomorHpArr = req.body.nomor_hp;
  if (!nomorHpArr) nomorHpArr = [];
  if (!Array.isArray(nomorHpArr)) nomorHpArr = [nomorHpArr];
  nomorHpArr = nomorHpArr.filter(n => n && n.trim() !== '');

  try {
    const { data: dataLama, error: errLama } = await supabaseAdmin.from('master_pelanggan').select('*').eq('id', id).single();
    if (errLama || !dataLama) throw new Error('Pelanggan tidak ditemukan');

    const kategoriBerubah = dataLama.kategori !== kategori;

    const { data: dataBaru, error } = await supabaseAdmin
      .from('master_pelanggan')
      .update({
        nama, kategori, alamat, cabang_id: cabang_id || null, catatan,
        is_aktif: is_aktif === 'on',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id).select().single();
    if (error) throw error;

    // Update nomor HP: hapus yang lama, insert ulang (sederhana & aman karena histori transaksi terpisah dari tabel ini)
    await supabaseAdmin.from('pelanggan_hp').delete().eq('pelanggan_id', id);
    if (nomorHpArr.length > 0) {
      const rows = nomorHpArr.map((hp, idx) => ({ pelanggan_id: id, nomor_hp: hp.trim(), is_utama: idx === 0 }));
      await supabaseAdmin.from('pelanggan_hp').insert(rows);
    }

    if (kategoriBerubah) {
      await supabaseAdmin.from('pelanggan_histori_kategori').insert({
        pelanggan_id: id,
        kategori_lama: dataLama.kategori,
        kategori_baru: kategori,
        diubah_oleh: req.session.user.id,
        catatan: 'Perubahan kategori melalui form edit',
      });
    }

    await catatAudit({ tabel: 'master_pelanggan', recordId: id, aksi: 'update', dataLama, dataBaru, userId: req.session.user.id });
    req.flash('success', 'Data pelanggan berhasil diperbarui.');
    res.redirect('/master/pelanggan');
  } catch (err) {
    req.flash('error', 'Gagal memperbarui pelanggan: ' + err.message);
    res.redirect(`/master/pelanggan/${id}/edit`);
  }
}

module.exports = {
  listPelanggan, formTambahPelanggan, simpanTambahPelanggan,
  formEditPelanggan, simpanEditPelanggan,
};
