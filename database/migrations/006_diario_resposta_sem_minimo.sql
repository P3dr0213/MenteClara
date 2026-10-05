ALTER TABLE public.registros_diario DROP CONSTRAINT IF EXISTS registros_diario_resposta_check;
ALTER TABLE public.registros_diario
    ADD CONSTRAINT registros_diario_resposta_check
    CHECK (char_length(btrim(resposta)) BETWEEN 1 AND 5000);
INSERT INTO public.schema_migrations(versao) VALUES ('006_diario_resposta_sem_minimo') ON CONFLICT (versao) DO NOTHING;
