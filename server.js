// Configuration de l'environnement
const dotenv = require('dotenv');
dotenv.config();

// Activation du débogage
const debug = require('debug')('app:server');
const debugAccess = require('debug')('app:access');
const debugAuth = require('debug')('app:auth');

// Configuration des variables d'environnement pour le débogage
process.env.DEBUG = process.env.DEBUG || 'app:*';

const app = require('./app');
const { getDriver } = require('./config/neo4j');

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    // Initialise le driver Neo4j au démarrage
    const driver = getDriver();
    await driver.getServerInfo();

    app.listen(PORT, () => {
      console.log(`IAM/RBAC backend listening on port ${PORT}`);
      debug('Débogage activé pour app:*');
      debugAccess('Journalisation d\'accès activée');
      debugAuth('Journalisation d\'authentification activée');
    });
  } catch (err) {
    debug('Échec du démarrage du serveur ou de la connexion à Neo4j:', err);
    console.error('Failed to start server or connect to Neo4j:', err);
    process.exit(1);
  }
}

start();

