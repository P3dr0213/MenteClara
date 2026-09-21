const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config({
  path: path.join(__dirname, '../.env'),
  quiet: true,
});
const { createApp } = require('../app');

test('API real: autenticacao, perfil, isolamento, filtros e logout', async t => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  const jwtSecret = process.env.JWT_SECRET;
  const app = createApp({ pool, jwtSecret });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const userIds = [];
  const call = async (route, { method = 'GET', token, body } = {}) => {
    const res = await fetch(base + route, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: res.status,
      data: res.status === 204 ? null : await res.json(),
    };
  };
  const email = 'audit-' + randomUUID() + '@example.invalid';
  const email2 = 'audit-' + randomUUID() + '@example.invalid';
  const password = 'Senha@123Teste';
  let a, b, mood;
  try {
    await t.test('cadastro e hash real sem expor senha', async () => {
      a = await call('/api/auth/register', {
        method: 'POST',
        body: { name: 'Teste A', email, password },
      });
      assert.equal(a.status, 201);
      userIds.push(a.data.user.id);
      assert.equal(a.data.user.senha_hash, undefined);
      const { rows } = await pool.query(
        'SELECT senha_hash FROM usuarios WHERE id=$1',
        [a.data.user.id],
      );
      assert.notEqual(rows[0].senha_hash, password);
      assert.equal(await bcrypt.compare(password, rows[0].senha_hash), true);
      b = await call('/api/auth/register', {
        method: 'POST',
        body: { name: 'Teste B', email: email2, password },
      });
      assert.equal(b.status, 201);
      userIds.push(b.data.user.id);
    });
    await t.test('email duplicado e campos invalidos', async () => {
      assert.equal(
        (
          await call('/api/auth/register', {
            method: 'POST',
            body: { name: 'Teste', email: email.toUpperCase(), password },
          })
        ).status,
        409,
      );
      for (const body of [
        { name: 'x'.repeat(121), email, password },
        { name: 'Teste', email: 'x'.repeat(255), password },
        { name: 'Teste', email, password: 'Áa1!'.repeat(30) },
        { name: 'Teste', email, password: {} },
      ]) {
        assert.equal(
          (await call('/api/auth/register', { method: 'POST', body })).status,
          400,
        );
      }
    });
    await t.test(
      'login, credenciais incorretas e sessao persistida no banco',
      async () => {
        assert.equal(
          (
            await call('/api/auth/login', {
              method: 'POST',
              body: { email, password: 'errada' },
            })
          ).status,
          401,
        );
        assert.equal(
          (
            await call('/api/auth/login', {
              method: 'POST',
              body: { email: 'inexistente@example.invalid', password },
            })
          ).status,
          401,
        );
        const login = await call('/api/auth/login', {
          method: 'POST',
          body: { email: email.toUpperCase(), password },
        });
        assert.equal(login.status, 200);
        const claims = jwt.verify(login.data.token, jwtSecret);
        assert.equal(
          (await pool.query('SELECT id FROM sessoes WHERE id=$1', [claims.jti]))
            .rowCount,
          1,
        );
        assert.equal(
          (await call('/api/auth/me', { token: login.data.token })).data.user
            .id,
          a.data.user.id,
        );
      },
    );
    await t.test(
      'perfil consulta, edicao, persistencia e conflito de email',
      async () => {
        assert.equal((await call('/api/user/profile')).status, 401);
        assert.equal(
          (await call('/api/user/profile', { token: 'dev-token' })).status,
          401,
        );
        const updated = await call('/api/user/profile', {
          method: 'PUT',
          token: a.data.token,
          body: { name: 'Nome Atualizado', email },
        });
        assert.equal(updated.status, 200);
        assert.equal(
          (await call('/api/user/profile', { token: a.data.token })).data.user
            .nome,
          'Nome Atualizado',
        );
        assert.equal(
          (
            await call('/api/user/profile', {
              method: 'PUT',
              token: a.data.token,
              body: { name: 'Teste', email: email2 },
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await call('/api/user/profile', {
              method: 'PUT',
              token: a.data.token,
              body: { name: '', email },
            })
          ).status,
          400,
        );
      },
    );
    await t.test('humor exige sessao e valida os campos', async () => {
      assert.equal(
        (
          await call('/api/mood/register', {
            method: 'POST',
            body: { tipo: 'feliz', intensidade: 4 },
          })
        ).status,
        401,
      );
      for (const body of [
        { tipo: 'outro', intensidade: 4 },
        { tipo: 'feliz', intensidade: 6 },
        { tipo: 'feliz', intensidade: true },
        { tipo: 'feliz', intensidade: 2, descricao: {} },
        { tipo: 'feliz', intensidade: 1.5 },
        { tipo: 'feliz', intensidade: 2, descricao: 'x'.repeat(281) },
      ]) {
        assert.equal(
          (
            await call('/api/mood/register', {
              method: 'POST',
              token: a.data.token,
              body,
            })
          ).status,
          400,
        );
      }
      mood = await call('/api/mood/register', {
        method: 'POST',
        token: a.data.token,
        body: { tipo: 'calmo', intensidade: 3 },
      });
      assert.equal(mood.status, 201);
      assert.equal(mood.data.registro.descricao, null);
    });
    await t.test(
      'consulta individual e isolamento entre usuarios',
      async () => {
        const id = mood.data.registro.id;
        assert.equal(
          (await call('/api/mood/' + id, { token: a.data.token })).status,
          200,
        );
        assert.equal(
          (await call('/api/mood/' + id, { token: b.data.token })).status,
          404,
        );
        assert.deepEqual(
          (await call('/api/mood/history', { token: b.data.token })).data
            .registros,
          [],
        );
        assert.equal(
          (await call('/api/mood/history', { token: a.data.token })).data
            .registros.length,
          1,
        );
      },
    );
    await t.test('filtros de 7 e 30 dias, sem registros futuros', async () => {
      const id = mood.data.registro.id;
      await pool.query(
        "UPDATE registros_humor SET criado_em=now()-interval '10 days' WHERE id=$1",
        [id],
      );
      assert.equal(
        (await call('/api/mood/history?period=week', { token: a.data.token }))
          .data.registros.length,
        0,
      );
      assert.equal(
        (await call('/api/mood/history?period=month', { token: a.data.token }))
          .data.registros.length,
        1,
      );
      await pool.query(
        "UPDATE registros_humor SET criado_em=now()-interval '31 days' WHERE id=$1",
        [id],
      );
      assert.equal(
        (await call('/api/mood/history?period=month', { token: a.data.token }))
          .data.registros.length,
        0,
      );
      await pool.query(
        "UPDATE registros_humor SET criado_em=now()+interval '1 day' WHERE id=$1",
        [id],
      );
      assert.equal(
        (await call('/api/mood/history?period=month', { token: a.data.token }))
          .data.registros.length,
        0,
      );
      assert.equal(
        (await call('/api/mood/history?period=year', { token: a.data.token }))
          .status,
        400,
      );
    });
    await t.test('token expirado e logout invalidam acesso', async () => {
      const claims = jwt.decode(a.data.token);
      const expired = jwt.sign(
        { sub: claims.sub, jti: claims.jti },
        jwtSecret,
        { issuer: 'mente-clara', audience: 'mente-clara-app', expiresIn: -1 },
      );
      assert.equal(
        (await call('/api/auth/me', { token: expired })).status,
        401,
      );
      assert.equal(
        (
          await call('/api/auth/logout', {
            method: 'POST',
            token: a.data.token,
          })
        ).status,
        204,
      );
      assert.equal(
        (await call('/api/auth/me', { token: a.data.token })).status,
        401,
      );
      assert.equal(
        (await call('/api/mood/history', { token: a.data.token })).status,
        401,
      );
    });
  } finally {
    if (userIds.length) {
      await pool.query('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [
        userIds,
      ]);
    }
    await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
});
