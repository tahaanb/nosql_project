const { runRead, runWrite } = require('../services/neo4j.service');
const crypto = require('crypto');

/**
 * GET /resources
 * Liste toutes les ressources protégées
 */
async function getAllResources(req, res, next) {
  try {
    const cypher = `
      MATCH (r:Resource)
      RETURN r.id AS id, r.path AS path, r.description AS description
      ORDER BY r.path
    `;

    const result = await runRead(cypher);
    const resources = result.records.map((record) => ({
      id: record.get('id'),
      path: record.get('path'),
      description: record.get('description'),
    }));

    res.json({ resources });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /resources
 * Crée une nouvelle ressource
 * Body: { path (ex: /dashboard, /admin), description? }
 */
async function createResource(req, res, next) {
  try {
    const { path, description } = req.body;

    if (!path) {
      return res.status(400).json({ message: 'Chemin de la ressource requis' });
    }

    const resourceId = crypto.randomUUID();

    const cypher = `
      CREATE (r:Resource {
        id: $resourceId,
        path: $path,
        description: $description,
        createdAt: datetime()
      })
      RETURN r
    `;

    await runWrite(cypher, {
      resourceId,
      path,
      description: description || null,
    });

    res.status(201).json({
      message: 'Ressource créée',
      resource: { id: resourceId, path, description },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllResources,
  createResource,
};