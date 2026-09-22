-- Controle de Estoque - Wap
-- Schema para Postgres / Supabase.
--
-- Como usar: abra o painel do seu projeto no Supabase -> "SQL Editor" ->
-- "New query", cole o conteúdo inteiro deste arquivo e clique em "Run".
-- É seguro rodar mais de uma vez (todos os comandos são idempotentes).

create table if not exists units (
  id text primary key,
  label text not null,
  sort_order integer not null default 0
);

create table if not exists users (
  id text primary key,
  username text not null unique,
  password_hash text not null,
  name text not null,
  role text not null check (role in ('ADM', 'GESTOR', 'TECNICO')),
  active boolean not null default true,
  must_change_password boolean not null default false,
  created_at text not null,
  created_by text
);

create table if not exists products (
  id text primary key,
  unit_id text not null references units(id),
  code text not null,
  name text not null,
  category text not null,
  unit_label text default '',
  min_stock double precision not null default 0,
  avg_consumption double precision not null default 0,
  created_at text not null,
  updated_at text not null,
  unique (unit_id, code)
);

create table if not exists counts (
  id text primary key,
  unit_id text not null references units(id),
  code text not null,
  month text not null,
  qty double precision,
  updated_at text not null,
  updated_by text,
  unique (unit_id, code, month)
);

create table if not exists activity (
  id text primary key,
  unit_id text not null references units(id),
  type text not null,
  code text,
  name text,
  detail text,
  month text,
  actor_id text,
  created_at text not null
);

-- Coluna adicionada depois: "month" guarda o mês de referência da contagem
-- (não o mês em que a ação foi feita) para o feed de movimentações mostrar
-- para qual mês aquele número era. Idempotente: seguro rodar de novo mesmo
-- se o banco já tiver a coluna.
alter table activity add column if not exists month text;

create index if not exists idx_products_unit on products(unit_id);
create index if not exists idx_counts_unit_month on counts(unit_id, month);
create index if not exists idx_activity_unit on activity(unit_id, created_at desc);

-- As 5 unidades da Wap. Reaplicar este bloco atualiza o rótulo/ordem sem
-- duplicar linhas.
insert into units (id, label, sort_order) values
  ('SM', 'WAP UN. SM', 1),
  ('AFP', 'WAP UN. AFP', 2),
  ('SERRA', 'WAP UN. SERRA', 3),
  ('LINHARES', 'WAP UN. LINHARES', 4),
  ('EUSEBIO', 'WAP UN. EUSÉBIO', 5)
on conflict (id) do update set label = excluded.label, sort_order = excluded.sort_order;
