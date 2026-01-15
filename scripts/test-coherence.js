/**
 * Script de test de cohérence Backend ↔ Base de données
 * Vérifie que la structure correspond EXACTEMENT au document PDF
 * 
 * Usage: node scripts/test-coherence.js
 */

require('dotenv').config();
const { getDriver, closeDriver } = require('../config/neo4j');

async function testCoherence() {
  const driver = getDriver();
  const session = driver.session();
  
  let errors = 0;
  let warnings = 0;

  try {
    console.log('\n🔬 TEST DE COHÉRENCE BD ↔ BACKEND\n');
    console.log('='.repeat(60));

    // TEST 1 : Format des permissions
    console.log('\n1️⃣  TEST : Format des permissions');
    console.log('-'.repeat(60));
    const permsResult = await session.run(`
      MATCH (p:Permission)
      RETURN p.name AS name
      LIMIT 5
    `);

    if (permsResult.records.length === 0) {
      console.log('❌ ERREUR : Aucune permission trouvée');
      console.log('   → Lancer: npm run init');
      errors++;
    } else {
      const permNames = permsResult.records.map(r => r.get('name'));
      const validFormat = permNames.every(name => 
        name && name.match(/^(READ|WRITE|DELETE)_[A-Z]+$/)
      );
      
      if (validFormat) {
        console.log('✅ Format correct : ACTION_RESOURCE');
        permNames.forEach(name => console.log(`   - ${name}`));
      } else {
        console.log('❌ ERREUR : Format invalide détecté');
        permNames.forEach(name => {
          if (!name.match(/^(READ|WRITE|DELETE)_[A-Z]+$/)) {
            console.log(`   ❌ ${name} (attendu: ACTION_RESOURCE)`);
          }
        });
        errors++;
      }
    }

    // TEST 2 : Relations Permission → Resource
    console.log('\n2️⃣  TEST : Relations Permission → Resource');
    console.log('-'.repeat(60));
    const relResult = await session.run(`
      MATCH (p:Permission)-[:ACCESS_TO]->(r:Resource)
      RETURN p.name AS permission, r.path AS resource
      LIMIT 5
    `);

    if (relResult.records.length === 0) {
      console.log('❌ ERREUR : Aucune relation Permission → Resource');
      errors++;
    } else {
      console.log('✅ Relations trouvées :');
      relResult.records.forEach(r => {
        console.log(`   ${r.get('permission')} → ${r.get('resource')}`);
      });
    }

    // TEST 3 : Chemin complet User → Resource
    console.log('\n3️⃣  TEST : Chemin User → Role → Permission → Resource');
    console.log('-'.repeat(60));
    const pathResult = await session.run(`
      MATCH path = (u:User {username: 'alice'})-[:HAS_ROLE]->(r:Role)
                   -[:GRANTS]->(p:Permission)
                   -[:ACCESS_TO]->(res:Resource {path: '/dashboard'})
      RETURN p.name AS permission
      LIMIT 1
    `);

    if (pathResult.records.length === 0) {
      console.log('❌ ERREUR : Chemin incomplet pour alice → /dashboard');
      console.log('   Vérifier :');
      console.log('   1. alice existe et a un rôle');
      console.log('   2. Le rôle a des permissions');
      console.log('   3. Les permissions sont liées aux ressources');
      errors++;
    } else {
      const perm = pathResult.records[0].get('permission');
      console.log(`✅ Chemin valide : alice → ADMIN → ${perm} → /dashboard`);
    }

    // TEST 4 : Propriétés User
    console.log('\n4️⃣  TEST : Propriétés des utilisateurs');
    console.log('-'.repeat(60));
    const userResult = await session.run(`
      MATCH (u:User {username: 'alice'})
      RETURN u.username AS username, 
             u.password AS password,
             u.createdAt AS createdAt
    `);

    if (userResult.records.length === 0) {
      console.log('❌ ERREUR : Alice non trouvée');
      errors++;
    } else {
      const user = userResult.records[0];
      const hasPassword = user.get('password') !== null;
      const hasCreatedAt = user.get('createdAt') !== null;
      
      if (hasPassword && hasCreatedAt) {
        console.log('✅ Propriétés correctes : username, password, createdAt');
      } else {
        if (!hasPassword) {
          console.log('⚠️  WARNING : password manquant');
          warnings++;
        }
        if (!hasCreatedAt) {
          console.log('⚠️  WARNING : createdAt manquant');
          warnings++;
        }
      }
    }

    // TEST 5 : Propriétés Resource
    console.log('\n5️⃣  TEST : Propriétés des ressources');
    console.log('-'.repeat(60));
    const resourceResult = await session.run(`
      MATCH (r:Resource {path: '/dashboard'})
      RETURN r.path AS path, r.name AS name, r.type AS type
    `);

    if (resourceResult.records.length === 0) {
      console.log('❌ ERREUR : /dashboard non trouvée');
      errors++;
    } else {
      const res = resourceResult.records[0];
      const hasName = res.get('name') !== null;
      const hasType = res.get('type') !== null;
      
      if (hasName && hasType) {
        console.log(`✅ Propriétés correctes : path=${res.get('path')}, name=${res.get('name')}, type=${res.get('type')}`);
      } else {
        if (!hasName) {
          console.log('⚠️  WARNING : name manquant');
          warnings++;
        }
        if (!hasType) {
          console.log('⚠️  WARNING : type manquant');
          warnings++;
        }
      }
    }

    // TEST 6 : Relation CONNECTS_FROM
    console.log('\n6️⃣  TEST : Relation User → IP (CONNECTS_FROM)');
    console.log('-'.repeat(60));
    const ipResult = await session.run(`
      MATCH (u:User {username: 'alice'})-[:CONNECTS_FROM]->(ip:IP)
      RETURN ip.address AS address
    `);

    if (ipResult.records.length === 0) {
      console.log('⚠️  Aucune IP connue pour alice (normal au premier démarrage)');
      warnings++;
    } else {
      console.log('✅ IP connues pour alice :');
      ipResult.records.forEach(r => {
        console.log(`   - ${r.get('address')}`);
      });
    }

    // TEST 7 : Test de vérification permission avec requête backend
    console.log('\n7️⃣  TEST : Simulation requête backend (alice → READ_DASHBOARD)');
    console.log('-'.repeat(60));
    const backendTestResult = await session.run(`
      MATCH (u:User {username: $username})-[:HAS_ROLE]->(r:Role)
            -[:GRANTS]->(p:Permission {name: $permissionName})
            -[:ACCESS_TO]->(res:Resource {path: $path})
      RETURN COUNT(p) > 0 AS hasPermission
    `, {
      username: 'alice',
      permissionName: 'READ_DASHBOARD',
      path: '/dashboard'
    });

    const hasPermission = backendTestResult.records[0].get('hasPermission');
    if (hasPermission) {
      console.log('✅ Backend peut vérifier : alice PEUT accéder à /dashboard');
    } else {
      console.log('❌ ERREUR : Backend ne peut PAS vérifier l\'accès');
      console.log('   → Le chemin User → Role → Permission → Resource est cassé');
      errors++;
    }

    // RÉSUMÉ
    console.log('\n' + '='.repeat(60));
    console.log('📊 RÉSUMÉ');
    console.log('='.repeat(60));
    console.log(`Erreurs : ${errors}`);
    console.log(`Warnings : ${warnings}`);
    
    if (errors === 0 && warnings === 0) {
      console.log('\n✅ 🎉 COHÉRENCE PARFAITE ! Backend ↔ BD alignés.\n');
    } else if (errors === 0) {
      console.log('\n⚠️  Cohérence OK avec quelques warnings mineurs.\n');
    } else {
      console.log('\n❌ Incohérences détectées. Relancer : npm run init\n');
    }

  } catch (err) {
    console.error('❌ Erreur lors du test :', err);
  } finally {
    await session.close();
    await closeDriver();
  }
}

testCoherence();