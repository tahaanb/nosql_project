const { getDriver } = require('../config/neo4j');

/**
 * Ouvre une session Neo4j (par défaut en mode WRITE pour plus de flexibilité).
 */
function getSession(accessMode = 'WRITE') {
  const driver = getDriver();
  return driver.session({ defaultAccessMode: accessMode });
}

async function runRead(cypher, params = {}) {
  const session = getSession('READ');
  try {
    const result = await session.run(cypher, params);
    return result;
  } finally {
    await session.close();
  }
}

async function runWrite(cypher, params = {}) {
  const session = getSession('WRITE');
  try {
    const result = await session.run(cypher, params);
    return result;
  } finally {
    await session.close();
  }
}

module.exports = {
  runRead,
  runWrite,
};

