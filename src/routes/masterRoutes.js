const express = require('express');
const router = express.Router();
const produkCtrl = require('../controllers/masterProdukController');
const bahanCtrl = require('../controllers/masterBahanBakuController');
const pelangganCtrl = require('../controllers/masterPelangganController');
const supplierCtrl = require('../controllers/masterSupplierController');
const stockPointCtrl = require('../controllers/masterStockPointController');
const { requireLogin, requireRole } = require('../middlewares/auth');

router.use(requireLogin);

// Master Produk
router.get('/produk', produkCtrl.listProduk);
router.get('/produk/tambah', requireRole('owner', 'admin'), produkCtrl.formTambahProduk);
router.post('/produk/tambah', requireRole('owner', 'admin'), produkCtrl.simpanTambahProduk);
router.get('/produk/:id/edit', requireRole('owner', 'admin'), produkCtrl.formEditProduk);
router.post('/produk/:id/edit', requireRole('owner', 'admin'), produkCtrl.simpanEditProduk);

// Master Bahan Baku
router.get('/bahan-baku', bahanCtrl.listBahanBaku);
router.get('/bahan-baku/tambah', requireRole('owner', 'admin'), bahanCtrl.formTambahBahanBaku);
router.post('/bahan-baku/tambah', requireRole('owner', 'admin'), bahanCtrl.simpanTambahBahanBaku);
router.get('/bahan-baku/:id/edit', requireRole('owner', 'admin'), bahanCtrl.formEditBahanBaku);
router.post('/bahan-baku/:id/edit', requireRole('owner', 'admin'), bahanCtrl.simpanEditBahanBaku);

// Master Pelanggan
router.get('/pelanggan', pelangganCtrl.listPelanggan);
router.get('/pelanggan/cek-duplikat', requireRole('owner', 'admin'), pelangganCtrl.cekNamaDuplikat);
router.get('/pelanggan/tambah', requireRole('owner', 'admin'), pelangganCtrl.formTambahPelanggan);
router.post('/pelanggan/tambah', requireRole('owner', 'admin'), pelangganCtrl.simpanTambahPelanggan);
router.get('/pelanggan/:id/edit', requireRole('owner', 'admin'), pelangganCtrl.formEditPelanggan);
router.post('/pelanggan/:id/edit', requireRole('owner', 'admin'), pelangganCtrl.simpanEditPelanggan);

// Master Supplier
router.get('/supplier', supplierCtrl.listSupplier);
router.get('/supplier/tambah', requireRole('owner', 'admin'), supplierCtrl.formTambahSupplier);
router.post('/supplier/tambah', requireRole('owner', 'admin'), supplierCtrl.simpanTambahSupplier);
router.get('/supplier/:id/edit', requireRole('owner', 'admin'), supplierCtrl.formEditSupplier);
router.post('/supplier/:id/edit', requireRole('owner', 'admin'), supplierCtrl.simpanEditSupplier);

// Master Stock Point
router.get('/stock-point', stockPointCtrl.listStockPoint);
router.get('/stock-point/tambah', requireRole('owner', 'admin'), stockPointCtrl.formTambahStockPoint);
router.post('/stock-point/tambah', requireRole('owner', 'admin'), stockPointCtrl.simpanTambahStockPoint);
router.get('/stock-point/:id/edit', requireRole('owner', 'admin'), stockPointCtrl.formEditStockPoint);
router.post('/stock-point/:id/edit', requireRole('owner', 'admin'), stockPointCtrl.simpanEditStockPoint);

module.exports = router;
