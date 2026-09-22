# Controle de Estoque — Wap

Aplicação web própria (fora do Claude) para controle de estoque de facilities.
**Sem tela de login**: qualquer pessoa com o link tem acesso completo — é
pensado para uso interno, compartilhado só com quem já deveria ter acesso.

## Papéis de acesso (estrutura mantida, sem uso prático hoje)

O código ainda tem os três papéis abaixo e a página "Usuários" para
cadastrá-los, mas como não há mais login, todo mundo que abre o link acessa
com o nível ADM (acesso completo) — a diferenciação por papel só volta a valer
se um login for reintroduzido no futuro.

| Papel     | Visualizar | Filtros | Editar parâmetros (segurança/consumo) | Imputar contagem (estoque) | Cadastrar/editar itens do catálogo | Gerenciar usuários |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|
| **ADM**     | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| **Gestor**  | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ |
| **Técnico** | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ |

## Arquitetura

- **Backend**: Node.js + Express. Roda tanto como servidor comum
  (`server/index.js`, para uso local) quanto como função serverless na Vercel
  (`api/index.js`) — os dois compartilham a mesma lógica de rotas
  (`server/app.js` / `server/routes.js`).
- **Banco de dados**: Postgres (hospedado no Supabase em produção). O schema
  vive em `supabase-schema.sql`.
- **Frontend**: HTML/CSS/JS puro em `public/`, sem framework — é o que a
  Vercel serve como arquivo estático na raiz do site.

## Rodando localmente

Pré-requisitos: Node.js 18+ e um Postgres acessível (local ou já o do
Supabase).

```bash
npm install
cp .env.example .env      # preencha DATABASE_URL e JWT_SECRET
npm run migrate           # cria as tabelas (equivalente a rodar supabase-schema.sql)
npm start
```

`DATABASE_URL` precisa estar definida no ambiente (ou no `.env`) para
qualquer um desses comandos funcionar — é a connection string do Postgres.

Depois de `npm start`, a aplicação fica disponível em `http://localhost:3000`
(ou na porta definida em `PORT`) — já abre direto no painel, sem login.

Se quiser usar a página "Usuários" (só para manter um registro de quem é
Gestor/Técnico, já que hoje isso não restringe nada), basta cadastrar por lá
mesmo, direto na tela — não precisa rodar `npm run seed`.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | **sim** | Connection string do Postgres (Supabase em produção). |
| `PORT` | não | Porta HTTP para `npm start` local (padrão 3000). Não se aplica na Vercel. |
| `JWT_SECRET` | não | Só é usada se um login vier a ser reintroduzido no futuro; sem tela de login, essa variável fica sem efeito prático hoje. |
| `SEED_ADMIN_USERNAME` / `SEED_ADMIN_NAME` / `SEED_ADMIN_PASSWORD` | não | Usadas apenas por `npm run seed` (opcional), caso queira pré-cadastrar um usuário ADM na tabela de usuários. |

## Colocando no ar ("fora do Claude", com link próprio)

Veja o passo a passo completo em **[DEPLOY.md](./DEPLOY.md)**: criar o
repositório no GitHub, o banco no Supabase, e publicar na Vercel — do zero até
o link público funcionando. Não há passo de login para configurar: assim que
o deploy termina, o link já abre direto no painel para qualquer pessoa.

## O que mudou em relação à versão anterior (artefato do Claude)

- A análise por IA ("Gerar análise") foi removida nesta versão, pois dependia
  de um recurso disponível apenas dentro do Claude. Pode ser reintroduzida
  futuramente com uma chave de API de IA própria, se desejado.
- Não há mais sincronização em tempo real entre abas/usuários — a tela se
  atualiza após cada ação (salvar, contar, etc.), mas não reflete
  instantaneamente o que outra pessoa está fazendo em outra sessão.
- Hospedagem própria (fora do Claude, com link direto) é nova nesta versão.
- O banco de dados passou de um arquivo SQLite local para Postgres
  (Supabase), para permitir hospedagem serverless (Vercel) sem depender de
  disco persistente.
- Uma versão anterior deste projeto teve login e papéis de acesso reais
  (ADM/Gestor/Técnico); a pedido, essa tela de login foi retirada — o sistema
  agora é aberto para quem tiver o link, e o código dos papéis ficou apenas
  como estrutura para uso futuro, se algum dia fizer sentido reativar.
