const axios = require('axios');

async function getAuthHeaders() {
    try {
        const loginRes = await axios.post('http://localhost:3000/api/auth/login', {
            email: 'admin@smoke.test',
            password: 'password123'
        });
        const cookie = loginRes.headers['set-cookie'];
        return {
            Cookie: cookie,
            Authorization: `Bearer ${loginRes.data.token}`
        };
    } catch (e) {
        console.error('Auth Failed:', e.message);
        throw e;
    }
}

module.exports = { getAuthHeaders };
