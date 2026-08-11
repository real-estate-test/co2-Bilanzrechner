-- =====================================================================
--  Projektrechner · Datenbankschema
--
--  Einmalig im Supabase-SQL-Editor ausführen.
--  Erstellt Tabellen, Rechteregeln (Row Level Security), Auslöser und
--  das Protokoll. Die Rechteprüfung liegt bewusst in der Datenbank —
--  ein manipulierter Browser kommt nicht daran vorbei.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Rollen
-- ---------------------------------------------------------------------
do $$ begin
  create type rolle as enum ('betrachter', 'bearbeiter', 'verwalter');
exception when duplicate_object then null; end $$;

comment on type rolle is
  'betrachter: nur lesen · bearbeiter: anlegen, ändern, archivieren · verwalter: zusätzlich löschen, Rollen und Vorgabewerte';

-- ---------------------------------------------------------------------
--  Profil je Benutzerkonto
-- ---------------------------------------------------------------------
create table if not exists profil (
  id           uuid primary key references auth.users on delete cascade,
  email        text        not null,
  name         text,
  rolle        rolle       not null default 'betrachter',
  aktiv        boolean     not null default true,
  erstellt_am  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
--  Projekte
--
--  daten  = vollständiges Projekt-JSON der Anwendung
--  kpi    = daraus berechnete Kennzahlen, als eigene Spalte, damit das
--           Portfolio ohne Laden sämtlicher Projektdaten auskommt
--  version= optimistisches Sperren gegen stilles Überschreiben
-- ---------------------------------------------------------------------
create table if not exists projekte (
  id             text primary key,
  name           text        not null default 'Neues Projekt',
  ort            text,
  kanton         text,
  status         text,
  startjahr      int,
  daten          jsonb       not null,
  kpi            jsonb,
  version        int         not null default 1,
  archiviert_am  timestamptz,
  erstellt_von   uuid references profil(id),
  erstellt_am    timestamptz not null default now(),
  geaendert_von  uuid references profil(id),
  geaendert_am   timestamptz not null default now()
);

create index if not exists projekte_archiviert_idx on projekte (archiviert_am);
create index if not exists projekte_status_idx     on projekte (status);

-- ---------------------------------------------------------------------
--  Stichtage (Quartalsstände für das Reporting)
--
--  ziele = die am Stichtag geltenden Zielwerte, mit eingefroren, damit
--          ein späterer Zielwechsel alte Berichte nicht rückwirkend ändert
-- ---------------------------------------------------------------------
create table if not exists stichtage (
  id              uuid primary key default gen_random_uuid(),
  projekt_id      text not null references projekte(id) on delete cascade,
  stichtag        date not null,
  label           text,
  daten           jsonb not null,
  kpi             jsonb not null,
  ziele           jsonb not null default '{}'::jsonb,
  freigegeben_am  timestamptz,
  freigegeben_von uuid references profil(id),
  erstellt_am     timestamptz not null default now(),
  erstellt_von    uuid references profil(id),
  unique (projekt_id, stichtag)
);

create index if not exists stichtage_datum_idx on stichtage (stichtag);

-- ---------------------------------------------------------------------
--  Firmenweite Einstellungen
--    ziele          -> gelten für alle Projekte, nicht überschreibbar
--    vorgabewerte   -> Startwerte für NEUE Projekte, im Projekt frei änderbar
-- ---------------------------------------------------------------------
create table if not exists einstellungen (
  schluessel    text primary key,
  wert          jsonb not null,
  geaendert_von uuid references profil(id),
  geaendert_am  timestamptz not null default now()
);

insert into einstellungen (schluessel, wert) values
  ('ziele', '{"marge": 15, "bruttorendite": 4.0}'::jsonb)
on conflict (schluessel) do nothing;

insert into einstellungen (schluessel, wert) values
  ('vorgabewerte', '{}'::jsonb)
on conflict (schluessel) do nothing;

-- Zugelassene E-Mail-Domänen für die Registrierung. Leer bedeutet:
-- ausser dem allerersten Konto kann sich niemand registrieren. Der
-- Verwalter trägt hier die Firmendomäne ein und öffnet damit gezielt.
insert into einstellungen (schluessel, wert) values
  ('erlaubte_domains', '[]'::jsonb)
on conflict (schluessel) do nothing;

-- ---------------------------------------------------------------------
--  Kommentare je Projekt
-- ---------------------------------------------------------------------
create table if not exists kommentare (
  id          uuid primary key default gen_random_uuid(),
  projekt_id  text not null references projekte(id) on delete cascade,
  text        text not null,
  verfasser   uuid references profil(id),
  erstellt_am timestamptz not null default now()
);

create index if not exists kommentare_projekt_idx on kommentare (projekt_id, erstellt_am desc);

-- ---------------------------------------------------------------------
--  Protokoll — unveränderlich, es gibt bewusst keine Änderungs- oder
--  Löschregel. Auch Verwalter können Einträge nicht nachträglich ändern.
-- ---------------------------------------------------------------------
create table if not exists protokoll (
  id             bigserial primary key,
  zeit           timestamptz not null default now(),
  benutzer       uuid,
  benutzer_email text,
  projekt_id     text,
  projekt_name   text,
  aktion         text not null,
  details        jsonb
);

create index if not exists protokoll_zeit_idx    on protokoll (zeit desc);
create index if not exists protokoll_projekt_idx on protokoll (projekt_id, zeit desc);

-- =====================================================================
--  Hilfsfunktionen
-- =====================================================================

-- Rolle des angemeldeten Benutzers. security definer, damit die
-- Rechteregeln nicht rekursiv wieder auf profil zugreifen.
create or replace function meine_rolle()
returns rolle
language sql
stable
security definer
set search_path = public
as $$
  select rolle from profil where id = auth.uid() and aktiv;
$$;

create or replace function darf_bearbeiten()
returns boolean
language sql
stable
as $$
  select meine_rolle() in ('bearbeiter', 'verwalter');
$$;

create or replace function ist_verwalter()
returns boolean
language sql
stable
as $$
  select meine_rolle() = 'verwalter';
$$;

-- =====================================================================
--  Auslöser
-- =====================================================================

-- Neues Konto -> Profil anlegen. Der erste Benutzer wird Verwalter,
-- sonst käme niemand an die Benutzerverwaltung heran.
create or replace function profil_anlegen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  anzahl   int;
  domains  jsonb;
  domaene  text;
begin
  select count(*) into anzahl from profil;

  -- Das erste Konto darf sich immer anlegen (Erstinbetriebnahme).
  -- Danach ist die Registrierung geschlossen, bis der Verwalter die
  -- Firmendomäne freigibt. Ohne diese Sperre könnte sich jeder, der die
  -- Adresse kennt, ein Konto anlegen.
  if anzahl > 0 then
    select wert into domains from einstellungen where schluessel = 'erlaubte_domains';
    domaene := lower(split_part(new.email, '@', 2));
    if domains is null or jsonb_array_length(domains) = 0 then
      raise exception 'Registrierung ist geschlossen. Ein Verwalter muss die zugelassene E-Mail-Domäne freigeben.';
    end if;
    if not (domains ? domaene) then
      raise exception 'Für die Domäne % ist keine Registrierung zugelassen.', domaene;
    end if;
  end if;

  insert into profil (id, email, name, rolle)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    case when anzahl = 0 then 'verwalter'::rolle else 'betrachter'::rolle end
  );
  return new;
