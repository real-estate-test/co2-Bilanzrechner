# Projektrechner · Immobilienentwicklung

Bewertungstool für Immobilienprojekte: von der Akquisition über die Baukosten nach BKP
bis zur Verwertung, Finanzierung und dem laufenden Portfolio-Tracking.

Reine Webanwendung ohne Build-Schritt und ohne Fremdbibliotheken.

Zwei Betriebsarten:

| | **Lokal** | **Firmenbetrieb** |
|---|---|---|
| Einrichtung | keine — `index.html` öffnen | Supabase-Projekt, ca. 10 Minuten |
| Daten | nur im Browser des Anwenders | gemeinsame Datenbank |
| Anmeldung | keine | E-Mail und Passwort |
| Rollen | — | Betrachter / Bearbeiter / Verwalter |
| Portfolio | eigene Projekte | alle Projekte der Firma |
| Protokoll | — | lückenlos, unveränderlich |
| Kosten | 0 | 0 (siehe [Betrieb](#firmenbetrieb-einrichten)) |

Solange `app/config.js` leer ist, läuft die Anwendung lokal. Das Eintragen der
Verbindung schaltet den Firmenbetrieb frei — am Rechenkern und an der
Bedienung ändert sich dabei nichts.

---

## Was das Werkzeug abbildet

**Szenarien**

| Szenario | Inhalt |
|---|---|
| Grüne Wiese · Neubau | Erwerb unbebaut, anschliessend Neubau |
| Bestand · Abriss & Neubau | Erwerb mit Gebäude, Rückbau, Neubau |
| Bestand · Sanierung | Sanierung ohne Neubauvolumen |
| Bestand · Sanierung & Erweiterung | Sanierung plus Aufstockung oder Anbau |

**Nutzungen** Je Gebäudeteil beliebig viele frei benannte Zeilen mit einer Art
aus Wohnen · Büro · Gewerbe · Verkauf (Retail) · Lager · Parkplatz. So lassen
sich «Wohnen Stockwerkeigentum» und «Wohnen Miete» im selben Projekt trennen —
eine Fläche gehört immer genau einer Zeile und wird deshalb nur einmal gezählt.

**Verwertung** je Nutzung und Gebäudeteil getrennt wählbar: Halten vermietet,
Halten selbstgenutzt, Verkauf als Stockwerkeigentum, Exit an einen Investor zu
einer Zielbruttorendite. Ein Projekt darf alle vier Arten gleichzeitig enthalten.

**Flächen** wahlweise über die Ausnützungsziffer, als anrechenbare Geschossfläche
direkt oder aus einer Studie. Die Kaskade:

```
aGF = Grundstück × Ziffer × (1 + Bonus)     oder direkt erfasst
aGF ÷ Vollgeschosse       = Gebäudegrundfläche     ← ohne Attika
Grundstück − Grundfläche  = Umgebungsfläche
Grundfläche × UG-Quote    = Untergeschoss          (Vorgabe 80 %)
PP × Fläche je PP         = Einstellhalle
aGF × Faktor + Attika     = Geschossfläche oberirdisch
GF o.i. × HNF-Quote       = Nutzfläche NWF         (Vorgabe 78 %)
```

**Geschosse sind Vollgeschosse ohne Attika.** Ist die Attika nicht anrechenbar,
kommt ihre Fläche (Vorgabe 60 % der Gebäudegrundfläche) zusätzlich zur aGF hinzu;
ist sie anrechenbar, steckt sie bereits darin. Der Fussabdruck — und damit die
Umgebungsfläche — bemisst sich immer am Vollgeschoss.

Kubaturen wahlweise über Höhen (Regelgeschoss 3.00 m, Attika 3.20 m,
Untergeschoss und Einstellhalle je 3.40 m) oder als direkt erfasstes Volumen,
aus dem sich die Höhen ergeben.

**Formeln in Zahlenfeldern** Jedes Zahlenfeld nimmt statt einer Zahl auch eine Rechnung
entgegen — `2500*0.9`, `(120+80)*3`, `1'250+250`. Ein führendes `=` ist erlaubt, aber nicht
nötig. Beim Hineinklicken erscheint die Formel, beim Verlassen das Ergebnis; eine kleine
Ecke am Feld markiert eine hinterlegte Formel, und der Bericht führt sie in der
Annahmenliste. Ausgewertet wird über einen eigenen Parser, **nicht** über `eval` — Formeln
werden gespeichert und wandern über den Server zu allen Mitarbeitenden. Eine unfertige
Eingabe wie `2500*` lässt den bisherigen Wert stehen und markiert das Feld, statt auf null
zu fallen. Verweise auf andere Felder gibt es bewusst nicht.

**Kapitalbedarf** Die Baukosten werden wahlweise automatisch verteilt (je Kostenart über
die passende Phase, S-Kurve oder linear) oder mit festen Prozentwerten je Projektphase —
Entwicklung, Bewilligung, Vorbereitung, Bau. Die Prozentwerte werden auf 100 % normiert,
Phasen der Dauer null entfallen und ihr Anteil verteilt sich auf die übrigen.

**Immobiliengefässe** Jedes Projekt lässt sich einer Firma zuordnen; die Liste pflegt der
Verwalter unter Verwaltung. Das Portfolio filtert danach und zeigt die Gefässe zusätzlich
nebeneinander — je Firma und über alles.

**Erwerbskosten** Kaufpreis wahlweise als Total, CHF/m² Land oder CHF/m² aGF, dazu
Notariat, Grundbuch, Handänderungssteuer mit Käuferanteil, Einkaufskommission,
Entwicklungshonorar, Due Diligence, Geometer, Rechtsberatung und
Mehrwertabgabe. Die Bezugsgrösse des Entwicklungshonorars sind in der Vorgabe
die Erwerbskosten ohne dieses Honorar zuzüglich der Baukosten ohne das
Projektmanagement-Honorar BKP 599; die Dritthonorare BKP 558.1 zählen mit.
Wahlweise auch auf Anlagekosten, Landwert oder Projektgewinn. Alternativ Baurecht mit Einmalentschädigung und Baurechtszins.
Kantonale Richtwerte für AG · SO · ZH · LU · BE · BS · BL sind hinterlegt.

**Baukosten** nach BKP, auf die praxisrelevanten Gruppen verdichtet:

| BKP | Zeile | Menge |
|---|---|---|
| 1 | Rückbau, Altlasten | m³ Bestand bzw. pauschal |
| 1 | Vorbereitungsarbeiten | % von BKP 20–29 vor Reserve |
| 1 | Anpassungen an bestehende Bauten | m² Grundstücksfläche |
| 1 | Pfählung/Wasserhaltung, Erschliessung | pauschal |
| 20–29 | Gebäude oberirdisch · Stockwerkeigentum | m³ Kubatur aus dem Nutzungsmix |
| 20–29 | Gebäude oberirdisch · Miete | m³ Kubatur aus dem Nutzungsmix |
| 20–29 | Gebäude oberirdisch · Gewerbe | m³ Kubatur aus dem Nutzungsmix |
| 20–29 | Untergeschoss | m³ |
| 20–29 | Einstellhalle | m³ |
| 202 | Reserve | % von BKP 20–29 vor Reserve + Vorbereitungsarbeiten |
| 3 · 4 | Betriebseinrichtungen, Umgebung | pauschal, m² |
| 558.1 | Dritthonorare | % von BKP 1–4 |
| 5 | Baunebenkosten | % von BKP 20–29 inkl. Reserve |
| 599 | Projektmanagement-Honorar | % von BKP 1–5 |
| 9 | Ausstattung | m² NWF |

Die prozentualen Zeilen laufen in fester Reihenfolge, weil sie aufeinander
aufbauen: zuerst die Vorbereitungsarbeiten auf die fünf Gebäudezeilen
BKP 20–29, dann die Reserve auf dieselbe Grösse **zuzüglich** der
Vorbereitungsarbeiten — deren Prozentwert wirkt damit bewusst ein zweites Mal.
Danach die Dritthonorare auf BKP 1–4 inklusive Reserve, die Baunebenkosten
ausschliesslich auf BKP 20–29 inklusive Reserve, zuletzt das
Projektmanagement-Honorar auf BKP 1–5 ohne sich selbst. Jede Zeile trägt ihre
Formel als Hinweis unter der Bezeichnung.

Die Kennwerte der BKP 20–29 sind Vollkosten inklusive Gebäudetechnik, Ausbau und
Planerhonoraren; der Ausbaustandard unterscheidet sich zwischen verkauftem
Wohnraum, Mietwohnungen und Gewerbe deutlich, deshalb die Dreiteilung. Welche
Nutzungszeile in welche Kostengruppe fällt, ist je Zeile einstellbar.

Je Zeile ist die Bezugsgrösse frei wählbar, eigene Zeilen lassen sich ergänzen.
Bis zu drei Kostenblöcke (Neubau, Erweiterung, Sanierung) mit eigenen Kennwerten.

**Erträge** Mietzinsen je Nutzungszeile, Verkaufspreise je m². Der optionale
**Wohnungsspiegel** kommt zum Zug, sobald einzelne Einheiten bepreist werden
sollen: Jede Einheit wird einer Nutzungszeile zugeordnet und erbt von dort Art
und Verwertung; Fläche und Durchschnittspreis der Zeile ergeben sich dann aus den
Einheiten. Ohne Spiegel gilt der erfasste Durchschnittswert.

**Finanzierung** Eigenkapitalquote und Belehnungsdeckel, getrennte Zinssätze vor
und nach der Baubewilligung, Bereitstellungskommission, kalkulatorische
Eigenkapitalverzinsung. Der Vorverkauf wirkt zweifach: über eine frei definierbare
Staffel senkt er den Zinssatz, über den Zahlungsplan entlasten die Käuferzahlungen
den Baukredit.

**Ergebnis** Anlagekosten, Projektgewinn, Marge, Rendite auf Eigenkapital,
interner Zinsfuss, Spitzenkapitalbedarf, Brutto- und Nettorendite,
Wasserfalldarstellung, Cashflow und Kapitalbindung im Jahresraster.

**Analyse** Sensitivität als Tornado über sieben Parameter sowie die
Rückwärtsrechnung des residualen Landwerts bei Zielmarge.

**Portfolio** Kennzahlen aller Projekte mit Ampeln gegen die Zielwerte, dazu drei
zusammengeführte Darstellungen auf gemeinsamer Kalenderachse.

Ein **Statusfilter mit Mehrfachauswahl** steuert die ganze Seite, nicht nur die
Liste — Summen, Terminplan, Kapitalbedarf und Cashflow folgen ihm. So bleiben
Projekte aus Akquisition und Prüfung aus dem Reporting draussen. Drei
Vier Voreinstellungen stehen bereit: *alle*, *keine*, *Entwicklung* (Prüfung bis
Entwicklung) und *Realisation* (Baubewilligung bis Vermarktung — die laufenden
Projekte). Über *keine* leert man die Auswahl und schaltet danach gezielt eine
oder zwei Phasen ein. Die Auswahl bleibt über
Sitzungen hinweg erhalten.

- **Terminplan** — ein Balken je Projekt mit allen Phasen, darunter die Anzahl
  gleichzeitig in Ausführung stehender Projekte
- **Kapitalbedarf** — gebundene Eigen- und Fremdmittel je Jahr
- **Cashflow** — Ausgaben, Einnahmen und kumulierter Saldo je Jahr

**Tracking** Soll-Ist-Vergleich je Kostenposition mit CSV-Einlesung sowie
Snapshots, die einen Projektstand einfrieren und gegen heute stellen.

Ein erfasster **Ist-Wert ersetzt den gerechneten Betrag** in der Kalkulation.
Nachgelagerte Grössen ziehen automatisch nach: die Reserve auf BKP 20–29, die
Baunebenkosten, das Projektmanagement-Honorar und damit Marge und Rendite. Leere
Felder gelten als noch offen und rechnen weiter mit der Schätzung. Über den
Umschalter lässt sich die Übernahme abstellen, wenn nur verglichen werden soll.

---

## Bedienung

**Detailtiefe** Der Umschalter links blendet Felder ein und aus:

- *Schnell* — die wesentlichen Grössen für den ersten Grobcheck
- *Standard* — übliche Bearbeitungstiefe
- *Detail* — alle Positionen

Ausgeblendete Felder rechnen mit ihren hinterlegten Werten weiter; die Detailtiefe
verändert das Ergebnis nicht.

**Datenherkunft** Der kleine Punkt neben jeder Feldbeschriftung markiert, woher
eine Zahl stammt — Standardwert (grau), Annahme (orange) oder belegt (grün), mit
Platz für die Quelle. Alle abweichenden Werte erscheinen gesammelt in der
Annahmenliste des Berichts.

**Plausibilität** Kennwerte ausserhalb der hinterlegten Bandbreiten färben sich
orange. Das ist ein Hinweis, keine Sperre.

**Varianten vergleichen** «Duplizieren» erzeugt eine Kopie des Projektes. So
lassen sich Abriss/Neubau und Sanierung nebeneinanderstellen; die Portfolio-Seite
zeigt beide Varianten mit ihren Kennzahlen.

---

## Firmenbetrieb einrichten

Vier Schritte, keine IT-Abteilung nötig.

**1 · Datenbank anlegen.** Auf [supabase.com](https://supabase.com) ein kostenloses
Projekt erstellen, Region **Frankfurt** (EU). Das Konto muss auf die Firma laufen,
nicht auf eine Privatperson.

**2 · Schema einspielen.** Den Inhalt von `db/schema.sql` im SQL-Editor einfügen
und ausführen. Das legt Tabellen, Rechteregeln, Auslöser und das Protokoll an.

**3 · Verbinden.** Aus *Project Settings › API* die beiden Werte in `app/config.js`
eintragen:

```js
window.APP_CONFIG = {
  url: 'https://xxxx.supabase.co',
  key: 'eyJhbGci…'          // anon public key
};
```

Der `anon key` ist zur Veröffentlichung bestimmt und für sich genommen wertlos —
wer was sehen und ändern darf, entscheiden ausschliesslich die Rechteregeln in
der Datenbank.

**4 · Erstes Konto.** Auf der Anmeldemaske *Konto anlegen* wählen. **Das erste
Konto wird automatisch Verwalter.** Danach ist die Registrierung geschlossen, bis
der Verwalter unter *Verwaltung › Registrierung* die Firmendomäne freigibt. Neue
Konten starten immer als Betrachter und werden dort hochgestuft.

### Zwei Wartungsaufträge

Der kostenlose Plan hat zwei Schwächen, die beide kostenlos geschlossen werden.
Beide Aufträge liegen unter `.github/workflows/` und brauchen nur die Secrets
unter *Settings › Secrets and variables › Actions*:

| Auftrag | Secrets | Wozu |
|---|---|---|
| `wachhalter.yml` | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Der kostenlose Plan pausiert nach 7 Tagen Ruhe. Zwei Anfragen pro Woche verhindern das. |
| `sicherung.yml` | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `BACKUP_PASSPHRASE` | Der kostenlose Plan hält keine Sicherung vor. Wöchentliche Ausleitung nach `sicherungen/`, versioniert über die Git-Historie. |

Der `service_role key` umgeht alle Rechteregeln und gehört **ausschliesslich** in
die GitHub-Secrets — niemals in `app/config.js`.

### Warum die Sicherung verschlüsselt ist

Damit GitHub Pages ohne Bezahlplan ausliefert, muss das Repository öffentlich
sein. Der Anwendungscode darf das sein — die Projektdaten nicht. Die Ausleitung
wird deshalb vor dem Ablegen mit AES-256 verschlüsselt. Fehlt
`BACKUP_PASSPHRASE`, bricht der Auftrag ab, statt Klartext zu veröffentlichen.

Das Kennwort gehört in einen Passwortmanager, **nicht** nur in die
GitHub-Secrets: Ohne es ist jede Sicherung wertlos.

Wiederherstellen:

```
gpg --decrypt sicherungen/stand-2026-08-12.json.gpg > stand.json
```

Die entstehende Datei enthält alle Tabellen und lässt sich im SQL-Editor oder
über die Import-Funktion der Anwendung zurückspielen.

### Was im öffentlichen Repository sichtbar ist

| | sichtbar | warum unproblematisch |
|---|---|---|
| Anwendungscode | ja | enthält keine Geschäftsdaten |
| `url` und `anon key` in `config.js` | ja | bauartbedingt öffentlich; die Rechteregeln in der Datenbank entscheiden über den Zugriff, nicht der Schlüssel |
| Projektdaten | **nein** | liegen in Supabase; die Sicherung im Repository ist verschlüsselt |
| `service_role key`, `BACKUP_PASSPHRASE` | **nein** | ausschliesslich als GitHub-Secrets |

Weil URL und Schlüssel damit jedem zugänglich sind, ist die Sperre der
Registrierung kein Beiwerk, sondern die eigentliche Zugangskontrolle: Ohne
freigegebene Firmendomäne kann sich niemand ein Konto anlegen.

### Rollen

| | lesen | anlegen, ändern, archivieren | endgültig löschen, Rollen, Zielwerte |
|---|:--:|:--:|:--:|
| Betrachter | ✓ | | |
| Bearbeiter | ✓ | ✓ | |
| Verwalter | ✓ | ✓ | ✓ |

**Löschen ist zweistufig.** Archivieren blendet ein Projekt aus Listen und
Portfolio aus, ist reversibel und jedem Bearbeiter erlaubt. Endgültiges Löschen
verlangt die Verwalterrolle, die Eingabe des Projektnamens und eine erneute
Passwortabfrage — und steht anschliessend im Protokoll.

Wichtig: Die Rechteprüfung liegt in der Datenbank, nicht im Browser. Ein
manipulierter Browser oder ein direkter Aufruf der Schnittstelle kommt nicht
daran vorbei. Die Abfragen in der Oberfläche verhindern Fehlgriffe, sie schützen
nicht.

### Gleichzeitiges Arbeiten

Jedes Projekt trägt einen Versionszähler. Speichert jemand, während eine andere
Person am selben Projekt arbeitet, wird der zweite Speichervorgang nicht still
ausgeführt, sondern meldet sich mit der Wahl: fremden Stand laden oder eigenen
durchsetzen. Beides landet im Protokoll.

Eingaben gehen sofort in den lokalen Entwurf und erst nach einer Ruhepause zum
Server. Bei Netzausfall bleiben sie im Browser erhalten.

---

## Aufbau

```
index.html            Grundgerüst
app/config.js         Verbindung zur Firmendatenbank (leer = lokaler Modus)
app/model.js          Datenmodell, Kennwertbibliothek, Kantonswerte, lokale Speicherung
app/engine.js         Rechenkern — reine Funktionen, ohne Oberfläche
app/api.js            Zugriff auf Datenbank und Anmeldung (nur fetch)
app/store-server.js   Speicherung in der Firmendatenbank
app/auth.js           Anmeldung, Sitzung, Passwortbestätigung
app/ui.js             Feldbausteine, Datenherkunft, Plausibilität
app/views.js          Eingabeseiten
app/results.js        Ergebnis, Analyse, Bericht
app/portfolio.js      Portfolio, Tracking, Archivieren, Import und Export
app/admin.js          Verwaltung, Protokoll, Anmerkungen
app/main.js           Zustand, Navigation, Kennzahlenleiste, Rollen
db/schema.sql         Tabellen, Rechteregeln, Auslöser
tests/engine.html     Selbsttest des Rechenkerns
```

Lokale und Serverspeicherung liegen hinter **derselben Schnittstelle**. Die
Oberfläche weiss nicht, woher die Daten kommen — deshalb blieben `engine.js`,
`views.js` und `results.js` beim Umbau auf den Firmenbetrieb unverändert.

Der Rechenkern kennt kein DOM. Dieselbe Funktion, die die Kennzahlenleiste
speist, rechnet auch die Sensitivität, den Bericht und die Portfolio-Aggregation —
damit gibt es keine zweite Stelle, an der dieselbe Zahl anders entstehen könnte.

---

## Rechenweise

**Zeitachse** Phasendauern werden in **Monaten** erfasst und bauen auf dem
Startdatum des Erwerbs auf. Gerechnet wird im Jahresraster; Cashflow und
Diagramme sind mit Kalenderjahren beschriftet. Zinsen laufen auf dem mittleren
Kapitalsaldo des Jahres.

**Baukostenverlauf** S-Kurve oder linear über die Bauzeit, Honorare ab
Projektbeginn, BKP 1 in der ersten Bauphase.

**Verkaufserlöse** Der Vorverkaufsanteil wird bis Baustart abgesetzt, der Rest
bis zum Ende der Vermarktungsphase. Innerhalb jedes Verkaufs greift der
Zahlungsplan (Beurkundung, Baustart, Rohbau, Übergabe).

**Gehaltene Flächen** fliessen in der Entwicklungsrechnung bei Projektende
kalkulatorisch zum Marktwert ein — bewusst erst nach der Zinsberechnung, damit
Bauzinsen nicht durch einen Zufluss gekürzt werden, den es real nicht gibt.
Die Bestandsrechnung auf der Seite *Betrieb* stellt dem eine Barwertrechnung über
die Haltedauer gegenüber.

**Fixpunkt** Entwicklungshonorar und Bauzinsen hängen von den Anlagekosten ab,
die beides enthalten. Die Rechnung iteriert bis zur Konvergenz unter einem Franken.

**Sollmiete und Rendite** Verkaufte Stockwerkeigentumsflächen erzeugen keine
Sollmiete — sie sind verkauft. Die Bruttorendite bezieht sich deshalb auf die
**anteiligen** Anlagekosten der Ertragsflächen, nicht auf die gesamten; bei
Mischprojekten wäre der Bezug auf alles verzerrt.

**Steuern** vereinfacht als ein effektiver Satz auf den Projektgewinn.
Kantonale Feinheiten der Grundstückgewinn- und Gewinnsteuer sind nicht modelliert.

---

## Selbsttest

`tests/engine.html` im Browser öffnen. Die Seite prüft 67 Referenzfälle —
Flächen- und Volumenkaskade, Nebenkostensätze, Kostengruppen, die Prozentkette
BKP 202 → 5 → 599, Verwertungsarten, Zeitverteilung, Vorverkaufsstaffel, internen
Zinsfuss, Residualwert, die Gewinnidentität und die Überführung alter
Projektdateien.

---

## Noch nicht gebaut

Das Reporting für den Verwaltungsrat ist die nächste Etappe:

- **Quartals-Stichtage** mit 14 Tagen Nachfrist und anschliessender Freigabe
  durch den Verwalter (die Tabelle `stichtage` steht bereits im Schema)
- **Abweichungsbrücke** — der Vergleich zweier Stichtage zerlegt die Veränderung
  des Gewinns nach Ursache: Flächen, Baukosten, Erlöse, Termine, Finanzierung
- **Halbjahresbericht** als PDF, auf Portfolioebene mit getrennt ausgewiesenen
  Zu- und Abgängen
- **Anwesenheitsanzeige** („wird gerade bearbeitet von …") — die Konflikterkennung
  beim Speichern ist bereits vorhanden

---

## Grenzen

Kantonale Gebühren und Steuersätze sind Richtwerte und vor Verwendung zu prüfen.
Die Kennwertbibliothek enthält marktübliche Bandbreiten, keine eigenen
Erfahrungswerte — sie sollte mit den eigenen Zahlen ersetzt werden.
Die Auswertung ersetzt keine Verkehrswertschätzung.
