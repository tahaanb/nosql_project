const { decideAccess } = require('../services/accessDecision.service');
const debug = require('debug')('app:access');
const createError = require('http-errors');

// Routes publiques qui ne passent pas par le moteur de décision
const PUBLIC_PATHS = [
  /^\/auth(\/.*)?$/,
  /^\/health$/,
];

function isPublicPath(path) {
  return PUBLIC_PATHS.some((re) => re.test(path));
}

/**
 * Middleware central d'accès.
 * - Identifie l'utilisateur courant (session)
 * - Détermine la ressource (route) et l'action (méthode HTTP -> READ/WRITE/DELETE)
 * - Vérifie le chemin User -> Role -> Permission -> Resource
 * - Vérifie l'IP (première, connue, nouvelle)
 * - Crée un nœud AccessAttempt + relations
 * - Retourne au frontend : { status, reason }
 */
/**
 * Vérifie si le chemin est public
 */
function isPublicPath(path) {
  const publicPaths = [
    '/',
    '/auth/login',
    '/auth/logout',
    '/auth/me',
    '/check-access/forbidden',
    '/favicon.ico'
  ];
  
  // Vérifie si le chemin commence par un chemin public
  return publicPaths.some(publicPath => 
    path === publicPath || 
    path.startsWith(`${publicPath}/`)
  );
}

/**
 * Middleware de contrôle d'accès
 */
module.exports = async function accessControl(req, res, next) {
  const startTime = Date.now();
  const { method, path, session } = req;
  
  debug('\n=== Début du contrôle d\'accès ===');
  debug(`[${new Date().toISOString()}] ${method} ${path}`);
  debug('Session ID:', session?.id);
  
  if (isPublicPath(path)) {
    debug('Accès autorisé: chemin public');
    return next();
  }

  // Vérifier si l'utilisateur est authentifié
  if (!session || !session.user) {
    debug('Accès refusé: utilisateur non authentifié');
    return next(createError(401, {
      code: 'UNAUTHENTICATED',
      message: 'Authentification requise',
      details: {
        action: 'login',
        path: '/auth/login'
      }
    }));
  }

  try {
    debug(`Vérification des permissions pour l'utilisateur: ${session.user.username}`);
    
    const decision = await decideAccess(req);
    const processingTime = Date.now() - startTime;
    
    debug('Décision d\'accès:', {
      status: decision.status,
      reason: decision.reason,
      processingTime: `${processingTime}ms`,
      resource: decision.resourcePath,
      action: decision.action,
      ip: decision.ipAddress
    });

    // Stocker la décision pour une utilisation ultérieure (logs, etc.)
    req.accessDecision = decision;

    if (decision.status === 'AUTHORIZED') {
      debug('Accès autorisé');
      return next();
    }

    // Déterminer le code d'erreur HTTP approprié
    let statusCode = 403; // Forbidden par défaut
    let errorCode = 'FORBIDDEN';
    
    if (decision.reason === 'no_session') {
      statusCode = 401; // Unauthorized
      errorCode = 'UNAUTHENTICATED';
    } else if (decision.reason === 'suspicious_activity') {
      statusCode = 429; // Too Many Requests
      errorCode = 'TOO_MANY_REQUESTS';
    }

    debug(`Accès refusé: ${decision.reason} (HTTP ${statusCode})`);
    
    return next(createError(statusCode, {
      code: errorCode,
      message: 'Accès refusé',
      details: {
        reason: decision.reason,
        action: decision.action,
        resource: decision.resourcePath,
        ip: decision.ipAddress,
        userId: session.user.userId,
        role: session.user.role
      }
    }));
  } catch (error) {
    debug('Erreur lors de la vérification des permissions:', error);
    return next(createError(500, {
      code: 'AUTH_ERROR',
      message: 'Erreur lors de la vérification des permissions',
      details: {
        error: error.message
      }
    }));
  }
};

