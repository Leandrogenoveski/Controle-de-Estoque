# Colocando o sistema no ar: GitHub + Supabase + Vercel

Este guia assume que você já tem conta no [GitHub](https://github.com),
[Supabase](https://supabase.com) e [Vercel](https://vercel.com). Leva uns 15
minutos na primeira vez; depois disso, qualquer atualização do sistema é só
um `git push`.

## 1. Colocar o código no GitHub

O projeto já vem com um repositório git iniciado localmente (pasta `.git/`
dentro do zip), então falta só criar o repositório vazio no GitHub e apontar
para ele.

1. Em [github.com/new](https://github.com/new), crie um repositório novo
   (ex.: `estoque-wap`). Deixe **sem** README, `.gitignore` ou licença — o
   projeto já traz os seus.
2. Copie a URL que o GitHub mostrar (algo como
   `https://github.com/SEU-USUARIO/estoque-wap.git`).
3. No seu computador, dentro da pasta do projeto (depois de extrair o zip),
   rode:

   ```bash
   git remote add origin https://github.com/SEU-USUARIO/estoque-wap.git
   git branch -M main
   git push -u origin main
   ```

   O Git vai pedir para você entrar com sua conta do GitHub na primeira vez.

Se preferir não usar o terminal: crie o repositório do mesmo jeito e use o
botão **"uploading an existing file"** na própria página do GitHub, arrastando
todos os arquivos e pastas extraídos do zip (exceto a pasta `node_modules`,
que não deve ir para o repositório).

## 2. Criar o banco de dados no Supabase

1. Em [supabase.com/dashboard](https://supabase.com/dashboard), clique em
   **New project**. Escolha uma senha forte para o banco (o próprio Supabase
   sugere uma) e, se disponível, a região **South America (São Paulo)** para
   ficar mais perto do Brasil. Aguarde o projeto ficar pronto (cerca de 2
   minutos).
2. No menu lateral, abra **SQL Editor** → **New query**. Cole todo o conteúdo
   do arquivo `supabase-schema.sql` (está na raiz do projeto) e clique em
   **Run**. Isso cria as tabelas e já cadastra as 5 unidades da Wap.
3. Vá em **Project Settings** (ícone de engrenagem) → **Database** →
   **Connection string**. Selecione a aba **Transaction** (modo "pooler" —
   é o recomendado para hospedagem serverless como a Vercel) e copie a URI.
   Ela tem esse formato:

   ```
   postgresql://postgres.xxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
   ```

   Troque `[YOUR-PASSWORD]` pela senha do banco que você definiu no passo 1.
   Guarde essa URL completa — ela é o valor de `DATABASE_URL` no próximo
   passo.

## 3. Publicar na Vercel

1. Em [vercel.com/new](https://vercel.com/new), clique em **Import** no
   repositório `estoque-wap` que você acabou de subir para o GitHub.
2. A Vercel detecta um projeto Node comum — não precisa mudar nenhuma opção
   de build ("Framework Preset" pode ficar em "Other").
3. Antes de clicar em **Deploy**, abra a seção **Environment Variables** e
   adicione:

   | Nome | Valor |
   |---|---|
   | `DATABASE_URL` | a connection string do Supabase copiada no passo anterior |

   (Não é preciso configurar `JWT_SECRET` nem nenhum usuário — o sistema não
   tem tela de login: qualquer pessoa com o link já entra direto no painel,
   com acesso completo.)

4. Clique em **Deploy**. Em cerca de 1 minuto a Vercel te dá um link público,
   algo como `https://estoque-wap.vercel.app` — esse já é o endereço
   definitivo do sistema, pronto para compartilhar com a equipe. Não tem mais
   nenhum passo depois disso: quem abrir o link já cai direto no painel.

## Atualizações futuras

- Mudou algo no código? `git add -A && git commit -m "..." && git push` — a
  Vercel refaz o deploy automaticamente.
- Mudou algo no schema do banco (nova coluna, nova tabela)? Rode o SQL
  correspondente no **SQL Editor** do Supabase, do mesmo jeito que no passo 2.
- Quer registrar quem é Gestor/Técnico (só como anotação — hoje isso não
  restringe nada)? Dá para cadastrar direto pela própria tela "Usuários" do
  sistema, sem precisar de login.
