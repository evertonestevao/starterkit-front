-- Três temas novos para a página pública da igreja. A paleta de cada um vive
-- em src/lib/pageAppearance.ts; aqui só nasce a linha em `templates`, que é
-- o que a igreja referencia (churches.template_id). Sem ela o tema não pode
-- ser salvo. `templates` já é leitura pública e sem escrita para o cliente.
insert into public.templates (name, slug, description)
values
  ('Meia-noite', 'meia-noite', 'Azul profundo com destaque em azul-céu.'),
  ('Lavanda', 'lavanda', 'Claro e suave, com lilás e roxo.'),
  ('Terra', 'terra', 'Tons de areia e marrom com destaque terracota.')
on conflict (slug) do nothing;
