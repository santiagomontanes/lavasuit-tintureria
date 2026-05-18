const request = require('supertest');

async function login(app, email = 'admin@lavasuit.com', password = 'admin123') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (!res.body?.token) {
    throw new Error(`login fallido (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

module.exports = { login };
