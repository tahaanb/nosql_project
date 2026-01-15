const { runRead, runWrite } = require('./neo4j.service');
const crypto = require('crypto');
const debug = require('debug')('app:access:decision');

/**
 * Convertit une méthode HTTP en action de permission
 */
function httpMethodToAction(method) {
  const methodMap = {
    'GET': 'READ',
    'POST': 'CREATE',
    'PUT': 'UPDATE',
    'PATCH': 'UPDATE',
    'DELETE': 'DELETE',
    'HEAD': 'READ',
    'OPTIONS': 'READ'
  };
  return methodMap[method.toUpperCase()] || 'READ';
}

/**
 * Récupère l'adresse IP du client en tenant compte des proxies
 */
function extractClientIp(req) {
  // Vérifier les en-têtes de proxy
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const ips = xff.split(',').map(ip => ip.trim());
    return ips[0] || '127.0.0.1';
  }
  
  // Vérifier l'en-tête CF-Connecting-IP (Cloudflare)
  if (req.headers['cf-connecting-ip']) {
    return req.headers['cf-connecting-ip'];
  }
  
  // Vérifier l'en-tête X-Real-IP (Nginx)
  if (req.headers['x-real-ip']) {
    return req.headers['x-real-ip'];
  }
  
  // Sinon, utiliser l'adresse distante
  return req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Vérifie les permissions de l'utilisateur
 */
async function hasPermission(userId, action, resourcePath) {
  debug(`\n=== DEBUT hasPermission ===`);
  debug(`Paramètres: userId=${userId}, action=${action}, resourcePath=${resourcePath}`);
  
  // Nettoyer le chemin de la ressource
  const cleanPath = resourcePath
    .replace(/^\/|\/$/g, '')  // Supprimer les slashes de début et de fin
    .replace(/\/+/g, '/')      // Remplacer les slashes multiples par un seul
    .toLowerCase();
    
  debug(`Chemin nettoyé: ${cleanPath}`);

  try {
    // Vérifier d'abord si l'utilisateur est admin
    debug(`\n[1/3] Vérification du statut administrateur pour l'utilisateur ${userId}`);
    const isAdmin = await checkAdminStatus(userId);
    debug(`[1/3] Résultat de checkAdminStatus: ${isAdmin}`);
    
    if (isAdmin) {
      debug('=== ACCÈS ADMIN ACCORDÉ ===');
      debug(`L'utilisateur ${userId} est administrateur, accès accordé à ${resourcePath}`);
      return true;
    }

    // Vérifier la permission spécifique
    const cypher = `
      MATCH (u:User {id: $userId})-[:HAS_ROLE]->(r:Role)
      MATCH (r)-[:GRANTS]->(p:Permission)-[:ACCESS_TO]->(res:Resource)
      WHERE p.name STARTS WITH $action
      AND (
        res.path = $resourcePath OR
        $resourcePath STARTS WITH (res.path + '/')
      )
      RETURN p.name as permission, res.path as resourcePath
      LIMIT 1
    `;
    
    debug('Exécution de la requête de permission:', { 
      cypher, 
      userId, 
      action: action.toUpperCase() + '_',
      resourcePath: cleanPath 
    });
    
    const result = await runRead(cypher, { 
      userId, 
      action: action.toUpperCase() + '_',
      resourcePath: cleanPath
    });
    
    const hasPermission = result.records.length > 0;
    
    if (hasPermission) {
      const permission = result.records[0].get('permission');
      const resource = result.records[0].get('resourcePath');
      debug(`Permission accordée: ${permission} pour ${resource}`);
    } else {
      debug('Aucune permission trouvée');
    }
    
    return hasPermission;
  } catch (error) {
    debug('Erreur lors de la vérification de la permission:', error);
    return false;
  }
}

/**
 * Vérifie si l'utilisateur est administrateur
 */
async function checkAdminStatus(userId) {
  try {
    debug(`Vérification du statut administrateur pour l'utilisateur ${userId}`);
    
    const cypher = `
      MATCH (u:User {id: $userId})-[:HAS_ROLE]->(r:Role)
      WHERE r.name = 'ADMIN'
      RETURN count(r) > 0 as isAdmin
    `;
    
    debug(`Exécution de la requête: ${cypher} avec userId: ${userId}`);
    
    const result = await runRead(cypher, { userId });
    const isAdmin = result.records[0]?.get('isAdmin') || false;
    
    debug(`L'utilisateur ${userId} est admin ? ${isAdmin}`);
    return isAdmin;
  } catch (error) {
    debug('Erreur lors de la vérification du statut admin:', error);
    return false;
  }
}

/**
 * Obtient l'état de l'IP pour un utilisateur
 */
async function getIpStateForUser(userId, ipAddress) {
  const cypher = `
    MATCH (u:User {id: $userId})
    OPTIONAL MATCH (u)-[r:CONNECTS_FROM]->(ip:IP)
    WITH u, 
         COLLECT(DISTINCT {address: ip.address, firstSeen: r.firstSeen, lastSeen: r.lastSeen}) AS ips
    RETURN {
      isFirstIp: SIZE(ips) = 0,
      isKnownIp: ANY(ip IN ips WHERE ip.address = $ipAddress),
      knownIps: ips,
      totalIps: SIZE(ips)
    } AS ipState
  `;

  try {
    const result = await runRead(cypher, { userId, ipAddress });
    return result.records[0]?.get('ipState') || { 
      isFirstIp: true, 
      isKnownIp: false, 
      knownIps: [],
      totalIps: 0
    };
  } catch (error) {
    debug('Erreur lors de la vérification de l\'état IP:', error);
    return { 
      isFirstIp: true, 
      isKnownIp: false,
      knownIps: [],
      totalIps: 0
    };
  }
}

