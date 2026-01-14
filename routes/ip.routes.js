const express = require('express');
const router = express.Router();
const ipController = require('../controllers/ip.controller');

/**
 * Routes protégées pour la gestion des IP
 * Le middleware accessControl vérifie automatiquement les permissions
 */

// GET /ips - Nécessite permission READ sur /ips
router.get('/', ipController.getAllIPs);

// POST /ips - Nécessite permission WRITE sur /ips
router.post('/', ipController.createIP);

// GET /users/:id/ips - Récupère les IP connues d'un utilisateur
// Nécessite permission READ sur /ips
router.get('/users/:id/ips', ipController.getUserIPs);

module.exports = router;