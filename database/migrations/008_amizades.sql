ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS codigo_amizade uuid DEFAULT gen_random_uuid();

UPDATE public.usuarios
SET codigo_amizade = gen_random_uuid()
WHERE codigo_amizade IS NULL;

ALTER TABLE public.usuarios
    ALTER COLUMN codigo_amizade SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_codigo_amizade_unico
    ON public.usuarios (codigo_amizade);

CREATE TABLE IF NOT EXISTS public.amizades (
    usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    amigo_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    criado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT amizades_sem_autoamizade CHECK (usuario_id <> amigo_id),
    PRIMARY KEY (usuario_id, amigo_id)
);

CREATE INDEX IF NOT EXISTS amizades_amigo_idx
    ON public.amizades (amigo_id, usuario_id);

GRANT SELECT, INSERT, DELETE ON public.amizades TO mente_clara_app;
INSERT INTO public.schema_migrations (versao)
VALUES ('008_amizades') ON CONFLICT (versao) DO NOTHING;
