const { runRead } = require('../config/neo4j');
const debug = require('debug')('app:auth');
const logger = console;

/**
 * POST /auth/login
 * Gère la connexion d'un utilisateur
 */
async function login(req, res, next) {
  const startTime = process.hrtime();
  const { username } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
  
  logger.info('Tentative de connexion', { 
    username, 
    ip,
    userAgent: req.headers['user-agent'] 
  });

  if (!username) {
    logger.warn('Tentative de connexion sans nom d\'utilisateur', { ip });
    return res.status(400).json({ 
      code: 'USERNAME_REQUIRED',
      message: 'Le nom d\'utilisateur est requis'
    });
  }

  try {
    // Requête optimisée pour récupérer l'utilisateur, son rôle et ses permissions
    const cypher = `
      MATCH (u:User {username: $username})
      OPTIONAL MATCH (u)-[:HAS_ROLE]->(r:Role)
      OPTIONAL MATCH (r)-[:GRANTS]->(p:Permission)-[:ACCESS_TO]->(res:Resource)
      RETURN u.id AS userId, 
             u.username AS username,
             r.name AS roleName,
             collect(DISTINCT {
               permission: p.name,
               action: split(p.name, '_')[0],
               resource: res.path,
               resource_name: res.name,
               resource_type: res.type
             }) AS permissions
      LIMIT 1
    `;

    logger.debug('Exécution de la requête Neo4j', { cypher, username });
    const result = await runRead(cypher, { username });

    if (result.records.length === 0) {
      logger.warn('Échec de connexion: utilisateur non trouvé', { username, ip });
      return res.status(404).json({
        code: 'USER_NOT_FOUND',
        message: 'Identifiants incorrects'
      });
    }

    const record = result.records[0];
    const user = {
      userId: record.get('userId'),
      username: record.get('username'),
      role: record.get('roleName') || 'GUEST',
      permissions: record.get('permissions') || []
    };

    // Création de la session
    return new Promise((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) {
          logger.error('Erreur lors de la régénération de la session', { 
            error: err.message,
            userId: user.userId,
            username
          });
          return reject(err);
        }

        req.session.user = user;
        req.session.ip = ip;
        req.session.userAgent = req.headers['user-agent'];

        req.session.save((err) => {
          if (err) {
            logger.error('Erreur lors de la sauvegarde de la session', {
              error: err.message,
              userId: user.userId
            });
            return reject(err);
          }

          const [seconds, ns] = process.hrtime(startTime);
          const responseTime = (seconds * 1000 + ns / 1e6).toFixed(2);
          
          logger.info('Connexion réussie', {
            userId: user.userId,
            username,
            role: user.role,
            permissionsCount: user.permissions.length,
            responseTime: `${responseTime}ms`
          });

          res.json({
            code: 'LOGIN_SUCCESS',
            message: 'Connexion réussie',
            user: {
              userId: user.userId,
              username: user.username,
              role: user.role,
              hasPermissions: user.permissions.length > 0
            }
          });
          resolve();
        });
      });
    });
  } catch (error) {
    logger.error('Erreur lors de la connexion', {
      error: error.message,
      stack: error.stack,
      username
    });
    next(error);
  }
}

/**
 * POST /auth/logout
 * Gère la déconnexion de l'utilisateur
 */
async function logout(req, res, next) {
  if (!req.session?.user) {
    return res.status(200).json({ 
      code: 'ALREADY_LOGGED_OUT',
      message: 'Aucune session active'
    });
  }

  const { userId, username } = req.session.user;
  
  return new Promise((resolve) => {
    req.session.destroy((err) => {
      if (err) {
        logger.error('Erreur lors de la destruction de la session', {
          error: err.message,
          userId,
          username
        });
        return next(err);
      }

      logger.info('Déconnexion réussie', { userId, username });
      
      res.clearCookie('connect.sid');
      res.json({ 
        code: 'LOGOUT_SUCCESS',
        message: 'Déconnexion réussie' 
      });
      resolve();
    });
  });
}

/**
 * GET /auth/me
 * Récupère les informations de l'utilisateur connecté
 */
async function me(req, res) {
  if (!req.session?.user) {
    logger.debug('Tentative d\'accès à /me sans session valide', {
      sessionId: req.sessionID
    });
    return res.status(401).json({ 
      code: 'UNAUTHENTICATED',
      message: 'Non authentifié' 
    });
  }

  const { userId, username, role } = req.session.user;
  logger.debug('Récupération des informations utilisateur', { userId, username });
  
  res.json({ 
    user: {
      userId,
      username,
      role,
      isAuthenticated: true,
      sessionId: req.sessionID
    }
  });
}

module.exports = {
  login,
  logout,
  me
};