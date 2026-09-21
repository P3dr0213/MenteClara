-- Executado como usuario da API. Nenhum dado de teste fica persistido.
BEGIN;
DO $$
DECLARE
    usuario_id uuid;
    data_atualizada timestamptz;
BEGIN
    INSERT INTO public.usuarios (nome, email, senha_hash, atualizado_em)
    VALUES ('Usuario Teste', 'teste-db@example.invalid', 'hash-ficticio-apenas-teste', '2000-01-01')
    RETURNING id INTO usuario_id;
    IF usuario_id IS NULL THEN RAISE EXCEPTION 'UUID nao foi gerado'; END IF;
    BEGIN
        INSERT INTO public.usuarios (nome, email, senha_hash)
        VALUES ('Duplicado', 'TESTE-DB@example.invalid', 'hash-ficticio');
        RAISE EXCEPTION 'Email duplicado foi aceito';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO public.usuarios (nome, email, senha_hash)
        VALUES (' ', 'nome-invalido@example.invalid', 'hash-ficticio');
        RAISE EXCEPTION 'Nome vazio foi aceito';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO public.usuarios (nome, email, senha_hash)
        VALUES ('Teste', 'email-invalido', 'hash-ficticio');
        RAISE EXCEPTION 'Email invalido foi aceito';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO public.usuarios (nome, email, senha_hash)
        VALUES ('Teste', 'hash-vazio@example.invalid', '');
        RAISE EXCEPTION 'Hash vazio foi aceito';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    UPDATE public.usuarios SET nome = 'Nome Atualizado' WHERE id = usuario_id;
    SELECT atualizado_em INTO data_atualizada FROM public.usuarios WHERE id = usuario_id;
    IF data_atualizada <> now() THEN RAISE EXCEPTION 'Timestamp nao atualizado'; END IF;
    IF has_database_privilege(current_user, current_database(), 'CREATE')
       OR has_schema_privilege(current_user, 'public', 'CREATE')
       OR (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
    THEN RAISE EXCEPTION 'Usuario da API possui privilegios excessivos'; END IF;
    DELETE FROM public.usuarios WHERE id = usuario_id;
    IF EXISTS (SELECT 1 FROM public.usuarios WHERE id = usuario_id)
    THEN RAISE EXCEPTION 'Usuario nao removido'; END IF;
END;
$$;
ROLLBACK;
SELECT 'PASS: CRUD, UUID, email unico, validacoes, timestamp e permissoes' AS resultado;
