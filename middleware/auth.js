const logger = console;

/**
 * Middleware d'authentification par session
 * Vérifie si l'utilisateur est connecté via la session
 */
const required = (req, res, next) => {
  try {
    if (!req.session?.user) {
      logger.warn('Tentative d\'accès non autorisée - Session invalide ou expirée', {
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      
      return res.status(401).json({ 
        error: 'Non authentifié',
        code: 'UNAUTHENTICATED'
      });
    }

    // Ajouter les informations de l'utilisateur à la requête
    req.user = req.session.user;
    
    logger.debug('Utilisateur authentifié', {
      userId: req.user.id,
      username: req.user.username
    });
    
    next();
  } catch (error) {
    logger.error('Erreur lors de la vérification de l\'authentification', {
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({ 
      error: 'Erreur lors de l\'authentification',
      code: 'AUTH_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  required
};
