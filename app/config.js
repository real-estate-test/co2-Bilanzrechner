/* =====================================================================
   Projektrechner · Verbindung zur Firmendatenbank

   Solange die beiden Werte leer sind, läuft die Anwendung im lokalen
   Modus wie bisher — alle Daten bleiben im Browser, keine Anmeldung.

   Für den Firmenbetrieb:
     1. Auf supabase.com ein kostenloses Projekt anlegen (Region Frankfurt)
     2. db/schema.sql im SQL-Editor einfügen und ausführen
     3. Aus «Project Settings › API» hier eintragen:
          url = Project URL
          key = anon public key
        Der anon key ist zur Veröffentlichung bestimmt. Er erlaubt für
        sich genommen keinen Datenzugriff — die Rechteregeln in der
        Datenbank entscheiden, wer was sehen und ändern darf.
   ===================================================================== */
window.APP_CONFIG = {
  url: '',
  key: '',

  /* Wie lange bleibt man angemeldet, ohne sich neu anzumelden (Tage). */
  sitzungstage: 30,

  /* Verzögerung in Millisekunden, bevor Änderungen zum Server gehen.
     Die Eingabe selbst bleibt davon unberührt und immer sofort. */
  speicherverzug: 2500
};
