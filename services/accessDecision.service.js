const { runRead, runWrite } = require('./neo4j.service');
const crypto = require('crypto');

/**
 * Convertit la méthode HTTP en action
 */
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
 * Construit le nom de la permission selon le format BD : ACTION_RESOURCE
 * Exemples : READ_DASHBOARD, WRITE_USERS, DELETE_USERS
 */
function buildPermissionName(action, resourcePath) {
  // /dashboard → DASHBOARD
  // /users → USERS
  // /admin → ADMIN
  const resourceName = resourcePath
    .replace(/^\//, '')  // Enlever le / initial
    .toUpperCase();      // Mettre en majuscules
  
  return `${action}_${resourceName}`;
}

/**
 * Récupère l'adresse IP logique du client.
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
 * Vérifie les permissions selon la structure BD exacte.
 * Cherche une permission nommée "ACTION_RESOURCE" (ex: "READ_DASHBOARD")
 */
async function hasPermission(username, action, resourcePath) {
  const permissionName = buildPermissionName(action, resourcePath);
  
  console.log('🔍 Checking permission:', { username, permissionName, resourcePath });
  
  const cypher = `
    MATCH (u:User {username: $username})-[:HAS_ROLE]->(r:Role)
          -[:GRANTS]->(p:Permission {name: $permissionName})
          -[:ACCESS_TO]->(res:Resource {path: $path})
    RETURN COUNT(p) > 0 AS hasPermission
  `;
  
  const result = await runRead(cypher, { username, permissionName, path: resourcePath });
  const record = result.records[0];
  const hasPerm = record ? record.get('hasPermission') : false;
  
  console.log('✅ Permission result:', hasPerm);
  
  return hasPerm;
}

/**
 * Détermine l'état de l'IP pour un utilisateur :
 * - isFirstIp: aucune IP connue pour cet utilisateur
 * - isKnownIp: IP déjà vue pour cet utilisateur
 */
async function getIpStateForUser(username, ipAddress) {
  const cypher = `
    MATCH (u:User {username: $username})
    OPTIONAL MATCH (u)-[:CONNECTS_FROM]->(ip:IP)
    WITH u, COLLECT(ip.address) AS ips
    RETURN
      SIZE(ips) = 0 AS isFirstIp,
      $ip IN ips AS isKnownIp
  `;
  
  const result = await runRead(cypher, { username, ip: ipAddress });
  if (result.records.length === 0) {
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
  username,
  resourcePath,
  method,
  action,
  ipAddress,
  status,
  reason,
}) {
  const attemptId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  
  const cypher = `
    MATCH (u:User {username: $username})
    MERGE (res:Resource {path: $path})
    MERGE (ip:IP {address: $ip})
    
    // Créer la relation CONNECTS_FROM uniquement si AUTHORIZED
    WITH u, res, ip
    ${status === 'AUTHORIZED' ? 'MERGE (u)-[:CONNECTS_FROM]->(ip)' : ''}
    
    // Créer l'AccessAttempt
    CREATE (attempt:AccessAttempt {
      id: $attemptId,
      timestamp: datetime($timestamp),
      status: $status,
      reason: $reason
    })
    
    // Créer les relations
    MERGE (u)-[:TRIED_TO_ACCESS]->(attempt)
    MERGE (attempt)-[:TARGET]->(res)
    MERGE (attempt)-[:FROM_IP]->(ip)
    
    RETURN attempt
  `;
  
  await runWrite(cypher, {
    username,
    path: resourcePath,
    ip: ipAddress,
    status,
    reason,
    attemptId,
    timestamp,
  });
  
  console.log('📝 Access attempt logged:', { username, resourcePath, status });
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
    console.log('❌ No session found');
    return {
      status: 'REFUSED',
      reason: 'no_session',
      skipLogging: true,
    };
  }
  
  const { username } = req.session.user;
  const method = req.method;
  const action = httpMethodToAction(method);
  const resourcePath = req.path;
  const ipAddress = extractClientIp(req);
  
  console.log('🔐 Access decision:', { username, method, action, resourcePath, ipAddress });
  
  const [permissionOk, ipState] = await Promise.all([
    hasPermission(username, action, resourcePath),
    getIpStateForUser(username, ipAddress),
  ]);
  
  let status;
  let reason;
  
  if (!permissionOk) {
    status = 'REFUSED';
    reason = 'no_permission';
    console.log('🚫 REFUSED: No permission');
  } else {
    if (ipState.isFirstIp || ipState.isKnownIp) {
      status = 'AUTHORIZED';
      reason = ipState.isFirstIp ? 'permission_ok_first_ip' : 'permission_ok_ip_known';
      console.log('✅ AUTHORIZED:', reason);
    } else {
      status = 'SUSPICIOUS';
      reason = 'permission_ok_new_ip_detected';
      console.log('⚠️ SUSPICIOUS: New IP detected');
    }
  }
  
  // Enregistrement systématique de la tentative
  await logAccessAttempt({
    username,
    resourcePath,
    method,
    action,
    ipAddress,
    status,
    reason,
  });
  
  return { status, reason, action, ipAddress, resourcePath };
}

module.exports = {
  decideAccess,
  buildPermissionName, // Exporté pour les tests
};