const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const auth = require('../middleware/auth');
const { checkUserPermission } = require('../services/permissions');

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

/**
 * Vérifie si l'utilisateur a une permission spécifique
 * POST /auth/check-permission
 * Body: { permission: 'NOM_DE_LA_PERMISSION' }
 */
router.post('/check-permission', auth.required, async (req, res) => {
  try {
    const { permission } = req.body;
    
    if (!permission) {
      return res.status(400).json({ 
        error: 'Permission non spécifiée',
        code: 'MISSING_PERMISSION'
      });
    }

    const hasPermission = await checkUserPermission(req.user.id, permission);
    
    return res.json({ 
      hasPermission,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erreur vérification permission:', error);
    return res.status(500).json({ 
      error: 'Erreur lors de la vérification de la permission',
      code: 'PERMISSION_CHECK_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;