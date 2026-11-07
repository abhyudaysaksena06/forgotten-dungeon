-- The Forgotten Dungeon — Supabase / PostgreSQL schema.
-- Not wired up yet: the server runs on MemoryStore (src/db/memoryStore.js) until deployment.
-- Only the server talks to the database, with the service key from its own environment.

create table rooms (
  code          text primary key,
  seed          text not null,
  phase         text not null default 'lobby',   -- lobby | scene | combat | victory | defeat
  stage         smallint not null default 0,
  state         jsonb not null,                   -- authoritative snapshot (no tokens)
  checkpoint    jsonb,                            -- saved at each stage start
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table players (
  id            uuid primary key,
  room_code     text not null references rooms(code) on delete cascade,
  name          text not null,
  class         text check (class in ('warrior','mage','rogue','healer')),
  token_hash    text not null,                    -- sha256 of the reconnect token, never the token
  hp            integer not null default 0 check (hp >= 0),
  max_hp        integer not null default 0,
  fallen        boolean not null default false,
  joined_at     timestamptz not null default now()
);
create unique index players_room_name on players (room_code, lower(name));

create table inventory_items (
  uid           text primary key,
  player_id     uuid not null references players(id) on delete cascade,
  item          text not null,
  created_at    timestamptz not null default now()
);

create table votes (
  room_code     text not null references rooms(code) on delete cascade,
  vote_id       text not null,
  player_id     uuid not null references players(id) on delete cascade,
  option_id     text not null,
  cast_at       timestamptz not null default now(),
  primary key (room_code, vote_id, player_id)      -- one vote per player per vote
);

create table actions (
  id                bigserial primary key,
  room_code         text not null references rooms(code) on delete cascade,
  player_id         uuid not null references players(id) on delete cascade,
  idempotency_key   text not null,
  type              text not null,
  payload           jsonb not null,
  created_at        timestamptz not null default now(),
  unique (room_code, idempotency_key)               -- a double-click can never run twice
);

create table events (
  id            bigserial primary key,
  room_code     text not null references rooms(code) on delete cascade,
  seq           integer not null,
  type          text not null,                    -- never 'whisper': whispers are not stored
  text          text not null,
  data          jsonb,
  created_at    timestamptz not null default now(),
  unique (room_code, seq)
);

create table scores (
  room_code     text primary key references rooms(code) on delete cascade,
  stage_clears  smallint not null default 0,
  boss          smallint not null default 0,
  survival      smallint not null default 0,
  speed         smallint not null default 0,
  shards        smallint not null default 0,
  total         smallint not null default 0,
  retries       smallint not null default 0,
  updated_at    timestamptz not null default now()
);

-- Supabase: keep RLS on and give the anon key no access; the browser never queries directly.
alter table rooms enable row level security;
alter table players enable row level security;
alter table inventory_items enable row level security;
alter table votes enable row level security;
alter table actions enable row level security;
alter table events enable row level security;
alter table scores enable row level security;
