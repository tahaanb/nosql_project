const neo4j = require('neo4j-driver');

let driver;

/**
 * Configuration de la base de données Neo4j
 */
const config = {
  uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
  user: process.env.NEO4J_USERNAME || 'neo4j',
  password: process.env.NEO4J_PASSWORD || 'neo4j',
  database: process.env.NEO4J_DATABASE || 'neo4j'
};

// Vérification de la configuration
if (!config.database) {
  console.error('Erreur: Aucune base de données spécifiée. Définissez NEO4J_DATABASE dans .env');
  process.exit(1);
}

console.log('Configuration Neo4j:', {
  uri: config.uri,
  user: config.user,
  database: config.database
});

/**
 * Initialise (lazy) et retourne le driver Neo4j partagé.
 */
function getDriver() {
  if (!driver) {
    driver = neo4j.driver(
      config.uri, 
      neo4j.auth.basic(config.user, config.password)
    );
    
    // Tester la connexion
    const testSession = driver.session({ database: config.database });
    testSession.run('RETURN 1')
      .then(() => console.log(`✅ Connecté à la base de données Neo4j: ${config.database}`))
      .catch(err => {
        console.error('❌ Erreur de connexion à Neo4j:', err.message);
        process.exit(1);
      })
      .finally(() => testSession.close());
  }
  return driver;
}

/**
 * Ferme le driver proprement (ex: dans des tests).
 */
async function closeDriver() {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

/**
 * Exécute une requête en lecture seule
 */
async function runRead(cypher, params = {}) {
  const session = getDriver().session({ 
    database: config.database,
    defaultAccessMode: neo4j.session.READ 
  });
  
  try {
    const result = await session.run(cypher, params);
    return result;
  } finally {
    await session.close();
  }
}

/**
 * Exécute une requête en écriture
 */
async function runWrite(cypher, params = {}) {
  const session = getDriver().session({ 
    database: config.database,
    defaultAccessMode: neo4j.session.WRITE 
  });
  
  try {
    const result = await session.run(cypher, params);
    return result;
  } finally {
    await session.close();
  }
}

module.exports = {
  getDriver,
  closeDriver,
  runRead,
  runWrite,
  config
};

