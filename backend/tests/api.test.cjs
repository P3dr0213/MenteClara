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
  let a, b, mood, diary;
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
    await t.test(
      'diario exige autenticacao, salva e recupera registros',
      async () => {
        assert.equal(
          (
            await call('/api/diary/register', {
              method: 'POST',
              body: {
                prompt: 'Como você está se sentindo hoje?',
                resposta: 'Estou mais tranquilo e confiante.',
              },
            })
          ).status,
          401,
        );
        assert.equal(
          (
            await call('/api/diary/register', {
              method: 'POST',
              token: a.data.token,
              body: {
                prompt: 'Como você está se sentindo hoje?',
                resposta: 'Estou mais tranquilo e confiante.',
              },
            })
          ).status,
          201,
        );
        assert.equal(
          (
            await call('/api/diary/register', {
              method: 'POST',
              token: a.data.token,
              body: {
                prompt: '',
                usePrompt: false,
                resposta: 'Hoje foi um dia leve, com foco e calma.',
              },
            })
          ).status,
          201,
        );
        diary = await call('/api/diary/register', {
          method: 'POST',
          token: a.data.token,
          body: {
            prompt: 'O que te deixou mais calmo?',
            resposta: 'A rotina e o tempo para refletir.',
          },
        });
        assert.equal(diary.status, 201);
        assert.equal(
          (await call('/api/diary/history', { token: a.data.token })).data
            .registros.length,
          3,
        );
        assert.equal(
          (
            await call('/api/diary/' + diary.data.registro.id, {
              token: a.data.token,
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await call('/api/diary/' + diary.data.registro.id, {
              token: b.data.token,
            })
          ).status,
          404,
        );
        assert.equal(
          (
            await call('/api/diary/register', {
              method: 'POST',
              token: a.data.token,
              body: {
                prompt: 'ok',
                resposta: 'Hoje foi um dia leve e tranquilo.',
              },
            })
          ).status,
          201,
        );
        assert.equal(
          (
            await call('/api/diary/register', {
              method: 'POST',
              token: a.data.token,
              body: { prompt: '', resposta: '   ' },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await call('/api/diary/register', {
              method: 'POST',
              token: a.data.token,
              body: { prompt: '', resposta: 'texto' },
            })
          ).status,
          201,
        );
      },
    );
    await t.test(
      'diario edita e exclui com persistencia e isolamento',
      async () => {
        const route = '/api/diary/' + diary.data.registro.id;
        const body = { prompt: '', resposta: 'Texto atualizado' };
        for (const method of ['PUT', 'DELETE']) {
          assert.equal((await call(route, { method, body })).status, 401);
          assert.equal(
            (await call(route, { method, body, token: b.data.token })).status,
            404,
          );
          assert.equal(
            (
              await call('/api/diary/invalido', {
                method,
                body,
                token: a.data.token,
              })
            ).status,
            400,
          );
        }
        assert.equal(
          (
            await call(route, {
              method: 'PUT',
              body: { resposta: ' ' },
              token: a.data.token,
            })
          ).status,
          400,
        );
        const updated = await call(route, {
          method: 'PUT',
          body,
          token: a.data.token,
        });
        assert.equal(updated.status, 200);
        assert.equal(updated.data.registro.prompt, null);
        assert.equal(
          (await call(route, { token: a.data.token })).data.registro.resposta,
          body.resposta,
        );
        assert.equal(
          (await call(route, { method: 'DELETE', token: a.data.token })).status,
          204,
        );
        assert.equal((await call(route, { token: a.data.token })).status, 404);
        assert.equal(
          (await call(route, { method: 'DELETE', token: a.data.token })).status,
          404,
        );
        assert.equal(
          (await call(route, { method: 'PUT', body, token: a.data.token }))
            .status,
          404,
        );
      },
    );
    await t.test('sincronização offline é idempotente e isolada por conta', async () => {
      const clientId = randomUUID();
      const body = { tipo: 'calmo', intensidade: 4, descricao: 'Offline', clientId };
      const first = await call('/api/mood/register', { method: 'POST', token: a.data.token, body });
      const retry = await call('/api/mood/register', { method: 'POST', token: a.data.token, body });
      assert.equal(first.status, 201);
      assert.equal(retry.status, 200);
      assert.equal(retry.data.registro.id, clientId);
      assert.equal((await call('/api/mood/' + clientId, { token: b.data.token })).status, 404);

      const diaryClientId = randomUUID();
      const diaryBody = { prompt: 'Offline', resposta: 'Registro feito sem conexão.', clientId: diaryClientId };
      const diaryFirst = await call('/api/diary/register', { method: 'POST', token: a.data.token, body: diaryBody });
      const diaryRetry = await call('/api/diary/register', { method: 'POST', token: a.data.token, body: diaryBody });
      assert.equal(diaryFirst.status, 201);
      assert.equal(diaryRetry.status, 200);
      assert.equal(diaryRetry.data.registro.id, diaryClientId);
      assert.equal((await call('/api/diary/' + diaryClientId, { token: b.data.token })).status, 404);
    });
    await t.test('humor pode ser editado e excluído somente pelo proprietário', async () => {
      const created = await call('/api/mood/register', {
        method: 'POST', token: a.data.token,
        body: { tipo: 'feliz', intensidade: 2, descricao: 'Inicial' },
      });
      const route = '/api/mood/' + created.data.registro.id;
      assert.equal((await call(route, { method: 'PUT', body: { tipo: 'calmo', intensidade: 4 } })).status, 401);
      assert.equal((await call(route, { method: 'DELETE' })).status, 401);
      assert.equal((await call(route, { method: 'PUT', token: b.data.token, body: { tipo: 'calmo', intensidade: 4 } })).status, 404);
      assert.equal((await call(route, { method: 'DELETE', token: b.data.token })).status, 404);
      assert.equal((await call('/api/mood/invalido', { method: 'PUT', token: a.data.token, body: { tipo: 'calmo', intensidade: 4 } })).status, 400);
      assert.equal((await call(route, { method: 'PUT', token: a.data.token, body: { tipo: 'desconhecido', intensidade: 4 } })).status, 400);
      const updated = await call(route, { method: 'PUT', token: a.data.token, body: { tipo: 'calmo', intensidade: 4, descricao: 'Atualizado' } });
      assert.equal(updated.status, 200);
      assert.equal(updated.data.registro.descricao, 'Atualizado');
      assert.equal((await call(route, { token: a.data.token })).data.registro.tipo, 'calmo');
      assert.equal((await call(route, { method: 'DELETE', token: a.data.token })).status, 204);
      assert.equal((await call(route, { token: a.data.token })).status, 404);
    });
    await t.test('estado de bem-estar autenticado, validado e separado por conta', async () => {
      assert.equal((await call('/api/user/wellbeing')).status, 401);
      const initial = await call('/api/user/wellbeing', { token: a.data.token });
      assert.equal(initial.status, 200);
      assert.deepEqual(initial.data.state.goals, []);
      const saved = await call('/api/user/wellbeing', {
        method: 'PUT', token: a.data.token,
        body: {
          reminderEnabled: true, reminderTime: '08:30',
          completedActivities: ['gratidao'],
          goals: [{ id: 'g1', title: 'Pausa diária', target: 5, progress: 2 }],
          points: 999, earnedBadges: ['constancia'],
        },
      });
      assert.equal(saved.status, 200);
      assert.equal(saved.data.state.points, 10);
      assert.deepEqual(saved.data.state.earnedBadges, []);
      assert.equal(saved.data.state.goals[0].progress, 2);
      assert.deepEqual((await call('/api/user/wellbeing', { token: b.data.token })).data.state.goals, []);
      assert.equal((await call('/api/user/wellbeing', {
        method: 'PUT', token: a.data.token,
        body: { reminderEnabled: true, reminderTime: '25:70', completedActivities: [], goals: [], earnedBadges: [] },
      })).status, 400);
    });
    await t.test('backup exporta e restaura sem duplicar registros', async () => {
      assert.equal((await call('/api/data/export')).status, 401);
      const exported = await call('/api/data/export', { token: a.data.token });
      assert.equal(exported.status, 200);
      assert.equal(exported.data.format, 'mente-clara-backup-v1');
      assert.ok(exported.data.registrosHumor.length >= 2);
      assert.ok(exported.data.registrosDiario.length >= 2);
      const restored = await call('/api/data/restore', { method: 'POST', token: b.data.token, body: exported.data });
      assert.equal(restored.status, 201);
      assert.equal(restored.data.registrosImportados, exported.data.registrosHumor.length + exported.data.registrosDiario.length);
      const again = await call('/api/data/restore', { method: 'POST', token: b.data.token, body: exported.data });
      assert.equal(again.status, 201);
      assert.equal(again.data.registrosImportados, 0);
      assert.equal(again.data.registrosIgnorados, restored.data.registrosImportados);
      assert.equal((await call('/api/mood/history?period=month', { token: b.data.token })).data.registros.length, 2);
      assert.equal((await call('/api/diary/history', { token: b.data.token })).data.registros.length, exported.data.registrosDiario.length);
    });
    await t.test('filtros de 7 e 30 dias, sem registros futuros', async () => {
      const id = mood.data.registro.id;
      await pool.query(
        "UPDATE registros_humor SET criado_em=now()-interval '31 days' WHERE usuario_id=$1 AND id<>$2",
        [a.data.user.id, id],
      );
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
