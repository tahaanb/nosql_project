const express = require('express');
const router = express.Router();
const accessController = require('../controllers/access.controller');

/**
 * Routes protégées pour consulter les tentatives d'accès
 * Le middleware accessControl vérifie automatiquement les permissions
 */

// GET /access/attempts - Récupère toutes les tentatives d'accès
// Nécessite permission READ sur /access
router.get('/attempts', accessController.getAccessAttempts);

// GET /access/decision - Retourne la décision d'accès courante
// Nécessite permission READ sur /access
router.get('/decision', accessController.getAccessDecision);

// POST /access/check-permission - Vérifie si l'utilisateur a une permission spécifique
// Body: { permission: 'READ_USERS' }
// Nécessite d'être authentifié (vérifié par le middleware d'authentification)
router.post('/check-permission', accessController.checkPermission);

module.exports = router;