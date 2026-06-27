const express = require('express');
const router = express.Router();
const produksiCtrl = require('../controllers/produksiController');
const { requireLogin, requireRole } = require('../middlewares/auth');

router.use(requireLogin);

router.get('/', produksiCtrl.listProduksi);
router.get('/tambah', requireRole('owner', 'admin', 'produksi'), produksiCtrl.formTambahProduksi);
router.post('/tambah', requireRole('owner', 'admin', 'produksi'), produksiCtrl.simpanTambahProduksi);
router.get('/konversi-frozen', requireRole('owner', 'admin', 'produksi'), produksiCtrl.formKonversiFrozen);
router.post('/konversi-frozen', requireRole('owner', 'admin', 'produksi'), produksiCtrl.simpanKonversiFrozen);

module.exports = router;
