// ============================================================
// Middleware untuk inject data umum ke semua view
// ============================================================
const { supabaseAdmin } = require('../config/supabase');

async function injectCommonData(req, res, next) {
  res.locals.flashSuccess = req.flash('success');
  res.locals.flashError = req.flash('error');
  res.locals.currentUser = (req.session && req.session.user) || null;
  res.locals.currentPath = req.path;
  res.locals.appName = process.env.APP_NAME || 'Yeshtosa ERP';

  // Daftar cabang untuk selector di navbar (cache ringan per-request)
  try {
    const { data: cabangList } = await supabaseAdmin
      .from('cabang')
      .select('id, kode, nama')
      .eq('is_aktif', true)
      .order('nama');
    res.locals.cabangList = cabangList || [];
  } catch (e) {
    res.locals.cabangList = [];
  }

  next();
}

module.exports = { injectCommonData };