end $$;

drop trigger if exists auf_neues_konto on auth.users;
create trigger auf_neues_konto
  after insert on auth.users
  for each row execute function profil_anlegen();

-- Änderungsdaten und Versionszähler pflegen
create or replace function projekt_stempeln()
returns trigger
language plpgsql
as $$
begin
  new.geaendert_von := auth.uid();
  new.geaendert_am  := now();
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
    new.erstellt_von := old.erstellt_von;
    new.erstellt_am  := old.erstellt_am;
  else
    new.erstellt_von := coalesce(new.erstellt_von, auth.uid());
    new.version := 1;
  end if;
  return new;
end $$;

drop trigger if exists auf_projekt_schreiben on projekte;
create trigger auf_projekt_schreiben
  before insert or update on projekte
  for each row execute function projekt_stempeln();

-- Protokolleintrag bei jeder Projektänderung
create or replace function projekt_protokollieren()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  aktion    text;
  felder    text[];
  alte_kpi  jsonb;
  email     text;
begin
  select p.email into email from profil p where p.id = auth.uid();

  if tg_op = 'INSERT' then
    aktion := 'angelegt';
  elsif tg_op = 'DELETE' then
    aktion := 'endgültig gelöscht';
  elsif old.archiviert_am is null and new.archiviert_am is not null then
    aktion := 'archiviert';
  elsif old.archiviert_am is not null and new.archiviert_am is null then
    aktion := 'reaktiviert';
  else
    aktion := 'geändert';
  end if;

  if tg_op = 'UPDATE' then
    alte_kpi := old.kpi;
    -- welche obersten Zweige des Projekt-JSON haben sich geändert?
    select coalesce(array_agg(k), '{}') into felder
    from jsonb_object_keys(new.daten) k
    where new.daten -> k is distinct from old.daten -> k;
  end if;

  insert into protokoll (benutzer, benutzer_email, projekt_id, projekt_name, aktion, details)
  values (
    auth.uid(),
    email,
    coalesce(new.id, old.id),
    coalesce(new.name, old.name),
    aktion,
    jsonb_strip_nulls(jsonb_build_object(
      'bereiche',  to_jsonb(felder),
      'kpi_alt',   alte_kpi,
      'kpi_neu',   case when tg_op <> 'DELETE' then new.kpi else null end,
      'version',   case when tg_op <> 'DELETE' then new.version else old.version end
    ))
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists auf_projekt_protokoll on projekte;
create trigger auf_projekt_protokoll
  after insert or update or delete on projekte
  for each row execute function projekt_protokollieren();

-- =====================================================================
--  Rechteregeln (Row Level Security)
-- =====================================================================

alter table profil        enable row level security;
alter table projekte      enable row level security;
alter table stichtage     enable row level security;
alter table einstellungen enable row level security;
alter table kommentare    enable row level security;
alter table protokoll     enable row level security;

-- --- Profil ---------------------------------------------------------
drop policy if exists profil_lesen on profil;
create policy profil_lesen on profil
  for select to authenticated using (true);

drop policy if exists profil_selbst_aendern on profil;
create policy profil_selbst_aendern on profil
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and rolle = meine_rolle() and aktiv = true);
  -- Die eigene Rolle lässt sich damit nicht hochstufen.

