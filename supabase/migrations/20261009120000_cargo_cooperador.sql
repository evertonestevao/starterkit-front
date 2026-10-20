-- Cargo sugerido "Cooperador(a)".
--
-- Os cargos que a igreja usava no sistema antigo eram: cooperador, diácono,
-- evangelista, missionária/missionário, pastor e presbítero. Todos já vinham
-- como sugestão da plataforma, menos o cooperador. ("Membros", que aparecia
-- naquela lista, não é cargo aqui: ser membro é a situação da pessoa no rol.)
--
-- Entra logo depois do diácono na ordem, com os mesmos acessos de partida do
-- obreiro e do diácono (painel, presença nos cultos e pedidos de visita). Como
-- todo cargo sugerido, cada rede ajusta os acessos em Configurações → Acessos.

insert into public.cargos (slug, nome, descricao, unico, ordem, acessos_padrao) values
  ('cooperador', 'Cooperador(a)', 'Auxilia nos cultos e no cuidado com os membros.', false, 5,
   array['dashboard', 'acompanhamento', 'relationships'])
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
