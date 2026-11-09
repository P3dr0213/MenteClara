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
  const regularJson = express.json({ limit: '16kb' });
  const restoreJson = express.json({ limit: '8mb' });
  app.use((req, res, next) =>
    (req.path === '/api/data/restore' ? restoreJson : regularJson)(req, res, next),
  );
  const wrap = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
  const badInput = (res, validation) =>
    res.status(400).json({
      message: Object.values(validation.errors)[0],
      errors: validation.errors,
    });
  const validUuid = value =>
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  const wellbeingActivities = new Set([
    'gratidao', 'pausa', 'alongamento', 'aterramento', 'pausa-corporal',
  ]);
  function validateWellbeingState(input) {
    const errors = {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { valid: false, errors: { state: 'Estado de bem-estar inválido.' } };
    }
    if (typeof input.reminderEnabled !== 'boolean') {
      errors.reminderEnabled = 'Preferência de lembrete inválida.';
    }
    if (typeof input.reminderTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.reminderTime)) {
      errors.reminderTime = 'Informe um horário válido no formato HH:MM.';
    }
    const completedActivities = input.completedActivities;
    if (!Array.isArray(completedActivities) || completedActivities.length > wellbeingActivities.size ||
      completedActivities.some(id => typeof id !== 'string' || !wellbeingActivities.has(id)) ||
      new Set(completedActivities).size !== completedActivities.length) {
      errors.completedActivities = 'Lista de atividades concluídas inválida.';
    }
    const goals = input.goals;
    if (!Array.isArray(goals) || goals.length > 30 || goals.some(goal =>
      !goal || typeof goal !== 'object' || typeof goal.id !== 'string' || !/^[\w-]{1,80}$/.test(goal.id) ||
      typeof goal.title !== 'string' || goal.title.trim().length < 1 || goal.title.trim().length > 100 ||
      !Number.isInteger(goal.target) || goal.target < 1 || goal.target > 100 ||
      !Number.isInteger(goal.progress) || goal.progress < 0 || goal.progress > goal.target
    ) || new Set(goals.map(goal => goal?.id)).size !== goals.length) {
      errors.goals = 'Metas inválidas. Verifique títulos, progresso e limites.';
    }
    if (!Array.isArray(input.earnedBadges) || input.earnedBadges.some(badge => badge !== 'constancia')) {
      errors.earnedBadges = 'Conquistas inválidas.';
    }
    if (Object.keys(errors).length) return { valid: false, errors };
    const points = completedActivities.length * 10;
    const earnedBadges = points >= 50 ? ['constancia'] : [];
    return {
      valid: true,
      errors: {},
      normalized: {
        reminderEnabled: input.reminderEnabled,
        reminderTime: input.reminderTime,
        completedActivities: [...completedActivities],
        goals: goals.map(goal => ({
          id: goal.id,
          title: goal.title.trim(),
          target: goal.target,
          progress: goal.progress,
        })),
        points,
        earnedBadges,
      },
    };
  }
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
  app.get(
    '/api/friends/code',
    auth,
    wrap(async (req, res) => {
      const result = await pool.query(
        'SELECT codigo_amizade::text AS code FROM public.usuarios WHERE id=$1',
        [req.auth.userId],
      );
      if (!result.rowCount) return res.status(404).json({ message: 'Usuário não encontrado.' });
      res.json({ code: result.rows[0].code });
    }),
  );
  app.get(
    '/api/friends',
    auth,
    wrap(async (req, res) => {
      const result = await pool.query(
        `SELECT u.id, u.nome, a.criado_em
         FROM public.amizades a
         JOIN public.usuarios u ON u.id=a.amigo_id
         WHERE a.usuario_id=$1
         ORDER BY lower(u.nome), u.id`,
        [req.auth.userId],
      );
      res.json({ friends: result.rows });
    }),
  );
  app.post(
    '/api/friends',
    auth,
    wrap(async (req, res) => {
      const code = typeof req.body?.code === 'string' ? req.body.code.trim().toLowerCase() : '';
      if (!validUuid(code)) return res.status(400).json({ message: 'Código de amizade inválido.' });
      const target = await pool.query(
        'SELECT id, nome FROM public.usuarios WHERE codigo_amizade=$1',
        [code],
      );
      if (!target.rowCount || target.rows[0].id === req.auth.userId) {
        return res.status(404).json({ message: 'Não encontramos outra pessoa com esse código.' });
      }
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        await db.query(
          `INSERT INTO public.amizades (usuario_id, amigo_id)
           VALUES ($1,$2),($2,$1) ON CONFLICT DO NOTHING`,
          [req.auth.userId, target.rows[0].id],
        );
        await db.query('COMMIT');
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      } finally {
        db.release();
      }
      res.status(201).json({ friend: target.rows[0], message: 'Amizade adicionada.' });
    }),
  );
  app.delete(
    '/api/friends/:id',
    auth,
    wrap(async (req, res) => {
      if (!validUuid(req.params.id) || req.params.id === req.auth.userId) {
        return res.status(400).json({ message: 'Amizade inválida.' });
      }
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        await db.query(
          'DELETE FROM public.amizades WHERE (usuario_id=$1 AND amigo_id=$2) OR (usuario_id=$2 AND amigo_id=$1)',
          [req.auth.userId, req.params.id],
        );
        await db.query('COMMIT');
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      } finally {
        db.release();
      }
      res.status(204).end();
    }),
  );
  app.get(
    '/api/user/wellbeing',
    auth,
    wrap(async (req, res) => {
      const result = await pool.query(
        'SELECT estado, atualizado_em FROM estado_bem_estar WHERE usuario_id=$1',
        [req.auth.userId],
      );
      if (!result.rowCount) {
        return res.json({
          state: {
            reminderEnabled: false, reminderTime: '20:00',
            completedActivities: [], goals: [], points: 0, earnedBadges: [], updatedAt: '',
          },
        });
      }
      res.json({ state: { ...result.rows[0].estado, updatedAt: result.rows[0].atualizado_em.toISOString() } });
    }),
  );
  app.put(
    '/api/user/wellbeing',
    auth,
    wrap(async (req, res) => {
      const validation = validateWellbeingState(req.body);
      if (!validation.valid) return badInput(res, validation);
      const result = await pool.query(
        `INSERT INTO estado_bem_estar (usuario_id,estado,atualizado_em)
         VALUES ($1,$2::jsonb,now())
         ON CONFLICT (usuario_id) DO UPDATE SET estado=EXCLUDED.estado,atualizado_em=now()
         RETURNING estado,atualizado_em`,
        [req.auth.userId, JSON.stringify(validation.normalized)],
      );
      res.json({ state: { ...result.rows[0].estado, updatedAt: result.rows[0].atualizado_em.toISOString() } });
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
      const clientId = req.body?.clientId;
      if (clientId !== undefined && !validUuid(clientId)) {
        return res.status(400).json({ message: 'Identificador offline inválido.' });
      }
      const result = clientId
        ? await pool.query(
            'INSERT INTO registros_humor (id,usuario_id,tipo,intensidade,descricao) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING RETURNING id,tipo,intensidade,descricao,criado_em',
            [clientId, req.auth.userId, tipo, intensidade, descricao || null],
          )
        : await pool.query(
            'INSERT INTO registros_humor (usuario_id,tipo,intensidade,descricao) VALUES ($1,$2,$3,$4) RETURNING id,tipo,intensidade,descricao,criado_em',
            [req.auth.userId, tipo, intensidade, descricao || null],
          );
      if (!result.rowCount && clientId) {
        const existing = await pool.query(
          'SELECT id,tipo,intensidade,descricao,criado_em FROM registros_humor WHERE id=$1 AND usuario_id=$2',
          [clientId, req.auth.userId],
        );
        if (!existing.rowCount) return res.status(409).json({ message: 'Identificador offline já utilizado.' });
        return res.json({ registro: existing.rows[0], message: 'Registro já sincronizado.' });
      }
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
  app.put(
    '/api/mood/:id',
    auth,
    wrap(async (req, res) => {
      if (!validUuid(req.params.id)) return res.status(400).json({ message: 'Registro inválido.' });
      const validation = validateMoodEntry(req.body);
      if (!validation.valid) return badInput(res, validation);
      const { tipo, intensidade, descricao } = validation.normalized;
      const result = await pool.query(
        'UPDATE registros_humor SET tipo=$1,intensidade=$2,descricao=$3 WHERE id=$4 AND usuario_id=$5 RETURNING id,tipo,intensidade,descricao,criado_em',
        [tipo, intensidade, descricao || null, req.params.id, req.auth.userId],
      );
      if (!result.rowCount) return res.status(404).json({ message: 'Registro não encontrado.' });
      res.json({ registro: result.rows[0], message: 'Registro atualizado.' });
    }),
  );
  app.delete(
    '/api/mood/:id',
    auth,
    wrap(async (req, res) => {
      if (!validUuid(req.params.id)) return res.status(400).json({ message: 'Registro inválido.' });
      const result = await pool.query(
        'DELETE FROM registros_humor WHERE id=$1 AND usuario_id=$2',
        [req.params.id, req.auth.userId],
      );
      if (!result.rowCount) return res.status(404).json({ message: 'Registro não encontrado.' });
      res.status(204).end();
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
      const clientId = req.body?.clientId;
      if (clientId !== undefined && !validUuid(clientId)) {
        return res.status(400).json({ message: 'Identificador offline inválido.' });
      }
      const result = clientId
        ? await pool.query(
            'INSERT INTO registros_diario (id,usuario_id,prompt,resposta) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING RETURNING id,prompt,resposta,criado_em',
            [clientId, req.auth.userId, usePrompt ? prompt : null, resposta],
          )
        : await pool.query(
            'INSERT INTO registros_diario (usuario_id,prompt,resposta) VALUES ($1,$2,$3) RETURNING id,prompt,resposta,criado_em',
            [req.auth.userId, usePrompt ? prompt : null, resposta],
          );
      if (!result.rowCount && clientId) {
        const existing = await pool.query(
          'SELECT id,prompt,resposta,criado_em FROM registros_diario WHERE id=$1 AND usuario_id=$2',
          [clientId, req.auth.userId],
        );
        if (!existing.rowCount) return res.status(409).json({ message: 'Identificador offline já utilizado.' });
        return res.json({ registro: existing.rows[0], message: 'Registro já sincronizado.' });
      }
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
    '/api/data/export',
    auth,
    wrap(async (req, res) => {
      const [moods, diary] = await Promise.all([
        pool.query(
          'SELECT COALESCE(origem_id,id) AS id,tipo,intensidade,descricao,criado_em FROM registros_humor WHERE usuario_id=$1 ORDER BY criado_em,id',
          [req.auth.userId],
        ),
        pool.query(
          'SELECT COALESCE(origem_id,id) AS id,prompt,resposta,criado_em FROM registros_diario WHERE usuario_id=$1 ORDER BY criado_em,id',
          [req.auth.userId],
        ),
      ]);
      res.json({
        format: 'mente-clara-backup-v1',
        exportedAt: new Date().toISOString(),
        registrosHumor: moods.rows,
        registrosDiario: diary.rows,
      });
    }),
  );
  app.post(
    '/api/data/restore',
    auth,
    wrap(async (req, res) => {
      const { registrosHumor = [], registrosDiario = [] } = req.body || {};
      if (
        req.body?.format !== 'mente-clara-backup-v1' ||
        !Array.isArray(registrosHumor) ||
        !Array.isArray(registrosDiario) ||
        registrosHumor.length + registrosDiario.length > 1000
      ) {
        return res.status(400).json({ message: 'Arquivo de backup inválido ou muito grande.' });
      }
      const normalizedMoods = [];
      for (const entry of registrosHumor) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return res.status(400).json({ message: 'Registro de humor inválido.' });
        }
        if (entry.id !== undefined && !validUuid(entry.id)) {
          return res.status(400).json({ message: 'Identificador de registro de humor inválido.' });
        }
        const validation = validateMoodEntry(entry);
        if (!validation.valid) return badInput(res, validation);
        if (entry.criado_em && typeof entry.criado_em !== 'string') {
          return res.status(400).json({ message: 'Data de registro de humor inválida.' });
        }
        const date = entry.criado_em ? new Date(entry.criado_em) : null;
        if (date && Number.isNaN(date.getTime())) {
          return res.status(400).json({ message: 'Data de registro de humor inválida.' });
        }
        normalizedMoods.push({ ...validation.normalized, origem_id: entry.id || null, criado_em: date?.toISOString() || null });
      }
      const normalizedDiary = [];
      for (const entry of registrosDiario) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return res.status(400).json({ message: 'Registro do diário inválido.' });
        }
        if (entry.id !== undefined && !validUuid(entry.id)) {
          return res.status(400).json({ message: 'Identificador de registro do diário inválido.' });
        }
        const validation = validateDiaryEntry({
          prompt: entry.prompt || '',
          usePrompt: Boolean(entry.prompt),
          resposta: entry.resposta,
        });
        if (!validation.valid) return badInput(res, validation);
        if (entry.criado_em && typeof entry.criado_em !== 'string') {
          return res.status(400).json({ message: 'Data de registro do diário inválida.' });
        }
        const date = entry.criado_em ? new Date(entry.criado_em) : null;
        if (date && Number.isNaN(date.getTime())) {
          return res.status(400).json({ message: 'Data de registro do diário inválida.' });
        }
        normalizedDiary.push({ ...validation.normalized, origem_id: entry.id || null, criado_em: date?.toISOString() || null });
      }

      const db = await pool.connect();
      let imported = 0;
      try {
        await db.query('BEGIN');
        for (const entry of normalizedMoods) {
          const result = await db.query(
            'INSERT INTO registros_humor (usuario_id,origem_id,tipo,intensidade,descricao,criado_em) SELECT $1,$2,$3,$4,$5,COALESCE($6::timestamptz,now()) WHERE $2::uuid IS NULL OR NOT EXISTS (SELECT 1 FROM registros_humor WHERE usuario_id=$1 AND (id=$2 OR origem_id=$2)) ON CONFLICT (usuario_id,origem_id) WHERE origem_id IS NOT NULL DO NOTHING',
            [req.auth.userId, entry.origem_id, entry.tipo, entry.intensidade, entry.descricao || null, entry.criado_em],
          );
          imported += result.rowCount;
        }
        for (const entry of normalizedDiary) {
          const result = await db.query(
            'INSERT INTO registros_diario (usuario_id,origem_id,prompt,resposta,criado_em) SELECT $1,$2,$3,$4,COALESCE($5::timestamptz,now()) WHERE $2::uuid IS NULL OR NOT EXISTS (SELECT 1 FROM registros_diario WHERE usuario_id=$1 AND (id=$2 OR origem_id=$2)) ON CONFLICT (usuario_id,origem_id) WHERE origem_id IS NOT NULL DO NOTHING',
            [req.auth.userId, entry.origem_id, entry.usePrompt ? entry.prompt : null, entry.resposta, entry.criado_em],
          );
          imported += result.rowCount;
        }
        await db.query('COMMIT');
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      } finally {
        db.release();
      }
      res.status(201).json({
        message: 'Backup restaurado. Os dados foram adicionados à conta atual.',
        registrosImportados: imported,
        registrosIgnorados: normalizedMoods.length + normalizedDiary.length - imported,
      });
    }),
  );
  app.put(
    '/api/diary/:id',
    auth,
    wrap(async (req, res) => {
      if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(req.params.id)) {
        return res.status(400).json({ message: 'Registro inválido.' });
      }
      const validation = validateDiaryEntry(req.body);
      if (!validation.valid) {
        return badInput(res, validation);
      }
      const { usePrompt, prompt, resposta } = validation.normalized;
      const result = await pool.query(
        'UPDATE registros_diario SET prompt=$1,resposta=$2 WHERE id=$3 AND usuario_id=$4 RETURNING id,prompt,resposta,criado_em',
        [usePrompt ? prompt : null, resposta, req.params.id, req.auth.userId],
      );
      if (!result.rowCount) {
        return res.status(404).json({ message: 'Registro não encontrado.' });
      }
      res.json({ registro: result.rows[0] });
    }),
  );
  app.delete(
    '/api/diary/:id',
    auth,
    wrap(async (req, res) => {
      if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(req.params.id)) {
        return res.status(400).json({ message: 'Registro inválido.' });
      }
      const result = await pool.query(
        'DELETE FROM registros_diario WHERE id=$1 AND usuario_id=$2',
        [req.params.id, req.auth.userId],
      );
      if (!result.rowCount) {
        return res.status(404).json({ message: 'Registro não encontrado.' });
      }
      res.status(204).end();
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
