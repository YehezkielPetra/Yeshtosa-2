const express = require('express');
const router = express.Router();
const stokCtrl = require('../controllers/stokController');
const { requireLogin } = require('../middlewares/auth');

router.use(requireLogin);
router.get('/', stokCtrl.viewStok);

module.exports = router;
