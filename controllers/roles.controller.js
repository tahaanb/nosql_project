const { runRead, runWrite } = require('../services/neo4j.service');
const crypto = require('crypto');

/**
 * GET /roles
 * Liste tous les rôles
 */
async function getAllRoles(req, res, next) {
  try {
    const cypher = `
      MATCH (r:Role)
      RETURN r.id AS id, r.name AS name, r.description AS description
      ORDER BY r.name
    `;

    const result = await runRead(cypher);
    const roles = result.records.map((record) => ({
      id: record.get('id'),
      name: record.get('name'),
      description: record.get('description'),
    }));

    res.json({ roles });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /roles
 * Crée un nouveau rôle
 * Body: { name, description? }
 */
async function createRole(req, res, next) {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Nom du rôle requis' });
    }

    const roleId = crypto.randomUUID();

    const cypher = `
      CREATE (r:Role {
        id: $roleId,
        name: $name,
        description: $description,
        createdAt: datetime()
      })
      RETURN r
    `;

    await runWrite(cypher, {
      roleId,
      name,
      description: description || null,
    });

    res.status(201).json({
      message: 'Rôle créé',
      role: { id: roleId, name, description },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /roles/:id
 * Met à jour un rôle
 * Body: { name?, description? }
 */
async function updateRole(req, res, next) {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const cypher = `
      MATCH (r:Role {id: $id})
      SET r.name = COALESCE($name, r.name),
          r.description = COALESCE($description, r.description),
          r.updatedAt = datetime()
      RETURN r
    `;

    const result = await runWrite(cypher, { id, name, description });

    if (result.records.length === 0) {
      return res.status(404).json({ message: 'Rôle non trouvé' });
    }

    res.json({ message: 'Rôle mis à jour' });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /roles/:id
 * Supprime un rôle
 */
async function deleteRole(req, res, next) {
  try {
    const { id } = req.params;

    const cypher = `
      MATCH (r:Role {id: $id})
      DETACH DELETE r
    `;

    await runWrite(cypher, { id });

    res.json({ message: 'Rôle supprimé' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /roles/:id/permissions
 * Associe une permission à un rôle
 * Body: { permissionId }
 */
async function assignPermissionToRole(req, res, next) {
  try {
    const { id } = req.params;
    const { permissionId } = req.body;

    if (!permissionId) {
      return res.status(400).json({ message: 'permissionId requis' });
    }

    const cypher = `
      MATCH (r:Role {id: $roleId})
      MATCH (p:Permission {id: $permissionId})
      MERGE (r)-[:GRANTS]->(p)
      RETURN r, p
    `;

    const result = await runWrite(cypher, { roleId: id, permissionId });

    if (result.records.length === 0) {
      return res.status(404).json({ message: 'Rôle ou Permission non trouvé' });
    }

    res.json({ message: 'Permission associée au rôle' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
  assignPermissionToRole,
};