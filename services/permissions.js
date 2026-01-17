const { runRead } = require('../config/neo4j');
const logger = console;

/**
 * Vérifie si un utilisateur a une permission spécifique
 * @param {string} userId - L'ID de l'utilisateur
 * @param {string} permission - Le nom de la permission à vérifier (ex: 'READ_USERS')
 * @returns {Promise<boolean>} - true si l'utilisateur a la permission, false sinon
 */
async function checkUserPermission(userId, permission) {
  if (!userId || !permission) {
    logger.warn('Vérification de permission : paramètres manquants', { 
      userId, 
      permission 
    });
    return false;
  }

  try {
    // 1. Vérification du rôle administrateur
    const adminCheckQuery = `
      MATCH (u:User {id: $userId})-[:HAS_ROLE]->(r:Role {name: 'ADMIN'})
      RETURN count(r) > 0 AS isAdmin
    `;
    
    const adminResult = await runRead(adminCheckQuery, { userId });
    const isAdmin = adminResult.records[0]?.get('isAdmin') || false;
    
    if (isAdmin) {
      logger.debug('Accès administrateur accordé', { 
        userId, 
        permission
      });
      return true;
    }

    // 2. Vérification de la permission spécifique
    const permissionCheckQuery = `
      MATCH (u:User {id: $userId})-[:HAS_ROLE]->(r:Role)-[:GRANTS]->(p:Permission {name: $permission})
      RETURN count(p) > 0 AS hasPermission
    `;
    
    const result = await runRead(permissionCheckQuery, { userId, permission });
    const hasPermission = result.records[0]?.get('hasPermission') || false;
    
    logger.debug('Résultat de la vérification de permission:', {
      userId,
      permission,
      hasPermission,
      isAdmin
    });
    
    return hasPermission;
  } catch (error) {
    logger.error('Erreur lors de la vérification de permission', {
      error: error.message,
      stack: error.stack,
      userId,
      permission
    });
    return false;
  }
}

/**
 * Récupère toutes les permissions d'un utilisateur
 * @param {string} userId - L'ID de l'utilisateur
 * @returns {Promise<Array>} - Tableau des noms de permissions
 */
async function getUserPermissions(userId) {
  if (!userId) {
    logger.warn('Récupération des permissions : ID utilisateur manquant');
    return [];
  }

  try {
    const query = `
      MATCH (u:User {id: $userId})-[:HAS_ROLE]->(r:Role)-[:GRANTS]->(p:Permission)
      RETURN collect(DISTINCT p.name) as permissions
    `;
    
    const result = await runRead(query, { userId });
    return result.records[0]?.get('permissions') || [];
  } catch (error) {
    logger.error('Erreur lors de la récupération des permissions', {
      error: error.message,
      userId
    });
    return [];
  }
}

module.exports = {
  checkUserPermission,
  getUserPermissions
};
