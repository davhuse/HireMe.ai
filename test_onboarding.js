const fetch = require('node-fetch');
(async () => {
    // Generate random email
    const email = 'test' + Date.now() + '@example.com';
    // Register
    const regRes = await fetch('http://localhost:4000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test', email, password: 'password' })
    });
    const regData = await regRes.json();
    const token = regData.token;
    
    // Onboarding
    const obRes = await fetch('http://localhost:4000/api/user/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ industry: 'Tech', targetRole: 'Dev' })
    });
    const obData = await obRes.json();
    console.log(obData);
})();
