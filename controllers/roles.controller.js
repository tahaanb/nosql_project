const express = require('express');
const router = express.Router();
const rolesController = require('../controllers/roles.controller');

/**
 * Routes protégées pour la gestion des rôles
 * Le middleware accessControl vérifie automatiquement les permissions
 */

// GET /roles - Nécessite permission READ sur /roles
router.get('/', rolesController.getAllRoles);

// POST /roles - Nécessite permission WRITE sur /roles
router.post('/', rolesController.createRole);

// PUT /roles/:id - Nécessite permission WRITE sur /roles
router.put('/:id', rolesController.updateRole);

// DELETE /roles/:id - Nécessite permission DELETE sur /roles
router.delete('/:id', rolesController.deleteRole);

// POST /roles/:name/permissions - Associe une permission à un rôle
// Nécessite permission WRITE sur /roles
// Paramètre: name du rôle (ex: "ADMIN")
// Body: { permissionName: "READ_DASHBOARD" }
router.post('/:name/permissions', rolesController.assignPermissionToRole);

module.exports = router;