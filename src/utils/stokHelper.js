// ============================================================
// Stok Helper
// Semua perubahan stok (bahan baku & produk Fresh/Frozen)
// WAJIB lewat fungsi ini agar selalu tercatat mutasinya dan
// stok di tabel utama selalu sinkron dengan riwayat mutasi.
// ============================================================
const { supabaseAdmin } = require('../config/supabase');

/**
 * Mengubah stok bahan baku (tambah/kurang) dan mencatat mutasinya.
 * jumlahPerubahan: positif = masuk, negatif = keluar
 */
async function ubahStokBahanBaku({ bahanBakuId, cabangId, jumlahPerubahan, referensiTipe, referensiId = null, keterangan = null, userId }) {
  const { data: existing, error: errFind } = await supabaseAdmin
    .from('stok_bahan_baku')
    .select('*')
    .eq('bahan_baku_id', bahanBakuId)
    .eq('cabang_id', cabangId)
    .maybeSingle();
  if (errFind) throw errFind;

  const jumlahSebelum = existing ? Number(existing.jumlah) : 0;
  const jumlahSesudah = jumlahSebelum + Number(jumlahPerubahan);

  if (existing) {
    const { error } = await supabaseAdmin
      .from('stok_bahan_baku')
      .update({ jumlah: jumlahSesudah, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabaseAdmin
      .from('stok_bahan_baku')
      .insert({ bahan_baku_id: bahanBakuId, cabang_id: cabangId, jumlah: jumlahSesudah });
    if (error) throw error;
  }

  await supabaseAdmin.from('mutasi_stok_bahan_baku').insert({
    bahan_baku_id: bahanBakuId,
    cabang_id: cabangId,
    jumlah_perubahan: jumlahPerubahan,
    jumlah_sebelum: jumlahSebelum,
    jumlah_sesudah: jumlahSesudah,
    referensi_tipe: referensiTipe,
    referensi_id: referensiId,
    keterangan,
    dibuat_oleh: userId,
  });

  return { jumlahSebelum, jumlahSesudah };
}

/**
 * Mengubah stok produk jadi (Fresh atau Frozen) dan mencatat mutasinya.
 * izinkanStokNegatif: jika true, stok tetap diizinkan menjadi negatif
 * (dipakai saat admin sudah mengonfirmasi lewat modal "stok tidak cukup").
 * Mutasi tetap tercatat dengan jelas di kolom keterangan.
 */
async function ubahStokProduk({ produkId, cabangId, status, jumlahPerubahan, referensiTipe, referensiId = null, keterangan = null, userId, izinkanStokNegatif = false }) {
  const { data: existing, error: errFind } = await supabaseAdmin
    .from('stok_produk')
    .select('*')
    .eq('produk_id', produkId)
    .eq('cabang_id', cabangId)
    .eq('status', status)
    .maybeSingle();
  if (errFind) throw errFind;

  const jumlahSebelum = existing ? Number(existing.jumlah) : 0;
  const jumlahSesudah = jumlahSebelum + Number(jumlahPerubahan);

  if (jumlahSesudah < 0 && !izinkanStokNegatif) {
    throw new Error(`Stok ${status} tidak cukup. Sisa: ${jumlahSebelum}, diminta: ${Math.abs(jumlahPerubahan)}`);
  }

  const keteranganFinal = (jumlahSesudah < 0 && izinkanStokNegatif)
    ? `${keterangan || ''} [STOK KURANG - dikonfirmasi admin, sisa stok menjadi ${jumlahSesudah}]`.trim()
    : keterangan;

  if (existing) {
    const { error } = await supabaseAdmin
      .from('stok_produk')
      .update({ jumlah: jumlahSesudah, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabaseAdmin
      .from('stok_produk')
      .insert({ produk_id: produkId, cabang_id: cabangId, status, jumlah: jumlahSesudah });
    if (error) throw error;
  }

  await supabaseAdmin.from('mutasi_stok_produk').insert({
    produk_id: produkId,
    cabang_id: cabangId,
    status,
    jumlah_perubahan: jumlahPerubahan,
    jumlah_sebelum: jumlahSebelum,
    jumlah_sesudah: jumlahSesudah,
    referensi_tipe: referensiTipe,
    referensi_id: referensiId,
    keterangan: keteranganFinal,
    dibuat_oleh: userId,
  });

  return { jumlahSebelum, jumlahSesudah };
}

/**
 * Memindahkan stok Fresh yang tidak habis menjadi Frozen (dengan batch & expired).
 */
async function konversiFreshKeFrozen({ produkId, cabangId, jumlah, umurSimpanHari = 30, userId }) {
  // Kurangi Fresh
  await ubahStokProduk({
    produkId, cabangId, status: 'fresh',
    jumlahPerubahan: -jumlah,
    referensiTipe: 'konversi_fresh_ke_frozen',
    keterangan: `Konversi ${jumlah} unit Fresh ke Frozen`,
    userId,
  });
  // Tambah Frozen
  await ubahStokProduk({
    produkId, cabangId, status: 'frozen',
    jumlahPerubahan: jumlah,
    referensiTipe: 'konversi_fresh_ke_frozen',
    keterangan: `Hasil konversi dari Fresh`,
    userId,
  });

  const tanggalProduksi = new Date();
  const tanggalExpired = new Date();
  tanggalExpired.setDate(tanggalExpired.getDate() + Number(umurSimpanHari));

  const { error } = await supabaseAdmin.from('batch_stok_frozen').insert({
    produk_id: produkId,
    cabang_id: cabangId,
    jumlah_awal: jumlah,
    jumlah_sisa: jumlah,
    tanggal_produksi: tanggalProduksi.toISOString().slice(0, 10),
    tanggal_expired: tanggalExpired.toISOString().slice(0, 10),
    sumber: 'konversi_fresh',
  });
  if (error) throw error;
}

module.exports = { ubahStokBahanBaku, ubahStokProduk, konversiFreshKeFrozen };
