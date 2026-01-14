const { runRead } = require('../services/neo4j.service');

/**
 * GET /access/attempts
 * Récupère toutes les tentatives d'accès enregistrées
 * Query params: ?userId=... (optionnel pour filtrer)
 */
async function getAccessAttempts(req, res, next) {
  try {
    const { userId } = req.query;

    let cypher = `
      MATCH (attempt:AccessAttempt)
      OPTIONAL MATCH (attempt)-[:TARGET]->(r:Resource)
      OPTIONAL MATCH (attempt)-[:FROM_IP]->(ip:IP)
    `;

    const params = {};

    if (userId) {
      cypher = `
        MATCH (u:User {id: $userId})-[:TRIED_TO_ACCESS]->(attempt:AccessAttempt)
        OPTIONAL MATCH (attempt)-[:TARGET]->(r:Resource)
        OPTIONAL MATCH (attempt)-[:FROM_IP]->(ip:IP)
      `;
      params.userId = userId;
    }

    cypher += `
      RETURN 
        attempt.id AS id,
        attempt.timestamp AS timestamp,
        attempt.path AS path,
        attempt.method AS method,
        attempt.action AS action,
        attempt.status AS status,
        attempt.reason AS reason,
        attempt.username AS username,
        r.path AS resourcePath,
        ip.address AS ipAddress
      ORDER BY attempt.timestamp DESC
    `;

    const result = await runRead(cypher, params);
    const attempts = result.records.map((record) => ({
      id: record.get('id'),
      timestamp: record.get('timestamp'),
      path: record.get('path'),
      method: record.get('method'),
      action: record.get('action'),
      status: record.get('status'),
      reason: record.get('reason'),
      username: record.get('username'),
      resourcePath: record.get('resourcePath'),
      ipAddress: record.get('ipAddress'),
    }));

    res.json({ attempts });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /access/decision
 * Retourne la décision d'accès pour la requête courante
 * (middleware accessControl aura déjà fait le travail)
 */
async function getAccessDecision(req, res) {
  // Le middleware accessControl a déjà placé req.accessDecision
  if (!req.accessDecision) {
    return res.status(500).json({ message: 'Décision d\'accès non disponible' });
  }

  res.json({ decision: req.accessDecision });
}

module.exports = {
  getAccessAttempts,
  getAccessDecision,
};