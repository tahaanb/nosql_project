const dotenv = require('dotenv');
dotenv.config();

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
    });
  } catch (err) {
    console.error('Failed to start server or connect to Neo4j:', err);
    process.exit(1);
  }
}

start();

