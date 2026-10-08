# E-mails de login (Supabase Auth) em português

Os e-mails de cadastro, senha e troca de e-mail não saem do código do sistema:
quem envia é o Supabase Auth (pelo SMTP do Resend). Por padrão o texto dele é
em inglês. Os modelos em português, com a mesma moldura dos e-mails do
sistema, ficam em `supabase/templates/`.

- **Dev (Supabase local):** já valem, pelo `supabase/config.toml`.
- **Produção:** precisam ser colados no painel, uma vez.

## Como colar em produção

Supabase → **Authentication → Emails → Templates**. Para cada modelo da
tabela, abra a aba correspondente, troque o **Subject** e cole o conteúdo
inteiro do arquivo no campo do corpo (aba "Source", se houver). Salve.

| Aba no Supabase | Assunto (Subject) | Arquivo |
|---|---|---|
| Confirm signup | Confirme seu cadastro no AssembleiaApp | `supabase/templates/confirmacao.html` |
| Reset password | Redefinir sua senha do AssembleiaApp | `supabase/templates/recuperacao.html` |
| Change email address | Confirme a troca de e-mail no AssembleiaApp | `supabase/templates/troca-de-email.html` |
| Magic link | Seu link de acesso ao AssembleiaApp | `supabase/templates/link-de-acesso.html` |
| Invite user | Você foi convidado para o AssembleiaApp | `supabase/templates/convite.html` |
| Reauthentication | Código de confirmação do AssembleiaApp | `supabase/templates/reautenticacao.html` |

Não edite as partes entre `{{ }}` (`{{ .ConfirmationURL }}`, `{{ .Email }}`,
`{{ .NewEmail }}`, `{{ .Token }}`, `{{ .SiteURL }}`): é o Supabase quem as
preenche.

## Para mudar o texto

Os arquivos são gerados a partir da mesma moldura dos e-mails do sistema
(`src/lib/emailLayout.ts`). Pequenos ajustes de texto podem ser feitos direto
no arquivo; depois, cole de novo no painel.
