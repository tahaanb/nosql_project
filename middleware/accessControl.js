const { decideAccess } = require('../services/accessDecision.service');

// Routes publiques qui ne passent pas par le moteur de décision
const PUBLIC_PATHS = [
  /^\/auth(\/.*)?$/,
  /^\/health$/,
];

function isPublicPath(path) {
  return PUBLIC_PATHS.some((re) => re.test(path));
}

/**
 * Middleware central d'accès.
 * - Identifie l'utilisateur courant (session)
 * - Détermine la ressource (route) et l'action (méthode HTTP -> READ/WRITE/DELETE)
 * - Vérifie le chemin User -> Role -> Permission -> Resource
 * - Vérifie l'IP (première, connue, nouvelle)
 * - Crée un nœud AccessAttempt + relations
 * - Retourne au frontend : { status, reason }
 */
module.exports = async function accessControl(req, res, next) {
  if (isPublicPath(req.path)) {
    return next();
  }

  try {
    const decision = await decideAccess(req);
    req.accessDecision = decision;

    if (decision.status === 'AUTHORIZED') {
      return next();
    }

    const httpStatus = decision.status === 'REFUSED' ? 403 : 403;

    return res.status(httpStatus).json({
      status: decision.status,
      reason: decision.reason,
    });
  } catch (err) {
    return next(err);
  }
};

