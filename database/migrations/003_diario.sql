CREATE TABLE IF NOT EXISTS public.registros_diario (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    prompt varchar(255) NULL CHECK (prompt IS NULL OR char_length(btrim(prompt)) BETWEEN 6 AND 255),
    resposta text NOT NULL CHECK (char_length(btrim(resposta)) BETWEEN 10 AND 5000),
    criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS registros_diario_usuario_data_idx ON public.registros_diario (usuario_id, criado_em DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registros_diario TO mente_clara_app;
INSERT INTO public.schema_migrations(versao) VALUES ('003_diario') ON CONFLICT (versao) DO NOTHING;
