const { runRead, runWrite } = require('../services/neo4j.service');
const crypto = require('crypto');

/**
 * GET /users
 * Liste tous les utilisateurs avec leurs rôles
 */
async function getAllUsers(req, res, next) {
  try {
    const cypher = `
      MATCH (u:User)
      OPTIONAL MATCH (u)-[:HAS_ROLE]->(r:Role)
      RETURN u.id AS id, u.username AS username, u.email AS email, r.name AS role
      ORDER BY u.username
    `;

    const result = await runRead(cypher);
    const users = result.records.map((record) => ({
      id: record.get('id'),
      username: record.get('username'),
      email: record.get('email'),
      role: record.get('role'),
    }));

    res.json({ users });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /users
 * Crée un nouvel utilisateur
 * Body: { username, email?, roleName? }
 */
async function createUser(req, res, next) {
  try {
    const { username, email, roleName } = req.body;

    if (!username) {
      return res.status(400).json({ message: 'Username requis' });
    }

    const userId = crypto.randomUUID();

    let cypher = `
      CREATE (u:User {
        id: $userId,
        username: $username,
        email: $email,
        createdAt: datetime()
      })
    `;

    const params = { userId, username, email: email || null };

    // Si un rôle est spécifié, créer la relation
    if (roleName) {
      cypher += `
        WITH u
        MATCH (r:Role {name: $roleName})
        MERGE (u)-[:HAS_ROLE]->(r)
      `;
      params.roleName = roleName;
    }

    cypher += ` RETURN u`;

    await runWrite(cypher, params);

    res.status(201).json({
      message: 'Utilisateur créé',
      user: { id: userId, username, email, role: roleName },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /users/:id
 * Met à jour un utilisateur
 * Body: { username?, email?, roleName? }
 */
async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const { username, email, roleName } = req.body;

    // Mise à jour des propriétés de base
    const cypher = `
      MATCH (u:User {id: $id})
      SET u.username = COALESCE($username, u.username),
          u.email = COALESCE($email, u.email),
          u.updatedAt = datetime()
      RETURN u
    `;

    const result = await runWrite(cypher, { id, username, email });

    if (result.records.length === 0) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Si roleName fourni, mettre à jour la relation
    if (roleName) {
      const roleUpdateCypher = `
        MATCH (u:User {id: $id})
        OPTIONAL MATCH (u)-[oldRel:HAS_ROLE]->(:Role)
        DELETE oldRel
        WITH u
        MATCH (r:Role {name: $roleName})
        MERGE (u)-[:HAS_ROLE]->(r)
      `;
      await runWrite(roleUpdateCypher, { id, roleName });
    }

    res.json({ message: 'Utilisateur mis à jour' });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /users/:id
 * Supprime un utilisateur
 */
async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;

    const cypher = `
      MATCH (u:User {id: $id})
      DETACH DELETE u
    `;

    await runWrite(cypher, { id });

    res.json({ message: 'Utilisateur supprimé' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
};