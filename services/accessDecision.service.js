const { runRead, runWrite } = require('./neo4j.service');
const crypto = require('crypto');

function httpMethodToAction(method) {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'READ';
    case 'POST':
    case 'PUT':
    case 'PATCH':
      return 'WRITE';
    case 'DELETE':
      return 'DELETE';
    default:
      return 'READ';
  }
}

/**
 * Récupère l'adresse IP logique du client.
 * On reste volontairement simple : X-Forwarded-For ou remoteAddress.
 */
function extractClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    return xff.split(',')[0].trim();
  }
  const remote = req.socket && req.socket.remoteAddress;
  return remote || '127.0.0.1';
}

/**
 * Vérifie les permissions (User -> Role -> Permission -> Resource).
 */
async function hasPermission(userId, action, resourcePath) {
  const cypher = `
    MATCH (u:User {id: $userId})-[:HAS_ROLE]->(r:Role)
          -[:GRANTS]->(p:Permission {action: $action})
          -[:ACCESS_TO]->(res:Resource {path: $path})
    RETURN COUNT(p) > 0 AS hasPermission
  `;

  const result = await runRead(cypher, { userId, action, path: resourcePath });
  const record = result.records[0];
  return record ? record.get('hasPermission') : false;
}

/**
 * Détermine l'état de l'IP pour un utilisateur :
 * - isFirstIp: aucune IP connue pour cet utilisateur
 * - isKnownIp: IP déjà vue pour cet utilisateur
 */
async function getIpStateForUser(userId, ipAddress) {
  const cypher = `
    MATCH (u:User {id: $userId})
    OPTIONAL MATCH (u)-[:CONNECTS_FROM]->(ip:IP)
    WITH u, COLLECT(ip.address) AS ips
    RETURN
      SIZE(ips) = 0 AS isFirstIp,
      $ip IN ips AS isKnownIp
  `;

  const result = await runRead(cypher, { userId, ip: ipAddress });
  if (result.records.length === 0) {
    // Utilisateur inexistant côté graph
    return { isFirstIp: true, isKnownIp: false };
  }
  const record = result.records[0];
  return {
    isFirstIp: record.get('isFirstIp'),
    isKnownIp: record.get('isKnownIp'),
  };
}

/**
 * Enregistre systématiquement la tentative d'accès en base,
 * et crée les relations demandées.
 */
async function logAccessAttempt({
  userId,
  username,
  resourcePath,
  method,
  action,
  ipAddress,
  status,
  reason,
}) {
  const attemptId = crypto.randomUUID();

  const cypher = `
    MATCH (u:User {id: $userId})
    MATCH (res:Resource {path: $path})
    MERGE (ip:IP {address: $ip})
    MERGE (u)-[:CONNECTS_FROM]->(ip)
    CREATE (attempt:AccessAttempt {
      id: $attemptId,
      timestamp: datetime(),
      path: $path,
      method: $method,
      action: $action,
      ip: $ip,
      status: $status,
      reason: $reason,
      username: $username
    })
    MERGE (u)-[:TRIED_TO_ACCESS]->(attempt)
    MERGE (attempt)-[:TARGET]->(res)
    MERGE (attempt)-[:FROM_IP]->(ip)
    RETURN attempt
  `;

  await runWrite(cypher, {
    userId,
    username,
    path: resourcePath,
    method,
    action,
    ip: ipAddress,
    status,
    reason,
    attemptId,
  });
}

/**
 * Règles de décision (non négociables) :
 * - Permission OK + IP connue        => AUTHORIZED
 * - Permission OK + IP nouvelle      => SUSPICIOUS
 * - Permission manquante             => REFUSED
 *
 * On considère que :
 * - Première IP pour l'utilisateur   => considérée comme connue (AUTHORIZED si permission OK)
 */
async function decideAccess(req) {
  if (!req.session || !req.session.user) {
    return {
      status: 'REFUSED',
      reason: 'no_session',
      skipLogging: true, // pas d'utilisateur -> pas de log d'AccessAttempt
    };
  }

  const { userId, username } = req.session.user;
  const method = req.method;
  const action = httpMethodToAction(method);
  const resourcePath = req.path; // ressource = route demandée (sans query)
  const ipAddress = extractClientIp(req);

  const [permissionOk, ipState] = await Promise.all([
    hasPermission(userId, action, resourcePath),
    getIpStateForUser(userId, ipAddress),
  ]);

  let status;
  let reason;

  if (!permissionOk) {
    status = 'REFUSED';
    reason = 'no_permission';
  } else {
    if (ipState.isFirstIp || ipState.isKnownIp) {
      status = 'AUTHORIZED';
      reason = ipState.isFirstIp ? 'permission_ok_first_ip' : 'permission_ok_ip_known';
    } else {
      status = 'SUSPICIOUS';
      reason = 'permission_ok_new_ip_detected';
    }
  }

  // Enregistrement systématique de la tentative (si user existant)
  if (userId) {
    await logAccessAttempt({
      userId,
      username,
      resourcePath,
      method,
      action,
      ipAddress,
      status,
      reason,
    });
  }

  return { status, reason, action, ipAddress, resourcePath };
}

module.exports = {
  decideAccess,
};

