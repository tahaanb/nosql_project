const neo4j = require('neo4j-driver');

let driver;

/**
 * Initialise (lazy) et retourne le driver Neo4j partagé.
 */
function getDriver() {
  if (!driver) {
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const user = process.env.NEO4J_USERNAME || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'neo4j';

    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
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

module.exports = {
  getDriver,
  closeDriver,
};

