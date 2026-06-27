const express = require('express');
const router = express.Router();
const tutupBukuCtrl = require('../controllers/tutupBukuController');
const approvalCtrl = require('../controllers/approvalController');
const analisisCtrl = require('../controllers/analisisController');
const { requireLogin, requireRole } = require('../middlewares/auth');

router.use(requireLogin);

// Tutup Buku (hanya Owner)
router.get('/tutup-buku', requireRole('owner'), tutupBukuCtrl.listTutupBuku);
router.get('/tutup-buku/baru', requireRole('owner'), tutupBukuCtrl.formTutupBuku);
router.post('/tutup-buku/preview', requireRole('owner'), tutupBukuCtrl.hitungPreviewTutupBuku);
router.post('/tutup-buku/baru', requireRole('owner'), tutupBukuCtrl.simpanTutupBuku);

// Approval Queue
router.get('/approval', requireRole('owner'), approvalCtrl.listApproval);
router.post('/approval/ajukan', requireRole('owner', 'admin'), approvalCtrl.ajukanPerubahan);
router.post('/approval/:id/setuju', requireRole('owner'), approvalCtrl.setujuiPerubahan);
router.post('/approval/:id/tolak', requireRole('owner'), approvalCtrl.tolakPerubahan);

// Analisis
router.get('/analisis/konsumen', analisisCtrl.analisisKonsumen);
router.get('/analisis/reseller', analisisCtrl.analisisReseller);
router.get('/analisis/stock-point', analisisCtrl.analisisStockPoint);

module.exports = router;
