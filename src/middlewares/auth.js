// ============================================================
// Middleware Autentikasi
// ============================================================

function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    req.flash('error', 'Silakan login terlebih dahulu.');
    return res.redirect('/login');
  }
  res.locals.currentUser = req.session.user;
  next();
}

function redirectIfLoggedIn(req, res, next) {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  next();
}

/**
 * Membatasi akses hanya untuk role tertentu.
 * Contoh: requireRole('owner') atau requireRole('owner', 'admin')
 */
function requireRole(...rolesYangDiizinkan) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      req.flash('error', 'Silakan login terlebih dahulu.');
      return res.redirect('/login');
    }
    if (!rolesYangDiizinkan.includes(req.session.user.role)) {
      req.flash('error', 'Anda tidak memiliki hak akses untuk halaman ini.');
      return res.redirect('/dashboard');
    }
    next();
  };
}

module.exports = { requireLogin, redirectIfLoggedIn, requireRole };
