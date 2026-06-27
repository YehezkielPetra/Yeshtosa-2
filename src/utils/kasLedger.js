// ============================================================
// Kas Ledger Helper
// Setiap transaksi yang menyentuh kas (penjualan, pembelian,
// pengeluaran, pembayaran) WAJIB lewat fungsi ini agar saldo
// kas selalu konsisten dan punya jejak audit.
//
// Saldo kas BUKAN laba — terdiri dari modal, hasil penjualan,
// biaya, pajak yang disisihkan, cadangan usaha, dan laba.
// ============================================================
const { supabaseAdmin } = require('../config/supabase');

/**
 * Mengambil saldo kas terakhir untuk satu cabang.
 */
async function getSaldoTerakhir(cabangId) {
  const { data, error } = await supabaseAdmin
    .from('kas_ledger')
    .select('saldo_setelah')
    .eq('cabang_id', cabangId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? Number(data.saldo_setelah) : 0;
}

/**
 * Menambahkan satu baris mutasi kas dan otomatis menghitung saldo berjalan.
 * @param {Object} params
 * @param {string} params.cabangId
 * @param {string} params.jenis - salah satu dari jenis_transaksi_kas enum
 * @param {number} params.jumlah - positif = masuk kas, negatif = keluar kas
 * @param {string} [params.referensiTipe]
 * @param {string} [params.referensiId]
 * @param {string} [params.keterangan]
 * @param {string} params.userId
 */
async function catatMutasiKas({ cabangId, jenis, jumlah, referensiTipe = null, referensiId = null, keterangan = null, userId }) {
  const saldoSebelum = await getSaldoTerakhir(cabangId);
  const saldoSesudah = Number(saldoSebelum) + Number(jumlah);

  const { data, error } = await supabaseAdmin
    .from('kas_ledger')
    .insert({
      cabang_id: cabangId,
      jenis,
      jumlah,
      saldo_setelah: saldoSesudah,
      referensi_tipe: referensiTipe,
      referensi_id: referensiId,
      keterangan,
      dicatat_oleh: userId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = { getSaldoTerakhir, catatMutasiKas };
