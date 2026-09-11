/* =====================================================================
   Projektrechner · Verbindung zur Firmendatenbank

   Solange die beiden Werte leer sind, läuft die Anwendung im lokalen
   Modus wie bisher — alle Daten bleiben im Browser, keine Anmeldung.

   Für den Firmenbetrieb:
     1. Auf supabase.com ein kostenloses Projekt anlegen (Region Frankfurt)
     2. db/schema.sql im SQL-Editor einfügen und ausführen
     3. Aus «Project Settings › API» hier eintragen:
          url = Project URL — nur der Grundteil, OHNE /rest/v1
                z. B. https://abcdefgh.supabase.co
          key = anon public key bzw. Publishable key
        Der anon key ist zur Veröffentlichung bestimmt. Er erlaubt für
        sich genommen keinen Datenzugriff — die Rechteregeln in der
        Datenbank entscheiden, wer was sehen und ändern darf.
   ===================================================================== */
window.APP_CONFIG = {
  url: 'https://gpgrcfuhbwaabucmpemf.supabase.co',
  key: 'sb_publishable_AVNoHya-d3dcdDoKgYmEaQ_XPAOubrr',

  /* Wie lange bleibt man angemeldet, ohne sich neu anzumelden (Tage). */
  sitzungstage: 30,

  /* Verzögerung in Millisekunden, bevor Änderungen zum Server gehen.
     Die Eingabe selbst bleibt davon unberührt und immer sofort. */
  speicherverzug: 2500,

  /* Kartenkacheln für die Standortkarte im Portfolio.
     Vorgabe: OpenStreetMap — kostenlos, kein Schlüssel, deckt die
     Schweiz und Deutschland gleich gut ab. Die Kachelserver von OSM
     sind für kleine Nutzung gedacht; wächst die Zahl der Anwender,
     lässt sich hier ohne Programmänderung auf einen bezahlten Anbieter
     umstellen (z. B. MapTiler oder Stadia Maps, dann mit Schlüssel in
     der Adresse). Die Namensnennung ist Pflicht und wird angezeigt. */
  kacheln: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  kachelnHinweis: '© OpenStreetMap-Mitwirkende',

  /* Adresssuche für die Koordinaten. Nominatim ist der Geocoder von
     OpenStreetMap: kostenlos, ohne Schlüssel, für Schweizer und
     deutsche Adressen. Gesucht wird nur auf Knopfdruck und einmal je
     Projekt — die Nutzungsregeln erlauben keine Massenabfragen. */
  adresssuche: 'https://nominatim.openstreetmap.org/search'
};
