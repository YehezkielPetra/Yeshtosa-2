const express = require('express');
const router = express.Router();
const pembayaranCtrl = require('../controllers/pembayaranController');
const { requireLogin, requireRole } = require('../middlewares/auth');

router.use(requireLogin);

router.get('/', pembayaranCtrl.listPembayaran);
router.get('/tambah', requireRole('owner', 'admin'), pembayaranCtrl.formTambahPembayaran);
router.post('/tambah', requireRole('owner', 'admin'), pembayaranCtrl.simpanTambahPembayaran);

module.exports = router;
