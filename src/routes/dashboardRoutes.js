const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const ownerController = require('../controllers/ownerController');
const { requireLogin, requireRole } = require('../middlewares/auth');

router.get('/dashboard', requireLogin, dashboardController.getDashboard);
router.get('/owner/dashboard', requireLogin, requireRole('owner'), ownerController.getOwnerDashboard);

module.exports = router;
