const { runRead, runWrite } = require('../services/neo4j.service');

/**
 * GET /ips
 * Liste toutes les IP enregistrées
 */
async function getAllIPs(req, res, next) {
  try {
    const cypher = `
      MATCH (ip:IP)
      RETURN ip.address AS address
      ORDER BY ip.address
    `;

    const result = await runRead(cypher);
    const ips = result.records.map((record) => ({
      address: record.get('address'),
    }));

    res.json({ ips });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /ips
 * Enregistre une nouvelle IP (ou la retrouve si elle existe)
 * Body: { address }
 */
async function createIP(req, res, next) {
  try {
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({ message: 'Adresse IP requise' });
    }

    const cypher = `
      MERGE (ip:IP {address: $address})
      RETURN ip
    `;

    await runWrite(cypher, { address });

    res.status(201).json({
      message: 'IP enregistrée',
      ip: { address },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /users/:id/ips
 * Récupère toutes les IP connues d'un utilisateur
 */
async function getUserIPs(req, res, next) {
  try {
    const { id } = req.params;

    const cypher = `
      MATCH (u:User {id: $userId})-[:CONNECTS_FROM]->(ip:IP)
      RETURN ip.address AS address
      ORDER BY ip.address
    `;

    const result = await runRead(cypher, { userId: id });
    const ips = result.records.map((record) => ({
      address: record.get('address'),
    }));

    res.json({ ips });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllIPs,
  createIP,
  getUserIPs,
};