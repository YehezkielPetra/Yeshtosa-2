// ============================================================
// Format Helper - Rupiah & Tanggal Indonesia
// Diekspos ke EJS lewat app.locals supaya bisa dipanggil
// langsung di semua view tanpa import berulang.
// ============================================================
const dayjs = require('dayjs');
require('dayjs/locale/id');
dayjs.locale('id');

function rupiah(angka) {
  const n = Number(angka) || 0;
  return 'Rp' + n.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}

function tanggalIndo(tgl, withTime = false) {
  if (!tgl) return '-';
  return dayjs(tgl).format(withTime ? 'D MMM YYYY, HH:mm' : 'D MMM YYYY');
}

module.exports = { rupiah, tanggalIndo };
