const express = require('express');
const router = express.Router();
const penjualanCtrl = require('../controllers/penjualanController');
const { requireLogin, requireRole } = require('../middlewares/auth');

router.use(requireLogin);

router.get('/', penjualanCtrl.listPenjualan);
router.get('/tambah', requireRole('owner', 'admin'), penjualanCtrl.formTambahPenjualan);
router.post('/cek-stok', requireRole('owner', 'admin'), penjualanCtrl.cekStokPenjualan);
router.post('/tambah', requireRole('owner', 'admin'), penjualanCtrl.simpanTambahPenjualan);
router.get('/:id', penjualanCtrl.detailPenjualan);
router.post('/:id/selesai', requireRole('owner', 'admin'), penjualanCtrl.tandaiSelesai);

module.exports = router;
