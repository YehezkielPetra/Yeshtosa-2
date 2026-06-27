// ============================================================
// Modal Konfirmasi Generik
// Dipakai untuk menampilkan dialog konfirmasi sebelum submit
// form, misal saat ada data yang berpotensi duplikat.
//
// CARA PAKAI:
//   showConfirmModal({
//     title: 'Nama Pelanggan Sudah Ada',
//     message: 'Pelanggan dengan nama ini sudah terdaftar...',
//     details: ['PL-000001 · Budi Santoso (konsumen)'],
//     confirmLabel: 'Ya, Tetap Tambahkan',
//     cancelLabel: 'Batal',
//     onConfirm: () => { ... lanjutkan submit ... }
//   });
// ============================================================

function showConfirmModal(opts) {
  // Hapus modal lama jika ada (mencegah duplikat saat dipanggil berkali-kali)
  const existing = document.getElementById('confirm-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'confirm-modal-overlay';
  overlay.className = 'confirm-modal-overlay';

  const detailsHtml = (opts.details && opts.details.length)
    ? `<ul class="confirm-modal-details">${opts.details.map(d => `<li>${d}</li>`).join('')}</ul>`
    : '';

  overlay.innerHTML = `
    <div class="confirm-modal-box">
      <h3 class="confirm-modal-title">${opts.title || 'Konfirmasi'}</h3>
      <p class="confirm-modal-message">${opts.message || ''}</p>
      ${detailsHtml}
      <div class="confirm-modal-actions">
        <button type="button" class="btn-secondary confirm-modal-cancel">${opts.cancelLabel || 'Batal'}</button>
        <button type="button" class="btn-primary confirm-modal-confirm">${opts.confirmLabel || 'Ya, Lanjutkan'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  function closeModal() {
    overlay.remove();
  }

  overlay.querySelector('.confirm-modal-cancel').addEventListener('click', () => {
    closeModal();
    if (opts.onCancel) opts.onCancel();
  });

  overlay.querySelector('.confirm-modal-confirm').addEventListener('click', () => {
    closeModal();
    if (opts.onConfirm) opts.onConfirm();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal();
      if (opts.onCancel) opts.onCancel();
    }
  });
}
