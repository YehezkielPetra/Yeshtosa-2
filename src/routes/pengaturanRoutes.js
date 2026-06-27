const express = require('express');
const router = express.Router();
const pengaturanCtrl = require('../controllers/pengaturanController');
const { requireLogin, requireRole } = require('../middlewares/auth');

router.use(requireLogin, requireRole('owner'));

router.get('/users', pengaturanCtrl.listUser);
router.get('/users/tambah', pengaturanCtrl.formTambahUser);
router.post('/users/tambah', pengaturanCtrl.simpanTambahUser);
router.get('/users/:id/edit', pengaturanCtrl.formEditUser);
router.post('/users/:id/edit', pengaturanCtrl.simpanEditUser);

module.exports = router;
