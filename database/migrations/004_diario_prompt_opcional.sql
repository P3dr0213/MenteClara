ALTER TABLE public.registros_diario ALTER COLUMN prompt DROP NOT NULL;
ALTER TABLE public.registros_diario DROP CONSTRAINT IF EXISTS registros_diario_prompt_not_null;
ALTER TABLE public.registros_diario DROP CONSTRAINT IF EXISTS registros_diario_prompt_check;
ALTER TABLE public.registros_diario
    ADD CONSTRAINT registros_diario_prompt_check
    CHECK (prompt IS NULL OR char_length(btrim(prompt)) BETWEEN 6 AND 255);
INSERT INTO public.schema_migrations(versao) VALUES ('004_diario_prompt_opcional') ON CONFLICT (versao) DO NOTHING;
