# E-mail em produção

O sistema envia e-mail em dois lugares diferentes, e os dois precisam ser
configurados antes de colocar uma igreja de verdade:

| Quem envia | Quais e-mails | Onde se configura |
| --- | --- | --- |
| **A aplicação**, pela Resend | Convite para acessar o sistema, link de acesso do patrocinador, avisos de vínculo entre igrejas, troca de Pix, perfil do patrocinador | Variáveis de ambiente da hospedagem |
| **O Supabase Auth** | Recuperação de senha (e confirmação de cadastro, se for ligada) | Painel do Supabase |

Sem o primeiro, ninguém recebe convite. Sem o segundo, ninguém consegue
recuperar a senha — e o Supabase, com o envio padrão dele, manda só alguns
poucos e-mails por hora.

## 1. Resend (e-mails da aplicação)

1. Crie a conta em <https://resend.com>.
2. Em **Domains → Add Domain**, informe o domínio de envio (ex.:
   `conectaigreja.com.br`). A Resend mostra os registros de DNS: **SPF**
   (TXT), **DKIM** (TXT/CNAME) e, opcional mas recomendado, **DMARC**.
3. Cadastre esses registros no provedor do domínio e espere o status ficar
   **Verified** (de minutos a algumas horas). Sem isso a Resend só envia
   para o e-mail de cadastro da própria conta.
4. Em **API Keys → Create API Key**, crie uma chave com permissão de envio
   (*Sending access*) restrita a esse domínio. Guarde num cofre de senhas.
5. Cadastre na hospedagem (Vercel → Settings → Environment Variables, em
   *Production*):

   ```
   EMAIL_PROVIDER=resend
   RESEND_API_KEY=re_...
   EMAIL_FROM=no-reply@seudominio.com.br
   EMAIL_FROM_NAME=Conecta Igreja
   EMAIL_REPLY_TO=suporte@seudominio.com.br
   APP_URL=https://seudominio.com.br
   ```

   - `EMAIL_FROM` é só o endereço, no domínio verificado. O nome que aparece
     para quem recebe vai em `EMAIL_FROM_NAME` (se ficar vazio, usa o nome do
     produto).
   - `EMAIL_REPLY_TO` é opcional: para onde vai a resposta de quem responder
     o e-mail.
   - `APP_URL` é o endereço público, com `https://` e sem barra no fim.
     **Os links dos e-mails usam este valor**: se ficar em `localhost`, o
     convite chega mas o link não abre.
6. Faça um novo deploy (variável nova só vale depois do deploy).

### Conferir

Com um arquivo local contendo as mesmas variáveis de produção:

```bash
node --env-file=.env.producao scripts/testar-email.mjs seu-email@exemplo.com
```

O script mostra a configuração lida, manda um e-mail de teste e, se a Resend
recusar, diz o motivo e o que corrigir (chave errada, domínio não verificado,
conta em modo de teste). Não mexe no banco.

Depois do deploy, olhe o log de inicialização do servidor: se algo estiver
faltando aparece uma linha começando com `[boot]`.

## 2. Supabase Auth (recuperação de senha)

No painel do projeto de **produção** do Supabase:

1. **Authentication → Emails → SMTP Settings → Enable Custom SMTP**, usando
   a própria Resend:
   - Host: `smtp.resend.com` · Porta: `465`
   - Usuário: `resend` · Senha: a `RESEND_API_KEY`
   - Sender email: o mesmo de `EMAIL_FROM` · Sender name: o de `EMAIL_FROM_NAME`
2. **Authentication → URL Configuration**:
   - *Site URL*: o mesmo de `APP_URL`
   - *Redirect URLs*: `https://seudominio.com.br/**`
3. **Authentication → Emails → Templates**: os textos padrão vêm em inglês.
   Traduza pelo menos o de *Reset Password*.
4. **Authentication → Rate Limits**: com SMTP próprio, aumente o limite de
   e-mails por hora (o padrão é baixo).

A confirmação de e-mail no cadastro está **desligada** no projeto
(`enable_confirmations = false`). Quem é convidado cria a conta e entra
direto; o que garante que a pessoa é dona do e-mail é o link do convite, que
só vale para aquele endereço.

## 3. Teste de ponta a ponta

1. Entre como Responsável de uma igreja.
2. Em **Membros**, edite um membro, informe um e-mail seu e convide.
3. Confira que o e-mail chegou (olhe o spam), com o nome da igreja no assunto.
4. Abra o link numa janela anônima, crie a conta com aquele e-mail e aceite.
5. Confira que a pessoa entrou e vê os menus do cargo dela.
6. Teste "Esqueci minha senha" na tela de entrada.

## Se o e-mail não chegar

Na ficha do membro, o convite pendente tem três saídas:

- **Reenviar e-mail** — manda de novo.
- **Copiar link** — copia o link do convite para colar onde quiser.
- **Enviar por WhatsApp** — abre o WhatsApp do membro com a mensagem e o
  link prontos (aparece quando o membro tem telefone cadastrado).

O convite vale por 7 dias e só pode ser aceito por quem entrar com o e-mail
convidado. Se o envio falhar na hora de convidar, o convite é criado mesmo
assim e a tela avisa para usar uma dessas saídas.

## Problemas comuns

| Sintoma | Causa provável |
| --- | --- |
| Ninguém recebe nada, sem erro na tela | `EMAIL_PROVIDER` não é `resend` (o padrão `console` só escreve no log) |
| "O convite foi criado, mas o e-mail não saiu" | Chave inválida, domínio não verificado ou `EMAIL_FROM` em outro domínio — rode o script de teste |
| Chega, mas no spam | SPF/DKIM não verificados, ou falta o DMARC |
| O link abre "localhost" | `APP_URL` não foi definido em produção |
| Só chega no seu próprio e-mail | Conta da Resend em modo de teste: falta verificar o domínio |
| Recuperação de senha não chega | SMTP próprio não configurado no Supabase Auth (seção 2) |
