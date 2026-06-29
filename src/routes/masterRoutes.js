const express = require('express');
const router = express.Router();
const produkCtrl = require('../controllers/masterProdukController');
const bahanCtrl = require('../controllers/masterBahanBakuController');
const pelangganCtrl = require('../controllers/masterPelangganController');
const supplierCtrl = require('../controllers/masterSupplierController');
const stockPointCtrl = require('../controllers/masterStockPointController');
const promoCtrl = require('../controllers/masterPromoController');
const { requireLogin, requireRole } = require('../middlewares/auth');
const { blokirAdminTulis } = require('../middlewares/readOnlyMaster');

router.use(requireLogin);

// ============================================================
// Master Produk, Bahan Baku, Stock Point, Supplier:
// READ-ONLY untuk role admin. Hanya Owner yang dapat menambah,
// mengubah, atau menghapus data master ini.
// ============================================================

// Master Produk
router.get('/produk', produkCtrl.listProduk);
router.get('/produk/tambah', requireRole('owner'), produkCtrl.formTambahProduk);
router.post('/produk/tambah', requireRole('owner'), produkCtrl.simpanTambahProduk);
router.get('/produk/:id/edit', requireRole('owner', 'admin'), produkCtrl.formEditProduk);
router.post('/produk/:id/edit', blokirAdminTulis, requireRole('owner'), produkCtrl.simpanEditProduk);

// Master Bahan Baku
router.get('/bahan-baku', bahanCtrl.listBahanBaku);
router.get('/bahan-baku/tambah', requireRole('owner'), bahanCtrl.formTambahBahanBaku);
router.post('/bahan-baku/tambah', requireRole('owner'), bahanCtrl.simpanTambahBahanBaku);
router.get('/bahan-baku/:id/edit', requireRole('owner', 'admin'), bahanCtrl.formEditBahanBaku);
router.post('/bahan-baku/:id/edit', blokirAdminTulis, requireRole('owner'), bahanCtrl.simpanEditBahanBaku);

// Master Pelanggan (TIDAK direstriksi — Admin tetap mengelola interaksi pelanggan harian)
router.get('/pelanggan', pelangganCtrl.listPelanggan);
router.get('/pelanggan/cek-duplikat', requireRole('owner', 'admin'), pelangganCtrl.cekNamaDuplikat);
router.get('/pelanggan/tambah', requireRole('owner', 'admin'), pelangganCtrl.formTambahPelanggan);
router.post('/pelanggan/tambah', requireRole('owner', 'admin'), pelangganCtrl.simpanTambahPelanggan);
router.get('/pelanggan/:id/edit', requireRole('owner', 'admin'), pelangganCtrl.formEditPelanggan);
router.post('/pelanggan/:id/edit', requireRole('owner', 'admin'), pelangganCtrl.simpanEditPelanggan);

// Master Supplier
router.get('/supplier', supplierCtrl.listSupplier);
router.get('/supplier/tambah', requireRole('owner'), supplierCtrl.formTambahSupplier);
router.post('/supplier/tambah', requireRole('owner'), supplierCtrl.simpanTambahSupplier);
router.get('/supplier/:id/edit', requireRole('owner', 'admin'), supplierCtrl.formEditSupplier);
router.post('/supplier/:id/edit', blokirAdminTulis, requireRole('owner'), supplierCtrl.simpanEditSupplier);

// Master Stock Point
router.get('/stock-point', stockPointCtrl.listStockPoint);
router.get('/stock-point/tambah', requireRole('owner'), stockPointCtrl.formTambahStockPoint);
router.post('/stock-point/tambah', requireRole('owner'), stockPointCtrl.simpanTambahStockPoint);
router.get('/stock-point/:id/edit', requireRole('owner', 'admin'), stockPointCtrl.formEditStockPoint);
router.post('/stock-point/:id/edit', blokirAdminTulis, requireRole('owner'), stockPointCtrl.simpanEditStockPoint);

// Master Promo (baru) — HALAMAN INI HANYA DAPAT DIAKSES OLEH OWNER.
// Promo hanya dapat dibuat, diubah, dan dihapus oleh Owner.
router.get('/promo', requireRole('owner'), promoCtrl.listPromo);
router.get('/promo/tambah', requireRole('owner'), promoCtrl.formTambahPromo);
router.post('/promo/tambah', requireRole('owner'), promoCtrl.simpanTambahPromo);
router.get('/promo/:id/edit', requireRole('owner'), promoCtrl.formEditPromo);
router.post('/promo/:id/edit', requireRole('owner'), promoCtrl.simpanEditPromo);

module.exports = router;
