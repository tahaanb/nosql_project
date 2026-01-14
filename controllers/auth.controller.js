const { runRead } = require('../services/neo4j.service');

/**
 * POST /auth/login
 * Connexion simple (sans mot de passe, pédagogique)
 * L'utilisateur choisit un username existant
 * Le backend charge l'utilisateur et stocke { userId, username, role } en session
 */
async function login(req, res, next) {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ message: 'Username requis' });
    }

    // Récupérer l'utilisateur avec son rôle
    const cypher = `
      MATCH (u:User {username: $username})
      OPTIONAL MATCH (u)-[:HAS_ROLE]->(r:Role)
      RETURN u.id AS userId, u.username AS username, r.name AS roleName
    `;

    const result = await runRead(cypher, { username });

    if (result.records.length === 0) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    const record = result.records[0];
    const user = {
      userId: record.get('userId'),
      username: record.get('username'),
      role: record.get('roleName') || 'GUEST',
    };

    // Stocker en session
    req.session.user = user;

    return res.json({
      message: 'Connexion réussie',
      user,
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
  if (!req.session || !req.session.user) {
    return res.status(401).json({ message: 'Non authentifié' });
  }
  res.json({ user: req.session.user });
}

module.exports = {
  login,
  logout,
  me,
};