drop policy if exists profil_verwalten on profil;
create policy profil_verwalten on profil
  for update to authenticated
  using (ist_verwalter()) with check (ist_verwalter());

-- --- Projekte -------------------------------------------------------
drop policy if exists projekte_lesen on projekte;
create policy projekte_lesen on projekte
  for select to authenticated using (true);

drop policy if exists projekte_anlegen on projekte;
create policy projekte_anlegen on projekte
  for insert to authenticated with check (darf_bearbeiten());

drop policy if exists projekte_aendern on projekte;
create policy projekte_aendern on projekte
  for update to authenticated
  using (darf_bearbeiten()) with check (darf_bearbeiten());

-- Endgültiges Löschen ausschliesslich für Verwalter.
drop policy if exists projekte_loeschen on projekte;
create policy projekte_loeschen on projekte
  for delete to authenticated using (ist_verwalter());

-- --- Stichtage ------------------------------------------------------
drop policy if exists stichtage_lesen on stichtage;
create policy stichtage_lesen on stichtage
  for select to authenticated using (true);

drop policy if exists stichtage_anlegen on stichtage;
create policy stichtage_anlegen on stichtage
  for insert to authenticated with check (darf_bearbeiten());

-- Ein freigegebener Stichtag ist unveränderlich.
drop policy if exists stichtage_aendern on stichtage;
create policy stichtage_aendern on stichtage
  for update to authenticated
  using (darf_bearbeiten() and (freigegeben_am is null or ist_verwalter()))
  with check (darf_bearbeiten());

drop policy if exists stichtage_loeschen on stichtage;
create policy stichtage_loeschen on stichtage
  for delete to authenticated using (ist_verwalter() and freigegeben_am is null);

-- --- Einstellungen --------------------------------------------------
drop policy if exists einstellungen_lesen on einstellungen;
create policy einstellungen_lesen on einstellungen
  for select to authenticated using (true);

drop policy if exists einstellungen_aendern on einstellungen;
create policy einstellungen_aendern on einstellungen
  for update to authenticated
  using (ist_verwalter()) with check (ist_verwalter());

drop policy if exists einstellungen_anlegen on einstellungen;
create policy einstellungen_anlegen on einstellungen
  for insert to authenticated with check (ist_verwalter());

-- --- Kommentare -----------------------------------------------------
drop policy if exists kommentare_lesen on kommentare;
create policy kommentare_lesen on kommentare
  for select to authenticated using (true);

-- Auch Betrachter dürfen kommentieren — Rückfragen sind kein Eingriff.
drop policy if exists kommentare_schreiben on kommentare;
create policy kommentare_schreiben on kommentare
  for insert to authenticated with check (verfasser = auth.uid());

drop policy if exists kommentare_loeschen on kommentare;
create policy kommentare_loeschen on kommentare
  for delete to authenticated using (verfasser = auth.uid() or ist_verwalter());

-- --- Protokoll ------------------------------------------------------
drop policy if exists protokoll_lesen on protokoll;
create policy protokoll_lesen on protokoll
  for select to authenticated using (true);

-- Absichtlich keine Regel für insert, update oder delete:
-- Einträge entstehen ausschliesslich über die Auslöser (security definer)
-- und lassen sich anschliessend von niemandem mehr verändern.

-- =====================================================================
--  Sicht für das Portfolio: ohne die vollständigen Projektdaten
-- =====================================================================
create or replace view portfolio_sicht as
select
  p.id, p.name, p.ort, p.kanton, p.status, p.startjahr,
  p.kpi, p.version, p.archiviert_am, p.geaendert_am,
  v.name  as geaendert_von_name,
  v.email as geaendert_von_email
from projekte p
left join profil v on v.id = p.geaendert_von;

-- =====================================================================
--  Fertig. Nächster Schritt: Projekt-URL und öffentlichen Schlüssel
--  (anon key) in app/config.js eintragen.
-- =====================================================================
