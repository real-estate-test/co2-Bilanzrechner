-- =====================================================================
--  Nachtrag 01 · Sicherheitslücke schliessen
--
--  Im ursprünglichen Schema war die Ansicht portfolio_sicht angelegt.
--  Eine gewöhnliche Postgres-Ansicht läuft mit den Rechten ihres
--  Eigentümers und umgeht damit die Rechteregeln der zugrunde liegenden
--  Tabellen. Da Supabase Ansichten im Schema public über die
--  REST-Schnittstelle veröffentlicht und der anon key öffentlich ist,
--  hätte jede nicht angemeldete Person darüber Projektnamen, Orte und
--  sämtliche Kennzahlen abrufen können.
--
--  Die Ansicht wird von der Anwendung nicht benutzt. Sie wird deshalb
--  ersatzlos entfernt — das ist die sicherste Lösung.
--
--  Im SQL-Editor ausführen. Dauert einen Augenblick.
-- =====================================================================

drop view if exists portfolio_sicht;

-- ---------------------------------------------------------------------
--  Kontrolle: Diese Abfrage muss für jede Tabelle «true» zeigen.
--  Steht irgendwo «false», ist die betreffende Tabelle ungeschützt.
-- ---------------------------------------------------------------------
select
  tablename                          as tabelle,
  rowsecurity                        as rechteregeln_aktiv,
  (select count(*) from pg_policies p
    where p.tablename = t.tablename) as anzahl_regeln
from pg_tables t
where schemaname = 'public'
order by tablename;
