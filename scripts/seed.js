const neo4j = require('neo4j-driver');
const dotenv = require('dotenv');
const crypto = require('crypto');
const path = require('path');

// Charger les variables d'environnement depuis la racine
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
const user = process.env.NEO4J_USERNAME || 'neo4j';
const password = process.env.NEO4J_PASSWORD || 'neo4j';

const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

async function main() {
    const session = driver.session();
    try {
        console.log('🌱 Starting seeding...');

        // 1. Nettoyage de la base
        console.log('Cleaning database...');
        await session.run('MATCH (n) DETACH DELETE n');

        // 2. Création des Rôles
        console.log('Creating Roles...');
        await session.run(`
      CREATE (admin:Role {name: 'ADMIN'})
      CREATE (user:Role {name: 'USER'})
      CREATE (guest:Role {name: 'GUEST'})
    `);

        // 3. Création des Ressources
        console.log('Creating Resources...');
        const resources = [
            '/users', '/roles', '/permissions', '/resources', '/ips', '/access', '/graph'
        ];
        for (const resPath of resources) {
            await session.run(`CREATE (:Resource {path: $path})`, { path: resPath });
        }

        // 4. Création des Permissions et liaisons
        console.log('Creating Permissions and linking to Roles...');

        // --- ADMIN : Tout faire sur tout ---
        // Pour simplifier, on donne READ/WRITE/DELETE sur toutes les ressources à ADMIN
        const actions = ['READ', 'WRITE', 'DELETE'];
        for (const resPath of resources) {
            for (const action of actions) {
                await session.run(`
          MATCH (r:Role {name: 'ADMIN'})
          MATCH (res:Resource {path: $path})
          CREATE (p:Permission {action: $action, name: 'ADMIN_' + $action + '_' + $path})
          MERGE (r)-[:GRANTS]->(p)
          MERGE (p)-[:ACCESS_TO]->(res)
        `, { path: resPath, action });
            }
        }

        // --- USER : Lecture seule sur /users et /resources ---
        const userResources = ['/users', '/resources', '/graph']; // Ajout de graph pour voir le résultat
        for (const resPath of userResources) {
            await session.run(`
        MATCH (r:Role {name: 'USER'})
        MATCH (res:Resource {path: $path})
        CREATE (p:Permission {action: 'READ', name: 'USER_READ_' + $path})
        MERGE (r)-[:GRANTS]->(p)
        MERGE (p)-[:ACCESS_TO]->(res)
      `, { path: resPath });
        }

        // 5. Création des Utilisateurs
        console.log('Creating Users...');

        const users = [
            { username: 'admin', role: 'ADMIN', email: 'admin@example.com' },
            { username: 'alice', role: 'USER', email: 'alice@example.com' },
            { username: 'bob', role: 'GUEST', email: 'bob@example.com' }
        ];

        for (const u of users) {
            const userId = crypto.randomUUID();
            await session.run(`
        CREATE (u:User {id: $id, username: $username, email: $email, createdAt: datetime()})
        WITH u
        MATCH (r:Role {name: $role})
        MERGE (u)-[:HAS_ROLE]->(r)
      `, { id: userId, username: u.username, email: u.email, role: u.role });
        }

        console.log('✅ Seeding completed successfully!');
    } catch (error) {
        console.error('❌ Seeding failed:', error);
    } finally {
        await session.close();
        await driver.close();
    }
}

main();
