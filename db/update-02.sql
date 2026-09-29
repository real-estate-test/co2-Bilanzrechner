-- =====================================================================
--  Nachtrag 02 · Sitzungsprotokolle
--
--  Legt die Tabelle «sitzungen» an, in der die Protokolle stehen, und
--  ergänzt zwei firmenweite Einstellungen: das Adressbuch und die
--  Sitzungsreihen.
--
--  Warum eine eigene Tabelle und nicht das Projekt-JSON: Ein Protokoll
--  wird geschrieben, während jemand anders am selben Projekt rechnet.
--  Läge beides im selben Datensatz, würde der zweite Speichervorgang
--  den ersten verwerfen. Nebenbei bleibt die Projektdatei schlank —
--  sie wird bei jeder Eingabe vollständig übertragen.
--
--  Im SQL-Editor von Supabase ausführen. Das Skript ist wiederholbar:
--  Ein zweiter Lauf ändert nichts.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Sitzungsprotokolle
--
--  Eigene Tabelle statt Projekt-JSON: Ein Protokoll entsteht, während
--  jemand anders am selben Projekt rechnet — beide Stände würden sich
--  sonst gegenseitig verwerfen. Die Punkte liegen als JSON in der Zeile;
--  sie gehören zum Protokoll und werden immer zusammen gespeichert.
--
--  punkte = [{ id, phase, beteiligter, typ, text, termin, start,
--              status, erledigt_am, erledigt_in, bemerkung }]
--    phase       -> SIA-Phase (Gliederungsebene 1)
--    beteiligter -> Id aus der Adressliste des Projekts (Ebene 2)
--    typ         -> aufgabe | entscheid | info
--
--  version = optimistisches Sperren, wie bei den Projekten
-- ---------------------------------------------------------------------
create table if not exists sitzungen (
  id             text primary key,
  projekt_id     text not null references projekte(id) on delete cascade,
  reihe          text not null default 'bauherren',
  nummer         int  not null default 1,
  datum          date,
  zeit_von       text,
  zeit_bis       text,
  ort            text,
  verfasser      text,
  status         text not null default 'entwurf',
  versendet_am   timestamptz,
  teilnehmer     jsonb not null default '[]'::jsonb,
  entschuldigt   jsonb not null default '[]'::jsonb,
  verteiler      jsonb not null default '[]'::jsonb,
  punkte         jsonb not null default '[]'::jsonb,
  version        int  not null default 1,
  erstellt_von   uuid references profil(id),
  erstellt_am    timestamptz not null default now(),
  geaendert_von  uuid references profil(id),
  geaendert_am   timestamptz not null default now()
);

create index if not exists sitzungen_projekt_idx on sitzungen (projekt_id, datum desc);
create index if not exists sitzungen_punkte_idx  on sitzungen using gin (punkte);

-- Stempel und Versionszähler, wie bei den Projekten
create or replace function sitzung_stempeln()
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

drop trigger if exists auf_sitzung_schreiben on sitzungen;
create trigger auf_sitzung_schreiben
  before insert or update on sitzungen
  for each row execute function sitzung_stempeln();

-- ---------------------------------------------------------------------
--  Firmenweite Einstellungen nachziehen
-- ---------------------------------------------------------------------
insert into einstellungen (schluessel, wert) values
  ('adressen', '[]'::jsonb)
on conflict (schluessel) do nothing;

insert into einstellungen (schluessel, wert) values
  ('sitzungsreihen', '[
     {"id": "bauherren",     "kuerzel": "BHS", "label": "Bauherrensitzung"},
     {"id": "planer",        "kuerzel": "PS",  "label": "Planersitzung"},
     {"id": "baukommission", "kuerzel": "BK",  "label": "Baukommission"}
   ]'::jsonb)
on conflict (schluessel) do nothing;

-- ---------------------------------------------------------------------
--  Rollentyp. Steht in schema.sql, wird hier nur sicherheitshalber
--  angelegt — meine_rolle() gibt ihn zurück und liesse sich sonst
--  nicht erzeugen.
-- ---------------------------------------------------------------------
do $$ begin
  create type rolle as enum ('betrachter', 'bearbeiter', 'verwalter');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
--  Hilfsfunktionen der Rechteregeln
--
--  Sie stammen aus schema.sql und stehen hier noch einmal: Fehlt eine
--  davon, bricht Postgres den ganzen Block ab und rollt ihn zurück —
--  die Tabelle hätte dann aktive Rechteregeln, aber keine einzige
--  Regel, und niemand dürfte etwas. «create or replace» ändert nichts,
--  wo die Funktionen bereits stimmen.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
--  Rechteregeln
-- ---------------------------------------------------------------------
alter table sitzungen enable row level security;

drop policy if exists sitzungen_lesen on sitzungen;
create policy sitzungen_lesen on sitzungen
  for select to authenticated using (true);

drop policy if exists sitzungen_anlegen on sitzungen;
create policy sitzungen_anlegen on sitzungen
  for insert to authenticated with check (darf_bearbeiten());

-- Ein versendetes Protokoll ist verschickt und gilt: es lässt sich nur
-- noch von Verwaltern ändern. Korrekturen gehören ins nächste Protokoll.
drop policy if exists sitzungen_aendern on sitzungen;
create policy sitzungen_aendern on sitzungen
  for update to authenticated
  using (darf_bearbeiten() and (status <> 'versendet' or ist_verwalter()))
  with check (darf_bearbeiten());

drop policy if exists sitzungen_loeschen on sitzungen;
create policy sitzungen_loeschen on sitzungen
  for delete to authenticated
  using (ist_verwalter() or (darf_bearbeiten() and status <> 'versendet'));



-- ---------------------------------------------------------------------
--  Kontrolle. Der SQL-Editor zeigt nur das Ergebnis der letzten
--  Anweisung, deshalb steht hier alles in einer Abfrage.
--
--  Jede Zeile muss «ok» zeigen. Steht irgendwo «FEHLT», ist das Skript
--  nicht vollständig durchgelaufen — dann die Fehlermeldung des
--  Editors beachten und erneut ausführen.
-- ---------------------------------------------------------------------
select 'Tabelle sitzungen'::text as pruefpunkt,
       (case when to_regclass('public.sitzungen') is null then 'FEHLT' else 'ok' end)::text as befund
union all
select 'Rechteregeln aktiv'::text,
       (coalesce((select case when relrowsecurity then 'ok' else 'AUS' end
                   from pg_class where oid = to_regclass('public.sitzungen')), 'FEHLT'))::text
union all
select ('Regel ' || r)::text,
       (case when exists (select 1 from pg_policies
                           where schemaname = 'public' and tablename = 'sitzungen'
                             and policyname = r)
             then 'ok' else 'FEHLT' end)::text
from unnest(array['sitzungen_lesen', 'sitzungen_anlegen',
                  'sitzungen_aendern', 'sitzungen_loeschen']) as r
union all
select ('Funktion ' || fn)::text,
       (case when exists (select 1 from pg_proc pr
                           join pg_namespace n on n.oid = pr.pronamespace
                          where n.nspname = 'public' and pr.proname = fn)
             then 'ok' else 'FEHLT' end)::text
from unnest(array['meine_rolle', 'darf_bearbeiten', 'ist_verwalter']) as fn
union all
select ('Einstellung ' || k)::text,
       (case when exists (select 1 from einstellungen where schluessel = k)
             then 'ok' else 'FEHLT' end)::text
from unnest(array['adressen', 'sitzungsreihen']) as k;
