CREATE TABLE IF NOT EXISTS public.registros_humor (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    tipo varchar(30) NOT NULL CHECK (tipo IN ('triste','ansioso','feliz','calmo','motivado')),
    intensidade smallint NOT NULL CHECK (intensidade BETWEEN 1 AND 5),
    descricao text CHECK (char_length(descricao) <= 280),
    criado_em timestamptz NOT NULL DEFAULT now()
);
-- Suporta uma tabela vazia criada pelo SQL anterior, sem atribuir dados a outra pessoa.
ALTER TABLE public.registros_humor ADD COLUMN IF NOT EXISTS usuario_id uuid REFERENCES public.usuarios(id) ON DELETE CASCADE;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.registros_humor WHERE usuario_id IS NULL) THEN
        RAISE EXCEPTION 'Existem registros antigos sem usuario. Associe-os ao proprietario antes de continuar; nenhum dado foi apagado.';
    END IF;
END;
$$;
ALTER TABLE public.registros_humor ALTER COLUMN usuario_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS registros_humor_usuario_data_idx ON public.registros_humor (usuario_id,criado_em DESC);
CREATE TABLE public.sessoes (
    id uuid PRIMARY KEY,
    usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    criado_em timestamptz NOT NULL DEFAULT now(),
    expira_em timestamptz NOT NULL
);
CREATE INDEX sessoes_usuario_idx ON public.sessoes(usuario_id);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.registros_humor TO mente_clara_app;
GRANT SELECT,INSERT,DELETE ON public.sessoes TO mente_clara_app;
INSERT INTO public.schema_migrations(versao) VALUES ('002_humor_sessoes');
