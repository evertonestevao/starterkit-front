-- ---------------------------------------------------------------------------
-- Termos por público: igreja e patrocinador
-- ---------------------------------------------------------------------------
-- Até aqui existia UM documento vigente para todo mundo, e um pastor aceitava
-- o mesmo texto que um patrocinador. São contratos diferentes: a igreja não
-- paga nada e é controladora dos dados da comunidade; o patrocinador paga
-- mensalmente, é consumidor e tem direito de arrependimento. Misturar os dois
-- num texto só obrigaria cada leitor a descobrir quais cláusulas são dele.
--
-- O conteúdo abaixo é gerado a partir de supabase/terms/*.md — edite os .md e
-- publique uma versão nova, não altere o texto direto no banco.

alter table public.terms_versions
  add column if not exists audience text not null default 'igreja'
    check (audience in ('igreja', 'patrocinador'));

comment on column public.terms_versions.audience is
  'Para quem este documento vale. Cada público tem sua própria numeração.';

-- A numeração passa a ser por público (igreja v2 e patrocinador v1 coexistem).
alter table public.terms_versions drop constraint if exists terms_versions_version_key;
create unique index if not exists terms_versions_audience_version
  on public.terms_versions (audience, version);

-- E a vigência também: uma por público, não uma global.
drop index if exists terms_versions_one_current;
create unique index if not exists terms_versions_one_current_per_audience
  on public.terms_versions (audience) where is_current;

-- A v1 antiga (texto de exemplo) fica no histórico: há aceites apontando para
-- ela, e apagar destruiria a prova de quem aceitou o quê.
update public.terms_versions set is_current = false where is_current;

insert into public.terms_versions (audience, version, content, is_current)
values ('igreja', 2, $doc$# Termos de Uso — Igrejas

**Versão 2 — vigente desde 18 de setembro de 2026**

Estes Termos regulam o uso da plataforma Conecta Igreja pelas igrejas e por
quem as administra. Ao criar uma conta e marcar o aceite, a Igreja concorda
com tudo o que está escrito aqui.

Se você é patrocinador — pessoa ou empresa que apoia financeiramente a
plataforma — os termos que valem para você são outros, os
[Termos de Uso para Patrocinadores](/terms/patrocinador).

---

## 1. Quem somos

A Conecta Igreja é operada por [RAZÃO SOCIAL], inscrita no CNPJ sob o nº
[CNPJ], com sede em [ENDEREÇO COMPLETO], doravante "Plataforma".

Contato: [EMAIL DE CONTATO]
Encarregado de dados (LGPD): [EMAIL DO ENCARREGADO]

## 2. O que a Plataforma faz

A Plataforma oferece à Igreja uma página pública na internet e um painel de
administração, com recursos para:

- publicar informações da igreja (endereço, horários de culto, redes sociais);
- receber pedidos de oração enviados por quem visita a página;
- divulgar eventos e receber inscrições;
- registrar visitantes;
- exibir os patrocinadores que sustentam a Plataforma;
- opcionalmente, usar um domínio próprio no lugar do endereço padrão.

A Plataforma é uma ferramenta. Ela não participa da vida religiosa, da
administração, da doutrina nem das decisões da Igreja.

## 3. Cadastro e responsabilidade pela conta

3.1. Quem cria a conta declara ter autorização da Igreja para representá-la.

3.2. As informações fornecidas no cadastro devem ser verdadeiras e mantidas
atualizadas.

3.3. A conta tem três papéis: **proprietário**, **administrador** e **membro**,
com permissões diferentes. A Igreja é responsável por quem convida e pelo que
cada pessoa faz com o acesso que recebeu.

3.4. As credenciais são pessoais e intransferíveis. A Igreja deve avisar a
Plataforma imediatamente se suspeitar de acesso indevido.

## 4. Preço

4.1. **O uso da Plataforma pela Igreja é gratuito.** A Igreja não paga
mensalidade, taxa de adesão nem comissão sobre o que quer que seja.

4.2. A Plataforma se sustenta com o patrocínio de pessoas e empresas, que
pagam diretamente a ela. **Esse dinheiro não é repassado à Igreja**, não é
doação à Igreja e não gera qualquer crédito ou direito da Igreja sobre ele.

4.3. Se no futuro passarem a existir planos pagos com recursos adicionais, a
contratação será opcional e comunicada com antecedência mínima de 30 dias. O
conjunto de recursos descrito na cláusula 2 permanece gratuito para quem já
usava a Plataforma quando estes Termos entraram em vigor.

4.4. O serviço de **configuração assistida de domínio próprio** é a única
exceção: é opcional, cobrado uma única vez, e só existe se a Igreja pedir.

## 5. Conteúdo publicado pela Igreja

5.1. A Igreja é a única responsável por tudo o que publica: textos, imagens,
horários, endereços, eventos e links.

5.2. A Igreja declara ter os direitos necessários sobre o que publica —
inclusive autorização de uso de imagem das pessoas que aparecem em fotos.

5.3. Não é permitido publicar conteúdo que:

- viole a lei ou direitos de terceiros;
- incite violência, ódio ou discriminação de qualquer natureza;
- seja enganoso quanto a doações, arrecadações ou promessas de cura,
  prosperidade ou milagre condicionados a pagamento;
- exponha dados pessoais de terceiros sem base legal.

5.4. A Plataforma pode remover conteúdo que viole a cláusula 5.3 e, em caso
grave ou reincidente, suspender a página pública. Sempre que possível, a
Igreja será avisada antes; quando não for possível, será avisada logo depois,
com a justificativa.

## 6. Dados das pessoas da comunidade

Esta é a cláusula mais importante deste documento, e vale a pena lê-la com
calma.

6.1. Quando alguém envia um pedido de oração, se inscreve num evento ou se
registra como visitante, essa pessoa está entregando **dados pessoais**, e às
vezes dados sensíveis — um pedido de oração pode falar de saúde, de família,
de sofrimento.

6.2. Para a Lei Geral de Proteção de Dados (Lei 13.709/2018), nessa relação:

- a **Igreja é a controladora** desses dados: é ela que decide para que eles
  serão usados e quem, dentro dela, pode vê-los;
- a **Plataforma é a operadora**: apenas armazena e processa os dados
  seguindo as instruções da Igreja.

6.3. Cabe à Igreja:

- usar os dados apenas para a finalidade pela qual foram entregues (responder
  ao pedido, organizar o evento, acolher o visitante);
- não vender, alugar nem compartilhar esses dados com terceiros;
- restringir o acesso a quem realmente precisa;
- atender aos pedidos dos titulares (acesso, correção, exclusão), com o apoio
  da Plataforma quando for necessário mexer no sistema.

6.4. Cabe à Plataforma:

- manter os dados isolados entre igrejas diferentes — nenhuma igreja acessa
  dados de outra;
- aplicar medidas técnicas de segurança compatíveis com a natureza dos dados;
- avisar a Igreja sem demora em caso de incidente de segurança que possa
  afetar esses dados;
- não usar os dados da comunidade da Igreja para finalidade própria.

6.5. A Plataforma não repassa aos patrocinadores nenhum dado da comunidade.
Patrocinador não recebe lista, contato, nome nem estatística individual de
quem interage com a página da Igreja.

## 7. Patrocinadores na página da Igreja

7.1. A página pública da Igreja exibe os patrocinadores ativos — nome e, se
houver, logo.

7.2. **A Igreja pode ocultar qualquer patrocinador da sua página, a qualquer
momento e sem precisar justificar.** A decisão é só dela, tem efeito imediato
e não passa por aprovação da Plataforma.

7.3. Ocultar não cancela o patrocínio nem interrompe a cobrança do
patrocinador: ele continua apoiando a Plataforma, apenas deixa de aparecer na
página daquela Igreja.

7.4. Se o problema for mais grave que preferência — conteúdo impróprio,
identidade falsa, uso indevido da marca —, a Igreja pode **denunciar** o
patrocinador, e a Plataforma analisará o caso.

7.5. Nome e logo de patrocinador passam por conferência da Plataforma antes de
entrar no ar. Isso reduz, mas não elimina, o risco de conteúdo inadequado. A
Igreja tem sempre o recurso da cláusula 7.2.

## 8. Domínio próprio

8.1. A Igreja pode apontar um domínio próprio para a sua página.

8.2. O registro do domínio, a renovação e o pagamento das taxas do registrador
são responsabilidade da Igreja. A Plataforma não registra domínio em nome da
Igreja.

8.3. O endereço padrão fornecido pela Plataforma continua funcionando mesmo
com domínio próprio configurado. Se o domínio da Igreja expirar, for
transferido ou tiver o DNS alterado, a página continua acessível pelo endereço
padrão.

## 9. Disponibilidade

9.1. A Plataforma trabalha para manter o serviço no ar, mas não garante
funcionamento ininterrupto. Falhas de internet, de provedores de
infraestrutura e manutenções acontecem.

9.2. Manutenções programadas serão comunicadas com antecedência sempre que
possível.

9.3. Como o serviço é gratuito para a Igreja (cláusula 4.1), não há
compensação financeira por indisponibilidade.

## 10. Encerramento

10.1. A Igreja pode encerrar a conta quando quiser, pelo painel ou pelo
contato indicado na cláusula 1.

10.2. A Plataforma pode suspender ou encerrar a conta em caso de violação
destes Termos, com aviso prévio e prazo para correção — salvo em casos graves,
como conteúdo ilícito, em que a suspensão pode ser imediata.

10.3. Encerrada a conta, a página pública sai do ar. Durante 30 dias, a
Igreja pode pedir, pelo contato da cláusula 1, uma cópia dos dados da
comunidade; depois desse prazo eles são eliminados, exceto o que a lei obrigar
a guardar.

10.4. O encerramento da conta da Igreja não gera direito a qualquer valor pago
por patrocinadores.

## 11. Propriedade intelectual

11.1. A Plataforma, seu código, sua marca e seu design pertencem à empresa
indicada na cláusula 1.

11.2. O conteúdo publicado pela Igreja continua sendo dela. A Igreja autoriza
a Plataforma a exibir esse conteúdo na página pública e em materiais de
divulgação do próprio serviço, podendo revogar essa segunda autorização a
qualquer tempo por escrito.

## 12. Limitação de responsabilidade

12.1. A Plataforma não responde por decisões da Igreja, pelo conteúdo que ela
publica, nem pela relação da Igreja com sua comunidade.

12.2. A Plataforma não responde por danos indiretos, lucros cessantes ou
perda de oportunidade.

12.3. Nada nesta cláusula afasta responsabilidades que a lei não permite
afastar, inclusive em matéria de proteção de dados.

## 13. Mudanças nestes Termos

13.1. Estes Termos podem ser alterados. A versão vigente fica sempre publicada
em [/terms/igreja](/terms/igreja), com número de versão e data.

13.2. Mudanças relevantes serão comunicadas com antecedência mínima de 30 dias
e exigirão novo aceite no próximo acesso ao painel.

13.3. Se a Igreja não concordar com a nova versão, pode encerrar a conta sem
ônus.

## 14. Lei aplicável e foro

Estes Termos são regidos pelas leis brasileiras. Fica eleito o foro da comarca
de [COMARCA], salvo quando a lei determinar foro diverso.
$doc$, true)
on conflict (audience, version) do update
  set content = excluded.content, is_current = excluded.is_current;

insert into public.terms_versions (audience, version, content, is_current)
values ('patrocinador', 1, $doc$# Termos de Uso — Patrocinadores

**Versão 1 — vigente desde 18 de setembro de 2026**

Estes Termos regulam o patrocínio da plataforma Conecta Igreja por pessoas e
empresas. Ao marcar o aceite e assinar um patrocínio, você concorda com tudo o
que está escrito aqui.

Se você representa uma igreja, os termos que valem para você são outros, os
[Termos de Uso para Igrejas](/terms/igreja).

---

## 1. Quem somos

A Conecta Igreja é operada por [RAZÃO SOCIAL], inscrita no CNPJ sob o nº
[CNPJ], com sede em [ENDEREÇO COMPLETO], doravante "Plataforma".

Contato: [EMAIL DE CONTATO]
Encarregado de dados (LGPD): [EMAIL DO ENCARREGADO]

## 2. O que você está contratando — e o que não está

**Leia esta cláusula antes de qualquer outra.**

2.1. O patrocínio é um **pagamento mensal feito à Plataforma** para sustentar o
serviço que mantém a presença digital das igrejas no ar.

2.2. **O valor não é doação, dízimo, oferta nem repasse para a igreja.** A
igreja que você escolheu apoiar **não recebe esse dinheiro**, não tem direito
sobre ele e não é parte desta contratação. Quem contrata é você; quem presta o
serviço é a Plataforma.

2.3. Em troca, seu nome e, se você enviar, seu logo aparecem na página pública
da igreja escolhida, na condição de patrocinador.

2.4. O patrocínio não gera vínculo com a igreja, não representa endosso dela a
você nem seu endosso a ela, e não dá direito a espaço publicitário, links
promocionais, menção em cultos ou qualquer outra contrapartida além da
exibição descrita em 2.3.

2.5. Se o que você quer é doar para a igreja, este não é o caminho: fale
diretamente com ela.

## 3. Cadastro e acesso

3.1. O patrocínio pode ser contratado por pessoa física (com CPF) ou jurídica
(com CNPJ). Os dados informados devem ser verdadeiros.

3.2. O tipo de cadastro (pessoa ou empresa) e o documento não podem ser
alterados depois, porque ficam vinculados ao cadastro no meio de pagamento.
Para mudar, é preciso encerrar e contratar de novo.

3.3. **Sua conta não tem senha.** O acesso ao painel é feito por link enviado
ao seu email. Mantenha seu email seguro: quem tem acesso a ele tem acesso à
sua conta.

## 4. Quanto custa

4.1. O valor mensal depende de **quantas igrejas você apoia**, e cai a cada
nova igreja. A tabela vigente é:

| Igreja | Valor mensal |
|---|---|
| 1ª | R$ 39,90 |
| 2ª | R$ 34,90 |
| 3ª | R$ 29,90 |
| 4ª em diante | R$ 27,90 |

4.2. O total é a **soma das faixas, na ordem**. Apoiando três igrejas, você
paga R$ 39,90 + R$ 34,90 + R$ 29,90 = **R$ 104,70 por mês**.

4.3. O desconto é seu, não da igreja. Ele existe porque *você* apoia várias, e
não porque determinada igreja tem muitos apoiadores.

4.4. **O preço está na posição, não na igreja.** Se você apoia três igrejas e
cancela uma delas, o total é recalculado para as duas faixas iniciais — R$
39,90 + R$ 34,90 = **R$ 74,80** — e não para a soma das faixas que aquelas
duas ocupavam antes. Você nunca fica pagando a faixa de uma posição que não
existe mais.

4.5. Os valores da tabela podem mudar. Alterações serão comunicadas com
antecedência mínima de 30 dias, não valem para o ciclo já pago, e você pode
cancelar antes que passem a valer.

## 5. Como você paga

5.1. A cobrança é **mensal, recorrente e única**: independentemente de quantas
igrejas você apoia, chega uma só cobrança por mês, com o total da cláusula 4.

5.2. O pagamento é processado por um meio de pagamento terceirizado. Os dados
do seu cartão são informados e guardados por ele — a Plataforma não armazena
número de cartão.

5.3. Ao adicionar uma igreja no meio do ciclo, o novo valor passa a valer na
cobrança seguinte. A exibição do seu apoio começa assim que o pagamento é
confirmado.

5.4. Se uma cobrança não for paga:

- seu apoio pode deixar de ser exibido nas páginas das igrejas;
- você não consegue adicionar novas igrejas enquanto houver fatura em aberto;
- a Plataforma pode encerrar os patrocínios após 30 dias de inadimplência,
  com aviso prévio por email.

## 6. Cancelamento

6.1. **Você pode cancelar quando quiser**, pelo painel, sem multa e sem
justificativa.

6.2. Ao cancelar o apoio a uma igreja, ele **continua sendo exibido até o fim
do ciclo já pago** — você não perde o que pagou — e deixa de contar no valor
do ciclo seguinte.

6.3. Cancelado um apoio, o valor dos demais é recalculado conforme a cláusula
4.4, valendo já para a cobrança seguinte.

6.4. **Direito de arrependimento:** nos 7 dias seguintes à primeira
contratação, você pode desistir e receber de volta o valor pago, conforme o
art. 49 do Código de Defesa do Consumidor. Basta pedir pelo contato da
cláusula 1.

## 7. Seu nome e seu logo

7.1. O que aparece na página da igreja é o nome que você cadastrou e, se
enviar, seu logo.

7.2. **Toda alteração de nome ou logo passa por conferência da Plataforma
antes de entrar no ar.** Enquanto a conferência não acontece, as páginas
continuam exibindo o que estava valendo.

7.3. Essa conferência existe por segurança: sem ela, bastaria uma conta de
email invadida para publicar qualquer imagem na página de uma igreja. A
análise costuma levar até 2 dias úteis.

7.4. Uma alteração pode ser recusada, e a recusa sempre vem com o motivo.
Podem ser recusados nome ou logo que:

- não correspondam a você ou ao seu negócio;
- usem marca de terceiro sem autorização;
- contenham conteúdo sexual, violento, discriminatório ou ilegal;
- façam propaganda de produto ou serviço incompatível com o ambiente —
  incluindo jogos de azar, bebida alcoólica, tabaco e crédito consignado;
- tenham teor político-partidário ou de campanha eleitoral.

7.5. A cada pedido de alteração, a Plataforma envia um email para o endereço
da sua conta, com um botão para desfazer caso não tenha sido você. Ao usar
esse botão, o pedido é cancelado, o perfil volta ao que era e sua conta fica
bloqueada para novas alterações até você falar com o suporte — proteção contra
conta invadida.

7.6. Formatos aceitos para o logo: PNG, JPG ou WebP, até 1 MB.

## 8. A igreja pode ocultar seu apoio

8.1. Cada igreja decide o que aparece na página dela. Uma igreja pode **ocultar
seu apoio a qualquer momento, sem precisar justificar**.

8.2. Isso não cancela o patrocínio nem interrompe a cobrança automaticamente.

8.3. Se isso acontecer e você não quiser continuar apoiando aquela igreja,
cancele o apoio pelo painel: a cobrança seguinte já vem recalculada (cláusula
4.4), sem multa. Sua exposição, portanto, se limita ao ciclo em curso.

8.4. Se você entender que a ocultação foi indevida, fale com o suporte.

## 9. Seus dados pessoais

9.1. Nesta relação, a **Plataforma é a controladora** dos seus dados: é ela que
decide como eles são usados.

9.2. São coletados: nome, email, telefone (se informado), CPF ou CNPJ, e os
dados necessários à cobrança.

9.3. Finalidades e bases legais:

- **executar este contrato** — cadastro, cobrança, suporte e exibição do seu
  apoio;
- **cumprir obrigações legais** — fiscais e contábeis;
- **comunicação por email sobre novidades** — só com o seu consentimento, que
  você pode revogar a qualquer momento sem afetar o patrocínio.

9.4. **Seu CPF ou CNPJ nunca é mostrado às igrejas.** A igreja vê apenas seu
nome, seu logo e desde quando você apoia. Não vê valor, documento nem contato.

9.5. Seus dados são compartilhados apenas com o meio de pagamento, no que for
necessário para cobrar, e com autoridades quando a lei exigir.

9.6. Você pode pedir acesso, correção, portabilidade ou exclusão dos seus
dados pelo contato da cláusula 1. Dados de pagamento são mantidos pelo prazo
exigido pela legislação fiscal mesmo após o encerramento.

## 10. Encerramento pela Plataforma

10.1. A Plataforma pode encerrar o patrocínio em caso de violação destes
Termos, fraude, inadimplência ou uso indevido, com aviso e devolução
proporcional do período pago e não usufruído.

10.2. Em caso de encerramento, seu nome e seu logo saem das páginas das
igrejas.

## 11. Disponibilidade e responsabilidade

11.1. A Plataforma trabalha para manter o serviço no ar, mas não garante
funcionamento ininterrupto.

11.2. Se a exibição do seu apoio ficar indisponível por falha da Plataforma
por mais de 72 horas seguidas num mesmo ciclo, você pode pedir o abatimento
proporcional na cobrança seguinte.

11.3. A Plataforma não responde pelo conteúdo publicado pelas igrejas nem por
qualquer relação que você venha a ter com elas fora da Plataforma.

## 12. Mudanças nestes Termos

12.1. A versão vigente fica publicada em
[/terms/patrocinador](/terms/patrocinador), com número de versão e data.

12.2. Mudanças relevantes serão comunicadas por email com antecedência mínima
de 30 dias. Se você não concordar, pode cancelar antes que passem a valer, sem
ônus.

## 13. Lei aplicável e foro

Estes Termos são regidos pelas leis brasileiras, inclusive pelo Código de
Defesa do Consumidor quando aplicável. Fica eleito o foro da comarca de
[COMARCA], ressalvado o direito do consumidor de demandar no foro do seu
domicílio.
$doc$, true)
on conflict (audience, version) do update
  set content = excluded.content, is_current = excluded.is_current;

notify pgrst, 'reload schema';
