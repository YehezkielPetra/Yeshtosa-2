// ============================================================
// Konfigurasi koneksi Supabase
// Menggunakan SERVICE ROLE KEY -> hanya boleh dipakai di server,
// TIDAK PERNAH dikirim ke browser/frontend.
// ============================================================
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[FATAL] SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diset di .env');
  process.exit(1);
}

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Client terpisah untuk operasi auth (signIn) memakai anon key,
// agar perilaku auth standar Supabase tetap terjaga.
const supabaseAuthClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

module.exports = { supabaseAdmin, supabaseAuthClient };
