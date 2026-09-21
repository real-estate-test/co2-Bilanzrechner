-- =====================================================================
--  Nachtrag 03 · Belege zum Baurecht-Check
--
--  Legt den Ablageort «baurecht» an, in dem die Screenshots zu den
--  Prüfpunkten liegen — der Paragraph, auf den sich ein Eintrag stützt,
--  der Zonenplanausschnitt, die Seite aus der BNO.
--
--  Warum eine Dateiablage und nicht das Projekt-JSON: Die Projektdatei
--  wird bei jeder Eingabe vollständig übertragen und bei jedem Stichtag
--  vollständig kopiert. Ein einziger Screenshot einer BNO-Seite wiegt
--  mehrere hundert Kilobyte; ein Dutzend davon im Projekt-JSON hiesse,
--  dass jede geänderte Zahl mehrere Megabyte über die Leitung schickt
--  und jeder Quartalsstand sie erneut ablegt. Im Projekt steht deshalb
--  nur der Verweis auf die Datei.
--
--  Der Ablageort ist NICHT öffentlich. Auf den Screenshots stehen
--  Projektunterlagen; ein öffentlicher Bucket wäre ohne Anmeldung
--  abrufbar, sobald jemand den Pfad kennt. Gelesen wird ausschliesslich
--  mit angemeldetem Zugang, geschrieben nur mit Bearbeitungsrecht.
--
--  Pfadschema:  <projekt_id>/<pruefpunkt_id>/<zufalls_id>.<endung>
--  Das «on delete cascade» der Projekte greift hier nicht — Dateien
--  hängen nicht an Tabellenzeilen. Der letzte Abschnitt unten räumt
--  verwaiste Belege auf; er läuft von Hand, nicht automatisch.
--
--  Im SQL-Editor von Supabase ausführen. Das Skript ist wiederholbar:
--  Ein zweiter Lauf ändert nichts.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Ablageort
--
--  file_size_limit greift zusätzlich zur Verkleinerung im Browser. Die
--  Anwendung bringt Bilder vor dem Hochladen auf 1600 Pixel Breite und
--  landet damit üblicherweise unter 400 KB; die 5 MB hier sind die
--  harte Grenze für den Fall, dass diese Rechnung einmal nicht aufgeht.
--
--  allowed_mime_types schliesst alles aus, was kein Bild ist. Ohne die
--  Liste liesse sich über denselben Weg beliebiger Inhalt ablegen.
-- ---------------------------------------------------------------------
--  Der Einschub steht bewusst in einem Block, der seinen Fehler
--  abfängt. Der SQL-Editor führt das ganze Skript in EINER Transaktion
--  aus: Bricht das Anlegen hier ab — in neueren Projekten ist die
--  Rolle «postgres» im Schema «storage» eingeschränkt —, würde ohne
--  diesen Block auch alles Folgende zurückgerollt. Man stünde dann
--  ohne Ablageort UND ohne Zugriffsregeln da, und die Anwendung meldet
--  «Bucket not found», ohne dass ersichtlich wäre, woran es liegt.
--
--  Geht es nicht per SQL, führt der Weg über das Dashboard:
--    Storage -> New bucket -> Name «baurecht», Public AUS -> Save
--  Danach dieses Skript erneut laufen lassen; die Zugriffsregeln
--  unten werden dann gesetzt.
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('baurecht', 'baurecht', false, 5242880,
          array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do update
     set public             = false,
         file_size_limit    = excluded.file_size_limit,
         allowed_mime_types = excluded.allowed_mime_types;
  raise notice 'Ablageort «baurecht» steht.';
exception when others then
  raise warning 'Der Ablageort liess sich nicht per SQL anlegen: %', sqlerrm;
  raise warning 'Bitte im Dashboard unter Storage einen PRIVATEN Bucket namens '
                '«baurecht» anlegen (Public ausgeschaltet) und dieses Skript '
                'danach erneut ausführen.';
end $$;

-- ---------------------------------------------------------------------
--  Zugriffsregeln
--
--  Gleicher Zuschnitt wie bei den Projekten: Lesen darf jeder
--  angemeldete Zugang, Schreiben und Löschen nur, wer bearbeiten darf.
--
--  Anders als beim Löschen eines ganzen Projekts reicht hier das
--  Bearbeitungsrecht: Ein Beleg ist Projektinhalt, und wer ein falsches
--  Bild eingefügt hat, muss es selbst wieder wegnehmen können, ohne den
--  Verwalter zu rufen.
-- ---------------------------------------------------------------------
--  Aus demselben Grund wie oben gekapselt: «storage.objects» gehört
--  der Rolle «supabase_storage_admin». Darf die eigene Rolle dort
--  keine Regeln setzen, soll das Skript das sagen — und nicht den
--  bereits angelegten Ablageort wieder mit zurückreissen.
do $$
begin
  execute 'drop policy if exists baurecht_belege_lesen on storage.objects';
  execute 'create policy baurecht_belege_lesen on storage.objects
             for select to authenticated
             using (bucket_id = ''baurecht'')';

  execute 'drop policy if exists baurecht_belege_anlegen on storage.objects';
  execute 'create policy baurecht_belege_anlegen on storage.objects
             for insert to authenticated
             with check (bucket_id = ''baurecht'' and public.darf_bearbeiten())';

  execute 'drop policy if exists baurecht_belege_ersetzen on storage.objects';
  execute 'create policy baurecht_belege_ersetzen on storage.objects
             for update to authenticated
             using (bucket_id = ''baurecht'' and public.darf_bearbeiten())
             with check (bucket_id = ''baurecht'' and public.darf_bearbeiten())';

  execute 'drop policy if exists baurecht_belege_loeschen on storage.objects';
  execute 'create policy baurecht_belege_loeschen on storage.objects
             for delete to authenticated
             using (bucket_id = ''baurecht'' and public.darf_bearbeiten())';

  raise notice 'Zugriffsregeln für die Belege stehen.';
exception when others then
  raise warning 'Die Zugriffsregeln liessen sich nicht setzen: %', sqlerrm;
  raise warning 'Ersatzweise im Dashboard unter Storage -> baurecht -> Policies '
                'vier Regeln für «authenticated» anlegen: SELECT frei, '
                'INSERT/UPDATE/DELETE mit der Bedingung public.darf_bearbeiten().';
end $$;

-- ---------------------------------------------------------------------
--  Verwaiste Belege finden
--
--  Wird ein Projekt gelöscht, bleiben seine Dateien liegen — die
--  Fremdschlüsselregel der Tabelle reicht nicht in die Dateiablage
--  hinein. Diese Abfrage zeigt, was zu keinem Projekt mehr gehört.
--  Sie löscht nichts; erst der auskommentierte Befehl darunter tut das.
--
--  Absichtlich von Hand: Ein Auslöser, der beim Projektlöschen Dateien
--  mitnimmt, würde auch dann zuschlagen, wenn jemand versehentlich
--  löscht und die Zeile aus einer Sicherung zurückholen will.
-- ---------------------------------------------------------------------
select o.name as verwaister_beleg,
       split_part(o.name, '/', 1) as projekt_id,
       pg_size_pretty((o.metadata ->> 'size')::bigint) as groesse,
       o.created_at
  from storage.objects o
 where o.bucket_id = 'baurecht'
   and not exists (select 1 from projekte p
                    where p.id = split_part(o.name, '/', 1))
 order by o.created_at;

-- Zum Aufräumen die nächste Zeile von Hand ausführen:
-- delete from storage.objects o
--  where o.bucket_id = 'baurecht'
--    and not exists (select 1 from projekte p
--                     where p.id = split_part(o.name, '/', 1));

-- ---------------------------------------------------------------------
--  Prüfung: steht alles?
-- ---------------------------------------------------------------------
select 'Ablageort baurecht'::text as gegenstand,
       (case when exists (select 1 from storage.buckets where id = 'baurecht')
             then 'ok' else 'FEHLT' end)::text as stand
union all
select 'Ablageort ist nicht öffentlich'::text,
       (case
          when not exists (select 1 from storage.buckets where id = 'baurecht')
            then '– (Ablageort fehlt)'
          when exists (select 1 from storage.buckets
                        where id = 'baurecht' and public = false)
            then 'ok'
          else 'ACHTUNG: öffentlich — Belege wären ohne Anmeldung abrufbar'
        end)::text
union all
select ('Regel ' || r)::text,
       (case when exists (select 1 from pg_policies
                           where schemaname = 'storage'
                             and tablename = 'objects'
                             and policyname = r)
             then 'ok' else 'FEHLT' end)::text
from unnest(array['baurecht_belege_lesen', 'baurecht_belege_anlegen',
                  'baurecht_belege_ersetzen', 'baurecht_belege_loeschen']) as r;
