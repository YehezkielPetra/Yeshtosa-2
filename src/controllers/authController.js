// ============================================================
// Auth Controller
// ============================================================
const { supabaseAdmin, supabaseAuthClient } = require('../config/supabase');

function getLoginPage(req, res) {
  res.render('auth/login', { title: 'Login' });
}

async function postLogin(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    req.flash('error', 'Email dan password wajib diisi.');
    return res.redirect('/login');
  }

  try {
    const { data: authData, error: authError } = await supabaseAuthClient.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      req.flash('error', 'Email atau password salah.');
      return res.redirect('/login');
    }

    // Ambil profil & role dari app_users
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('app_users')
      .select('id, nama, role, cabang_id, is_aktif, cabang:cabang_id(id, kode, nama)')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile) {
      req.flash('error', 'Akun ditemukan tetapi profil pengguna belum diatur. Hubungi Owner.');
      return res.redirect('/login');
    }

    if (!profile.is_aktif) {
      req.flash('error', 'Akun Anda tidak aktif. Hubungi Owner.');
      return res.redirect('/login');
    }

    req.session.user = {
      id: profile.id,
      nama: profile.nama,
      role: profile.role,
      cabangId: profile.cabang_id,
      cabangNama: profile.cabang ? profile.cabang.nama : null,
      email: authData.user.email,
    };

    req.flash('success', `Selamat datang, ${profile.nama}!`);
    return res.redirect('/dashboard');
  } catch (err) {
    console.error('[login] error:', err.message);
    req.flash('error', 'Terjadi kesalahan saat login. Silakan coba lagi.');
    return res.redirect('/login');
  }
}

function postLogout(req, res) {
  req.session.destroy(() => {
    res.redirect('/login');
  });
}

module.exports = { getLoginPage, postLogin, postLogout };
