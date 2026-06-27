const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { redirectIfLoggedIn } = require('../middlewares/auth');

router.get('/login', redirectIfLoggedIn, authController.getLoginPage);
router.post('/login', redirectIfLoggedIn, authController.postLogin);
router.post('/logout', authController.postLogout);

module.exports = router;
