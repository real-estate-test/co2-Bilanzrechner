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
--  Rechteregeln
-- ---------------------------------------------------------------------
alter table sitzungen enable row level security;



-- ---------------------------------------------------------------------
--  Kontrolle. Erwartet wird:
--    sitzungen | true | 4      (Rechteregeln aktiv, vier Regeln)
-- ---------------------------------------------------------------------
select
  c.relname                                        as tabelle,
  c.relrowsecurity                                 as rechteregeln_aktiv,
  (select count(*) from pg_policies p
     where p.schemaname = 'public' and p.tablename = c.relname) as regeln
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'sitzungen';
