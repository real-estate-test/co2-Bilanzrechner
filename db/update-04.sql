-- =====================================================================
--  Nachtrag 04 · Posteingang
--
--  Ein Landeplatz für Mails, aus denen eine Aufgabe werden soll. Man
--  fügt eine Mail ein, ohne sich sofort entscheiden zu müssen, in
--  welches Projekt sie gehört und wer sie erledigt — das kommt beim
--  Zuweisen.
--
--  Warum eine eigene Tabelle und nicht gleich eine Aufgabe: Aufgaben
--  hängen an einer Sitzung, Sitzungen an einem Projekt. Eine Mail, die
--  hereinkommt, kennt ihr Projekt nicht. Sie irgendeinem zuzuordnen
--  und später zu verschieben hiesse, dass sie zwischendurch im
--  falschen Projekt steht — in dessen Protokoll, dessen Auswertung,
--  dessen Aufgabenliste. Lieber wartet sie hier.
--
--  Der Posteingang ist zugleich der Anschlusspunkt für später: Kommen
--  Mails einmal über eine Weiterleitung oder aus Power Automate, füllen
--  sie dieselbe Tabelle. Am Tool ändert sich dann nichts.
--
--  Im SQL-Editor von Supabase ausführen. Das Skript ist wiederholbar:
--  Ein zweiter Lauf ändert nichts.
-- =====================================================================

create table if not exists posteingang (
  id             text primary key,

  -- was aus der Mail gelesen wurde
  betreff        text not null default '',
  inhalt         text not null default '',
  absender       text,                    -- Mailadresse
  absender_name  text,
  mail_datum     date,                    -- Datum der Mail, nicht des Einfügens

  -- woher der Eintrag kam; heute immer 'einfuegen', später auch
  -- 'weiterleitung' oder 'flow'
  quelle         text not null default 'einfuegen',

  -- wer ihn abgelegt hat und wann
  erfasst_von    uuid references profil(id),
  erfasst_am     timestamptz not null default now(),

  -- nach dem Zuweisen: wohin er gegangen ist
  --   Der Eintrag bleibt stehen, statt gelöscht zu werden. Wer eine
  --   Mail versehentlich ins falsche Projekt schiebt, sieht sonst
  --   nicht mehr, was ursprünglich dastand.
  projekt_id     text references projekte(id) on delete set null,
  sitzung_id     text,                    -- Sitzung, in der die Aufgabe liegt
  aufgabe_id     text,                    -- Id des Punktes in jener Sitzung
  zugewiesen_am  timestamptz,
  zugewiesen_von uuid references profil(id),

  -- weggelegt, ohne eine Aufgabe daraus zu machen
  verworfen_am   timestamptz
);

-- Die Liste wird immer nach «offen zuerst, neueste oben» gelesen.
create index if not exists posteingang_offen_idx
  on posteingang (erfasst_von, zugewiesen_am, verworfen_am, erfasst_am desc);

-- ---------------------------------------------------------------------
--  Zugriffsregeln
--
--  Der Posteingang ist persönlich: Was ich eingefügt habe, sehe und
--  bearbeite ich. Anders als bei den Projekten, die allen offenstehen —
--  eine eingefügte Mail kann Privates enthalten, das niemanden sonst
--  angeht, und sie ist noch keine Projektinformation.
--
--  Verwalter sehen alles. Ohne das käme niemand an Einträge heran,
--  wenn jemand das Haus verlässt.
-- ---------------------------------------------------------------------
alter table posteingang enable row level security;

drop policy if exists posteingang_lesen on posteingang;
create policy posteingang_lesen on posteingang
  for select to authenticated
  using (erfasst_von = auth.uid() or ist_verwalter());

drop policy if exists posteingang_anlegen on posteingang;
create policy posteingang_anlegen on posteingang
  for insert to authenticated
  with check (darf_bearbeiten() and erfasst_von = auth.uid());

drop policy if exists posteingang_aendern on posteingang;
create policy posteingang_aendern on posteingang
  for update to authenticated
  using (erfasst_von = auth.uid() or ist_verwalter())
  with check (erfasst_von = auth.uid() or ist_verwalter());

drop policy if exists posteingang_loeschen on posteingang;
create policy posteingang_loeschen on posteingang
  for delete to authenticated
  using (erfasst_von = auth.uid() or ist_verwalter());

-- ---------------------------------------------------------------------
--  Wer eingefügt hat, wird gesetzt statt geglaubt
--
--  Ohne diesen Auslöser müsste die Anwendung erfasst_von mitschicken,
--  und die Regel oben prüfte nur, ob sie die Wahrheit sagt. So steht
--  der Wert fest, bevor irgendeine Regel greift.
-- ---------------------------------------------------------------------
create or replace function posteingang_stempeln()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.erfasst_von := coalesce(new.erfasst_von, auth.uid());
    new.erfasst_am  := coalesce(new.erfasst_am, now());
  end if;
  if tg_op = 'UPDATE' and new.zugewiesen_am is distinct from old.zugewiesen_am
     and new.zugewiesen_am is not null then
    new.zugewiesen_von := coalesce(new.zugewiesen_von, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists posteingang_stempeln_tr on posteingang;
create trigger posteingang_stempeln_tr
  before insert or update on posteingang
  for each row execute function posteingang_stempeln();

-- ---------------------------------------------------------------------
--  Prüfung: steht alles?
-- ---------------------------------------------------------------------
select 'Tabelle posteingang'::text as gegenstand,
       (case when exists (select 1 from information_schema.tables
                           where table_schema = 'public' and table_name = 'posteingang')
             then 'ok' else 'FEHLT' end)::text as stand
union all
select 'Zeilenschutz aktiv'::text,
       (case when exists (select 1 from pg_tables
                           where schemaname = 'public' and tablename = 'posteingang'
                             and rowsecurity)
             then 'ok' else 'FEHLT' end)::text
union all
select ('Regel ' || r)::text,
       (case when exists (select 1 from pg_policies
                           where schemaname = 'public' and tablename = 'posteingang'
                             and policyname = r)
             then 'ok' else 'FEHLT' end)::text
from unnest(array['posteingang_lesen', 'posteingang_anlegen',
                  'posteingang_aendern', 'posteingang_loeschen']) as r
union all
select 'Auslöser posteingang_stempeln_tr'::text,
       (case when exists (select 1 from pg_trigger
                           where tgname = 'posteingang_stempeln_tr')
             then 'ok' else 'FEHLT' end)::text;
