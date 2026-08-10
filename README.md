# Projektrechner · Immobilienentwicklung

Bewertungstool für Immobilienprojekte: von der Akquisition über die Baukosten nach BKP
bis zur Verwertung, Finanzierung und dem laufenden Portfolio-Tracking.

Reine Webanwendung ohne Build-Schritt — `index.html` im Browser öffnen oder über
GitHub Pages ausliefern. Alle Projektdaten liegen im Browser des Anwenders
(localStorage) und lassen sich als JSON sichern und weitergeben.

---

## Was das Werkzeug abbildet

**Szenarien**

| Szenario | Inhalt |
|---|---|
| Grüne Wiese · Neubau | Erwerb unbebaut, anschliessend Neubau |
| Bestand · Abriss & Neubau | Erwerb mit Gebäude, Rückbau, Neubau |
| Bestand · Sanierung | Sanierung ohne Neubauvolumen |
| Bestand · Sanierung & Erweiterung | Sanierung plus Aufstockung oder Anbau |

**Nutzungen** Wohnen · Büro · Gewerbe · Verkauf (Retail) · Lager · Parkierung —
je Gebäudeteil frei mischbar.

**Verwertung** je Nutzung und Gebäudeteil getrennt wählbar: Halten vermietet,
Halten selbstgenutzt, Verkauf als Stockwerkeigentum, Exit an einen Investor zu
einer Zielbruttorendite. Ein Projekt darf alle vier Arten gleichzeitig enthalten.

**Flächen** wahlweise aus der Ausnutzung (Grundstück × AZ) oder direkt aus einer
Studie. Die Kaskade lautet aGF → GF oberirdisch → Untergeschoss → Nutzfläche NWF;
jeder Umrechnungsfaktor ist überschreibbar (HNF-Quote standardmässig 78 %).

**Erwerbskosten** Kaufpreis wahlweise als Total, CHF/m² Land oder CHF/m² aGF, dazu
Notariat, Grundbuch, Handänderungssteuer mit Käuferanteil, Einkaufskommission,
Entwicklungshonorar, Dritthonorare, Due Diligence, Geometer, Rechtsberatung und
Mehrwertabgabe. Alternativ Baurecht mit Einmalentschädigung und Baurechtszins.
Kantonale Richtwerte für AG · SO · ZH · LU · BE · BS · BL sind hinterlegt.

**Baukosten** nach BKP, auf die praxisrelevanten Gruppen verdichtet: BKP 1
(Rückbau, Altlasten, Anpassungen an bestehende Bauten, Pfählung/Wasserhaltung,
Erschliessung), BKP 20–22 Rohbau, BKP 23–26 Technik, BKP 27–28 Ausbau,
Parkierung je Parkplatz, BKP 29 Honorare, BKP 3, 4, 5 und 9. Je Zeile ist die
Bezugsgrösse wählbar (CHF/m² GF, CHF/m³ GV, CHF/m² NWF, CHF/PP, pauschal oder
prozentual). Die Reserve läuft auf BKP 1 + 2. Bis zu drei Kostenblöcke
(Neubau, Erweiterung, Sanierung) mit eigenen Kennwerten.

**Erträge** Mietzinsen je Nutzung, Verkaufspreise je m², optionaler Wohnungsspiegel
— sobald dieser erfasst ist, ersetzt sein Durchschnittspreis den Preis je m².

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

**Portfolio** Kennzahlen aller Projekte, Ampeln gegen die Zielwerte und der über
Kalenderjahre zusammengeführte Kapitalbedarf — er zeigt, wann sich Projekte in
der Finanzierung überlagern.

**Tracking** Soll-Ist-Vergleich je Kostenposition mit CSV-Einlesung sowie
Snapshots, die einen Projektstand einfrieren und gegen heute stellen.

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

## Aufbau

```
index.html            Grundgerüst
app/model.js          Datenmodell, Kennwertbibliothek, Kantonswerte, Speicherung
app/engine.js         Rechenkern — reine Funktionen, ohne Oberfläche
app/ui.js             Feldbausteine, Datenherkunft, Plausibilität
app/views.js          Eingabeseiten
app/results.js        Ergebnis, Analyse, Bericht
app/portfolio.js      Portfolio, Tracking, Import und Export
app/main.js           Zustand, Navigation, Kennzahlenleiste
tests/engine.html     Selbsttest des Rechenkerns
```

Der Rechenkern kennt kein DOM. Dieselbe Funktion, die die Kennzahlenleiste
speist, rechnet auch die Sensitivität, den Bericht und die Portfolio-Aggregation —
damit gibt es keine zweite Stelle, an der dieselbe Zahl anders entstehen könnte.

---

## Rechenweise

**Zeitachse** Jahresraster. Phasendauern dürfen dezimal sein (1,5 = achtzehn
Monate). Zinsen laufen auf dem mittleren Kapitalsaldo des Jahres.

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

**Steuern** vereinfacht als ein effektiver Satz auf den Projektgewinn.
Kantonale Feinheiten der Grundstückgewinn- und Gewinnsteuer sind nicht modelliert.

---

## Selbsttest

`tests/engine.html` im Browser öffnen. Die Seite prüft 26 Referenzfälle —
Flächenkaskade, Nebenkostensätze, Reservebasis, Verwertungsarten,
Zeitverteilung, Vorverkaufsstaffel, internen Zinsfuss, Residualwert und die
Gewinnidentität.

---

## Grenzen

Kantonale Gebühren und Steuersätze sind Richtwerte und vor Verwendung zu prüfen.
Die Kennwertbibliothek enthält marktübliche Bandbreiten, keine eigenen
Erfahrungswerte — sie sollte mit den eigenen Zahlen ersetzt werden.
Die Auswertung ersetzt keine Verkehrswertschätzung.
