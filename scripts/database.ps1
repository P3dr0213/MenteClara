param(
    [ValidateSet('setup','start','stop','status','test','console')]
    [string]$Action = 'status'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$localRoot = Join-Path $projectRoot '.local'
$bin = Join-Path $localRoot 'postgresql-18.6\pgsql\bin'
$data = Join-Path $localRoot 'postgres-data'
$credentialsPath = Join-Path $localRoot 'postgres-credentials.json'
$pgctl = Join-Path $bin 'pg_ctl.exe'
$psql = Join-Path $bin 'psql.exe'
if (-not (Test-Path $pgctl)) { throw 'Binarios PostgreSQL ausentes. Consulte database/README.md.' }
function New-Password {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}
function Start-Database {
    & $pgctl -D $data status *> $null
    if ($LASTEXITCODE -eq 0) { Write-Output 'PostgreSQL ja esta iniciado.'; return }
    $log = Join-Path $localRoot 'postgres.log'
    $process = Start-Process -FilePath $pgctl -ArgumentList @('-D', ('"' + $data + '"'), '-l', ('"' + $log + '"'), '-w', 'start') -WindowStyle Hidden -PassThru
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw "Falha ao iniciar PostgreSQL. Consulte $log" }
}
function Invoke-Sql([string]$Sql, [string]$Database = 'mente_clara') {
    $result = $Sql | & $psql -X -w -h 127.0.0.1 -p 5432 -U postgres -d $Database -v ON_ERROR_STOP=1 -At
    if ($LASTEXITCODE -ne 0) { throw 'Comando SQL falhou.' }
    return $result
}
if ($Action -eq 'status') { & $pgctl -D $data status; exit $LASTEXITCODE }
if ($Action -eq 'stop') { & $pgctl -D $data -m fast -w stop; exit $LASTEXITCODE }
if ($Action -eq 'start') { Start-Database; exit 0 }
if (-not (Test-Path $credentialsPath)) {
    if ($Action -ne 'setup' -or (Test-Path (Join-Path $data 'PG_VERSION'))) { throw 'Credenciais locais ausentes; nao sera alterado um banco existente.' }
    New-Item -ItemType Directory -Path $localRoot -Force | Out-Null
    @{ adminPassword = New-Password; appPassword = New-Password } | ConvertTo-Json | Set-Content $credentialsPath -Encoding ascii
}
$credentials = Get-Content $credentialsPath -Raw | ConvertFrom-Json
$oldPassword = $env:PGPASSWORD
$oldAppPassword = $env:MENTE_CLARA_APP_PASSWORD
try {
    if ($Action -eq 'setup') {
        if (-not (Test-Path (Join-Path $data 'PG_VERSION'))) {
            $passwordFile = Join-Path $localRoot 'initdb-password.tmp'
            try {
                Set-Content $passwordFile $credentials.adminPassword -Encoding ascii
                & (Join-Path $bin 'initdb.exe') -D $data -U postgres --encoding=UTF8 --locale=C --auth=scram-sha-256 "--pwfile=$passwordFile"
                if ($LASTEXITCODE -ne 0) { throw 'initdb falhou.' }
            } finally {
                if (Test-Path -LiteralPath $passwordFile) { Remove-Item -LiteralPath $passwordFile }
            }
            Add-Content (Join-Path $data 'postgresql.conf') "`nlisten_addresses = '127.0.0.1'`nport = 5432`npassword_encryption = 'scram-sha-256'`n"
        }
        Start-Database
        $env:PGPASSWORD = $credentials.adminPassword
        $env:MENTE_CLARA_APP_PASSWORD = $credentials.appPassword
        Invoke-Sql @'
\getenv app_password MENTE_CLARA_APP_PASSWORD
SELECT format('CREATE ROLE mente_clara_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mente_clara_app') \gexec
SELECT 'CREATE DATABASE mente_clara ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'mente_clara') \gexec
'@ 'postgres'
        Invoke-Sql @'
REVOKE ALL ON DATABASE mente_clara FROM PUBLIC;
GRANT CONNECT ON DATABASE mente_clara TO mente_clara_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO mente_clara_app;
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    versao text PRIMARY KEY,
    aplicada_em timestamptz NOT NULL DEFAULT now()
);
'@
        $migrations = Get-ChildItem (Join-Path $projectRoot 'database/migrations') -Filter '*.sql' | Sort-Object Name
        foreach ($migration in $migrations) {
            $version = $migration.BaseName
            if ($version -notmatch '^[0-9]{3}_[a-z_]+$') { throw 'Nome de migration invalido.' }
            $applied = Invoke-Sql "SELECT count(*) FROM public.schema_migrations WHERE versao = '$version';"
            if ($applied -eq '0') {
                & $psql -X -w -h 127.0.0.1 -p 5432 -U postgres -d mente_clara -v ON_ERROR_STOP=1 --single-transaction -f $migration.FullName
                if ($LASTEXITCODE -ne 0) { throw "Migration $version falhou." }
            }
        }
        $envFile = Join-Path $projectRoot 'backend/.env'
        if (-not (Test-Path $envFile)) {
            Set-Content $envFile ("DATABASE_URL=postgresql://mente_clara_app:" + $credentials.appPassword + "@127.0.0.1:5432/mente_clara") -Encoding ascii
        }
        $envContent = Get-Content $envFile -Raw
        if ($envContent -notmatch '(?m)^JWT_SECRET=.{32,}$') {
            $envContent = $envContent -replace '(?m)^JWT_SECRET=.*\r?\n?', ''
            $secret = New-Password
            Set-Content $envFile ($envContent.TrimEnd() + [Environment]::NewLine + 'JWT_SECRET=' + $secret) -Encoding ascii
        }
        Write-Output 'Banco mente_clara atualizado. Credenciais em backend/.env.'
    }
    if ($Action -eq 'test' -or $Action -eq 'console') {
        Start-Database
        $env:PGPASSWORD = $credentials.appPassword
        if ($Action -eq 'test') {
            & $psql -X -w -h 127.0.0.1 -p 5432 -U mente_clara_app -d mente_clara -v ON_ERROR_STOP=1 -f (Join-Path $projectRoot 'database/tests/usuarios.sql')
        } else {
            & $psql -X -w -h 127.0.0.1 -p 5432 -U mente_clara_app -d mente_clara
        }
        if ($LASTEXITCODE -ne 0) { throw 'Comando PostgreSQL falhou.' }
    }
} finally {
    $env:PGPASSWORD = $oldPassword
    $env:MENTE_CLARA_APP_PASSWORD = $oldAppPassword
}
