const { checkUserPermission } = require('../services/permissions');
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
 * Détermine la permission requise en fonction de la méthode HTTP et du chemin
 */
function determineRequiredPermission(method, path) {
  // Nettoyage du chemin
  const cleanPath = path.replace(/^\/+|\/+$/g, ''); // Supprime les / au début et à la fin
  
  // Détermination de l'action en fonction de la méthode HTTP
  let action;
  switch (method.toUpperCase()) {
    case 'GET':
      action = 'READ';
      break;
    case 'POST':
      action = 'CREATE';
      break;
    case 'PUT':
    case 'PATCH':
      action = 'UPDATE';
      break;
    case 'DELETE':
      action = 'DELETE';
      break;
    default:
      action = 'EXECUTE';
  }
  
  // Construction du nom de la permission
  const resource = cleanPath
    .replace(/\//g, '_')  // Remplace les / par _
    .replace(/-/g, '_')    // Remplace les - par _
    .toUpperCase();
  
  return `${action}_${resource}`;
}

/**
 * Middleware de contrôle d'accès principal
 */
module.exports = async function accessControl(req, res, next) {
  const startTime = process.hrtime();
  const { method, path, headers, session } = req;
  const userAgent = headers['user-agent'] || '';
  const referer = headers.referer || '';
  const ip = headers['x-forwarded-for'] || req.connection.remoteAddress;

  // Journalisation de la requête entrante
  debug(`\n=== [${new Date().toISOString()}] ${method} ${path} ===`);
  debug('Headers:', {
    'user-agent': userAgent,
    referer,
    'x-forwarded-for': ip,
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

  const { userId, username, roles = [] } = session.user;
  
  // Vérification de l'ID utilisateur
  if (!userId) {
    debug('Accès refusé: ID utilisateur manquant dans la session');
    return next(createError(401, {
      code: 'INVALID_SESSION',
      message: 'Session utilisateur invalide',
      details: { username }
    }));
  }

  try {
    // Détermination de la permission requise
    const requiredPermission = determineRequiredPermission(method, path);
    
    debug(`Vérification des permissions pour: ${username} (${userId})`);
    debug(`Permission requise: ${requiredPermission}, Rôles: ${roles.join(', ')}`);
    debug(`IP: ${ip}, Chemin: ${path}, Méthode: ${method}`);

    // Vérification de la permission
    const hasPermission = await checkUserPermission(userId, requiredPermission);
    
    // Calcul du temps de traitement
    const processingTime = process.hrtime(startTime);
    const processingTimeMs = Math.round((processingTime[0] * 1000) + (processingTime[1] / 1000000));

    // Journalisation de la décision
    debug('Décision d\'accès:', {
      status: hasPermission ? 'AUTHORIZED' : 'DENIED',
      permission: requiredPermission,
      processingTime: `${processingTimeMs}ms`,
      resource: path,
      method,
      ip
    });

    if (hasPermission) {
      debug('Accès autorisé');
      return next();
    }
    
    // Accès refusé
    debug(`Accès refusé: permission manquante (${requiredPermission})`);
    return next(createError(403, {
      code: 'FORBIDDEN',
      message: 'Accès refusé',
      details: {
        permission: requiredPermission,
        resource: path,
        method,
        roles,
        userId,
        timestamp: new Date().toISOString()
      }
    }));
    
  } catch (error) {
    debug('Erreur critique lors de la vérification des permissions:', error);
    
    // Journalisation de l'erreur critique
    console.error('Erreur critique dans le contrôle d\'accès:', {
      error: error.message,
      stack: error.stack,
      userId,
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
module.exports.determineRequiredPermission = determineRequiredPermission;