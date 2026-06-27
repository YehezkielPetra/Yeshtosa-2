// ============================================================
// YESHTOSA ERP - Entry Point
// ============================================================
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');
const morgan = require('morgan');
const helmet = require('helmet');
const path = require('path');
const ejsMate = require('ejs-mate');
const rateLimit = require('express-rate-limit');

const { injectCommonData } = require('./middlewares/commonData');
const { requireLogin } = require('./middlewares/auth');
const { rupiah, tanggalIndo } = require('./utils/format');

const app = express();

// --- Helper format tersedia di semua view EJS ---
app.locals.rupiah = rupiah;
app.locals.tanggalIndo = tanggalIndo;

// --- View engine ---
app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Security headers ---
app.use(helmet({
  contentSecurityPolicy: false, // dinonaktifkan agar Tailwind CDN/inline style tidak terblokir; aktifkan & sesuaikan di produksi jika perlu
}));

// --- Logging ---
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// --- Body parsing ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(methodOverride('_method'));

// --- Static files ---
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Session & Flash ---
// Cookie 'secure' HANYA boleh true jika koneksi benar-benar HTTPS.
// Mengandalkan NODE_ENV semata berisiko: jika NODE_ENV=production
// tapi diakses lewat HTTP (misal saat testing lokal), browser akan
// MENOLAK menyimpan cookie sama sekali, sehingga session selalu gagal.
const useSecureCookie = process.env.FORCE_SECURE_COOKIE === 'true';

app.use(session({
  secret: process.env.SESSION_SECRET || 'ganti_secret_ini',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 8, // 8 jam
    httpOnly: true,
    secure: useSecureCookie,
    sameSite: 'lax',
  },
}));
app.use(flash());

// --- Rate limiting untuk login (mencegah brute force) ---
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Terlalu banyak percobaan login. Silakan coba lagi nanti.',
});
app.use('/login', loginLimiter);

// --- Inject data umum ke semua view ---
app.use(injectCommonData);

// --- Routes ---
app.use('/', require('./routes/authRoutes'));
app.use('/', require('./routes/dashboardRoutes'));
app.use('/master', require('./routes/masterRoutes'));
app.use('/penjualan', require('./routes/penjualanRoutes'));
app.use('/produksi', require('./routes/produksiRoutes'));
app.use('/pembelian', require('./routes/pembelianRoutes'));
app.use('/pengeluaran', require('./routes/pengeluaranRoutes'));
app.use('/pembayaran', require('./routes/pembayaranRoutes'));
app.use('/stok', require('./routes/stokRoutes'));
app.use('/laporan', require('./routes/laporanRoutes'));
app.use('/pengaturan', require('./routes/pengaturanRoutes'));

// --- Root redirect ---
app.get('/', (req, res) => {
  res.redirect(req.session && req.session.user ? '/dashboard' : '/login');
});

// --- 404 handler ---
app.use((req, res) => {
  res.status(404).render('errors/404', { title: 'Halaman Tidak Ditemukan' });
});

// --- Global error handler ---
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(500).render('errors/500', { title: 'Terjadi Kesalahan', errorMessage: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Yeshtosa ERP berjalan di http://localhost:${PORT}`);
});

module.exports = app;
