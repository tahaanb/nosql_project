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
      RETURN 
        ID(u) AS userId,
        u.id AS userUuid,
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

    // Log la structure complète de la réponse Neo4j
    console.log('=== DÉBOGAGE RÉPONSE NEO4J ===');
    console.log('Résultat brut:', JSON.stringify(result, null, 2));
    
    if (result.records && result.records.length > 0) {
      const record = result.records[0];
      console.log('Premier enregistrement:', JSON.stringify({
        keys: record.keys,
        length: record.length,
        hasUserId: record.has('userId'),
        hasId: record.has('id'),
        fields: record._fields ? record._fields.map(f => ({
          type: typeof f,
          value: f,
          properties: f && typeof f === 'object' ? f.properties : null
        })) : null
      }, null, 2));
    }

    if (result.records.length === 0) {
      logger.warn('Échec de connexion: utilisateur non trouvé', { username, ip });
      return res.status(404).json({
        code: 'USER_NOT_FOUND',
        message: 'Identifiants incorrects'
      });
    }

    const record = result.records[0];
    
    // Log de débogage pour voir la structure complète du record
    logger.debug('Record Neo4j brut:', {
      keys: record.keys,
      fields: record._fields,
      length: record.length
    });

    // Récupération de l'ID utilisateur
    let userId = record.get('userUuid'); // Utiliser directement l'UUID de l'utilisateur
    
    // Si l'UUID n'est pas disponible, essayer avec l'ID numérique
    if (!userId) {
      const numericId = record.get('userId');
      if (numericId) {
        // Gérer l'objet Integer de Neo4j
        if (typeof numericId === 'object' && 'low' in numericId) {
          userId = numericId.low.toString();
        } else {
          userId = numericId.toString();
        }
      }
    }
    
    // Si toujours pas d'ID, essayer avec le premier champ
    if (!userId && record._fields && record._fields[0]) {
      const firstField = record._fields[0];
      if (firstField) {
        if (typeof firstField === 'object' && 'low' in firstField) {
          userId = firstField.low.toString();
        } else if (typeof firstField === 'string' || typeof firstField === 'number') {
          userId = firstField.toString();
        }
      }
    }
    
    logger.debug('Données extraites du record:', {
      userId,
      username: record.get('username'),
      role: record.get('roleName'),
      permissionsCount: record.get('permissions')?.length || 0
    });

    if (!userId) {
      logger.error('Impossible de récupérer l\'ID utilisateur', { record: JSON.stringify(record) });
      throw new Error('Erreur lors de la récupération des informations utilisateur');
    }

    const user = {
      id: userId,
      userId: userId, // Ajout explicite de userId pour la rétrocompatibilité
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
            userId: userId,
            username
          });
          return reject(err);
        }

        // Stockage des informations utilisateur dans la session
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
            userId: user.id,
            username,
            role: user.role,
            permissionsCount: user.permissions.length,
            responseTime: `${responseTime}ms`
          });

          // Formater la réponse selon la structure attendue par le frontend
          const response = {
            hasPermission: true, // L'utilisateur est authentifié => a la permission
            user: {
              id: user.id, // Utiliser id au lieu de userId
              username: user.username,
              roles: [user.role], // Convertir en tableau
              permissions: user.permissions.map(p => p.permission) // Extraire les noms des permissions
            }
          };
          
          logger.debug('Réponse de connexion:', response);
          res.json(response);
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

  // S'assurer d'avoir les bonnes propriétés de l'utilisateur
  const user = req.session.user || {};
  const userId = user.userId || user.id;
  const username = user.username;
  
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

      logger.info('Déconnexion réussie', { 
        userId, 
        username,
        sessionId: req.sessionID
      });
      
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

  // S'assurer d'avoir les bonnes propriétés de l'utilisateur
  const user = req.session.user || {};
  const userId = user.userId || user.id;
  const { username, role } = user;
  
  logger.debug('Récupération des informations utilisateur', { 
    userId, 
    username,
    sessionId: req.sessionID 
  });
  
  if (!userId) {
    logger.warn('ID utilisateur manquant dans la session', { 
      sessionUser: req.session.user,
      sessionId: req.sessionID
    });
  }
  
  // Même structure que la réponse de login
  res.json({
    hasPermission: true,
    user: {
      id: userId,
      username,
      roles: [role || 'GUEST'],
      permissions: user.permissions?.map(p => p.permission) || []
    }
  });
}

module.exports = {
  login,
  logout,
  me
};