/**
 * Journalise une tentative d'accès
 */
async function logAccessAttempt(data) {
  const {
    userId,
    username,
    resourcePath,
    method,
    action,
    ipAddress,
    status,
    reason,
    userAgent = '',
    referer = ''
  } = data;

  const attemptId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  try {
    await runWrite(`
      MATCH (u:User {id: $userId})
      MERGE (ip:IP {address: $ipAddress})
      ON CREATE SET 
        ip.firstSeen = datetime($timestamp),
        ip.lastSeen = datetime($timestamp)
      ON MATCH SET 
        ip.lastSeen = datetime($timestamp)
      
      MERGE (u)-[r:CONNECTS_FROM]->(ip)
      ON CREATE SET 
        r.firstSeen = datetime($timestamp),
        r.lastSeen = datetime($timestamp)
      ON MATCH SET 
        r.lastSeen = datetime($timestamp)
      
      MERGE (res:Resource {path: $resourcePath})
      ON CREATE SET 
        res.createdAt = datetime($timestamp)
      
      CREATE (attempt:AccessAttempt {
        id: $attemptId,
        timestamp: datetime($timestamp),
        path: $resourcePath,
        method: $method,
        action: $action,
        status: $status,
        reason: $reason,
        userAgent: $userAgent,
        referer: $referer
      })
      
      MERGE (u)-[:MADE_ATTEMPT]->(attempt)
      MERGE (attempt)-[:FROM_IP]->(ip)
      MERGE (attempt)-[:TARGETED]->(res)
      
      RETURN attempt
    `, {
      userId,
      attemptId,
      username,
      resourcePath,
      method,
      action,
      ipAddress,
      status,
      reason,
      userAgent,
      referer,
      timestamp
    });

    debug(`Tentative d'accès enregistrée: ${status} - ${reason}`);
  } catch (error) {
    debug('Erreur lors de l\'enregistrement de la tentative d\'accès:', error);
    // Ne pas propager l'erreur pour ne pas interrompre le flux
  }
}

/**
 * Prend une décision d'accès
 */
async function decideAccess(req) {
  const startTime = Date.now();
  const { method, path, headers, session } = req;
  const action = httpMethodToAction(method);
  const ipAddress = extractClientIp(req);
  const userAgent = headers['user-agent'] || '';
  const referer = headers.referer || '';

  debug(`=== Décision d'accès pour ${method} ${path} ===`);
  debug(`IP: ${ipAddress}, User-Agent: ${userAgent}`);

  // Vérification de session
  if (!session?.user) {
    debug('Refus: aucune session utilisateur trouvée');
    return {
      status: 'REFUSED',
      reason: 'no_session',
      action,
      ipAddress,
      resourcePath: path,
      timestamp: new Date().toISOString()
    };
  }

  const { userId, username } = session.user;

  try {
    // Vérification en parallèle des permissions et de l'état IP
    const [permissionOk, ipState] = await Promise.all([
      hasPermission(userId, action, path),
      getIpStateForUser(userId, ipAddress)
    ]);

    debug(`Résultats - Permission: ${permissionOk}, État IP:`, ipState);

    let status, reason, isSuspicious = false;

    // Logique de décision
    if (!permissionOk) {
      status = 'REFUSED';
      reason = 'no_permission';
      debug('Refus: permissions insuffisantes');
    } else if (ipState.isFirstIp) {
      status = 'AUTHORIZED';
      reason = 'first_ip_authorized';
      debug('Autorisation accordée: première connexion depuis cette IP');
    } else if (ipState.isKnownIp) {
      status = 'AUTHORIZED';
      reason = 'known_ip';
      debug('Autorisation accordée: IP connue');
    } else {
      status = 'SUSPICIOUS';
      reason = 'new_ip_detected';
      isSuspicious = true;
      debug('Activité suspecte: nouvelle IP détectée');
    }

    // Journalisation asynchrone (ne pas attendre)
    logAccessAttempt({
      userId,
      username,
      resourcePath: path,
      method,
      action,
      ipAddress,
      status,
      reason,
      userAgent,
      referer,
      processingTime: Date.now() - startTime
    }).catch(error => {
      debug('Erreur lors de la journalisation asynchrone:', error);
    });

    return {
      status,
      reason,
      action,
      ipAddress,
      resourcePath: path,
      isSuspicious,
      ipState: {
        isFirstIp: ipState.isFirstIp,
        isKnownIp: ipState.isKnownIp,
        totalIps: ipState.totalIps
      },
      timestamp: new Date().toISOString(),
      processingTime: Date.now() - startTime
    };

  } catch (error) {
    debug('Erreur lors de la prise de décision d\'accès:', error);
    
    // Journalisation de l'erreur
    logAccessAttempt({
      userId,
      username,
      resourcePath: path,
      method,
      action,
      ipAddress,
      status: 'ERROR',
      reason: 'decision_error',
      error: error.message,
      userAgent,
      referer
    }).catch(err => debug('Erreur lors de la journalisation d\'erreur:', err));

    return {
      status: 'ERROR',
      reason: 'internal_error',
      action,
      ipAddress,
      resourcePath: path,
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
}

module.exports = {
  decideAccess,
  hasPermission,
  getIpStateForUser,
  httpMethodToAction,
  extractClientIp
};