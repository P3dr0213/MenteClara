const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('node:crypto');
const {
  validateRegisterForm,
  validateLoginForm,
  validateProfileUpdateForm,
} = require('../src/auth');
const { validateMoodEntry } = require('../src/mood');
const { validateDiaryEntry } = require('../src/diary');

function createApp({ pool, jwtSecret }) {
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('Configure JWT_SECRET com pelo menos 32 caracteres.');
  }
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  const wrap = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
  const badInput = (res, validation) =>
    res.status(400).json({
      message: Object.values(validation.errors)[0],
      errors: validation.errors,
    });
  async function issueSession(db, user) {
    const id = randomUUID();
    const token = jwt.sign({}, jwtSecret, {
      subject: user.id,
      jwtid: id,
      expiresIn: '7d',
      algorithm: 'HS256',
      issuer: 'mente-clara',
      audience: 'mente-clara-app',
    });
    const { exp } = jwt.decode(token);
    await db.query(
      'INSERT INTO sessoes (id, usuario_id, expira_em) VALUES ($1, $2, to_timestamp($3))',
      [id, user.id, exp],
    );
    return { token, user };
  }
  const auth = wrap(async (req, res, next) => {
    const header = req.get('authorization') || '';
    if (!header.startsWith('Bearer ')) {
      return res
        .status(401)
        .json({ message: 'Entre novamente para continuar.' });
    }
    let payload;
    try {
      payload = jwt.verify(header.slice(7), jwtSecret, {
        algorithms: ['HS256'],
        issuer: 'mente-clara',
        audience: 'mente-clara-app',
      });
    } catch {
      return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
    }
    if (typeof payload.sub !== 'string' || typeof payload.jti !== 'string') {
      return res.status(401).json({ message: 'Sessão inválida.' });
    }
    const result = await pool.query(
      'SELECT id FROM sessoes WHERE id = $1 AND usuario_id = $2 AND expira_em > now()',
      [payload.jti, payload.sub],
    );
    if (!result.rowCount) {
      return res.status(401).json({ message: 'Sessão encerrada ou expirada.' });
    }
    req.auth = { userId: payload.sub, sessionId: payload.jti };
    next();
  });
  app.get(
    '/health',
    wrap(async (_req, res) => {
      await pool.query('SELECT 1');
      res.json({ ok: true });
    }),
  );
  app.post(
    '/api/auth/register',
    wrap(async (req, res) => {
      const validation = validateRegisterForm(req.body);
      if (!validation.valid) {
        return badInput(res, validation);
      }
      const { name, email, password } = validation.normalized;
      const hash = await bcrypt.hash(password, 12);
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        const result = await db.query(
          'INSERT INTO usuarios (nome,email,senha_hash) VALUES ($1,$2,$3) RETURNING id,nome,email',
          [name, email, hash],
        );
        const session = await issueSession(db, result.rows[0]);
        await db.query('COMMIT');
        res
          .status(201)
          .json({ ...session, message: 'Conta criada com sucesso.' });
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      } finally {
        db.release();
      }
    }),
  );
  app.post(
    '/api/auth/login',
    wrap(async (req, res) => {
      const validation = validateLoginForm(req.body);
      if (!validation.valid) {
        return badInput(res, validation);
      }
      const { email, password } = validation.normalized;
      const result = await pool.query(
        'SELECT id,nome,email,senha_hash FROM usuarios WHERE lower(email) = $1',
        [email],
      );
      const found = result.rows[0];
      if (!found || !(await bcrypt.compare(password, found.senha_hash))) {
        return res.status(401).json({ message: 'Credenciais inválidas.' });
      }
      const user = { id: found.id, nome: found.nome, email: found.email };
      res.json(await issueSession(pool, user));
    }),
  );
  app.post(
    '/api/auth/logout',
    auth,
    wrap(async (req, res) => {
      await pool.query(
        'DELETE FROM sessoes WHERE id = $1 AND usuario_id = $2',
        [req.auth.sessionId, req.auth.userId],
      );
      res.status(204).end();
    }),
  );
  const profile = wrap(async (req, res) => {
    const result = await pool.query(
      'SELECT id,nome,email FROM usuarios WHERE id=$1',
      [req.auth.userId],
    );
    if (!result.rowCount) {
      return res.status(401).json({ message: 'Usuário não encontrado.' });
    }
    res.json({ user: result.rows[0] });
  });
  app.get('/api/auth/me', auth, profile);
  app.get('/api/user/profile', auth, profile);
  app.put(
    '/api/user/profile',
    auth,
    wrap(async (req, res) => {
      const validation = validateProfileUpdateForm(req.body);
      if (!validation.valid) {
        return badInput(res, validation);
      }
      const { name, email } = validation.normalized;
      const result = await pool.query(
        'UPDATE usuarios SET nome=$1,email=$2 WHERE id=$3 RETURNING id,nome,email',
        [name, email, req.auth.userId],
      );
      res.json({ user: result.rows[0], message: 'Perfil atualizado.' });
    }),
  );
  app.post(
    '/api/mood/register',
    auth,
    wrap(async (req, res) => {
      const validation = validateMoodEntry(req.body);
      if (!validation.valid) {
        return badInput(res, validation);
      }
      const { tipo, intensidade, descricao } = validation.normalized;
      const result = await pool.query(
        'INSERT INTO registros_humor (usuario_id,tipo,intensidade,descricao) VALUES ($1,$2,$3,$4) RETURNING id,tipo,intensidade,descricao,criado_em',
        [req.auth.userId, tipo, intensidade, descricao || null],
      );
      res
        .status(201)
        .json({ registro: result.rows[0], message: 'Registro salvo.' });
    }),
  );
  app.get(
    '/api/mood/history',
    auth,
    wrap(async (req, res) => {
      const period = req.query.period || 'week';
      if (!['week', 'month'].includes(period)) {
        return res.status(400).json({ message: 'Período inválido.' });
      }
      const days = period === 'week' ? 7 : 30;
      const result = await pool.query(
        "SELECT id,tipo,intensidade,descricao,criado_em FROM registros_humor WHERE usuario_id=$1 AND criado_em >= now() - ($2 * interval '1 day') AND criado_em <= now() ORDER BY criado_em DESC,id DESC",
        [req.auth.userId, days],
      );
      res.json({ registros: result.rows, period });
    }),
  );
  app.get(
    '/api/mood/:id',
    auth,
    wrap(async (req, res) => {
      if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(req.params.id)) {
        return res.status(400).json({ message: 'Registro inválido.' });
      }
      const result = await pool.query(
        'SELECT id,tipo,intensidade,descricao,criado_em FROM registros_humor WHERE id=$1 AND usuario_id=$2',
        [req.params.id, req.auth.userId],
      );
      if (!result.rowCount) {
        return res.status(404).json({ message: 'Registro não encontrado.' });
      }
      res.json({ registro: result.rows[0] });
    }),
  );
  app.post(
    '/api/diary/register',
    auth,
    wrap(async (req, res) => {
      const validation = validateDiaryEntry(req.body);
      if (!validation.valid) {
        return badInput(res, validation);
      }
      const { usePrompt, prompt, resposta } = validation.normalized;
      const result = await pool.query(
        'INSERT INTO registros_diario (usuario_id,prompt,resposta) VALUES ($1,$2,$3) RETURNING id,prompt,resposta,criado_em',
        [req.auth.userId, usePrompt ? prompt : null, resposta],
      );
      res.status(201).json({
        registro: result.rows[0],
        message: 'Registro do diário salvo.',
      });
    }),
  );
  app.get(
    '/api/diary/history',
    auth,
    wrap(async (req, res) => {
      const result = await pool.query(
        'SELECT id,prompt,resposta,criado_em FROM registros_diario WHERE usuario_id=$1 ORDER BY criado_em DESC,id DESC',
        [req.auth.userId],
      );
      res.json({ registros: result.rows });
    }),
  );
  app.get(
    '/api/diary/:id',
    auth,
    wrap(async (req, res) => {
      if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(req.params.id)) {
        return res.status(400).json({ message: 'Registro inválido.' });
      }
      const result = await pool.query(
        'SELECT id,prompt,resposta,criado_em FROM registros_diario WHERE id=$1 AND usuario_id=$2',
        [req.params.id, req.auth.userId],
      );
      if (!result.rowCount) {
        return res.status(404).json({ message: 'Registro não encontrado.' });
      }
      res.json({ registro: result.rows[0] });
    }),
  );
  app.use((_req, res) =>
    res.status(404).json({ message: 'Rota não encontrada.' }),
  );
  app.use((error, _req, res, _next) => {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Este email já está em uso.' });
    }
    if (
      error.type === 'entity.parse.failed' ||
      error.type === 'entity.too.large'
    ) {
      return res.status(400).json({ message: 'Corpo da requisição inválido.' });
    }
    console.error('Falha da API:', error.code || error.name);
    res
      .status(500)
      .json({ message: 'Não foi possível concluir. Tente novamente.' });
  });
  return app;
}
module.exports = { createApp };
