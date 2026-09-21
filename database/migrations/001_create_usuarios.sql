CREATE TABLE public.usuarios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome varchar(120) NOT NULL,
    email varchar(254) NOT NULL,
    senha_hash text NOT NULL,
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT usuarios_nome_valido CHECK (char_length(btrim(nome)) BETWEEN 2 AND 120 AND nome = btrim(nome)),
    CONSTRAINT usuarios_email_valido CHECK (email = btrim(email) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
    CONSTRAINT usuarios_senha_hash_preenchido CHECK (char_length(btrim(senha_hash)) > 0)
);
CREATE UNIQUE INDEX usuarios_email_unico ON public.usuarios (lower(email));
CREATE FUNCTION public.atualizar_timestamp_usuario() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.atualizado_em = now();
    RETURN NEW;
END;
$$;
CREATE TRIGGER usuarios_atualizado_em
BEFORE UPDATE ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION public.atualizar_timestamp_usuario();
COMMENT ON COLUMN public.usuarios.senha_hash IS 'Somente hash produzido pela API; nunca armazenar senha em texto puro.';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usuarios TO mente_clara_app;
INSERT INTO public.schema_migrations (versao) VALUES ('001_create_usuarios');
