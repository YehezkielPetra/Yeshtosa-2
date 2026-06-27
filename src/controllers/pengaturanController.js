// ============================================================
// Pengaturan Controller
// Owner mengelola user (Owner, Admin, Produksi) beserta hak
// aksesnya dan cabang penempatannya.
// ============================================================
const { supabaseAdmin } = require('../config/supabase');
const { catatAudit } = require('../utils/auditTrail');

async function listUser(req, res) {
  const { data, error } = await supabaseAdmin
    .from('app_users')
    .select('*, cabang:cabang_id(nama)')
    .order('created_at', { ascending: false });
  if (error) req.flash('error', 'Gagal memuat data user: ' + error.message);
  res.render('pengaturan/user_list', { title: 'Pengaturan Pengguna', userList: data || [] });
}

async function formTambahUser(req, res) {
  const { data: cabangList } = await supabaseAdmin.from('cabang').select('id, nama').eq('is_aktif', true);
  res.render('pengaturan/user_form', { title: 'Tambah Pengguna', cabangList: cabangList || [] });
}

async function simpanTambahUser(req, res) {
  const { email, password, nama, role, cabang_id } = req.body;
  try {
    // Buat akun di Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (authError) throw authError;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('app_users')
      .insert({ id: authData.user.id, nama, role, cabang_id: cabang_id || null })
      .select().single();
    if (profileError) throw profileError;

    await catatAudit({ tabel: 'app_users', recordId: profile.id, aksi: 'create', dataBaru: profile, userId: req.session.user.id });
    req.flash('success', `Pengguna ${nama} berhasil dibuat.`);
    res.redirect('/pengaturan/users');
  } catch (err) {
    req.flash('error', 'Gagal membuat pengguna: ' + err.message);
    res.redirect('/pengaturan/users/tambah');
  }
}

async function formEditUser(req, res) {
  const { data: user, error } = await supabaseAdmin.from('app_users').select('*').eq('id', req.params.id).single();
  if (error || !user) {
    req.flash('error', 'Pengguna tidak ditemukan.');
    return res.redirect('/pengaturan/users');
  }
  const { data: cabangList } = await supabaseAdmin.from('cabang').select('id, nama').eq('is_aktif', true);
  res.render('pengaturan/user_form', { title: 'Edit Pengguna', user, cabangList: cabangList || [] });
}

async function simpanEditUser(req, res) {
  const { id } = req.params;
  const { nama, role, cabang_id, is_aktif } = req.body;
  try {
    const { data: dataLama } = await supabaseAdmin.from('app_users').select('*').eq('id', id).single();
    const { data, error } = await supabaseAdmin
      .from('app_users')
      .update({ nama, role, cabang_id: cabang_id || null, is_aktif: is_aktif === 'on', updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;

    await catatAudit({ tabel: 'app_users', recordId: id, aksi: 'update', dataLama, dataBaru: data, userId: req.session.user.id });
    req.flash('success', 'Data pengguna berhasil diperbarui.');
    res.redirect('/pengaturan/users');
  } catch (err) {
    req.flash('error', 'Gagal memperbarui pengguna: ' + err.message);
    res.redirect(`/pengaturan/users/${id}/edit`);
  }
}

module.exports = { listUser, formTambahUser, simpanTambahUser, formEditUser, simpanEditUser };
