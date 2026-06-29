// ============================================================
// Middleware: Read-Only Master Data untuk Role Admin
// Master Produk, Bahan Baku, Stock Point, dan Supplier hanya
// dapat ditambah/diubah/dihapus oleh Owner. Admin hanya bisa
// melihat (read-only).
// ============================================================

function blokirAdminTulis(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') {
    req.flash('error', 'Anda tidak memiliki hak akses untuk menambah atau mengubah data master');
    return res.redirect('back');
  }
  next();
}

module.exports = { blokirAdminTulis };
