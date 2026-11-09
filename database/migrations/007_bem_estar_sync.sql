ALTER TABLE public.registros_humor ADD COLUMN IF NOT EXISTS origem_id uuid;
ALTER TABLE public.registros_diario ADD COLUMN IF NOT EXISTS origem_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS registros_humor_usuario_origem_idx
    ON public.registros_humor (usuario_id, origem_id)
    WHERE origem_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS registros_diario_usuario_origem_idx
    ON public.registros_diario (usuario_id, origem_id)
    WHERE origem_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.estado_bem_estar (
    usuario_id uuid PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
    estado jsonb NOT NULL CHECK (jsonb_typeof(estado) = 'object'),
    atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.estado_bem_estar TO mente_clara_app;
INSERT INTO public.schema_migrations(versao)
VALUES ('007_bem_estar_sync') ON CONFLICT (versao) DO NOTHING;
