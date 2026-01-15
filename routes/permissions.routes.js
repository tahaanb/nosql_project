const express = require('express');
const router = express.Router();
const permissionsController = require('../controllers/permissions.controller');

/**
 * Routes protégées pour la gestion des permissions
 * Le middleware accessControl vérifie automatiquement les permissions
 */

// GET /permissions - Nécessite permission READ sur /permissions
router.get('/', permissionsController.getAllPermissions);

// POST /permissions - Nécessite permission WRITE sur /permissions
router.post('/', permissionsController.createPermission);

// POST /permissions/:name/resource - Associe une permission à une ressource
// Nécessite permission WRITE sur /permissions
// Paramètre: name de la permission (ex: "READ_DASHBOARD")
// Body: { resourcePath: "/dashboard" }
router.post('/:name/resource', permissionsController.assignPermissionToResource);

module.exports = router;