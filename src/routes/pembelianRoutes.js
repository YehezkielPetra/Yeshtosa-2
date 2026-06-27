const express = require('express');
const router = express.Router();
const pembelianCtrl = require('../controllers/pembelianController');
const { requireLogin, requireRole } = require('../middlewares/auth');

router.use(requireLogin);

router.get('/', pembelianCtrl.listPembelian);
router.get('/tambah', requireRole('owner', 'admin'), pembelianCtrl.formTambahPembelian);
router.post('/tambah', requireRole('owner', 'admin'), pembelianCtrl.simpanTambahPembelian);
router.get('/:id', pembelianCtrl.detailPembelian);

module.exports = router;
