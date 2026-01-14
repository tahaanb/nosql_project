const { runRead, runWrite } = require('./neo4j.service');
const crypto = require('crypto');
const debug = require('debug')('app:access:decision');

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
  debug(`Vérification de la permission: user=${userId}, action=${action}, resource=${resourcePath}`);
  
  // Nettoyer le chemin de la ressource pour le faire correspondre au format des permissions
  const cleanPath = resourcePath
    .replace(/^\/|\/$/g, '')  // Supprimer les slashes au début et à la fin
    .replace(/\//g, '_')       // Remplacer les slashes par des underscores
    .replace(/-/g, '_')        // Remplacer les tirets par des underscores
    .toUpperCase();            // Tout en majuscules
    
  const permissionName = `${action.toUpperCase()}_${cleanPath}`;
  debug(`Permission recherchée: ${permissionName}`);
  
  const cypher = `
    MATCH (u:User {id: $userId})-[:HAS_ROLE]->(r:Role)
          -[:GRANTS]->(p:Permission {name: $permissionName})
          -[:ACCESS_TO]->(res:Resource {path: $resourcePath})
    RETURN COUNT(p) > 0 AS hasPermission
  `;
  
  debug('Requête de permission:', cypher, { userId, permissionName, resourcePath });

  try {
    const result = await runRead(cypher, { 
      userId, 
      permissionName,
      resourcePath 
    });
    
    debug('Résultat de la requête de permission:', JSON.stringify(result, null, 2));
    
    if (!result.records || result.records.length === 0) {
      debug('Aucun enregistrement trouvé pour la permission');
      return false;
    }
    
    const record = result.records[0];
    const hasPerm = record ? record.get('hasPermission') : false;
    debug(`Permission ${hasPerm ? 'accordée' : 'refusée'}`);
    
    // Si la permission n'est pas trouvée, vérifier si l'utilisateur est admin
    if (!hasPerm) {
      const isAdminCypher = `
        MATCH (u:User {id: $userId})-[:HAS_ROLE]->(r:Role {name: 'ADMIN'})
        RETURN COUNT(r) > 0 AS isAdmin
      `;
      const adminResult = await runRead(isAdminCypher, { userId });
      const isAdmin = adminResult.records[0]?.get('isAdmin') || false;
      
      if (isAdmin) {
        debug('Accès accordé: utilisateur est ADMIN');
        return true;
      }
    }
    
    return hasPerm;
  } catch (error) {
    debug('Erreur lors de la vérification de la permission:', error);
    return false;
  }
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
  debug('=== Décision d\'accès ===');
  debug(`Méthode: ${req.method}, Chemin: ${req.path}`);
  debug('Session:', req.session);
  if (!req.session || !req.session.user) {
    debug('Refus: aucune session utilisateur trouvée');
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

  debug(`Vérification des permissions pour l'utilisateur ${userId} (${username})`);
  debug(`Action: ${action}, Ressource: ${resourcePath}, IP: ${ipAddress}`);
  
  const [permissionOk, ipState] = await Promise.all([
    hasPermission(userId, action, resourcePath),
    getIpStateForUser(userId, ipAddress),
  ]);
  
  debug(`Résultats - Permission: ${permissionOk}, État IP:`, ipState);

  let status;
  let reason;

  if (!permissionOk) {
    status = 'REFUSED';
    reason = 'no_permission';
    debug('Refus: permissions insuffisantes');
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

