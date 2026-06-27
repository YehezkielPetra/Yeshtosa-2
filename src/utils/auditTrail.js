// ============================================================
// Audit Trail Helper
// Mencatat setiap perubahan penting: nilai lama, nilai baru,
// tanggal, jam, dan user yang melakukan perubahan.
// ============================================================
const { supabaseAdmin } = require('../config/supabase');

/**
 * Mencatat satu entri audit trail.
 * @param {Object} params
 * @param {string} params.tabel - nama tabel target
 * @param {string} params.recordId - id record yang diubah
 * @param {'create'|'update'|'delete'|'approve'|'reject'} params.aksi
 * @param {Object|null} params.dataLama
 * @param {Object|null} params.dataBaru
 * @param {string} params.userId
 */
async function catatAudit({ tabel, recordId, aksi, dataLama = null, dataBaru = null, userId }) {
  const { error } = await supabaseAdmin.from('audit_trail').insert({
    tabel_target: tabel,
    record_id: recordId,
    aksi,
    data_lama: dataLama,
    data_baru: dataBaru,
    user_id: userId,
  });
  if (error) {
    console.error('[audit_trail] gagal mencatat:', error.message);
  }
}

module.exports = { catatAudit };
