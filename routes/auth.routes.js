const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

/**
 * Routes publiques d'authentification
 * Pas de middleware accessControl sur ces routes
 */

// POST /auth/login
router.post('/login', authController.login);

// POST /auth/logout
router.post('/logout', authController.logout);

// GET /auth/me
router.get('/me', authController.me);

module.exports = router;