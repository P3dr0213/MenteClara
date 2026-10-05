const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const localRoot = path.join(projectRoot, '.local');
const credentialsPath = path.join(localRoot, 'postgres-credentials.json');
const backendEnvPath = path.join(projectRoot, 'backend', '.env');
const migrationsDir = path.join(projectRoot, 'database', 'migrations');
const testsFile = path.join(projectRoot, 'database', 'tests', 'usuarios.sql');

const action = process.argv[2] || 'status';

function runSync(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: projectRoot, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function invokeSql(sql, db = 'mente_clara', user = 'postgres', password = '') {
  const env = { ...process.env };
  if (password) env.PGPASSWORD = password;

  const result = spawnSync(
    'docker',
    ['exec', '-i', '-e', `PGPASSWORD=${password}`, 'mente-clara-db', 'psql', '-U', user, '-d', db, '-v', 'ON_ERROR_STOP=1', '-At'],
    { input: sql, encoding: 'utf8', cwd: projectRoot, env }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'Comando SQL falhou');
  }
  return result.stdout.trim();
}

function generateSecureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function waitForDatabaseReady(maxAttempts = 30) {
  for (let i = 1; i <= maxAttempts; i++) {
    const res = spawnSync(
      'docker',
      ['exec', 'mente-clara-db', 'pg_isready', '-U', 'postgres', '-d', 'mente_clara'],
      { stdio: 'ignore' }
    );
    if (res.status === 0) return true;
    spawnSync('sleep', ['1']);
  }
  throw new Error('PostgreSQL nao ficou pronto a tempo no container.');
}

function getCredentials() {
  if (!fs.existsSync(localRoot)) {
    fs.mkdirSync(localRoot, { recursive: true });
  }

  let credentials;
  if (fs.existsSync(credentialsPath)) {
    try {
      credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    } catch {
      credentials = null;
    }
  }

  if (!credentials) {
    credentials = {
      adminUser: 'postgres',
      adminPassword: generateSecureToken(32),
      appUser: 'mente_clara_app',
      appPassword: generateSecureToken(32),
      port: 5433,
      database: 'mente_clara',
    };
  }

  if (!credentials.adminPassword || credentials.adminPassword === 'menteclara_admin_password') {
    credentials.adminPassword = generateSecureToken(32);
  }
  fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2), { mode: 0o600 });
  fs.chmodSync(credentialsPath, 0o600);
  const adminPasswordPath = path.join(localRoot, 'postgres-admin-password');
  fs.writeFileSync(adminPasswordPath, credentials.adminPassword, { mode: 0o600 });
  fs.chmodSync(adminPasswordPath, 0o600);

  return credentials;
}

function startDatabase() {
  const credentials = getCredentials();
  console.log('[db:setup] Iniciando container PostgreSQL...');
  runSync('docker', ['compose', 'up', '-d', 'db']);

  console.log('[db:setup] Aguardando banco ficar pronto...');
  waitForDatabaseReady();

  // Existing volumes do not apply POSTGRES_PASSWORD_FILE again.
  const password = credentials.adminPassword.replace(/'/g, "''");
  invokeSql(`ALTER ROLE postgres WITH PASSWORD '${password}';`);
  return credentials;
}

async function setup() {
  const credentials = startDatabase();

  console.log('[db:setup] Configurando papel e permissoes...');
  invokeSql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${credentials.appUser}') THEN
        CREATE ROLE ${credentials.appUser} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${credentials.appPassword}';
      ELSE
        ALTER ROLE ${credentials.appUser} WITH PASSWORD '${credentials.appPassword}';
      END IF;
    END
    $$;
  `, 'mente_clara', 'postgres');

  invokeSql(`
    REVOKE ALL ON DATABASE mente_clara FROM PUBLIC;
    GRANT CONNECT ON DATABASE mente_clara TO ${credentials.appUser};
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    GRANT USAGE ON SCHEMA public TO ${credentials.appUser};
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      versao text PRIMARY KEY,
      aplicada_em timestamptz NOT NULL DEFAULT now()
    );
  `, 'mente_clara', 'postgres');

  console.log('[db:setup] Verificando migrations...');
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const version = path.basename(file, '.sql');
    const applied = invokeSql(
      `SELECT count(*) FROM public.schema_migrations WHERE versao = '${version}';`,
      'mente_clara',
      'postgres'
    );

    if (applied === '0') {
      console.log(`[db:setup] Aplicando migration: ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      invokeSql(sql, 'mente_clara', 'postgres');
    } else {
      console.log(`[db:setup] Migration ja aplicada: ${file}`);
    }
  }

  // Gera/atualiza backend/.env
  let envContent = '';
  if (fs.existsSync(backendEnvPath)) {
    envContent = fs.readFileSync(backendEnvPath, 'utf8');
  }

  const databaseUrl = `postgresql://${credentials.appUser}:${credentials.appPassword}@127.0.0.1:${credentials.port || 5433}/${credentials.database}`;
  if (/^DATABASE_URL=.*$/m.test(envContent)) {
    envContent = envContent.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${databaseUrl}`);
  } else {
    envContent += (envContent ? '\n' : '') + `DATABASE_URL=${databaseUrl}\n`;
  }

  if (!/^JWT_SECRET=.{32,}$/m.test(envContent)) {
    const secret = generateSecureToken(48);
    envContent = envContent.replace(/^JWT_SECRET=.*$/m, '');
    envContent += `JWT_SECRET=${secret}\n`;
  }

  if (!/^HOST=/m.test(envContent)) {
    envContent += 'HOST=127.0.0.1\n';
  }
  if (!/^PORT=/m.test(envContent)) {
    envContent += 'PORT=3001\n';
  }

  fs.writeFileSync(backendEnvPath, envContent.trim() + '\n', 'utf8');
  console.log('[db:setup] Banco mente_clara atualizado com sucesso!');
  console.log(`[db:setup] Servidor PostgreSQL ativo em 127.0.0.1:${credentials.port || 5433}.`);
  console.log('[db:setup] Credenciais configuradas em backend/.env.');
}

function testDatabase() {
  const credentials = getCredentials();
  console.log('[db:test] Executando testes de esquema e permissoes...');
  const testSql = fs.readFileSync(testsFile, 'utf8');
  const result = invokeSql(testSql, 'mente_clara', credentials.appUser, credentials.appPassword);
  console.log(result || 'PASS: CRUD, UUID, email unico, validacoes, timestamp e permissoes');
}

function main() {
  switch (action) {
    case 'start':
      startDatabase();
      console.log('PostgreSQL iniciado via Docker na porta 5433.');
      break;
    case 'stop':
      runSync('docker', ['compose', 'stop', 'db']);
      console.log('PostgreSQL pausado com sucesso.');
      break;
    case 'status':
      runSync('docker', ['compose', 'ps', 'db']);
      break;
    case 'setup':
      setup().catch(err => {
        console.error('[db error]', err.message);
        process.exit(1);
      });
      break;
    case 'test':
      testDatabase();
      break;
    case 'console': {
      const credentials = getCredentials();
      spawn(
        'docker',
        ['exec', '-it', '-e', `PGPASSWORD=${credentials.appPassword}`, 'mente-clara-db', 'psql', '-U', credentials.appUser, '-d', credentials.database],
        { stdio: 'inherit', cwd: projectRoot }
      );
      break;
    }
    default:
      console.error(`Acao desconhecida: ${action}. Use: setup, start, stop, status, test, console.`);
      process.exit(1);
  }
}

main();
