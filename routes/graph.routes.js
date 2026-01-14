const express = require('express');
const router = express.Router();
const graphController = require('../controllers/graph.controller');

/**
 * Routes protégées pour visualiser le graphe
 * Le middleware accessControl vérifie automatiquement les permissions
 */

// GET /graph - Récupère tous les nœuds et relations
// Nécessite permission READ sur /graph
router.get('/', graphController.getGraph);

module.exports = router;