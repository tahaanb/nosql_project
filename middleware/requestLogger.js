const debug = require('debug')('app:request');

/**
 * Middleware de journalisation des requêtes
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, originalUrl, body, params, query, session } = req;
  
  // Journaliser la requête entrante
  debug(`[${new Date().toISOString()}] ${method} ${originalUrl}`);
  debug('Headers:', req.headers);
  debug('Params:', params);
  debug('Query:', query);
  
  if (Object.keys(body).length > 0) {
    debug('Body:', body);
  }
  
  if (session && session.user) {
    debug('Session user:', session.user);
  }
  
  // Capturer la réponse
  const originalSend = res.send;
  res.send = function(body) {
    const duration = Date.now() - start;
    debug(`[${new Date().toISOString()}] ${method} ${originalUrl} - ${res.statusCode} (${duration}ms)`);
    if (body) {
      try {
        const response = JSON.parse(body);
        debug('Response:', response);
      } catch (e) {
        debug('Response (non-JSON):', body);
      }
    }
    return originalSend.call(this, body);
  };
  
  next();
}

module.exports = requestLogger;
