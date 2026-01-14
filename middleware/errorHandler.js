/**
 * Middleware de gestion d'erreurs global.
 * Retourne toujours une réponse JSON.
 */
module.exports = function errorHandler(err, req, res, next) {
  // eslint-disable-line no-unused-vars
  console.error('Unhandled error:', err);
  const status = err.status || 500;
  res.status(status).json({
    message: err.message || 'Internal Server Error',
  });
};

