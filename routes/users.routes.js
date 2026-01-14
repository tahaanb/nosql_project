const express = require('express');
const router = express.Router();
const usersController = require('../controllers/users.controller');

/**
 * Routes protégées pour la gestion des utilisateurs
 * Le middleware accessControl vérifie automatiquement les permissions
 */

// GET /users - Nécessite permission READ sur /users
router.get('/', usersController.getAllUsers);

// POST /users - Nécessite permission WRITE sur /users
router.post('/', usersController.createUser);

// PUT /users/:id - Nécessite permission WRITE sur /users
router.put('/:id', usersController.updateUser);

// DELETE /users/:id - Nécessite permission DELETE sur /users
router.delete('/:id', usersController.deleteUser);

module.exports = router;