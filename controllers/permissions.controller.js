const { runRead, runWrite } = require('../services/neo4j.service');
const crypto = require('crypto');

/**
 * GET /permissions
 * Liste toutes les permissions
 */
async function getAllPermissions(req, res, next) {
  try {
    const cypher = `
      MATCH (p:Permission)
      RETURN p.id AS id, p.action AS action, p.description AS description
      ORDER BY p.action
    `;

    const result = await runRead(cypher);
    const permissions = result.records.map((record) => ({
      id: record.get('id'),
      action: record.get('action'),
      description: record.get('description'),
    }));

    res.json({ permissions });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /permissions
 * Crée une nouvelle permission
 * Body: { action (READ/WRITE/DELETE), description? }
 */
async function createPermission(req, res, next) {
  try {
    const { action, description } = req.body;

    if (!action) {
      return res.status(400).json({ message: 'Action requise (READ, WRITE, DELETE)' });
    }

    const permissionId = crypto.randomUUID();

    const cypher = `
      CREATE (p:Permission {
        id: $permissionId,
        action: $action,
        description: $description,
        createdAt: datetime()
      })
      RETURN p
    `;

    await runWrite(cypher, {
      permissionId,
      action,
      description: description || null,
    });

    res.status(201).json({
      message: 'Permission créée',
      permission: { id: permissionId, action, description },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /permissions/:id/resource
 * Associe une permission à une ressource
 * Body: { resourceId }
 */
async function assignPermissionToResource(req, res, next) {
  try {
    const { id } = req.params;
    const { resourceId } = req.body;

    if (!resourceId) {
      return res.status(400).json({ message: 'resourceId requis' });
    }

    const cypher = `
      MATCH (p:Permission {id: $permissionId})
      MATCH (r:Resource {id: $resourceId})
      MERGE (p)-[:ACCESS_TO]->(r)
      RETURN p, r
    `;

    const result = await runWrite(cypher, { permissionId: id, resourceId });

    if (result.records.length === 0) {
      return res.status(404).json({ message: 'Permission ou Ressource non trouvée' });
    }

    res.json({ message: 'Permission associée à la ressource' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllPermissions,
  createPermission,
  assignPermissionToResource,
};