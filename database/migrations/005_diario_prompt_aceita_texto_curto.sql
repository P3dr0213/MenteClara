ALTER TABLE public.registros_diario DROP CONSTRAINT IF EXISTS registros_diario_prompt_check;
ALTER TABLE public.registros_diario
    ADD CONSTRAINT registros_diario_prompt_check
    CHECK (prompt IS NULL OR char_length(btrim(prompt)) BETWEEN 1 AND 255);
INSERT INTO public.schema_migrations(versao) VALUES ('005_diario_prompt_aceita_texto_curto') ON CONFLICT (versao) DO NOTHING;
