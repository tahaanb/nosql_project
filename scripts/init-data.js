/**
 * Script d'initialisation des données Neo4j
 * 🔴 STRUCTURE EXACTE SELON LE DOCUMENT PDF
 * 
 * Permissions : FORMAT "ACTION_RESOURCE" (READ_DASHBOARD, WRITE_USERS, etc.)
 * User : username, password, createdAt
 * Resource : id, path, name, type
 * 
 * Usage: node scripts/init-data.js
 */

require('dotenv').config();
const { getDriver, closeDriver } = require('../config/neo4j');

async function initData() {
    const driver = getDriver();
    const session = driver.session();

    try {
        console.log('🔄 Nettoyage de la base...');
        await session.run('MATCH (n) DETACH DELETE n');

        console.log('📦 Création des rôles...');
        await session.run(`
      CREATE (admin:Role {name: 'ADMIN'})
      CREATE (user:Role {name: 'USER'})
      CREATE (guest:Role {name: 'GUEST'})
    `);

        console.log('📄 Création des ressources...');
        await session.run(`
      CREATE (dashboard:Resource {
        id: randomUUID(),
        path: '/dashboard',
        name: 'Dashboard',
        type: 'page'
      })
      CREATE (admin:Resource {
        id: randomUUID(),
        path: '/admin',
        name: 'Administration',
        type: 'page'
      })
      CREATE (users:Resource {
        id: randomUUID(),
        path: '/users',
        name: 'Users Management',
        type: 'page'
      })
      CREATE (roles:Resource {
        id: randomUUID(),
        path: '/roles',
        name: 'Roles Management',
        type: 'page'
      })
      CREATE (permissions:Resource {
        id: randomUUID(),
        path: '/permissions',
        name: 'Permissions Management',
        type: 'page'
      })
      CREATE (resources:Resource {
        id: randomUUID(),
        path: '/resources',
        name: 'Resources Management',
        type: 'page'
      })
      CREATE (ips:Resource {
        id: randomUUID(),
        path: '/ips',
        name: 'IP Management',
        type: 'page'
      })
      CREATE (access:Resource {
        id: randomUUID(),
        path: '/access',
        name: 'Access Attempts',
        type: 'page'
      })
      CREATE (graph:Resource {
        id: randomUUID(),
        path: '/graph',
        name: 'Graph Visualization',
        type: 'page'
      })
      CREATE (profile:Resource {
        id: randomUUID(),
        path: '/profile',
        name: 'User Profile',
        type: 'page'
      })
    `);

        console.log('🔑 Création des permissions (FORMAT: ACTION_RESOURCE)...');
        await session.run(`
      CREATE (readDashboard:Permission {name: 'READ_DASHBOARD'})
      CREATE (readAdmin:Permission {name: 'READ_ADMIN'})
      CREATE (readUsers:Permission {name: 'READ_USERS'})
      CREATE (writeUsers:Permission {name: 'WRITE_USERS'})
      CREATE (deleteUsers:Permission {name: 'DELETE_USERS'})
      CREATE (readRoles:Permission {name: 'READ_ROLES'})
      CREATE (writeRoles:Permission {name: 'WRITE_ROLES'})
      CREATE (deleteRoles:Permission {name: 'DELETE_ROLES'})
      CREATE (readPermissions:Permission {name: 'READ_PERMISSIONS'})
      CREATE (writePermissions:Permission {name: 'WRITE_PERMISSIONS'})
      CREATE (readResources:Permission {name: 'READ_RESOURCES'})
      CREATE (writeResources:Permission {name: 'WRITE_RESOURCES'})
      CREATE (readIps:Permission {name: 'READ_IPS'})
      CREATE (writeIps:Permission {name: 'WRITE_IPS'})
      CREATE (readAccess:Permission {name: 'READ_ACCESS'})
      CREATE (readGraph:Permission {name: 'READ_GRAPH'})
      CREATE (readProfile:Permission {name: 'READ_PROFILE'})
      CREATE (writeProfile:Permission {name: 'WRITE_PROFILE'})
    `);

        console.log('🔗 Création des relations Permission → Resource...');
        await session.run(`
      MATCH (p:Permission), (r:Resource)
      WHERE 
        (p.name = 'READ_DASHBOARD' AND r.path = '/dashboard') OR
        (p.name = 'READ_ADMIN' AND r.path = '/admin') OR
        (p.name = 'READ_USERS' AND r.path = '/users') OR
        (p.name = 'WRITE_USERS' AND r.path = '/users') OR
        (p.name = 'DELETE_USERS' AND r.path = '/users') OR
        (p.name = 'READ_ROLES' AND r.path = '/roles') OR
        (p.name = 'WRITE_ROLES' AND r.path = '/roles') OR
        (p.name = 'DELETE_ROLES' AND r.path = '/roles') OR
        (p.name = 'READ_PERMISSIONS' AND r.path = '/permissions') OR
        (p.name = 'WRITE_PERMISSIONS' AND r.path = '/permissions') OR
        (p.name = 'READ_RESOURCES' AND r.path = '/resources') OR
        (p.name = 'WRITE_RESOURCES' AND r.path = '/resources') OR
        (p.name = 'READ_IPS' AND r.path = '/ips') OR
        (p.name = 'WRITE_IPS' AND r.path = '/ips') OR
        (p.name = 'READ_ACCESS' AND r.path = '/access') OR
        (p.name = 'READ_GRAPH' AND r.path = '/graph') OR
        (p.name = 'READ_PROFILE' AND r.path = '/profile') OR
        (p.name = 'WRITE_PROFILE' AND r.path = '/profile')
      MERGE (p)-[:ACCESS_TO]->(r)
    `);

        console.log('🔗 Création des relations Rôle → Permission...');
        // ADMIN : TOUTES les permissions
        await session.run(`
      MATCH (admin:Role {name: 'ADMIN'})
      MATCH (p:Permission)
      MERGE (admin)-[:GRANTS]->(p)
    `);

        // USER : READ sur tout + WRITE sur profil/users/roles (limité)
        await session.run(`
      MATCH (user:Role {name: 'USER'})
      MATCH (p:Permission)
      WHERE p.name STARTS WITH 'READ_' OR
            p.name IN ['WRITE_USERS', 'WRITE_PROFILE']
      MERGE (user)-[:GRANTS]->(p)
    `);

        // GUEST : READ uniquement (sauf admin)
        await session.run(`
      MATCH (guest:Role {name: 'GUEST'})
      MATCH (p:Permission)
      WHERE p.name STARTS WITH 'READ_' AND p.name <> 'READ_ADMIN'
      MERGE (guest)-[:GRANTS]->(p)
    `);

        console.log('👥 Création des utilisateurs...');
        await session.run(`
      MATCH (adminRole:Role {name: 'ADMIN'})
      MATCH (userRole:Role {name: 'USER'})
      MATCH (guestRole:Role {name: 'GUEST'})
      
      CREATE (alice:User {
        username: 'alice',
        password: 'alice123',
        createdAt: datetime()
      })
      CREATE (bob:User {
        username: 'bob',
        password: 'bob123',
        createdAt: datetime()
      })
      CREATE (charlie:User {
        username: 'charlie',
        password: 'charlie123',
        createdAt: datetime()
      })
      
      MERGE (alice)-[:HAS_ROLE]->(adminRole)
      MERGE (bob)-[:HAS_ROLE]->(userRole)
      MERGE (charlie)-[:HAS_ROLE]->(guestRole)
    `);

        console.log('🌐 Création des IP de test...');
        await session.run(`
      MATCH (alice:User {username: 'alice'})
      MATCH (bob:User {username: 'bob'})
      
      MERGE (ip1:IP {address: '192.168.1.10'})
      MERGE (ip2:IP {address: '192.168.1.20'})
      MERGE (ip3:IP {address: '10.0.0.5'})
      
      MERGE (alice)-[:CONNECTS_FROM]->(ip1)
      MERGE (bob)-[:CONNECTS_FROM]->(ip2)
    `);

        console.log('✅ Initialisation terminée !');
        console.log('\n📊 Résumé :');
        console.log('   - 3 rôles : ADMIN, USER, GUEST');
        console.log('   - 18 permissions : READ_DASHBOARD, WRITE_USERS, etc.');
        console.log('   - 10 ressources protégées');
        console.log('   - 3 utilisateurs : alice (ADMIN), bob (USER), charlie (GUEST)');
        console.log('   - 3 IP de test');
        console.log('\n🔐 Pour tester :');
        console.log('   POST /auth/login avec {"username": "alice"}');
        console.log('   POST /auth/login avec {"username": "bob"}');
        console.log('   POST /auth/login avec {"username": "charlie"}');

        console.log('\n🔍 Vérifier dans Neo4j :');
        console.log('   MATCH (p:Permission) RETURN p.name');
        console.log('   MATCH (u:User {username: "alice"})-[:HAS_ROLE]->(r)-[:GRANTS]->(p)-[:ACCESS_TO]->(res) RETURN p.name, res.path');
    } catch (err) {
        console.error('❌ Erreur lors de l\'initialisation :', err);
    } finally {
        await session.close();
        await closeDriver();
    }
}

initData();