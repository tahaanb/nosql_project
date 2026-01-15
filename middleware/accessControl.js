const { decideAccess } = require('../services/accessDecision.service');
const debug = require('debug')('app:access:control');
const createError = require('http-errors');

// Liste des chemins publics (ne nécessitant pas d'authentification)
const PUBLIC_PATHS = [
  // Authentification
  /^\/auth(\/.*)?$/,
  /^\/login(\/.*)?$/,
  /^\/register(\/.*)?$/,
  
  // Santé et statut
  /^\/health(\/.*)?$/,
  /^\/status(\/.*)?$/,
  
  // Fichiers statiques
  /^\/static(\/.*)?$/,
  /^\/assets(\/.*)?$/,
  /^\/images(\/.*)?$/,
  /^\/favicon\.ico$/,
  
  // Documentation
  /^\/docs(\/.*)?$/,
  /^\/api-docs(\/.*)?$/,
  
  // Autres
  /^\/$/,  // Page d'accueil
  /^\/public(\/.*)?$/,
  /^\/healthz$/,  // Endpoint de santé pour Kubernetes
  /^\/readiness$/  // Endpoint de readiness pour Kubernetes
];

/**
 * Vérifie si un chemin est public
 */
function isPublicPath(path) {
  // Vérification rapide des chemins exacts
  if (path === '/' || 
      path === '/favicon.ico' || 
      path === '/health' || 
      path === '/status') {
    return true;
  }
  
  // Vérification des préfixes de chemin
  const publicPathPrefixes = [
    '/auth/',
    '/static/',
    '/assets/',
    '/public/',
    '/docs/'
  ];
  
  if (publicPathPrefixes.some(prefix => path.startsWith(prefix))) {
    return true;
  }
  
  // Vérification par expressions régulières
  return PUBLIC_PATHS.some(regex => regex.test(path));
}

/**
 * Middleware de contrôle d'accès principal
 */
module.exports = async function accessControl(req, res, next) {
  const startTime = process.hrtime();
  const { method, path, headers, session } = req;
  const userAgent = headers['user-agent'] || '';
  const referer = headers.referer || '';

  // Journalisation de la requête entrante
  debug(`\n=== [${new Date().toISOString()}] ${method} ${path} ===`);
  debug('Headers:', {
    'user-agent': userAgent,
    referer,
    'x-forwarded-for': headers['x-forwarded-for'],
    'x-real-ip': headers['x-real-ip']
  });

  // Vérification des chemins publics
  if (isPublicPath(path)) {
    debug('Accès autorisé: chemin public');
    req.isPublicPath = true;
    return next();
  }

  // Vérification de l'authentification
  if (!session?.user) {
    debug('Accès refusé: utilisateur non authentifié');
    return next(createError(401, {
      code: 'UNAUTHENTICATED',
      message: 'Authentification requise',
      details: {
        action: 'login',
        path: '/auth/login',
        method,
        resource: path
      }
    }));
  }

  const { userId, username, role } = session.user;

  try {
    // Journalisation du début de la vérification des permissions
    debug(`Vérification des permissions pour l'utilisateur: ${username} (${userId})`);
    debug(`Rôle: ${role}, IP: ${req.ip}`);

    // Décision d'accès
    const decision = await decideAccess(req);
    const processingTime = process.hrtime(startTime);
    const processingTimeMs = Math.round((processingTime[0] * 1000) + (processingTime[1] / 1000000));

    // Journalisation de la décision
    debug('Décision d\'accès:', {
      status: decision.status,
      reason: decision.reason,
      processingTime: `${processingTimeMs}ms`,
      resource: decision.resourcePath,
      action: decision.action,
      ip: decision.ipAddress,
      isSuspicious: decision.isSuspicious
    });

    // Stockage de la décision pour une utilisation ultérieure
    req.accessDecision = decision;

    // Traitement en fonction du statut de la décision
    switch (decision.status) {
      case 'AUTHORIZED':
        debug('Accès autorisé');
        return next();

      case 'SUSPICIOUS':
        debug('Activité suspecte détectée');
        // Envoyer une alerte mais autoriser l'accès
        // (ou rediriger vers une vérification 2FA)
        req.suspiciousActivity = true;
        return next();

      case 'REFUSED':
      default:
        const errorInfo = {
          code: 'FORBIDDEN',
          statusCode: 403,
          message: 'Accès refusé'
        };

        // Personnalisation des messages d'erreur
        if (decision.reason === 'no_session') {
          errorInfo.code = 'UNAUTHENTICATED';
          errorInfo.statusCode = 401;
          errorInfo.message = 'Session expirée ou invalide';
        } else if (decision.reason === 'suspicious_activity') {
          errorInfo.code = 'TOO_MANY_REQUESTS';
          errorInfo.statusCode = 429;
          errorInfo.message = 'Trop de tentatives, veuillez réessayer plus tard';
        } else if (decision.reason === 'ip_blocked') {
          errorInfo.code = 'IP_BLOCKED';
          errorInfo.statusCode = 403;
          errorInfo.message = 'Votre adresse IP est bloquée temporairement';
        }

        debug(`Accès refusé: ${decision.reason} (HTTP ${errorInfo.statusCode})`);

        return next(createError(errorInfo.statusCode, {
          code: errorInfo.code,
          message: errorInfo.message,
          details: {
            reason: decision.reason,
            action: decision.action,
            resource: decision.resourcePath,
            ip: decision.ipAddress,
            userId,
            role,
            timestamp: new Date().toISOString()
          }
        }));
    }
  } catch (error) {
    debug('Erreur critique lors de la vérification des permissions:', error);
    
    // Journalisation de l'erreur critique
    console.error('Erreur critique dans le contrôle d\'accès:', {
      error: error.message,
      stack: error.stack,
      userId: session?.user?.userId,
      path,
      method,
      timestamp: new Date().toISOString()
    });

    return next(createError(500, {
      code: 'AUTH_SYSTEM_ERROR',
      message: 'Erreur système lors de la vérification des autorisations',
      details: process.env.NODE_ENV === 'development' ? {
        error: error.message,
        stack: error.stack
      } : {}
    }));
  }
};

// Export pour les tests
module.exports.isPublicPath = isPublicPath;