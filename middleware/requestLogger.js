const debug = require('debug')('app:request');
const { v4: uuidv4 } = require('uuid');
const { inspect } = require('util');

// Configuration du logger
const MAX_BODY_LENGTH = process.env.REQUEST_LOG_BODY_LIMIT || 1000;
const SENSITIVE_HEADERS = ['authorization', 'cookie', 'set-cookie', 'x-api-key'];

/**
 * Masque les données sensibles dans les logs
 */
function maskSensitiveData(data) {
  if (typeof data === 'string') {
    return data.replace(/(password|token|secret|api[_-]?key)=[^&]*/gi, '$1=***');
  }
  return data;
}

/**
 * Formate les en-têtes en masquant les données sensibles
 */
function formatHeaders(headers) {
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
      result[key] = '***';
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Middleware de journalisation des requêtes avancé
 */
function requestLogger(req, res, next) {
  const requestId = req.headers['x-request-id'] || uuidv4();
  const startTime = process.hrtime();
  const { method, originalUrl, ip, protocol, hostname } = req;
  
  // Ajouter l'ID de requête à l'objet req pour une utilisation ultérieure
  req.requestId = requestId;
  
  // Créer un objet de métadonnées de requête
  const requestMeta = {
    id: requestId,
    timestamp: new Date().toISOString(),
    method,
    url: originalUrl,
    path: req.path,
    query: req.query,
    params: req.params,
    ip: ip || req.connection.remoteAddress,
    protocol,
    host: hostname,
    userAgent: req.headers['user-agent'],
    referer: req.headers.referer,
    headers: formatHeaders(req.headers)
  };
  
  // Journalisation de la requête entrante
  debug(`[${requestId}] ${method} ${originalUrl}`, {
    ip: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    referer: requestMeta.referer
  });
  
  // Journalisation détaillée en mode debug
  if (debug.enabled) {
    // Log des paramètres de requête
    if (Object.keys(req.query).length > 0) {
      debug(`[${requestId}] Query:`, req.query);
    }
    
    // Log des paramètres de route
    if (Object.keys(req.params).length > 0) {
      debug(`[${requestId}] Route params:`, req.params);
    }
    
    // Log du corps de la requête (si présent)
    if (req.body && Object.keys(req.body).length > 0) {
      const bodyStr = JSON.stringify(req.body);
      const bodyPreview = bodyStr.length > MAX_BODY_LENGTH 
        ? bodyStr.substring(0, MAX_BODY_LENGTH) + '...' 
        : bodyStr;
      
      debug(`[${requestId}] Body:`, maskSensitiveData(bodyPreview));
    }
    
    // Log des informations de session (si présentes)
    if (req.session?.user) {
      debug(`[${requestId}] Session:`, {
        userId: req.session.user.id,
        username: req.session.user.username,
        role: req.session.user.role
      });
    }
  }
  
  // Capturer la réponse
  const originalSend = res.send;
  const originalJson = res.json;
  
  // Surcharge de res.send
  res.send = function(body) {
    // Appeler la méthode originale
    const result = originalSend.apply(this, arguments);
    
    // Calculer le temps de traitement
    const [seconds, nanoseconds] = process.hrtime(startTime);
    const responseTime = (seconds * 1000 + nanoseconds / 1e6).toFixed(2);
    
    // Journalisation de la réponse
    const responseMeta = {
      requestId,
      statusCode: res.statusCode,
      statusMessage: res.statusMessage,
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString(),
      contentLength: res.get('Content-Length') || '0',
      contentType: res.get('Content-Type') || 'unknown'
    };
    
    // Journalisation du statut de la réponse
    const logLevel = res.statusCode >= 400 ? 'error' : 'info';
    const logMessage = `[${requestId}] ${method} ${originalUrl} - ${res.statusCode} (${responseTime}ms)`;
    
    if (logLevel === 'error') {
      debug.error(logMessage);
      // Log supplémentaire pour les erreurs
      debug.error(`[${requestId}] Response headers:`, res.getHeaders());
    } else {
      debug(logMessage);
    }
    
    // Journalisation du corps de la réponse en mode debug
    if (debug.enabled && body) {
      try {
        const responseData = typeof body === 'string' ? JSON.parse(body) : body;
        debug(`[${requestId}] Response:`, inspect(maskSensitiveData(responseData), { depth: 2 }));
      } catch (e) {
        debug(`[${requestId}] Response (non-JSON):`, maskSensitiveData(String(body).substring(0, 500)));
      }
    }
    
    return result;
  };
  
  // Surcharge de res.json pour une meilleure gestion des réponses JSON
  res.json = function(obj) {
    res.setHeader('Content-Type', 'application/json');
    return this.send(JSON.stringify(obj));
  };
  
  // Gestion des erreurs non attrapées
  const handleError = (err) => {
    const [seconds, nanoseconds] = process.hrtime(startTime);
    const responseTime = (seconds * 1000 + nanoseconds / 1e6).toFixed(2);
    
    debug.error(`[${requestId}] Error after ${responseTime}ms:`, {
      message: err.message,
      stack: err.stack,
      statusCode: err.statusCode || 500
    });
  };
  
  // Écouter les événements d'erreur
  req.on('error', handleError);
  res.on('error', handleError);
  res.on('finish', () => {
    // Nettoyage
    req.off('error', handleError);
    res.off('error', handleError);
  });
  
  next();
}

// Ajout des méthodes de niveau de log
debug.error = function(...args) {
  console.error(`[ERROR] ${new Date().toISOString()}`, ...args);
};

module.exports = requestLogger;