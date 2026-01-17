const { runRead, runWrite } = require('../services/neo4j.service');

/**
 * GET /permissions
 * Liste toutes les permissions (format: READ_DASHBOARD, WRITE_USERS, etc.)
 */
async function getAllPermissions(req, res, next) {
  try {
    const cypher = `
      MATCH (p:Permission)
      RETURN p.name AS name
      ORDER BY p.name
    `;

    const result = await runRead(cypher);
    const permissions = result.records.map((record) => ({
      name: record.get('name'),
    }));

    res.json({ permissions });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /permissions
 * Crée une nouvelle permission
 * Body: { name (ex: "READ_REPORTS", "WRITE_SETTINGS") }
 */
async function createPermission(req, res, next) {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Nom de la permission requis (ex: READ_DASHBOARD)' });
    }

    // Vérifier le format (doit être ACTION_RESOURCE)
    if (!name.match(/^(READ|WRITE|DELETE)_[A-Z]+$/)) {
      return res.status(400).json({
        message: 'Format invalide. Attendu: ACTION_RESOURCE (ex: READ_DASHBOARD, WRITE_USERS)'
      });
    }

    const cypher = `
      MERGE (p:Permission {name: $name})
      RETURN p
    `;

    await runWrite(cypher, { name });

    res.status(201).json({
      message: 'Permission créée',
      permission: { name },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /permissions/:name/resource
 * Associe une permission à une ressource
 * Body: { resourcePath (ex: "/dashboard") }
 */
async function assignPermissionToResource(req, res, next) {
  try {
    const { name } = req.params;
    const { resourcePath } = req.body;

    if (!resourcePath) {
      return res.status(400).json({ message: 'resourcePath requis' });
    }

    const cypher = `
      MATCH (p:Permission {name: $name})
      MATCH (r:Resource {path: $resourcePath})
      MERGE (p)-[:ACCESS_TO]->(r)
      RETURN p, r
    `;

    const result = await runWrite(cypher, { name, resourcePath });

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