const { runRead } = require('../services/neo4j.service');
const logger = console;

/**
 * GET /access/attempts
 * Récupère les tentatives d'accès avec filtrage avancé
 * Query params:
 * - userId: Filtre par utilisateur
 * - status: Filtre par statut (AUTHORIZED, DENIED, etc.)
 * - ip: Filtre par adresse IP
 * - limit: Limite le nombre de résultats (défaut: 100)
 * - offset: Pagination (défaut: 0)
 */
async function getAccessAttempts(req, res, next) {
  const startTime = process.hrtime();
  const { 
    userId, 
    status, 
    ip, 
    limit = 100, 
    offset = 0 
  } = req.query;

  try {
    // Validation des paramètres
    const parsedLimit = Math.min(parseInt(limit, 10), 1000); // Limite maximale de 1000
    const parsedOffset = Math.max(0, parseInt(offset, 10));

    // Construction de la requête Cypher
    let cypher = `
      MATCH (attempt:AccessAttempt)
      WHERE 1=1
    `;
    
    const params = {
      limit: parsedLimit,
      skip: parsedOffset
    };

    // Filtres
    const filters = [];
    
    if (userId) {
      filters.push(`(u:User {id: $userId})-[:TRIED_TO_ACCESS]->(attempt)`);
      params.userId = userId;
    }
    
    if (status) {
      filters.push(`attempt.status = $status`);
      params.status = status;
    }
    
    if (ip) {
      filters.push(`(attempt)-[:FROM_IP]->(:IP {address: $ip})`);
      params.ip = ip;
    }

    // Ajout des filtres à la requête
    if (filters.length > 0) {
      cypher += `\n  ${filters.join('\n  AND ')}`;
    }

    // Jointures optionnelles
    cypher += `
      OPTIONAL MATCH (attempt)-[:TARGETED]->(r:Resource)
      OPTIONAL MATCH (attempt)-[:FROM_IP]->(ip:IP)
      ${userId ? '' : 'OPTIONAL MATCH (u:User)-[:TRIED_TO_ACCESS]->(attempt)'}
    `;

    // Sélection et tri
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
        ip.address AS ipAddress,
        u.id AS userId,
        u.username AS requestUsername
      ORDER BY attempt.timestamp DESC
      SKIP $skip
      LIMIT $limit
    `;

    logger.debug('Exécution de la requête de récupération des tentatives', {
      cypher,
      params
    });

    const result = await runRead(cypher, params);
    
    // Requête pour le décompte total (pour la pagination)
    const countCypher = `
      MATCH (attempt:AccessAttempt)
      ${filters.length > 0 ? 'WHERE ' + filters.join('\n  AND ').replace(/-\[\:MADE_ATTEMPT\]-/g, '-[:TRIED_TO_ACCESS]->') : ''}
      RETURN count(attempt) AS total
    `;
    
    const countResult = await runRead(countCypher, params);
    const total = countResult.records[0]?.get('total').toNumber() || 0;

    const attempts = result.records.map((record) => ({
      id: record.get('id'),
      timestamp: record.get('timestamp'),
      path: record.get('path'),
      method: record.get('method'),
      action: record.get('action'),
      status: record.get('status'),
      reason: record.get('reason'),
      username: record.get('username') || record.get('requestUsername'),
      userId: record.get('userId'),
      resourcePath: record.get('resourcePath'),
      ipAddress: record.get('ipAddress')
    }));

    const [seconds, ns] = process.hrtime(startTime);
    const responseTime = (seconds * 1000 + ns / 1e6).toFixed(2);

    logger.info('Récupération des tentatives d\'accès', {
      count: attempts.length,
      total,
      responseTime: `${responseTime}ms`,
      filteredBy: { userId, status, ip }
    });

    res.json({ 
      success: true,
      data: attempts,
      pagination: {
        total,
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: (parsedOffset + attempts.length) < total
      }
    });

  } catch (error) {
    logger.error('Erreur lors de la récupération des tentatives d\'accès', {
      error: error.message,
      stack: error.stack,
      query: req.query
    });
    next(error);
  }
}

/**
 * GET /access/decision
 * Récupère la décision d'accès pour la requête courante
 */
async function getAccessDecision(req, res) {
  const { accessDecision } = req;
  
  if (!accessDecision) {
    logger.warn('Tentative d\'accès à la décision sans middleware accessControl', {
      path: req.path,
      method: req.method,
      sessionId: req.sessionID
    });
    
    return res.status(500).json({ 
      success: false,
      code: 'MISSING_ACCESS_DECISION',
      message: 'La décision d\'accès n\'est pas disponible'
    });
  }

  logger.debug('Récupération de la décision d\'accès', {
    decision: accessDecision,
    userId: req.session?.user?.userId,
    path: req.path
  });

  res.json({ 
    success: true,
    data: accessDecision
  });
}

/**
 * POST /access/check-permission
 * Vérifie si l'utilisateur a une permission spécifique
 * Body: { permission: string }
 */
async function checkPermission(req, res, next) {
  const { permission: permissionName } = req.body;
  const { username } = req.user;

  if (!permissionName) {
    return res.status(400).json({ 
      error: 'Le paramètre "permission" est requis' 
    });
  }

  try {
    const cypher = `
      MATCH (u:User {username: $username})-[:HAS_ROLE]->(r:Role)
            -[:GRANTS]->(p:Permission {name: $permissionName})
      RETURN COUNT(p) > 0 AS hasPermission
    `;

    const result = await runRead(cypher, { username, permissionName });
    const hasPermission = result.records[0]?.get('hasPermission') || false;

    res.json({ 
      hasPermission,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking permission:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la vérification de la permission',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

module.exports = {
  getAccessAttempts,
  getAccessDecision,
  checkPermission
};