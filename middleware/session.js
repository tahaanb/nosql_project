const session = require('express-session');
const logger = console;

/**
 * Configuration de la session
 * En production, utilisez un store comme connect-redis ou connect-mongo
 */
module.exports = session({
  name: 'sessionId',
  secret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS en production
    sameSite: 'lax', // Protection CSRF
    maxAge: 24 * 60 * 60 * 1000, // 24 heures
    path: '/',
    domain: process.env.COOKIE_DOMAIN || undefined
  },
  // En production, utilisez un store approprié
  // store: new (require('connect-redis')(session))({
  //   client: redisClient,
  //   ttl: 86400 // 24h
  // })
});

// Middleware pour logger les sessions (à désactiver en production)
if (process.env.NODE_ENV === 'development') {
  module.exports = [
    module.exports,
    (req, res, next) => {
      logger.debug('Session', {
        sessionId: req.sessionID,
        userId: req.session.user?.id,
        path: req.path,
        method: req.method
      });
      next();
    }
  ];
}

