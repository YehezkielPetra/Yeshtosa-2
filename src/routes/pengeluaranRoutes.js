const express = require('express');
const router = express.Router();
const pengeluaranCtrl = require('../controllers/pengeluaranController');
const { requireLogin, requireRole } = require('../middlewares/auth');

router.use(requireLogin);

router.get('/', pengeluaranCtrl.listPengeluaran);
router.get('/tambah', requireRole('owner', 'admin'), pengeluaranCtrl.formTambahPengeluaran);
router.post('/tambah', requireRole('owner', 'admin'), pengeluaranCtrl.simpanTambahPengeluaran);

module.exports = router;
