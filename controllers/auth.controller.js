const { runRead } = require('../config/neo4j');
const debug = require('debug')('app:auth');

/**
 * POST /auth/login
 * Connexion simple (sans mot de passe, pédagogique)
 * L'utilisateur choisit un username existant
 * Le backend charge l'utilisateur et stocke { userId, username, role } en session
 */
async function login(req, res, next) {
  debug('=== Début de la fonction login ===');
  debug('Headers de la requête:', req.headers);
  debug('Corps de la requête reçu:', req.body);
  
  try {
    const { username } = req.body;
    debug(`Tentative de connexion pour l'utilisateur: ${username}`);

    if (!username) {
      debug('Échec de la connexion: nom d\'utilisateur manquant');
      return res.status(400).json({ 
        message: 'Nom d\'utilisateur requis',
        code: 'USERNAME_REQUIRED'
      });
    }

    // Requête pour récupérer l'utilisateur avec son rôle et ses permissions
    const cypher = `
      MATCH (u:User {username: $username})
      OPTIONAL MATCH (u)-[:HAS_ROLE]->(r:Role)
      OPTIONAL MATCH (r)-[:GRANTS]->(p:Permission)-[:ACCESS_TO]->(res:Resource)
      RETURN 
        u.id AS userId, 
        u.username AS username, 
        r.name AS roleName,
        collect(DISTINCT { 
          permission: p.name, 
          resource: res.path 
        }) AS permissions
    `;

    debug('Exécution de la requête Neo4j:', cypher, { username });
    const result = await runRead(cypher, { username });
    
    if (result.records.length === 0) {
      debug(`Aucun utilisateur trouvé avec le nom d'utilisateur: ${username}`);
      return res.status(404).json({ 
        message: 'Identifiants invalides',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const record = result.records[0];
    const user = {
      userId: record.get('userId'),
      username: record.get('username'),
      role: record.get('roleName') || 'GUEST',
      permissions: record.get('permissions') || []
    };

    // Stocker en session
    debug('Stockage des informations utilisateur en session');
    req.session.regenerate((err) => {
      if (err) {
        debug('Erreur lors de la régénération de la session:', err);
        return next(err);
      }
      
      req.session.user = user;
      debug('Session après stockage:', {
        userId: user.userId,
        username: user.username,
        role: user.role,
        permissionsCount: user.permissions.length
      });

      // Sauvegarder la session
      req.session.save((err) => {
        if (err) {
          debug('Erreur lors de la sauvegarde de la session:', err);
          return next(err);
        }
        
        debug('Connexion réussie, envoi de la réponse');
        res.json({
          message: 'Connexion réussie',
          user: {
            userId: user.userId,
            username: user.username,
            role: user.role,
            hasPermissions: user.permissions.length > 0
          }
        });
      });
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/logout
 * Détruit la session
 */
async function logout(req, res, next) {
  try {
    req.session.destroy((err) => {
      if (err) {
        return next(err);
      }
      res.json({ message: 'Déconnexion réussie' });
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /auth/me
 * Retourne l'utilisateur courant (session)
 */
async function me(req, res) {
  debug('Requête sur /me - Session:', req.session);
  if (!req.session || !req.session.user) {
    debug('Accès non autorisé: pas d\'utilisateur en session');
    return res.status(401).json({ message: 'Non authentifié' });
  }
  res.json({ user: req.session.user });
}

module.exports = {
  login,
  logout,
  me,
};