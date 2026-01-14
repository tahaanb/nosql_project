const http = require('http');

const PORT = 4000; // Assumer que le serveur tourne sur 4000
const BASE_URL = `http://localhost:${PORT}`;

// Helper simple pour les requêtes HTTP
function request(method, path, body = null, cookie = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
        };

        if (cookie) {
            options.headers['Cookie'] = cookie;
        }

        const req = http.request(`${BASE_URL}${path}`, options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                let parsedData = data;
                try {
                    parsedData = JSON.parse(data);
                } catch (e) {
                    // keep as string
                }
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    data: parsedData,
                });
            });
        });

        req.on('error', (err) => reject(err));

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

function assert(condition, message) {
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        // ne pas exit, continuer les tests
    } else {
        console.log(`✅ PASS: ${message}`);
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    console.log('🚀 Starting Access Control Tests...');

    // Wait for server? Assuming server is running.
    try {
        await request('GET', '/health');
    } catch (e) {
        console.error("❌ Server not reachable at " + BASE_URL + ". Is it running?");
        process.exit(1);
    }

    // ---------------------------------------------------------
    // SCENARIO 1: ADMIN ACCESS
    // ---------------------------------------------------------
    console.log('\n--- Scenario 1: ADMIN Login & Access ---');

    // 1. Login
    const loginRes = await request('POST', '/auth/login', { username: 'admin' });
    assert(loginRes.statusCode === 200, 'Admin login should succeed');
    const adminCookie = loginRes.headers['set-cookie'] ? loginRes.headers['set-cookie'][0] : null;
    assert(!!adminCookie, 'Admin should get a session cookie');

    if (adminCookie) {
        // 2. Access /users (Expected: 200 - First IP)
        const usersRes1 = await request('GET', '/users', null, adminCookie);
        assert(usersRes1.statusCode === 200, 'Admin accessing /users (1st time) should be 200');

        // 3. Access /users again (Expected: 200 - Known IP)
        const usersRes2 = await request('GET', '/users', null, adminCookie);
        assert(usersRes2.statusCode === 200, 'Admin accessing /users (2nd time) should be 200');

        // 4. Access /users from NEW IP (Expected: 403 Suspicious)
        // On simule une nouvelle IP via X-Forwarded-For
        const suspiciousRes = await request('GET', '/users', null, adminCookie, {
            'X-Forwarded-For': '10.10.10.10'
        });

        // Le backend renvoie { status: 'SUSPICIOUS', reason: '...' } avec un code 403
        assert(suspiciousRes.statusCode === 403, 'Admin accessing from NEW IP should be 403 Forbidden');
        assert(suspiciousRes.data.status === 'SUSPICIOUS', 'Response status should be SUSPICIOUS');
        assert(suspiciousRes.data.reason === 'permission_ok_new_ip_detected', 'Reason should be permission_ok_new_ip_detected');
    }

    // ---------------------------------------------------------
    // SCENARIO 2: USER ACCESS (Alice)
    // ---------------------------------------------------------
    console.log('\n--- Scenario 2: USER (Alice) Login & Access ---');

    // 1. Login
    const aliceLoginRes = await request('POST', '/auth/login', { username: 'alice' });
    assert(aliceLoginRes.statusCode === 200, 'Alice login should succeed');
    const aliceCookie = aliceLoginRes.headers['set-cookie'] ? aliceLoginRes.headers['set-cookie'][0] : null;

    if (aliceCookie) {
        // 2. Access /users (Has permission)
        const aliceUsersRes = await request('GET', '/users', null, aliceCookie);
        assert(aliceUsersRes.statusCode === 200, 'Alice should be able to read /users');

        // 3. Access /roles (No permission)
        const aliceRolesRes = await request('GET', '/roles', null, aliceCookie);
        assert(aliceRolesRes.statusCode === 403, 'Alice should NOT be able to read /roles');
        assert(aliceRolesRes.data.status === 'REFUSED', 'Status should be REFUSED');
    }

    // ---------------------------------------------------------
    // SCENARIO 3: GUEST/NO LOGIN
    // ---------------------------------------------------------
    console.log('\n--- Scenario 3: No Login Access ---');
    const guestRes = await request('GET', '/users');
    assert(guestRes.statusCode === 403, 'Unauthenticated user should be refused');
    assert(guestRes.data.reason === 'no_session', 'Reason should be no_session');

    console.log('\n🏁 Tests Completed.');
}

runTests();
