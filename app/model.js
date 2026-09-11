/* =====================================================================
   Projektrechner · Datenmodell, Defaults, Kennwerte, Persistenz
   Klassisches Script (kein Build-Step) — Namespace window.APP
   ===================================================================== */
window.APP = window.APP || {};
(function (A) {
  'use strict';

  A.SCHEMA = 21;

  /* ---------------------------------------------------------------
     Stammlisten
     --------------------------------------------------------------- */

  /* Nutzungsarten. Die Bezeichnung einer Zeile ist frei, die Art bleibt
     aus dieser Liste — sie liefert die Marktbandbreiten für die Ampel. */
  A.NUTZUNGEN = [
    { id: 'wohnen',    label: 'Wohnen',              kurz: 'Wohnen',  einheit: 'm²' },
    { id: 'buero',     label: 'Büro',                kurz: 'Büro',    einheit: 'm²' },
    { id: 'gewerbe',   label: 'Gewerbe',             kurz: 'Gewerbe', einheit: 'm²' },
    { id: 'verkauf',   label: 'Verkauf (Retail)',    kurz: 'Retail',  einheit: 'm²' },
    { id: 'lager',     label: 'Lager / Nebenflächen',kurz: 'Lager',   einheit: 'm²' },
    { id: 'parkplatz', label: 'Parkplatz',           kurz: 'PP',      einheit: 'Stk.' }
  ];

  /* Zuordnung einer Nutzungszeile zu einer Baukostenzeile der BKP 20–29.
     Der Ausbaustandard unterscheidet sich zwischen verkauftem Wohnraum,
     Mietwohnungen und Gewerbe erheblich — deshalb getrennte Kennwerte. */
  A.KOSTENGRUPPEN = [
    { id: 'oi_stwe',    label: 'o.i. Stockwerkeigentum' },
    { id: 'oi_miete',   label: 'o.i. Miete' },
    { id: 'oi_gewerbe', label: 'o.i. Gewerbe' }
  ];

  /* Vorschlag der Kostengruppe aus Nutzungsart und Verwertung. */
  A.kostengruppeFuer = function (art, verwertung) {
    if (art === 'parkplatz') return 'oi_miete';
    if (art !== 'wohnen') return 'oi_gewerbe';
    return verwertung === 'stwe' ? 'oi_stwe' : 'oi_miete';
  };

  A.TEILE = [
    { id: 'bestand',     label: 'Bestand' },
    { id: 'neubau',      label: 'Neubau' },
    { id: 'erweiterung', label: 'Erweiterung / Aufstockung' }
  ];

  A.VERWERTUNG = [
    { id: 'halten_vermietet', label: 'Halten · vermietet' },
    { id: 'halten_selbst',    label: 'Halten · selbstgenutzt' },
    { id: 'stwe',             label: 'STWE-Verkauf' },
    { id: 'exit',             label: 'Exit an Investor' }
  ];

  A.SZENARIEN = [
    { id: 'neubau',               label: 'Grüne Wiese · Neubau',
      hint: 'Kauf einer unbebauten Liegenschaft, anschliessend Neubau.' },
    { id: 'abriss_neubau',        label: 'Bestand · Abriss & Neubau',
      hint: 'Kauf mit Bestandsgebäude, Rückbau, anschliessend Neubau.' },
    { id: 'sanierung',            label: 'Bestand · Sanierung',
      hint: 'Kauf mit Bestandsgebäude, Sanierung ohne Neubauvolumen.' },
    { id: 'sanierung_erweiterung',label: 'Bestand · Sanierung & Erweiterung',
      hint: 'Sanierung des Bestands plus Aufstockung/Anbau.' }
  ];

  A.STATUS = ['Idee', 'Prüfung', 'Akquisition', 'Entwicklung', 'Baubewilligung',
              'Realisierung', 'Vermarktung', 'Abgeschlossen', 'Verworfen'];

  /* ---------------------------------------------------------------
     Kantonale Richtwerte  —  ausdrücklich Richtwerte, immer editierbar
     --------------------------------------------------------------- */

  A.KANTONE = {
    ZH: { label: 'Zürich',       haend: 0.00, gbg: 0.25, gewinnsteuer: 20 },
    AG: { label: 'Aargau',       haend: 0.40, gbg: 0.20, gewinnsteuer: 18 },
    SO: { label: 'Solothurn',    haend: 2.20, gbg: 0.15, gewinnsteuer: 20 },
    LU: { label: 'Luzern',       haend: 1.50, gbg: 0.15, gewinnsteuer: 16 },
    BE: { label: 'Bern',         haend: 1.80, gbg: 0.20, gewinnsteuer: 21 },
    BS: { label: 'Basel-Stadt',  haend: 3.00, gbg: 0.15, gewinnsteuer: 22 },
    BL: { label: 'Basel-Land',   haend: 2.50, gbg: 0.20, gewinnsteuer: 20 },
    XX: { label: 'anderer Kanton', haend: 1.50, gbg: 0.20, gewinnsteuer: 20 }
  };

  /* ---------------------------------------------------------------
     Baukosten — Zeilenkatalog (BKP zusammengefasst)
     basis:
       pauschal      Betrag direkt
       gf            CHF je m² Geschossfläche (oberirdisch + UG ohne TG)
       gf_oi         CHF je m² Geschossfläche oberirdisch
       gv            CHF je m³ Gebäudevolumen
       gv_oi_*       CHF je m³ Kubatur oberirdisch je Kostengruppe
       nwf           CHF je m² Nutzfläche
       pp            CHF je Parkplatz
       umgebung      CHF je m² Umgebungsfläche
       gsf           CHF je m² Grundstücksfläche
       gv_bestand    CHF je m³ Gebäudevolumen Bestand (Abbruch)
       pct_bkp2      % der Summe BKP 20–29 vor Reserve
       pct_bkp1_2    % der Summe BKP 1 und 2
       pct_bkp1_4    % der Summe BKP 1–4
     --------------------------------------------------------------- */

  A.BASIS_LABELS = {
    pauschal:      'Pauschal',
    gf:            'CHF/m² GF',
    gf_oi:         'CHF/m² GF o.i.',
    gf_oi_stwe:    'CHF/m² GF STWE',
    gf_oi_miete:   'CHF/m² GF Miete',
    gf_oi_gewerbe: 'CHF/m² GF Gewerbe',
    gv:            'CHF/m³ GV',
    gv_oi:         'CHF/m³ o.i.',
    gv_oi_stwe:    'CHF/m³ STWE',
    gv_oi_miete:   'CHF/m³ Miete',
    gv_oi_gewerbe: 'CHF/m³ Gewerbe',
    gv_ug:         'CHF/m³ UG',
    gv_aeh:        'CHF/m³ Einstellhalle',
    f_ug:          'CHF/m² UG',
    f_aeh:         'CHF/m² Einstellhalle',
    nwf:           'CHF/m² NWF',
    pp:            'CHF/PP',
    umgebung:      'CHF/m² Umgeb.',
    gsf:           'CHF/m² GSF',
    gv_bestand:    'CHF/m³ GV Bestand',
    pct_bkp2:      '% von BKP 20–29',
    pct_bkp1_2:    '% von BKP 1–2',
    pct_bkp1_4:    '% von BKP 1–4',
    pct_bkp1_5:    '% von BKP 1–5'
  };

  /* Immobiliengefässe. Die Liste pflegt der Verwalter; im Einzelplatzbetrieb
     steht sie lokal. Firmen, die an einem Projekt bereits hängen, bleiben
     immer wählbar — sonst verlöre ein Projekt seine Zuordnung, nur weil ein
     Eintrag aus der Liste genommen wurde. */
  A.FIRMEN_LOKAL = 'projektrechner.firmen';

  A.firmenListe = function (projekte) {
    var liste = Array.isArray(A.firmen) ? A.firmen.slice() : null;
    if (!liste) {
      try { liste = JSON.parse(localStorage.getItem(A.FIRMEN_LOKAL) || '[]'); }
      catch (e) { liste = []; }
      if (!Array.isArray(liste)) liste = [];
    }
    (projekte || (A.state && A.state.p ? [A.state.p] : [])).forEach(function (q) {
      if (q && q.firma && liste.indexOf(q.firma) < 0) liste.push(q.firma);
    });
    return liste.filter(function (f, i, a) { return f && a.indexOf(f) === i; })
                .sort(function (a, b) { return a.localeCompare(b, 'de'); });
  };

  A.firmenSetzen = function (liste) {
    liste = (liste || []).map(function (f) { return String(f).trim(); })
                         .filter(function (f, i, a) { return f && a.indexOf(f) === i; });
    A.firmen = liste;
    try { localStorage.setItem(A.FIRMEN_LOKAL, JSON.stringify(liste)); } catch (e) {}
    return liste;
  };

  /* ---------------------------------------------------------------
     Adressen — Personen, die an Projekten mitwirken

     Die Liste wird einmal firmenweit gepflegt (Verwaltung); das Projekt
     hält nur, WER beteiligt ist und in welcher Rolle. So bleibt eine
     Mailadresse an einer Stelle aktuell, statt in zwanzig Projekten
     zu veralten. Fällt ein Eintrag später aus der zentralen Liste,
     rettet die Kopie im Projekt Name und Firma — die Beteiligung geht
     also nie verloren.
     --------------------------------------------------------------- */

  A.ADRESSEN_LOKAL = 'projektrechner.adressen';

  /* Häufige Rollen als Vorschlag. Frei überschreibbar — jedes Projekt
     hat Beteiligte, die in keine Liste passen. */
  A.PROJEKTROLLEN = [
    'Bauherrschaft', 'Projektentwicklung', 'Gesamtleitung', 'Architektur',
    'Bauleitung', 'Bauingenieur', 'HLKS-Planung', 'Elektroplanung',
    'Sanitärplanung', 'Brandschutz', 'Bauphysik / Akustik', 'Geometer',
    'Baurecht / Jurist', 'Totalunternehmer', 'Behörde', 'Vermarktung'
  ];

  A.adressenListe = function () {
    var liste = Array.isArray(A.adressen) ? A.adressen : null;
    if (!liste) {
      try { liste = JSON.parse(localStorage.getItem(A.ADRESSEN_LOKAL) || '[]'); }
      catch (e) { liste = []; }
      if (!Array.isArray(liste)) liste = [];
    }
    return liste.filter(function (a) { return a && (a.name || a.firma); })
                .map(function (a) {
                  return { id: a.id || A.uid(), kuerzel: a.kuerzel || '', name: a.name || '',
                           firma: a.firma || '', rolle: a.rolle || '',
                           mail: a.mail || '', telefon: a.telefon || '' };
                });
  };

  A.adressenSetzen = function (liste) {
    liste = (liste || []).filter(function (a) { return a && (a.name || a.firma); })
      .map(function (a) {
        return { id: a.id || A.uid(),
                 kuerzel: String(a.kuerzel || '').trim(), name: String(a.name || '').trim(),
                 firma: String(a.firma || '').trim(), rolle: String(a.rolle || '').trim(),
                 mail: String(a.mail || '').trim(), telefon: String(a.telefon || '').trim() };
      });
    A.adressen = liste;
    try { localStorage.setItem(A.ADRESSEN_LOKAL, JSON.stringify(liste)); } catch (e) {}
    return liste;
  };

  /* Ein Beteiligter, angereichert um die zentralen Stammdaten. Die
     Rolle gehört immer dem Projekt — dieselbe Person kann hier die
     Bauleitung und dort die Gesamtleitung führen. */
  A.beteiligter = function (b) {
    if (!b) return null;
    var z = b.adresse
      ? A.adressenListe().find(function (a) { return a.id === b.adresse; })
      : null;
    return {
      id: b.id, adresse: b.adresse || '', zentral: !!z,
      kuerzel: b.kuerzel || (z ? z.kuerzel : ''),
      name:    z ? z.name    : (b.name || ''),
      firma:   z ? z.firma   : (b.firma || ''),
      mail:    z ? z.mail    : (b.mail || ''),
      telefon: z ? z.telefon : (b.telefon || ''),
      rolle:   b.rolle || (z ? z.rolle : ''),
      verteiler: b.verteiler !== false
    };
  };

  A.beteiligteListe = function (p) {
    return ((p && p.beteiligte) || []).map(A.beteiligter).filter(Boolean);
  };

  /* ---------------------------------------------------------------
     Mailentwurf im Mailprogramm öffnen

     Outlook trennt Empfänger mit Semikolon; eine kommagetrennte Liste
     landet dort als eine einzige, unbrauchbare Adresse. Semikolon
     verstehen auch Thunderbird und Apple Mail, also gilt es überall.
     --------------------------------------------------------------- */

  A.MAIL_TRENNER = '; ';

  A.mailListe = function (adressen) {
    return (adressen || []).filter(Boolean).join(A.MAIL_TRENNER);
  };

  /* Adressen gehören unkodiert in die Adresszeile: encodeURIComponent
     macht aus dem @ ein %40, und ältere Mailprogramme zeigen das
     wörtlich an. Mailadressen bestehen ohnehin aus URL-sicheren
     Zeichen; nur Leerraum wird entfernt. Betreff und Text werden
     kodiert, dort steht beliebiger Text. */
  function adressteil(adressen) {
    return (adressen || [])
      .map(function (a) { return String(a || '').trim(); })
      .filter(Boolean)
      .join(';');
  }

  A.mailOeffnen = function (opts) {
    opts = opts || {};
    var teile = [];
    if (opts.betreff) teile.push('subject=' + encodeURIComponent(opts.betreff));
    if (opts.text) teile.push('body=' + encodeURIComponent(opts.text));
    if (opts.kopie && opts.kopie.length) teile.push('cc=' + adressteil(opts.kopie));

    var url = 'mailto:' + adressteil(opts.an) +
      (teile.length ? '?' + teile.join('&') : '');
    window.location.href = url;
    return url;
  };

  /* ---------------------------------------------------------------
     Protokolle und Termine

     Gliederung eines Protokolls: Phase → Beteiligter → Punkte. Die
     Nummern (2.1.3) werden daraus abgeleitet und nicht von Hand
     gepflegt — verschiebt sich ein Punkt in eine andere Phase, stimmt
     die Nummer trotzdem. Der Terminplan zeigt später dieselbe
     Gliederung, wahlweise nach Fristen sortiert.
     --------------------------------------------------------------- */

  /* Phasen nach SIA 102. «rechen» ordnet jede Phase einer der vier
     Rechenphasen zu — die Kalkulation kennt nur diese vier. */
  /* «gewicht» steuert nur den Terminvorschlag: Innerhalb einer
     Rechenphase teilen sich die SIA-Phasen den Zeitraum in diesem
     Verhältnis. Ein Vorprojekt dauert länger als eine strategische
     Planung — gleichmässige Drittel wären als Vorschlag wertlos.
     gewicht 0 heisst: keine eigene Zeitspanne (Sammelrubrik). */
  A.SIA_PHASEN = [
    { id: 'allgemein',   label: 'Allgemeines / Organisation', sia: '',   rechen: 'entwicklung', gewicht: 0 },
    { id: 'strategie',   label: 'Strategische Planung',       sia: '1',  rechen: 'entwicklung', gewicht: 0.5 },
    { id: 'vorstudien',  label: 'Vorstudien',                 sia: '2',  rechen: 'entwicklung', gewicht: 1 },
    { id: 'vorprojekt',  label: 'Vorprojekt',                 sia: '31', rechen: 'entwicklung', gewicht: 1.5 },
    { id: 'bauprojekt',  label: 'Bauprojekt',                 sia: '32', rechen: 'entwicklung', gewicht: 2 },
    { id: 'baubewilligung', label: 'Bewilligungsverfahren',   sia: '33', rechen: 'bewilligung', gewicht: 1 },
    { id: 'ausschreibung',  label: 'Ausschreibung',           sia: '41', rechen: 'vorbereitung', gewicht: 1.5 },
    { id: 'ausfuehrungsplanung', label: 'Ausführungsplanung',  sia: '51', rechen: 'vorbereitung', gewicht: 1 },
    { id: 'ausfuehrung', label: 'Ausführung',                 sia: '52', rechen: 'bau', gewicht: 9 },
    { id: 'abschluss',   label: 'Inbetriebnahme / Abschluss', sia: '53', rechen: 'bau', gewicht: 1 }
  ];

  A.phaseLabel = function (id) {
    var ph = A.SIA_PHASEN.find(function (x) { return x.id === id; });
    if (!ph) return 'ohne Phase';
    return ph.sia ? ph.label + ' (SIA ' + ph.sia + ')' : ph.label;
  };

  /* Was ein Protokollpunkt sein kann. Nur Aufgaben tragen einen Termin
     in den Plan; Entscheide sind Meilensteine, Infos bleiben Text. */
  A.PUNKT_TYPEN = [
    { id: 'aufgabe',   label: 'Aufgabe',  kurz: 'A', farbe: '#1f5fd0' },
    { id: 'entscheid', label: 'Entscheid', kurz: 'E', farbe: '#0d7a45' },
    { id: 'info',      label: 'Info',     kurz: 'I', farbe: '#6b7484' }
  ];

  /* Dringlichkeit eines Punktes. Ohne Angabe bleibt die Zeile ruhig —
     wäre alles eingestuft, sagte die Einstufung nichts mehr. */
  A.PRIORITAETEN = [
    { id: '',       label: '—',      kurz: '',  klasse: '' },
    { id: 'hoch',   label: 'hoch',   kurz: 'H', klasse: 'neg' },
    { id: 'mittel', label: 'mittel', kurz: 'M', klasse: 'warn' },
    { id: 'tief',   label: 'tief',   kurz: 'T', klasse: '' }
  ];

  A.prioritaet = function (id) {
    return A.PRIORITAETEN.find(function (x) { return x.id === (id || ''); }) ||
           A.PRIORITAETEN[0];
  };

  /* ---------------------------------------------------------------
     Themen — die zweite Ordnung neben den Phasen

     Die Phase sagt, WANN ein Punkt hingehört; das Thema, WORUM es
     geht. Über die Themen lassen sich Entscheide, Aufgaben und Infos
     später protokollübergreifend sammeln. Die Liste wird firmenweit
     gepflegt, damit «Kosten» in jedem Projekt dasselbe bedeutet.
     --------------------------------------------------------------- */

  A.THEMEN_LOKAL = 'projektrechner.themen';
  A.themen = null;

  A.THEMEN_STANDARD = [
    { id: 'kosten',       label: 'Kosten',                farbe: '#b0871f' },
    { id: 'termine',      label: 'Termine',               farbe: '#1f5fd0' },
    { id: 'qualitaet',    label: 'Qualität / Ausführung', farbe: '#0d7a45' },
    { id: 'bewilligung',  label: 'Bewilligung / Behörden', farbe: '#7c4dbe' },
    { id: 'vermarktung',  label: 'Vermarktung / Verkauf', farbe: '#c0568a' },
    { id: 'organisation', label: 'Organisation',          farbe: '#6b7484' }
  ];

  A.themenListe = function () {
    var liste = Array.isArray(A.themen) ? A.themen : null;
    if (!liste) {
      try { liste = JSON.parse(localStorage.getItem(A.THEMEN_LOKAL) || 'null'); }
      catch (e) { liste = null; }
    }
    if (!Array.isArray(liste) || !liste.length) liste = A.THEMEN_STANDARD;
    return liste.map(function (t) {
      return { id: t.id || A.uid(), label: t.label || 'Thema',
               farbe: t.farbe || '#6b7484' };
    });
  };

  A.themenSetzen = function (liste) {
    liste = (liste || []).filter(function (t) { return t && t.label; })
      .map(function (t) {
        return { id: t.id || A.uid(), label: String(t.label).trim(),
                 farbe: t.farbe || '#6b7484' };
      });
    A.themen = liste;
    try { localStorage.setItem(A.THEMEN_LOKAL, JSON.stringify(liste)); } catch (e) {}
    return liste;
  };

  A.thema = function (id) {
    if (!id) return null;
    return A.themenListe().find(function (t) { return t.id === id; }) || null;
  };

  /* Die Nummer eines Themas ist seine Stelle in der firmenweiten
     Liste — fest, nicht laufend. «Kosten» ist damit in jedem Protokoll
     Traktandum 3, und man findet dieselbe Sache über Sitzungen und
     Projekte hinweg unter derselben Nummer wieder. */
  A.themaNummer = function (id) {
    var i = A.themenListe().findIndex(function (t) { return t.id === id; });
    return i < 0 ? 0 : i + 1;
  };

  /* Die drei Zustände einer Aufgabe — sie sind zugleich die Spalten
     der Kanban-Ansicht. «übernommen» steht nicht zur Wahl: Diesen
     Zustand vergibt allein die Pendenzenübernahme, wenn eine Aufgabe
     in ein neues Protokoll wandert. */
  A.PUNKT_STATUS = [
    { id: 'offen',    label: 'offen' },
    { id: 'warten',   label: 'warten auf Rückmeldung' },
    { id: 'erledigt', label: 'erledigt' }
  ];

  A.STATUS_UEBERNOMMEN = 'uebernommen';

  A.statusLabel = function (id) {
    if (id === A.STATUS_UEBERNOMMEN) return 'übernommen';
    var st = A.PUNKT_STATUS.find(function (x) { return x.id === id; });
    return st ? st.label : (id || 'offen');
  };

  /* Eine Aufgabe ist erledigt, wenn sie nicht mehr auf jemanden
     wartet — übernommene zählen dazu, sie leben im neuen Protokoll
     weiter. */
  A.statusOffen = function (id) {
    return id !== 'erledigt' && id !== A.STATUS_UEBERNOMMEN;
  };


  /* ---------------------------------------------------------------
     Baurecht-Check — Sammlung des geltenden Baurechts je Projekt

     Der Katalog der Prüfpunkte wird firmenweit gepflegt, damit in
     jedem Projekt dieselben Fragen gestellt werden. Was zu einem
     Punkt gilt, steht im Projekt: ein Eintrag und eine Bemerkung,
     üblicherweise die Rechtsgrundlage. Der Katalog stammt aus der
     Baurecht-Checkliste und ist bewusst leer — Werte gehören ins
     Projekt, nicht in die Vorlage.
     --------------------------------------------------------------- */

  A.BAURECHT_LOKAL = 'projektrechner.baurecht';
  A.baurechtkatalog = null;

  A.BAURECHT_GRUPPEN = [
    { id: 'gst', label: 'Grundstück' },
    { id: 'zif', label: 'Ziffern / Boni' },
    { id: 'abs', label: 'Abstände / Begrenzungen' },
    { id: 'wei', label: 'Weiteres' },
    { id: 'gb', label: 'Grundbuch' },
  ];

  A.BAURECHT_KATALOG = [
    /* Grundstück */
    { id: 'gst_parzellennummer', gruppe: 'gst', label: 'Parzellennummer' },
    { id: 'gst_ort_kanton', gruppe: 'gst', label: 'Ort (Kanton)' },
    { id: 'gst_strasse', gruppe: 'gst', label: 'Strasse' },
    { id: 'gst_strassentypen', gruppe: 'gst',
      label: 'Strassentypen', hilfe: 'Kantonsstrassen? Gemeindestrassen …' },
    { id: 'gst_erschliessung_von', gruppe: 'gst',
      label: 'Erschliessung von', hilfe: 'Strassenname und Strassentyp' },
    { id: 'gst_grundstuecksflaeche_gsf', gruppe: 'gst',
      label: 'Grundstücksfläche (GSF)', rechen: 'grundstueck.flaeche' },
    { id: 'gst_anrechenbare_gsf', gruppe: 'gst', label: 'anrechenbare GSF' },
    { id: 'gst_zone', gruppe: 'gst', label: 'Zone' },
    { id: 'gst_zonennutzung', gruppe: 'gst', label: 'Zonennutzung' },
    { id: 'gst_bno_gueltig_vom', gruppe: 'gst', label: 'BNO gültig vom' },
    { id: 'gst_bno_revision', gruppe: 'gst', label: 'BNO revision?' },
    { id: 'gst_ivhb', gruppe: 'gst', label: 'IVHB' },
    /* Ziffern / Boni */
    { id: 'zif_ausnutzungsziffer_aussenwa', gruppe: 'zif',
      label: 'Ausnutzungsziffer (Aussenwand bis 0.35cm)', rechen: 'grundstueck.az' },
    { id: 'zif_max_anrechenbare_gf', gruppe: 'zif',
      label: 'max anrechenbare GF', rechen: 'agf' },
    { id: 'zif_baumassenziffer', gruppe: 'zif', label: 'Baumassenziffer' },
    { id: 'zif_gruenflaechenziffer', gruppe: 'zif', label: 'Grünflächenziffer' },
    { id: 'zif_geschossflaechenziffer', gruppe: 'zif', label: 'Geschossflächenziffer' },
    { id: 'zif_spielplatzflaeche_aufentha', gruppe: 'zif',
      label: 'Spielplatzfläche / Aufenthaltsflächen' },
    { id: 'zif_attikageschoss_anrechenbar', gruppe: 'zif',
      label: 'Attikageschoss anrechenbar' },
    { id: 'zif_max_fussabdruck_attikagesc', gruppe: 'zif',
      label: 'max Fussabdruck Attikageschoss' },
    { id: 'zif_position', gruppe: 'zif', label: 'Position' },
    { id: 'zif_weitere_dachgeschoss_besch', gruppe: 'zif',
      label: 'weitere Dachgeschoss beschränkungen' },
    { id: 'zif_arealueberbauung_moeglich', gruppe: 'zif',
      label: 'Arealüberbauung möglich' },
    { id: 'zif_gf_mit_arealbonus', gruppe: 'zif', label: 'GF mit Arealbonus' },
    { id: 'zif_minergie_bonus', gruppe: 'zif', label: 'Minergie Bonus' },
    { id: 'zif_wintergarten_bonus', gruppe: 'zif', label: 'Wintergarten Bonus' },
    { id: 'zif_gestaltungsplan_pflicht', gruppe: 'zif', label: 'Gestaltungsplan pflicht' },
    /* Abstände / Begrenzungen */
    { id: 'abs_grenzabstand_o_i_klein', gruppe: 'abs', label: 'Grenzabstand o.i. klein' },
    { id: 'abs_grenzabstand_o_i_gross', gruppe: 'abs', label: 'Grenzabstand o.i. gross' },
    { id: 'abs_grenzabstand_unterniveau', gruppe: 'abs',
      label: 'Grenzabstand Unterniveau' },
    { id: 'abs_vorspringende_gebaeudeteil', gruppe: 'abs',
      label: 'vorspringende Gebäudeteile' },
    { id: 'abs_strassenabstand_fuer_pp_un', gruppe: 'abs',
      label: 'Strassenabstand für PP und Stützmauer bis 1.8m Höhe' },
    { id: 'abs_baulinienplan_vorhanden', gruppe: 'abs', label: 'Baulinienplan vorhanden?' },
    { id: 'abs_gebaeudeabstand', gruppe: 'abs', label: 'Gebäudeabstand' },
    { id: 'abs_zonengrenzabstand', gruppe: 'abs', label: 'Zonengrenzabstand' },
    { id: 'abs_strassenabstand_gemeinde_o', gruppe: 'abs',
      label: 'Strassenabstand (Gemeinde o.i.+u.i.)' },
    { id: 'abs_gewaesserabstand', gruppe: 'abs', label: 'Gewässerabstand' },
    { id: 'abs_mehrlaengenzuschlaege_haup', gruppe: 'abs',
      label: 'Mehrlängenzuschläge Hauptseite' },
    { id: 'abs_mehrlaengenzuschlaege_nebe', gruppe: 'abs',
      label: 'Mehrlängenzuschläge Nebenseiten' },
    { id: 'abs_gesamthoehe_flachdach', gruppe: 'abs', label: 'Gesamthöhe (Flachdach)' },
    { id: 'abs_fassadenhoehe', gruppe: 'abs', label: 'Fassadenhöhe' },
    { id: 'abs_mehrhoehenzuschlag', gruppe: 'abs', label: 'Mehrhöhenzuschlag' },
    { id: 'abs_traufhoehe', gruppe: 'abs', label: 'Traufhöhe' },
    { id: 'abs_anzahl_vg', gruppe: 'abs',
      label: 'Anzahl VG', rechen: 'grundstueck.geschosse' },
    { id: 'abs_grenze_vollgeschoss_ug', gruppe: 'abs', label: 'Grenze Vollgeschoss / UG' },
    { id: 'abs_dachgauben_durchbrueche', gruppe: 'abs', label: 'Dachgauben / Durchbrüche' },
    { id: 'abs_gebaeudelaenge', gruppe: 'abs', label: 'Gebäudelänge' },
    { id: 'abs_dachneigung_klein_und_anba', gruppe: 'abs',
      label: 'Dachneigung klein und Anbauten' },
    { id: 'abs_dachneigung_exkl_klein_und', gruppe: 'abs',
      label: 'Dachneigung exkl. Klein und Anbauten' },
    /* Weiteres */
    { id: 'wei_altlasten', gruppe: 'wei', label: 'Altlasten' },
    { id: 'wei_archaeologische_fundstelle', gruppe: 'wei',
      label: 'archäologische Fundstelle' },
    { id: 'wei_bahnlinienabstand', gruppe: 'wei', label: 'Bahnlinienabstand' },
    { id: 'wei_dachgestaltung', gruppe: 'wei', label: 'Dachgestaltung' },
    { id: 'wei_empfindlichkeitsstufe', gruppe: 'wei', label: 'Empfindlichkeitsstufe' },
    { id: 'wei_energiesparmassnahmen_44_b', gruppe: 'wei',
      label: 'Energiesparmassnahmen §44 BNO' },
    { id: 'wei_erdsonde_erlaubt', gruppe: 'wei', label: 'Erdsonde erlaubt' },
    { id: 'wei_gemeinschaftsraeume', gruppe: 'wei', label: 'Gemeinschaftsräume' },
    { id: 'wei_gewaesserabstand', gruppe: 'wei',
      label: 'Gewässerabstand', hilfe: 'Kantonsübergangsbestimmungen prüfen!' },
    { id: 'wei_gewaesserschutzbereich', gruppe: 'wei', label: 'Gewässerschutzbereich' },
    { id: 'wei_grundwasserpumpe_erlaubt', gruppe: 'wei',
      label: 'Grundwasserpumpe erlaubt' },
    { id: 'wei_hochspannungsleitung', gruppe: 'wei',
      label: 'Hochspannungsleitung',
      hilfe: 'Vorhanden? Wenn ja, welcher Abstand? Und wann wurde sie eingezont?' },
    { id: 'wei_interessenslinie_vorhanden', gruppe: 'wei',
      label: 'Interessenslinie vorhanden' },
    { id: 'wei_isos', gruppe: 'wei', label: 'ISOS' },
    { id: 'wei_massgebendes_terrain_gefae', gruppe: 'wei',
      label: 'massgebendes Terrain Gefälle' },
    { id: 'wei_naturgefahren', gruppe: 'wei', label: 'Naturgefahren' },
    { id: 'wei_parking', gruppe: 'wei', label: 'Parking' },
    { id: 'wei_schutzbestand_vegetation', gruppe: 'wei',
      label: 'Schutzbestand Vegetation' },
    { id: 'wei_schutzobjekte_vorhanden', gruppe: 'wei', label: 'Schutzobjekte vorhanden?' },
    { id: 'wei_schutzraumpflicht', gruppe: 'wei',
      label: 'Schutzraumpflicht',
      hilfe: 'Wenn mehr als 38 Zimmer i.d.R. immer verpflichtend' },
    { id: 'wei_stuetzmauern', gruppe: 'wei', label: 'Stützmauern' },
    { id: 'wei_waldabstand', gruppe: 'wei', label: 'Waldabstand' },
    /* Grundbuch */
    { id: 'gb_dienstbarkeiten_vorhanden', gruppe: 'gb',
      label: 'Dienstbarkeiten vorhanden' },
    { id: 'gb_dienstbarkeiten_benoetigt', gruppe: 'gb', label: 'Dienstbarkeiten benötigt' },
    { id: 'gb_dienstbarkeiten_optional', gruppe: 'gb', label: 'Dienstbarkeiten Optional' },
    { id: 'gb_pot_grundstueckszukaeufe', gruppe: 'gb',
      label: 'pot. Grundstückszukäufe',
      hilfe: 'Sinnvolle Erweiterungen, um z. B. Arealboni oder Erschliessung zu erhalten oder zu optimieren' },
  ];

  /* Drei Zustände je Prüfpunkt. Ohne sie wäre eine leere Zeile
     mehrdeutig — «geprüft, gibt es hier nicht» sieht sonst aus wie
     «noch nicht angeschaut». */
  A.BAURECHT_STATUS = [
    { id: 'offen',     label: 'offen' },
    { id: 'geprueft',  label: 'geprüft' },
    { id: 'entfaellt', label: 'nicht relevant' }
  ];

  A.baurechtStatusLabel = function (id) {
    var s = A.BAURECHT_STATUS.find(function (x) { return x.id === id; });
    return s ? s.label : 'offen';
  };

  A.baurechtListe = function () {
    var liste = Array.isArray(A.baurechtkatalog) ? A.baurechtkatalog : null;
    if (!liste) {
      try { liste = JSON.parse(localStorage.getItem(A.BAURECHT_LOKAL) || 'null'); }
      catch (e) { liste = null; }
    }
    if (!Array.isArray(liste) || !liste.length) liste = A.BAURECHT_KATALOG;
    var gruppen = A.BAURECHT_GRUPPEN.map(function (g) { return g.id; });
    return liste.filter(function (x) { return x && x.label; }).map(function (x) {
      return { id: x.id || A.uid(),
               gruppe: gruppen.indexOf(x.gruppe) >= 0 ? x.gruppe : gruppen[0],
               label: String(x.label).trim(),
               hilfe: x.hilfe || '', rechen: x.rechen || '' };
    });
  };

  A.baurechtSetzen = function (liste) {
    var sauber = (liste || []).filter(function (x) { return x && x.label; })
      .map(function (x) {
        return { id: x.id || A.uid(), gruppe: x.gruppe || 'gst',
                 label: String(x.label).trim(),
                 hilfe: String(x.hilfe || '').trim(),
                 rechen: x.rechen || '' };
      });
    A.baurechtkatalog = sauber;
    try { localStorage.setItem(A.BAURECHT_LOKAL, JSON.stringify(sauber)); } catch (e) {}
    return sauber;
  };

  A.baurechtGruppe = function (id) {
    return A.BAURECHT_GRUPPEN.find(function (g) { return g.id === id; }) || null;
  };

  /* Der Eintrag zu einem Prüfpunkt. Er entsteht erst beim ersten
     Anfassen — ein unbearbeitetes Projekt trägt keine 75 leeren
     Zeilen mit sich herum. */
  A.baurechtEintrag = function (p, punktId, anlegen) {
    if (!p.baurecht || typeof p.baurecht !== 'object') {
      p.baurecht = { eintraege: {}, eigene: [] };
    }
    var e = p.baurecht.eintraege[punktId];
    if (!e && anlegen) {
      e = p.baurecht.eintraege[punktId] = { wert: '', bemerkung: '', status: 'offen' };
    }
    return e || { wert: '', bemerkung: '', status: 'offen' };
  };

  /* Die Prüfpunkte eines Projekts, nach Gruppen geordnet: erst die
     firmenweiten, danach die projekteigenen Ergänzungen. */
  A.baurechtPunkte = function (p) {
    var eigene = (p && p.baurecht && Array.isArray(p.baurecht.eigene))
      ? p.baurecht.eigene : [];
    return A.BAURECHT_GRUPPEN.map(function (g) {
      var katalog = A.baurechtListe().filter(function (x) { return x.gruppe === g.id; });
      var dazu = eigene.filter(function (x) { return x.gruppe === g.id; })
        .map(function (x) {
          return { id: x.id, gruppe: g.id, label: x.label || '',
                   hilfe: x.hilfe || '', rechen: '', eigen: true };
        });
      return { gruppe: g, punkte: katalog.concat(dazu) };
    });
  };

  /* Bearbeitungsstand: geprüft und nicht relevant gelten als erledigt. */
  A.baurechtStand = function (p) {
    var gesamt = 0, fertig = 0, gefuellt = 0;
    A.baurechtPunkte(p).forEach(function (bl) {
      bl.punkte.forEach(function (pt) {
        gesamt++;
        var e = A.baurechtEintrag(p, pt.id);
        if (e.status === 'geprueft' || e.status === 'entfaellt') fertig++;
        if (String(e.wert || '').trim()) gefuellt++;
      });
    });
    return { gesamt: gesamt, fertig: fertig, gefuellt: gefuellt,
             offen: gesamt - fertig };
  };

  /* Vier Prüfpunkte kennt die Rechnung bereits. Der Baurecht-Check
     schreibt sie nicht — er zeigt daneben, was gerechnet wird, damit
     ein Auseinanderlaufen auffällt. */
  A.baurechtRechenwert = function (p, r, pfad) {
    if (!pfad || !r) return null;
    if (pfad === 'agf') {
      return { wert: r.flaechen ? r.flaechen.agf_zulaessig : 0,
               dez: 0, einheit: 'm²', label: 'anrechenbare GF' };
    }
    if (pfad === 'grundstueck.flaeche') {
      return { wert: A.get(p, pfad), dez: 0, einheit: 'm²', label: 'Grundstücksfläche' };
    }
    if (pfad === 'grundstueck.az') {
      return { wert: A.get(p, pfad), dez: 2, einheit: '', label: 'Ausnützungsziffer' };
    }
    if (pfad === 'grundstueck.geschosse') {
      return { wert: A.get(p, pfad), dez: 0, einheit: '', label: 'Vollgeschosse' };
    }
    return null;
  };

  /* Sitzungsreihen. Vorgabe wie bei den Firmen firmenweit pflegbar —
     jede Reihe zählt ihre Sitzungen für sich. */
  A.SITZUNGSREIHEN_STANDARD = [
    { id: 'bauherren',     kuerzel: 'BHS', label: 'Bauherrensitzung' },
    { id: 'planer',        kuerzel: 'PS',  label: 'Planersitzung' },
    { id: 'baukommission', kuerzel: 'BK',  label: 'Baukommission' }
  ];
  A.SITZUNGSREIHEN_LOKAL = 'projektrechner.sitzungsreihen';

  A.sitzungsreihen = null;   // firmenweite Liste, im Serverbetrieb geladen

  A.reihenListe = function () {
    var liste = Array.isArray(A.sitzungsreihen) ? A.sitzungsreihen : null;
    if (!liste) {
      try { liste = JSON.parse(localStorage.getItem(A.SITZUNGSREIHEN_LOKAL) || 'null'); }
      catch (e) { liste = null; }
    }
    if (!Array.isArray(liste) || !liste.length) liste = A.SITZUNGSREIHEN_STANDARD;
    return liste.map(function (r) {
      return { id: r.id || A.uid(), kuerzel: r.kuerzel || '', label: r.label || 'Sitzung' };
    });
  };

  A.reihenSetzen = function (liste) {
    liste = (liste || []).filter(function (r) { return r && r.label; })
      .map(function (r) {
        return { id: r.id || A.uid(), kuerzel: String(r.kuerzel || '').trim(),
                 label: String(r.label || '').trim() };
      });
    A.sitzungsreihen = liste;
    try { localStorage.setItem(A.SITZUNGSREIHEN_LOKAL, JSON.stringify(liste)); } catch (e) {}
    return liste;
  };

  A.reihe = function (id) {
    if (id === A.MANUELL_REIHE) {
      return { id: id, kuerzel: '', label: 'manuell erfasst' };
    }
    return A.reihenListe().find(function (r) { return r.id === id; }) || null;
  };

  /* ---------------------------------------------------------------
     Briefkopf — Logo und Absenderangaben für Protokolle und Berichte

     Die Logos liegen als Bilddaten in den firmenweiten Einstellungen.
     Das ist bewusst so: Es gibt keinen Dateispeicher, und ein Logo ist
     ein paar Dutzend Kilobyte. Vor dem Ablegen wird es im Browser auf
     eine vernünftige Breite verkleinert.
     --------------------------------------------------------------- */

  A.BRIEFKOPF_LOKAL = 'projektrechner.briefkopf';
  A.briefkopf = null;        // firmenweit, im Serverbetrieb geladen

  A.briefkopfLesen = function () {
    var b = A.briefkopf;
    if (!b) {
      try { b = JSON.parse(localStorage.getItem(A.BRIEFKOPF_LOKAL) || 'null'); }
      catch (e) { b = null; }
    }
    b = b && typeof b === 'object' ? b : {};
    return {
      logos: Array.isArray(b.logos) ? b.logos : [],
      firma: b.firma || '',
      adresse: b.adresse || '',
      fusszeile: b.fusszeile ||
        'Einwände gegen dieses Protokoll bitte innert zehn Tagen; danach gilt es als genehmigt.'
    };
  };

  A.briefkopfSetzen = function (b) {
    A.briefkopf = {
      logos: (b.logos || []).map(function (l) {
        return { id: l.id || A.uid(), label: String(l.label || '').trim() || 'Logo',
                 bild: l.bild || '', standard: !!l.standard,
                 /* Zwei Marken heissen zwei Absender — sonst stünde
                    unter dem einen Logo die Adresse des anderen. */
                 firma: String(l.firma || '').trim(),
                 adresse: String(l.adresse || '').trim() };
      }),
      firma: String(b.firma || '').trim(),
      adresse: String(b.adresse || '').trim(),
      fusszeile: String(b.fusszeile || '').trim()
    };
    try { localStorage.setItem(A.BRIEFKOPF_LOKAL, JSON.stringify(A.briefkopf)); } catch (e) {}
    return A.briefkopf;
  };

  /* Welches Logo gilt für dieses Projekt? Die Wahl steht im Projekt;
     ohne Wahl gilt das als Standard markierte. */
  A.logoFuer = function (p) {
    var bk = A.briefkopfLesen();
    if (!bk.logos.length) return null;
    var gewaehlt = p && p.briefkopf
      ? bk.logos.find(function (l) { return l.id === p.briefkopf; })
      : null;
    return gewaehlt ||
      bk.logos.find(function (l) { return l.standard; }) ||
      bk.logos[0];
  };

  /* Absenderangaben für dieses Projekt: was am gewählten Logo hängt,
     sonst die allgemeine Angabe. */
  A.absender = function (p) {
    var bk = A.briefkopfLesen();
    var l = A.logoFuer(p);
    return {
      firma: (l && l.firma) || bk.firma || '',
      adresse: (l && l.adresse) || bk.adresse || '',
      fusszeile: bk.fusszeile || ''
    };
  };

  /* ---------------------------------------------------------------
     Standardtraktanden — je Sitzungsreihe, firmenweit und je Projekt

     Firmenweit steht, was in jeder Sitzung dieser Art vorkommt
     («Genehmigung Vorprotokoll», «Termine», «Kosten», «Diverses»).
     Das Projekt ergänzt, was nur hier gilt. Beim Anlegen eines
     Protokolls werden beide eingesetzt und sind danach ganz normale
     Punkte — änderbar und löschbar.
     --------------------------------------------------------------- */

  A.TRAKTANDEN_LOKAL = 'projektrechner.standardtraktanden';
  A.standardtraktanden = null;   // { reiheId: [ {id,text,typ,phase} ] }

  /* Je Sitzungsreihe steht hier, WELCHE Themen als Traktanden
     erscheinen und welche Punkte darunter schon vorformuliert sind:

       { <reiheId>: { themen: [themaId, …], punkte: [ {…}, … ] } }

     Die frühere Form war eine blosse Punkteliste je Reihe; sie wird
     beim Lesen umgeschrieben, die Themen ergeben sich dann aus den
     Punkten. */
  A.traktandenLesen = function () {
    var t = A.standardtraktanden;
    if (!t) {
      try { t = JSON.parse(localStorage.getItem(A.TRAKTANDEN_LOKAL) || 'null'); }
      catch (e) { t = null; }
    }
    t = t && typeof t === 'object' ? t : {};

    var raus = {};
    Object.keys(t).forEach(function (k) {
      var e = t[k];
      if (Array.isArray(e)) {
        /* alte Form: nur Punkte */
        var themen = [];
        e.forEach(function (x) {
          if (x && x.thema && themen.indexOf(x.thema) < 0) themen.push(x.thema);
        });
        raus[k] = { themen: themen, punkte: e };
      } else {
        raus[k] = {
          themen: Array.isArray(e && e.themen) ? e.themen : [],
          punkte: Array.isArray(e && e.punkte) ? e.punkte : []
        };
      }
    });
    return raus;
  };

  A.traktandenSetzen = function (t) {
    var sauber = {};
    Object.keys(t || {}).forEach(function (k) {
      var e = t[k] || {};
      sauber[k] = {
        themen: (Array.isArray(e.themen) ? e.themen : []).filter(Boolean),
        punkte: (Array.isArray(e.punkte) ? e.punkte : [])
          .filter(function (x) { return x && x.text; })
          .map(function (x) {
            return { id: x.id || A.uid(), text: String(x.text).trim(),
                     typ: x.typ || 'info', phase: x.phase || 'allgemein',
                     thema: x.thema || '', prio: x.prio || '' };
          })
      };
    });
    A.standardtraktanden = sauber;
    try { localStorage.setItem(A.TRAKTANDEN_LOKAL, JSON.stringify(sauber)); } catch (e) {}
    return sauber;
  };

  /* Die Traktanden einer Sitzungsreihe: die gewählten Themen in der
     firmenweiten Reihenfolge, jedes mit seiner festen Nummer. Ist für
     eine Reihe nichts gewählt, gelten alle Themen — sonst stünde ein
     neues Protokoll ohne jede Überschrift da. */
  A.reiheThemen = function (reiheId) {
    var alle = A.themenListe();
    var gewaehlt = (A.traktandenLesen()[reiheId] || {}).themen || [];
    var liste = gewaehlt.length
      ? alle.filter(function (t) { return gewaehlt.indexOf(t.id) >= 0; })
      : alle;
    return liste.map(function (t) {
      return { thema: t, nr: A.themaNummer(t.id) };
    });
  };

  /* Standardpunkte für eine neue Sitzung: firmenweite Vorgabe der
     Reihe, danach die Ergänzungen des Projekts. */
  A.standardpunkte = function (p, reiheId) {
    var firmenweit = ((A.traktandenLesen()[reiheId] || {}).punkte) || [];
    var eigene = ((p && p.standardpunkte) || []).filter(function (x) {
      return !x.reihe || x.reihe === reiheId;
    });
    return firmenweit.concat(eigene).map(function (x) {
      return A.defPunkt({ text: x.text, typ: x.typ || 'info',
                          phase: x.phase || 'allgemein',
                          thema: x.thema || '', prio: x.prio || '' });
    });
  };

  A.defPunkt = function (vorgabe) {
    /* «verschoben» hiess, was heute «warten auf Rückmeldung» heisst.
       Umgeschrieben wird beim Lesen — die Punkte liegen als JSON in
       der Sitzungszeile, eine Datenbankmigration gäbe es dafür nicht. */
    if (vorgabe && vorgabe.status === 'verschoben') {
      vorgabe = Object.assign({}, vorgabe, { status: 'warten' });
    }
    var pt = {
      id: A.uid(),
      phase: 'allgemein',
      beteiligter: '',       // Id aus p.beteiligte — die zweite Gliederungsebene
      thema: '',             // Id aus der firmenweiten Themenliste
      prio: '',              // '' | hoch | mittel | tief
      typ: 'info',
      text: '',
      termin: '',
      start: '',             // leer = Sitzungsdatum
      status: 'offen',
      erledigt_am: '',
      erledigt_in: '',       // Id der Sitzung, in der er geschlossen wurde
      bemerkung: '',
      /* Was aus der Aufgabe geworden ist: Rückmeldungen mit Datum, in
         der Reihenfolge ihres Eintreffens. Eine Aufgabe läuft oft über
         mehrere Sitzungen — «Bauprofile am 14.10., Bestätigung folgt»
         ist ein Zwischenstand, dem später etwas nachkommt. Deshalb ein
         Verlauf und kein einzelnes Feld. */
      antworten: []
    };
    Object.keys(vorgabe || {}).forEach(function (k) { pt[k] = vorgabe[k]; });
    if (!Array.isArray(pt.antworten)) pt.antworten = [];
    pt.antworten = pt.antworten.map(A.defAntwort);
    return pt;
  };

  A.defAntwort = function (vorgabe) {
    var a = { id: A.uid(), datum: A.heute(), text: '', von: '' };
    Object.keys(vorgabe || {}).forEach(function (k) { a[k] = vorgabe[k]; });
    return a;
  };

  /* Wer gerade schreibt. Im Firmenbetrieb der angemeldete Benutzer,
     sonst der im Projekt eingetragene Bearbeiter. Leer ist zulässig —
     die Rückmeldung steht dann ohne Urheber da. */
  A.werBinIch = function () {
    var pr = A.api && A.api.profil;
    if (pr) return pr.name || pr.email || '';
    var p = A.state && A.state.p;
    return (p && p.bearbeiter) || '';
  };

  /* Die jüngste Rückmeldung einer Aufgabe — für Listen, die nur den
     aktuellen Stand zeigen. */
  A.letzteAntwort = function (pt) {
    var a = (pt && pt.antworten) || [];
    return a.length ? a[a.length - 1] : null;
  };

  /* Aufgaben ohne Sitzung liegen in einer eigenen Sammelsitzung je
     Projekt. Sie nutzt dieselbe Tabelle wie die Protokolle — gleiche
     Struktur, gleiche Rechte, gleicher Schutz gegen gegenseitiges
     Überschreiben — erscheint aber nirgends als Protokoll. */
  A.MANUELL_REIHE = '_manuell';

  A.istManuell = function (s) {
    return !!s && s.reihe === A.MANUELL_REIHE;
  };

  A.defSitzung = function (projektId, reiheId) {
    return {
      id: A.uid(),
      projekt_id: projektId,
      reihe: reiheId || (A.reihenListe()[0] || {}).id || 'bauherren',
      nummer: 1,
      datum: A.heute(),
      zeit_von: '', zeit_bis: '',
      ort: '',
      verfasser: '',
      status: 'entwurf',      // entwurf | versendet
      versendet_am: '',
      teilnehmer: [], entschuldigt: [], verteiler: [],
      punkte: [],
      /* 0 heisst: noch nie gespeichert. Der Speicherweg entscheidet
         daran zwischen Anlegen und Ändern. */
      version: 0
    };
  };

  /* Eine Sitzung robust einlesen — fremde oder alte Datensätze dürfen
     die Oberfläche nicht zerlegen. */
  A.sitzungLesen = function (s) {
    if (!s || typeof s !== 'object') return null;
    var d = A.defSitzung(s.projekt_id, s.reihe);
    Object.keys(d).forEach(function (k) {
      if (s[k] !== undefined && s[k] !== null) d[k] = s[k];
    });
    ['teilnehmer', 'entschuldigt', 'verteiler'].forEach(function (k) {
      if (!Array.isArray(d[k])) d[k] = [];
    });
    d.punkte = (Array.isArray(s.punkte) ? s.punkte : []).map(function (pt) {
      return A.defPunkt(pt);
    });
    return d;
  };

  /* Punkte einer Sitzung in die Gliederung bringen und nummerieren.
     Phasen folgen dem SIA-Katalog, Beteiligte der Reihenfolge in der
     Adressliste — so bleibt die Nummer eines Punktes stabil, solange
     sich an Phase und Zuständigkeit nichts ändert. */
  /* Gliederung eines Protokolls: Thema → Punkte.

     Die Themen kommen aus der Sitzungsreihe und behalten ihre feste
     Nummer aus der Verwaltung. Alle gewählten Themen erscheinen, auch
     leere — eine fehlende Überschrift liest sich sonst wie ein
     verlorener Abschnitt. Punkte ohne Thema sammeln sich am Ende. */
  A.gliederung = function (p, sitzung) {
    var punkte = sitzung.punkte || [];
    var gruppen = A.reiheThemen(sitzung.reihe).map(function (e) {
      return {
        thema: e.thema, nr: String(e.nr),
        punkte: punkte.filter(function (pt) { return pt.thema === e.thema.id; })
      };
    });

    /* Was einem Thema angehört, das in dieser Reihe nicht vorgesehen
       ist, verschwindet nicht — es bekommt eine eigene Überschrift. */
    var bekannt = {};
    gruppen.forEach(function (g) { bekannt[g.thema.id] = true; });
    var rest = {};
    punkte.forEach(function (pt) {
      if (bekannt[pt.thema]) return;
      var key = pt.thema || '';
      (rest[key] = rest[key] || []).push(pt);
    });
    Object.keys(rest).forEach(function (key) {
      var t = A.thema(key);
      gruppen.push({
        thema: t || { id: '', label: 'ohne Thema', farbe: '#aab2bd' },
        nr: t ? String(A.themaNummer(key)) : '–',
        punkte: rest[key], ausserhalb: true
      });
    });

    /* Nummern vergeben: Thema.Punkt */
    gruppen.forEach(function (g) {
      g.punkte.forEach(function (pt, i) { pt._nr = g.nr + '.' + (i + 1); });
    });
    return gruppen;
  };

  /* Nächste Nummer einer Reihe innerhalb eines Projekts */
  A.naechsteSitzungsnummer = function (liste, reiheId) {
    var n = 0;
    (liste || []).forEach(function (s) {
      if (s.reihe === reiheId && s.nummer > n) n = s.nummer;
    });
    return n + 1;
  };

  A.BKP_KATALOG = [
    { id: 'b1_abbruch',   bkp: '1',     label: 'Abbruch / Rückbau Bestand',
      hilfe: 'Nur relevant, wenn der Bestand zurückgebaut wird. Menge = Gebäudevolumen Bestand.' },
    { id: 'b1_altlasten', bkp: '1',     label: 'Altlasten / Entsorgung' },
    { id: 'b1_vorbereitung', bkp: '1',  label: 'Vorbereitungsarbeiten',
      hilfe: 'Prozentual auf BKP 20–29 vor Reserve — Stockwerkeigentum, Miete, Gewerbe, ' +
             'Untergeschoss und Einstellhalle.' },
    { id: 'b1_anpassung', bkp: '1',     label: 'Anpassungen an bestehende Bauten',
      hilfe: 'Anschlüsse, Unterfangungen, Sicherungen an Nachbar- oder Bestandsbauten. ' +
             'Menge = Grundstücksfläche.' },
    { id: 'b1_pfaehlung', bkp: '1',     label: 'Pfählung / Wasserhaltung / Spezialtiefbau',
      hilfe: 'Baugrundbedingte Zusatzkosten: Pfähle, Spundwände, Grundwasserhaltung.' },
    { id: 'b1_erschl',    bkp: '1',     label: 'Erschliessung / Werkleitungen' },

    { id: 'b2_oi_stwe',   bkp: '20–29', label: 'Gebäude oberirdisch · Stockwerkeigentum',
      hilfe: 'Kennwert inklusive Technik, Ausbau und Planerhonoraren. Menge aus dem Nutzungsmix.' },
    { id: 'b2_oi_miete',  bkp: '20–29', label: 'Gebäude oberirdisch · Miete' },
    { id: 'b2_oi_gewerbe',bkp: '20–29', label: 'Gebäude oberirdisch · Gewerbe' },
    { id: 'b2_ug',        bkp: '20–29', label: 'Untergeschoss',
      hilfe: 'Ohne Einstellhalle — diese wird separat erfasst.' },
    { id: 'b2_aeh',       bkp: '20–29', label: 'Einstellhalle',
      hilfe: 'Fläche = Fläche je Parkplatz × Anzahl Parkplätze.' },
    { id: 'b2_reserve',   bkp: '202',   label: 'Reserve auf BKP 20–29',
      hilfe: 'Prozentual auf BKP 20–29 vor Reserve zuzüglich der Vorbereitungsarbeiten. ' +
             'Deren Prozentwert wirkt damit ein zweites Mal — bewusst so gewählt.' },

    { id: 'b3_betrieb',   bkp: '3',     label: 'Betriebseinrichtungen' },
    { id: 'b4_umgebung',  bkp: '4',     label: 'Umgebung' },
    { id: 'b5_dritt',     bkp: '558.1', label: 'Dritthonorare',
      hilfe: 'Externe Fachplanung und Beratung ausserhalb der Kennwerte der BKP 20–29. ' +
             'Prozentual auf BKP 1–4 inklusive Reserve.' },
    { id: 'b5_bnk',       bkp: '5',     label: 'Baunebenkosten, Bewilligungen, Versicherungen',
      hilfe: 'Prozentual auf BKP 20–29 inklusive Reserve — ohne BKP 1, 3, 4 und 9.' },
    { id: 'b5_pm',        bkp: '599',   label: 'Projektmanagement-Honorar',
      hilfe: 'Prozentual auf BKP 1–5 ohne diese Zeile selbst.' },
    { id: 'b9_ausstat',   bkp: '9',     label: 'Ausstattung' }
  ];

  /* Kennwert-Bibliothek je Kostenblock. min/max = Plausibilitätsband.
     Die Kennwerte für BKP 20–29 verstehen sich als Vollkosten inklusive
     Gebäudetechnik, Ausbau und Planerhonoraren. */
  A.KENNWERTE = {
    neubau: {
      b1_abbruch:    { basis: 'gv_bestand', wert: 0,     min: 60,   max: 140   },
      b1_altlasten:  { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b1_vorbereitung: { basis: 'pct_bkp2',    wert: 2,    min: 0,    max: 12   },
      b1_anpassung:  { basis: 'gsf',          wert: 0,    min: 0,    max: 250  },
      b1_pfaehlung:  { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b1_erschl:     { basis: 'pauschal',   wert: 120000,min: 0,    max: 0     },
      b2_oi_stwe:    { basis: 'gv_oi_stwe',    wert: 1050, min: 800,  max: 1470 },
      b2_oi_miete:   { basis: 'gv_oi_miete',   wert: 970,  min: 730,  max: 1300 },
      b2_oi_gewerbe: { basis: 'gv_oi_gewerbe', wert: 800,  min: 530,  max: 1130 },
      b2_ug:         { basis: 'gv_ug',         wert: 550,  min: 380,  max: 780  },
      b2_aeh:        { basis: 'gv_aeh',        wert: 400,  min: 270,  max: 620  },
      b2_reserve:    { basis: 'pct_bkp2',      wert: 5,    min: 0,    max: 12   },
      b3_betrieb:    { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b4_umgebung:   { basis: 'umgebung',   wert: 150,   min: 80,   max: 550   },
      b5_dritt:      { basis: 'pct_bkp1_4', wert: 0.5,   min: 0,    max: 4     },
      b5_bnk:        { basis: 'pct_bkp2',   wert: 3,     min: 1.5,  max: 8     },
      b5_pm:         { basis: 'pct_bkp1_5', wert: 2.0,   min: 0.5,  max: 5     },
      b9_ausstat:    { basis: 'nwf',        wert: 60,    min: 0,    max: 250   }
    },
    erweiterung: {
      b1_abbruch:    { basis: 'gv_bestand', wert: 0,     min: 0,    max: 0     },
      b1_altlasten:  { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b1_vorbereitung: { basis: 'pct_bkp2',    wert: 2,    min: 0,    max: 12   },
      b1_anpassung:  { basis: 'gsf',          wert: 30,   min: 0,    max: 250  },
      b1_pfaehlung:  { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b1_erschl:     { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b2_oi_stwe:    { basis: 'gv_oi_stwe',    wert: 1150, min: 830,  max: 1670 },
      b2_oi_miete:   { basis: 'gv_oi_miete',   wert: 1070, min: 770,  max: 1500 },
      b2_oi_gewerbe: { basis: 'gv_oi_gewerbe', wert: 900,  min: 570,  max: 1300 },
      b2_ug:         { basis: 'gv_ug',         wert: 0,    min: 0,    max: 0    },
      b2_aeh:        { basis: 'gv_aeh',        wert: 0,    min: 0,    max: 0    },
      b2_reserve:    { basis: 'pct_bkp2',      wert: 5,    min: 0,    max: 12   },
      b3_betrieb:    { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b4_umgebung:   { basis: 'umgebung',   wert: 0,     min: 0,    max: 0     },
      b5_dritt:      { basis: 'pct_bkp1_4', wert: 0.5,   min: 0,    max: 4     },
      b5_bnk:        { basis: 'pct_bkp2',   wert: 3,     min: 1.5,  max: 8     },
      b5_pm:         { basis: 'pct_bkp1_5', wert: 2.0,   min: 0.5,  max: 5     },
      b9_ausstat:    { basis: 'nwf',        wert: 60,    min: 0,    max: 250   }
    },
    sanierung: {
      b1_abbruch:    { basis: 'gv_bestand', wert: 0,     min: 0,    max: 0     },
      b1_altlasten:  { basis: 'pauschal',   wert: 60000, min: 0,    max: 0     },
      b1_vorbereitung: { basis: 'pct_bkp2',    wert: 2,    min: 0,    max: 12   },
      b1_anpassung:  { basis: 'gsf',          wert: 0,    min: 0,    max: 250  },
      b1_pfaehlung:  { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b1_erschl:     { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b2_oi_stwe:    { basis: 'gv_oi_stwe',    wert: 600,  min: 230,  max: 1070 },
      b2_oi_miete:   { basis: 'gv_oi_miete',   wert: 500,  min: 200,  max: 930  },
      b2_oi_gewerbe: { basis: 'gv_oi_gewerbe', wert: 400,  min: 130,  max: 800  },
      b2_ug:         { basis: 'gv_ug',         wert: 180,  min: 0,    max: 450  },
      b2_aeh:        { basis: 'gv_aeh',        wert: 0,    min: 0,    max: 0    },
      b2_reserve:    { basis: 'pct_bkp2',      wert: 5,    min: 0,    max: 15   },
      b3_betrieb:    { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b4_umgebung:   { basis: 'umgebung',   wert: 0,     min: 0,    max: 0     },
      b5_dritt:      { basis: 'pct_bkp1_4', wert: 0.5,   min: 0,    max: 4     },
      b5_bnk:        { basis: 'pct_bkp2',   wert: 3,     min: 1.5,  max: 8     },
      b5_pm:         { basis: 'pct_bkp1_5', wert: 2.5,   min: 0.5,  max: 5     },
      b9_ausstat:    { basis: 'nwf',        wert: 40,    min: 0,    max: 250   }
    }
  };

  /* Fälligkeiten der Kaufpreisraten, chronologisch. Drei Arten:
       Vertragstermine je Einheit   — beurkundung, tagebuch, uebergabe
       Bautermine aus dem Modell    — baustart, rohbau
       Bautermine von Hand          — decke_ug, unterlagsboden
     Die Unterscheidung steuert, woher der Zeitpunkt kommt. */
  A.ZAHLUNG_BEZUG = {
    beurkundung:    'bei Beurkundung',
    tagebuch:       '3 Tage nach Tagebucheintrag',
    baustart:       'bei Baustart',
    decke_ug:       'Decke UG fertig',
    rohbau:         'bei Rohbau fertig',
    unterlagsboden: 'Fertigstellung Unterlagsboden',
    uebergabe:      'bei Übergabe'
  };

  /* Welche Fälligkeit ihren Termin woher bezieht. */
  A.ZAHLUNG_ART = {
    beurkundung:    'einheit',    // Beurkundungsdatum der Einheit
    tagebuch:       'einheit',    // Beurkundung + Fristen
    uebergabe:      'einheit',    // eigenes Übergabedatum, ohne das nichts fliesst
    baustart:       'modell',
    rohbau:         'modell',
    decke_ug:       'hand',       // Schätzung aus der Bauzeit, bis ein Datum steht
    unterlagsboden: 'hand'
  };

  A.BLOCK_LABELS = {
    neubau: 'Neubau', erweiterung: 'Erweiterung / Aufstockung', sanierung: 'Sanierung Bestand'
  };

  /* Marktbandbreiten für die Plausibilitätsampel bei Mieten/Preisen */
  A.MARKT = {
    miete:  { wohnen: [200, 400], buero: [180, 400], gewerbe: [120, 260],
              verkauf: [180, 600], lager: [60, 160] },
    preis:  { wohnen: [6000, 16000], buero: [4500, 11000], gewerbe: [3000, 8000],
              verkauf: [4000, 12000], lager: [1500, 4500] }
  };

  /* ---------------------------------------------------------------
     Hilfsfunktionen Pfadzugriff
     --------------------------------------------------------------- */

  A.get = function (obj, path) {
    return path.split('.').reduce(function (o, k) {
      return (o === undefined || o === null) ? undefined : o[k];
    }, obj);
  };

  A.set = function (obj, path, val) {
    var keys = path.split('.'), o = obj;
    for (var i = 0; i < keys.length - 1; i++) {
      if (o[keys[i]] === undefined || o[keys[i]] === null) o[keys[i]] = {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = val;
    return obj;
  };

  A.clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  function num0(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

  A.uid = function () {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  };

  A.heute = function () { return new Date().toISOString().slice(0, 10); };

  /* ISO-Datum in Schweizer Schreibweise. Leere und unlesbare Werte
     geben einen Strich zurück statt «Invalid Date». */
  A.datum = function (iso) {
    var t = String(iso || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return '—';
    return t.slice(8, 10) + '.' + t.slice(5, 7) + '.' + t.slice(0, 4);
  };

  /* Datumsrechnung für den Terminplan. Der Rechenkern arbeitet in
     Jahresbruchteilen ab Startdatum, der Terminplan in Kalenderdaten —
     hier laufen die beiden Welten zusammen. */
  A.datumPlusTage = function (iso, tage) {
    var d = Date.parse(String(iso || '').slice(0, 10));
    if (!isFinite(d)) return '';
    return new Date(d + Math.round(tage) * 86400000).toISOString().slice(0, 10);
  };

  A.datumPlusJahre = function (iso, jahre) {
    return A.datumPlusTage(iso, (jahre || 0) * 365.25);
  };

  /* Jahresbruchteil zwischen zwei Daten — die Umkehrung von oben. */
  A.jahreZwischen = function (von, bis) {
    var a = Date.parse(String(von || '').slice(0, 10));
    var b = Date.parse(String(bis || '').slice(0, 10));
    if (!isFinite(a) || !isFinite(b)) return null;
    return (b - a) / 31557600000;
  };

  A.tageZwischen = function (von, bis) {
    var a = Date.parse(String(von || '').slice(0, 10));
    var b = Date.parse(String(bis || '').slice(0, 10));
    if (!isFinite(a) || !isFinite(b)) return null;
    return Math.round((b - a) / 86400000);
  };

  /* ---------------------------------------------------------------
     Terminplan — Vorgänge, Abhängigkeiten, Dauern

     Ein Vorgang ist eine Zeile des Gantt-Diagramms: Beschriftung,
     Startdatum, Dauer in Kalendertagen. Hängt er an einem anderen,
     rechnet sich sein Start aus dessen Ende plus einer Verzögerung —
     das getippte Startdatum tritt dann zurück.

     Die Verkettung wird für den ganzen Plan auf einmal aufgelöst
     (A.terminplanRechnen). Das ist schneller als rekursive
     Einzelabfragen und erlaubt es, Ringschlüsse zu erkennen: «A nach B,
     B nach A» darf die Oberfläche nicht aufhängen.
     --------------------------------------------------------------- */

  A.GANTT_FARBEN = [
    { id: 'blau',       label: 'Blau',       hex: '#2a52be' },
    { id: 'dunkelblau', label: 'Dunkelblau', hex: '#1a3a6b' },
    { id: 'gruen',      label: 'Grün',       hex: '#27ae60' },
    { id: 'tuerkis',    label: 'Türkis',     hex: '#16a085' },
    { id: 'gelb',       label: 'Gelb',       hex: '#e0a400' },
    { id: 'orange',     label: 'Orange',     hex: '#e67e22' },
    { id: 'rot',        label: 'Rot',        hex: '#c0392b' },
    { id: 'rosa',       label: 'Rosa',       hex: '#c0568a' },
    { id: 'lila',       label: 'Lila',       hex: '#7c4dbe' },
    { id: 'braun',      label: 'Braun',      hex: '#795548' },
    { id: 'grau',       label: 'Grau',       hex: '#7f8c8d' },
    { id: 'anthrazit',  label: 'Anthrazit',  hex: '#2c3e50' }
  ];

  A.ganttFarbe = function (id) {
    var f = A.GANTT_FARBEN.find(function (x) { return x.id === id; });
    return f ? f.hex : A.GANTT_FARBEN[0].hex;
  };

  /* Welche Farbe eine aus einer SIA-Phase abgeleitete Zeile bekommt —
     dieselbe Ordnung wie die Rechenphasen im Portfolio. */
  var PHASENFARBE = {
    entwicklung: 'dunkelblau', bewilligung: 'gelb',
    vorbereitung: 'grau', bau: 'blau'
  };

  A.defVorgang = function (vorgabe) {
    var v = {
      id: A.uid(),
      label: '',
      abh: '',            // Id des Vorgängers, leer = eigener Starttermin
      verz: 0,            // Tage zwischen Vorgängerende und eigenem Start
      start: '',          // nur wirksam ohne Abhängigkeit
      tage: 10,
      farbe: 'blau',
      erledigt: false,
      dashboard: false,   // im Portfolio zeigen
      sia: '',            // Herkunft, falls aus einer SIA-Phase entstanden
      /* Ein Meilenstein hat keine Dauer: ein Datum, ein Zeichen. Er
         ist kein eintägiger Vorgang — «Baustart» dauert nicht einen
         Tag, er findet statt. */
      meilenstein: false
    };
    Object.keys(vorgabe || {}).forEach(function (k) { v[k] = vorgabe[k]; });
    v.tage = v.meilenstein ? 1 : (Math.max(1, Math.round(num0(v.tage)) || 1));
    v.verz = Math.round(num0(v.verz));
    return v;
  };

  A.vorgaenge = function (p) {
    var liste = (p && p.termine && p.termine.vorgaenge) || [];
    return Array.isArray(liste) ? liste : [];
  };

  /* Die Startbelegung eines neuen Plans: die zehn SIA-Phasen der Reihe
     nach verkettet. Sammelrubriken (Gewicht 0) bleiben draussen — sie
     laufen quer durchs Projekt und wären als Balken irreführend. */
  A.vorgaengeAusSia = function (p, r) {
    var raus = [], vorher = null;
    A.SIA_PHASEN.forEach(function (ph) {
      if (!ph.gewicht) return;
      var tage = 30;
      if (r && r.zeit && p && p.startdatum) {
        /* Dauer aus dem Bauzeitmodell: Die Phasen einer Rechenphase
           teilen sich deren Zeitraum nach Gewicht. */
        var Z = r.zeit;
        var grenzen = {
          entwicklung:  [0, Z.t_baueingabe], bewilligung: [Z.t_baueingabe, Z.t_bb],
          vorbereitung: [Z.t_bb, Z.t_baustart], bau: [Z.t_baustart, Z.t_bauende]
        }[ph.rechen];
        if (grenzen) {
          var summe = A.SIA_PHASEN.reduce(function (a, x) {
            return a + (x.rechen === ph.rechen ? x.gewicht : 0); }, 0);
          if (summe > 0) {
            tage = Math.max(1, Math.round((grenzen[1] - grenzen[0]) *
                                          ph.gewicht / summe * 365.25));
          }
        }
      }
      var v = A.defVorgang({
        label: ph.sia ? ph.label + ' (SIA ' + ph.sia + ')' : ph.label,
        sia: ph.id, tage: tage, farbe: PHASENFARBE[ph.rechen] || 'blau',
        abh: vorher ? vorher.id : '',
        start: vorher ? '' : (p && p.startdatum) || A.heute()
      });
      raus.push(v);
      vorher = v;
    });
    return raus;
  };

  /* Start- und Enddatum aller Vorgänge in einem Durchgang.

     Rückgabe: { byId: { id: { start, ende, ring } }, ringe: [id, …] }
     «ring» markiert einen Vorgang, dessen Abhängigkeit im Kreis läuft;
     er fällt dann auf sein eigenes Startdatum zurück, damit der Plan
     trotzdem darstellbar bleibt. */
  A.terminplanRechnen = function (p) {
    var liste = A.vorgaenge(p);
    var nach = {};
    liste.forEach(function (v) { nach[v.id] = v; });

    var erg = {}, ringe = [], laeuft = {};

    function rechne(v) {
      if (erg[v.id]) return erg[v.id];
      if (laeuft[v.id]) {                       // Ringschluss
        if (ringe.indexOf(v.id) < 0) ringe.push(v.id);
        return null;
      }
      laeuft[v.id] = true;

      var start = v.start || (p && p.startdatum) || A.heute();
      var ring = false;
      if (v.abh && nach[v.abh]) {
        var vor = rechne(nach[v.abh]);
        if (vor) {
          start = A.datumPlusTage(vor.ende, (Math.round(num0(v.verz)) || 0) + 1);
        } else {
          ring = true;
          if (ringe.indexOf(v.id) < 0) ringe.push(v.id);
        }
      }
      /* Ein Meilenstein steht auf einem Datum; ein Vorgang von einem
         Tag beginnt und endet am selben Datum. */
      var tage = v.meilenstein ? 1 : Math.max(1, Math.round(num0(v.tage)) || 1);
      var ende = A.datumPlusTage(start, tage - 1);

      laeuft[v.id] = false;
      erg[v.id] = { start: start, ende: ende, tage: tage, ring: ring };
      return erg[v.id];
    }

    liste.forEach(rechne);
    return { byId: erg, ringe: ringe };
  };

  /* Die Nummer eines Vorgangs ist seine Stelle in der Liste — so wie
     man sie in der Spalte «Abh.» einträgt. */
  A.vorgangNummer = function (p, id) {
    var i = A.vorgaenge(p).findIndex(function (v) { return v.id === id; });
    return i < 0 ? 0 : i + 1;
  };

  A.vorgangNachNummer = function (p, nr) {
    var i = parseInt(nr, 10);
    var liste = A.vorgaenge(p);
    return (i >= 1 && i <= liste.length) ? liste[i - 1] : null;
  };

  /* Ob eine Abhängigkeit erlaubt ist: Sie darf nicht auf den Vorgang
     selbst und nicht über Umwege auf ihn zurückführen. */
  A.abhaengigkeitErlaubt = function (p, vId, zielId) {
    if (!zielId) return true;
    if (vId === zielId) return false;
    var nach = {};
    A.vorgaenge(p).forEach(function (v) { nach[v.id] = v; });
    var lauf = nach[zielId], tiefe = 0;
    while (lauf && tiefe++ < 500) {
      if (lauf.id === vId) return false;
      lauf = lauf.abh ? nach[lauf.abh] : null;
    }
    return true;
  };

  /* Beschriftung eines Projektjahres im Kalender. */
  A.jahrLabel = function (p, j) {
    var start = p && p.startjahr ? parseInt(p.startjahr, 10) : new Date().getFullYear();
    return String(start + j);
  };

  /* ---------------------------------------------------------------
     Default-Nutzungszeile
     --------------------------------------------------------------- */

  /* Eine Nutzungszeile. Die Bezeichnung ist frei wählbar, damit sich
     etwa «Wohnen STWE» und «Wohnen Miete» im selben Projekt trennen
     lassen; die Art liefert weiterhin die Marktbandbreiten. */
  A.defNutzung = function (o) {
    o = o || {};
    var art = o.art || 'wohnen';
    return {
      id: o.id || A.uid(),
      bezeichnung: o.bezeichnung || (A.NUTZUNGEN.find(function (n) { return n.id === art; }) || {}).label || 'Nutzung',
      art: art,
      anteil: o.anteil !== undefined ? o.anteil : 0,   // % der NWF bzw. der Parkplätze
      flaeche_manuell: o.flaeche_manuell || 0,
      miete: o.miete !== undefined ? o.miete : 320,    // CHF/m²/Jahr, bei PP CHF/Monat
      preis: o.preis !== undefined ? o.preis : 9500,   // CHF/m² bzw. CHF/PP
      verwertung: o.verwertung || 'stwe',
      selbst: o.selbst || 0,
      /* 0 oder leer = Vorgabe aus den Bewertungsannahmen übernehmen */
      exit_rendite: o.exit_rendite !== undefined ? o.exit_rendite : 0,
      kostengruppe: o.kostengruppe || A.kostengruppeFuer(art, o.verwertung || 'stwe'),
      /* Formeln der Zeile — sonst gingen sie beim Normalisieren verloren */
      _f: o._f && typeof o._f === 'object' ? o._f : {}
    };
  };

  A.standardNutzungen = function () {
    return [
      A.defNutzung({ bezeichnung: 'Wohnen Stockwerkeigentum', art: 'wohnen',
        anteil: 100, miete: 320, preis: 9500, verwertung: 'stwe' }),
      A.defNutzung({ bezeichnung: 'Parkplätze Verkauf', art: 'parkplatz',
        anteil: 100, miete: 150, preis: 45000, verwertung: 'stwe' })
    ];
  };

  function defTeil(aktiv, modus) {
    return {
      aktiv: aktiv,
      modus: modus,            // 'ausnutzung' | 'studie'
      gf_oi: 0,                // Studie: Geschossfläche oberirdisch m²
      nwf_manuell: 0,          // Studie: NWF direkt (überschreibt hnf_quote)
      faktor_gf: 1.00,         // Aufschlag GF oberirdisch je m² aGF
      hnf_quote: 78,           // NWF in % der GF oberirdisch
      ug_quote: 80,            // Untergeschoss in % der Gebäudegrundfläche
      pp: 0,                   // Anzahl Parkplätze
      flaeche_pro_pp: 32,      // m² Einstellhalle je Parkplatz

      /* Kubaturen: entweder über Höhen gerechnet oder direkt erfasst.
         Regelgeschosse = Anzahl Geschosse − 1, Dachgeschoss immer eines. */
      kubatur_modus: 'hoehe',  // 'hoehe' | 'volumen'
      h_regel: 3.00,
      h_dach: 3.20,
      h_ug: 3.40,
      h_aeh: 3.40,
      v_oi: 0, v_ug: 0, v_aeh: 0,

      nutzungen: aktiv ? A.standardNutzungen() : []
    };
  }

  function defBaublock(art) {
    var zeilen = {}, kw = A.KENNWERTE[art];
    A.BKP_KATALOG.forEach(function (z) {
      var k = kw[z.id];
      zeilen[z.id] = { aktiv: k.wert !== 0, basis: k.basis, wert: k.wert, menge_manuell: 0 };
    });
    /* Die Reserve steckt neu als Zeile «202» im Katalog und wirkt auf
       BKP 20–29. Das Feld bleibt für Altprojekte erhalten (Vorgabe 0). */
    return { aktiv: false, zeilen: zeilen, reserve: 0, bemerkung: '' };
  }

  /* ---------------------------------------------------------------
     Default-Projekt
     --------------------------------------------------------------- */

  A.defaultProject = function () {
    var p = {
      schema: A.SCHEMA,
      id: A.uid(),
      name: 'Neues Projekt',
      ort: '',
      parzelle: '',                      // Parzellennummer, frei erfasst
      /* Standort für die Karte im Portfolio. Wird über die Adresssuche
         gefüllt und ist von Hand überschreibbar; einmal ermittelt,
         fragt nie wieder jemand nach. */
      geo: { lat: 0, lon: 0, bezeichnung: '', gesucht: '' },
      firma: '',                         // Immobiliengefäss — Liste in der Verwaltung
      kanton: 'ZH',
      bearbeiter: '',
      startdatum: A.heute(),                 // Erwerb — alle Termine bauen darauf auf
      startjahr: new Date().getFullYear(),   // wird aus startdatum abgeleitet
      stand: A.heute(),
      status: 'Prüfung',
      notiz: '',
      stufe: 'standard',                 // schnell | standard | detail
      szenario: 'neubau',
      erwerbsart: 'kauf',                // kauf | baurecht
      meta: {},                          // Datenherkunft je Feldpfad
      formeln: {},                       // Formeltext je Feldpfad; der Wert
                                         // selbst steht im Feld — der
                                         // Rechenkern sieht nur Zahlen

      /* Beteiligte dieses Projekts. Verweist auf die firmenweite
         Adressliste; Rolle und Verteilerhaken gehören dem Projekt. */
      beteiligte: [],

      /* Welches Logo auf Protokoll und Bericht steht. Leer = das in
         der Verwaltung als Standard markierte. */
      briefkopf: '',

      /* Traktanden, die nur in diesem Projekt in jeder Sitzung
         vorkommen. Ergänzen die firmenweite Vorgabe der Reihe. */
      standardpunkte: [],

      /* Terminplan. Zweite Zeitebene neben den Rechendauern: hier
         stehen Kalenderdaten, dort Monate. Beide bleiben getrennt —
         ein verschobener Sitzungstermin darf die Marge nicht still
         verändern. Die Übernahme geschieht auf Knopfdruck.
           phasen = SIA-Phasen mit Von/Bis, dashboard = im Portfolio zeigen
           eigene = frei erfasste Termine und Meilensteine */
      /* vorgaenge = Zeilen des Gantt-Diagramms (Start, Dauer,
         Abhängigkeit); phasen/eigene sind die Vorgängerstruktur und
         bleiben leer stehen, damit ein alter Stand lesbar bleibt. */
      termine: { vorgaenge: [], phasen: [], eigene: [] },

      /* Das für dieses Grundstück geltende Baurecht. Die Fragen stehen
         im firmenweiten Katalog, die Antworten hier:
           eintraege = { punktId: { wert, bemerkung, status } }
           eigene    = Prüfpunkte, die es nur in diesem Projekt gibt */
      baurecht: { eintraege: {}, eigene: [] },

      grundstueck: {
        flaeche: 2500,
        az_modus: 'az',                  // 'az' = über Ausnützungsziffer, 'agf' = direkt
        az: 0.90,
        az_bonus: 0,                     // % Zuschlag auf die Ziffer (Arealbonus o. ä.)
        agf_direkt: 0,                   // anrechenbare Geschossfläche, wenn keine AZ vorliegt
        bemerkung: '',                   // Notiz zur Ausnutzung
        geschosse: 4,                    // VOLLGESCHOSSE, ohne Attika
        attika_anrechenbar: true,        // false = Attika kommt zusätzlich zur aGF
        attika_pct: 60,                  // % der Gebäudegrundfläche, wenn nicht anrechenbar
        umgebung_manuell: 0,             // >0 überschreibt Grundstück − Gebäudegrundfläche
        mehrwertabgabe_aktiv: false,
        mehrwertabgabe_pct: 20,
        mehrwert_basis: 0                // CHF Planungsmehrwert
      },

      teile: {
        bestand:     defTeil(false, 'studie'),
        neubau:      defTeil(true,  'ausnutzung'),
        erweiterung: defTeil(false, 'studie')
      },

      bestand_extra: {
        strategie: 'sanierung',          // sanierung | abriss | erhalten
        gv: 0,                           // m³ GV Bestand (für Abbruchkosten)
        zwischennutzung: true,
        zn_miete: 0,                     // CHF/Jahr Nettomietertrag bis Baustart
        zn_kosten_pct: 25                // % Bewirtschaftungskosten auf ZN-Miete
      },

      erwerb: {
        preis_modus: 'total',            // total | m2_land | m2_agf
        preis_total: 3500000,
        preis_m2_land: 1400,
        preis_m2_agf: 1550,
        baurecht_zins: 0,                // CHF/Jahr
        baurecht_einmal: 0,              // CHF Einmalentschädigung
        notariat: 0.20,                  // % Kaufpreis
        grundbuch: 0.25,                 // % Kaufpreis
        handaenderung: 0.00,             // % Kaufpreis (Total)
        handaenderung_anteil: 50,        // % davon zu Lasten Käufer
        courtage: 2.00,                  // % Kaufpreis
        /* erwerb_bau = Erwerbskosten (ohne dieses Honorar) + Baukosten
           ohne Projektmanagement- und Dritthonorare. */
        entwicklung_basis: 'erwerb_bau', // erwerb_bau | anlagekosten | landwert | gewinn
        entwicklung_pct: 2.50,
        /* Preisvorstellung der Gegenseite — reine Notiz, fliesst nicht in
           die Rechnung ein. Dient dem Vergleich mit dem Kaufpreis. */
        wunschpreis: 0,
        bemerkung: '',
        dd: 25000,
        geometer: 15000,
        recht: 20000
      },

      bau: {
        neubau:      defBaublock('neubau'),
        erweiterung: defBaublock('erweiterung'),
        sanierung:   defBaublock('sanierung'),
        teuerung_aktiv: false,
        teuerung_pct: 1.5,
        mwst_modus: 'inkl',              // inkl | exkl
        mwst_satz: 8.1,
        vorsteuer_aktiv: false           // Vorsteuerabzug auf optierten Gewerbeanteil
      },

      spiegel: {
        aktiv: false,
        teil: 'neubau',
        /* Je Einheit: {nr, anzahl, geschoss, zimmer, flaeche, preis, zeile}
           «anzahl» fasst gleichwertige Wohnungen zusammen — Fläche und
           Preis gelten je Einheit und werden mit der Anzahl multipliziert.
           «zeile» verweist auf eine Nutzungszeile — darüber erbt die
           Einheit Art und Verwertung. Ohne Spiegel gilt der
           Durchschnittspreis der Zeile. */
        einheiten: []
      },

      vermarktung: {
        verkauf_pct: 1.90,               // % Verkaufserlös STWE
        vermietung_monate: 1.50,         // Monatsmieten je Erstvermietung
        marketing_basis: 'pct',          // pct | pauschal
        marketing_pct: 0.50,             // % vom Erlös
        marketing_fix: 0,
        muster: 60000,                   // Musterwohnung / Visualisierung
        beurkundung_verkauf: 0.15,       // % Verkaufserlös (Anteil Verkäufer)
        exit_nebenkosten: 1.00,          // % Exit-Erlös
        /* false = es gilt die Firmenvorgabe aus der Verwaltung, die beim
           Öffnen des Projektes eingesetzt wird. true = dieses Projekt
           führt einen eigenen Plan und bleibt von der Vorgabe unberührt. */
        zahlungsplan_eigen: false,
        /* Fristen rund um die Beurkundung und Schätzwerte für die beiden
           von Hand freigegebenen Bautermine. «eigen» wird gesetzt, sobald
           ein Wert von der Firmenvorgabe abweicht. */
        fristen: {
          eigen: false,
          tagebuch_tage: 10,          // Beurkundung → Tagebucheintrag
          nach_tagebuch_tage: 3,      // Tagebucheintrag → Zahlung
          decke_ug_pct: 20,           // % der Bauzeit, bis ein Datum erfasst ist
          unterlagsboden_pct: 75
        },
        /* «frei» hält fest, dass eine Rate fällig gestellt bzw. bezahlt
           ist; «datum» das tatsächliche Zahlungsdatum. Beides sind
           Projektfakten und keine Firmenvorgabe — sie überleben deshalb
           das Einsetzen der Vorgabe. */
        zahlungsplan: [
          { label: 'Beurkundung / Anzahlung', anteil: 20, bezug: 'beurkundung' },
          { label: 'Baustart',                anteil: 30, bezug: 'baustart' },
          { label: 'Rohbau fertig',           anteil: 30, bezug: 'rohbau' },
          { label: 'Übergabe',                anteil: 20, bezug: 'uebergabe' }
        ]
      },

      betrieb: {
        verwaltung:  { basis: 'pct_miete', wert: 3.5 },
        unterhalt:   { basis: 'pct_ak',    wert: 1.0 },
        versicher:   { basis: 'pct_ak',    wert: 0.3 },
        nk_nicht_um: { basis: 'pct_miete', wert: 2.0 },
        erneuerung:  { basis: 'pct_miete', wert: 0.0 },
        leerstand: 3.0,                  // % der Sollmiete
        erstvermietung: 0.5              // Jahre bis Vollvermietung
      },

      /* Alle Dauern in MONATEN. Der Rechenkern teilt intern durch 12. */
      zeit: {
        dauer_entwicklung: 18,           // Erwerb → Baueingabe
        dauer_bewilligung: 12,           // Baueingabe → rechtskräftige Bewilligung
        dauer_vorbereitung: 3,           // Bewilligung → Baustart
        dauer_bau: 21,
        verkaufsstart_rel_bb: 0,         // Monate relativ zur Baubewilligung
        dauer_verkauf: 24,
        exit_verzoegerung: 3,            // Monate nach Fertigstellung
        kostenkurve: 's',                // s | linear — gilt im Modus «auto»
        /* Verteilung der Baukosten und damit des Kapitalbedarfs.
           auto   = wie bisher, je Zeilenart über die passende Phase
           phasen = Prozentwerte je Projektphase, innerhalb linear */
        verteilung_modus: 'auto',        // auto | phasen
        verteilung: {
          entwicklung: 0,                // Erwerb → Baueingabe
          bewilligung: 5,                // Baueingabe → Baubewilligung
          vorbereitung: 15,              // Baubewilligung → Baustart
          bau: 80                        // Baustart → Fertigstellung
        }
      },

      finanzierung: {
        ek_quote: 30,                    // % der Gesamtinvestition (Rückfallwert)
        /* Vor der Baubewilligung finanzieren Banken zurückhaltender —
           deshalb beide Phasen getrennt erfassbar. */
        ek_quote_vor_bb: 60,
        ek_quote_nach_bb: 30,
        ek_einsatz: 'proportional',      // proportional | zuerst
        ltc_max: 70,                     // % Deckel Fremdkapital
        zins_vor_bb: 3.50,
        zins_nach_bb: 2.75,
        bereitstellung: 0.25,            // % p.a. auf nicht beanspruchte Limite
        /* Das Eigenkapital stellt in der Regel der Mutterkonzern verzinst
           zur Verfügung — für die Projektgesellschaft sind das echte
           Kosten. Der Zins läuft deshalb wie der Fremdkapitalzins in
           Kapitalbedarf, Gewinn, Marge, Rendite und internen Zinsfuss. */
        ek_zins_aktiv: true,
        ek_zins: 8.00,                   // kalkulatorisch
        bauzinsen_aktivieren: true,
        vorverkauf_quote: 40,            // % Erlös vor Baustart
        staffel: [                       // Zinsrabatt nach Vorverkaufsquote
          { ab: 30, bp: 25 },
          { ab: 50, bp: 50 }
        ]
      },

      bestandsrechnung: {
        haltedauer: 10,
        diskontsatz: 4.00,
        exit_cap: 4.00,                  // Nettorendite für den Terminal Value
        wachstum_miete: 0.50,            // % p.a.
        hypothek_ltv: 65,
        hypothek_zins: 2.00
      },

      bewertung: {
        rendite_halten: 4.00,            // Bruttorendite zur Wertermittlung Halteanteil
        exit_rendite: 4.00,              // Vorgabe Kapitalisierungssatz Exit an Investor;
                                         // eine Nutzungszeile darf davon abweichen
        exit_netto: false                // true = Nettorendite statt Brutto beim Exit
      },

      steuern: { aktiv: false, satz: 20 },

      ziele: { marge: 15, bruttorendite: 4.0 },

      /* Verkaufsstand aus der zentralen Verkaufsübersicht. «stand» ist der
         beim Aktualisieren eingefrorene Auszug des zugeordneten Projekts —
         der Rechenkern bleibt damit netzwerkfrei und Snapshots frieren den
         Verkaufsstand mit ein. Die Erlöse je verkaufte Einheit trägt der
         Anwender selbst ein (die Übersicht liefert nur den Status). */
      verkauf: {
        /* '' = kein Verkauf · 'uebersicht' = zentrale Verkaufsübersicht ·
           'manuell' = eigene Liste für Projekte ohne öffentliche
           Vermarktungsseite. Beide Quellen liefern dieselbe Struktur,
           der Rechenkern unterscheidet sie nicht. */
        modus: '',
        projekt_id: '',                  // id in der Verkaufsübersicht
        stand: null,                     // { datum, geholt, einheiten: [...] }
        manuell: [],                     // eigene Einheitenliste, gleiche Struktur
        preise: {},                      // Erlös je Einheiten-Nr, manuell erfasst
        /* Beurkundungs- und Übergabedatum je Einheiten-Nr. Beide stehen
           bewusst neben dem eingefrorenen Stand, damit sie eine
           Aktualisierung überleben. */
        daten: {},
        uebergaben: {}
      },

      ist: {},                           // Ist-Werte je Kostenzeile
      bezahlt: {},                       // bereits geflossene Beträge je Kostenzeile —
                                         // wirken auf den Kapitalbedarf und damit
                                         // auf die Finanzierungskosten
      vertrag: {},                       // Kennzeichen «vertraglich gesichert» je Zeile;
                                         // reine Dokumentation, ohne Rechenwirkung
      stichtag: A.heute(),               // Stand der Zahlungen — Grenze zwischen
                                         // geflossen und noch offen
      ist_uebernehmen: true,             // Ist-Werte ersetzen den Soll-Betrag
      snapshots: [],
      archiviert_am: null,               // gesetzt = aus Listen und Portfolio ausgeblendet
      version: 1                         // Zähler gegen stilles Überschreiben
    };

    A.applyKanton(p, p.kanton);
    A.applySzenario(p, p.szenario);   // aktiviert Gebäudeteile und Kostenblöcke
    return p;
  };

  A.applyKanton = function (p, kt) {
    var k = A.KANTONE[kt] || A.KANTONE.XX;
    p.erwerb.handaenderung = k.haend;
    p.erwerb.grundbuch = k.gbg;
    p.steuern.satz = k.gewinnsteuer;
    return p;
  };

  /* Szenario setzt die Gebäudeteile und Kostenblöcke konsistent auf.
     Wird ein Gebäudeteil erstmals aktiviert, erhält er plausible Startflächen —
     ein leeres Formular nach dem Szenariowechsel wäre für die Bedienung wertlos. */
  A.applySzenario = function (p, sz) {
    p.szenario = sz;
    var t = p.teile, b = p.bau;

    function startflaechen(teil, gf) {
      if (teil.gf_oi > 0 || teil.nwf_manuell > 0) return;
      teil.gf_oi = Math.round(gf / 10) * 10;
    }

    /* Ein neu aktivierter Gebäudeteil ohne Nutzungszeilen wäre wertlos —
       er brächte weder Fläche noch Ertrag in die Rechnung. */
    function startnutzungen(teil) {
      if (!Array.isArray(teil.nutzungen) || !teil.nutzungen.length) {
        teil.nutzungen = A.standardNutzungen();
      }
    }
    A.TEILE.forEach(function (T) {
      var teil = t[T.id];
      if (teil && teil.aktiv) startnutzungen(teil);
    });
    var land = num0(p.grundstueck.flaeche);
    if (sz !== 'neubau') {
      startflaechen(t.bestand, land * 0.55);
      if (!num0(p.bestand_extra.gv)) {
        p.bestand_extra.gv = Math.round((t.bestand.gf_oi + t.bestand.gf_ug) * t.bestand.gv_faktor);
      }
    }
    if (sz === 'sanierung_erweiterung') startflaechen(t.erweiterung, t.bestand.gf_oi * 0.30);

    switch (sz) {
      case 'neubau':
        t.bestand.aktiv = false; t.neubau.aktiv = true; t.erweiterung.aktiv = false;
        b.neubau.aktiv = true; b.erweiterung.aktiv = false; b.sanierung.aktiv = false;
        p.bestand_extra.strategie = 'erhalten';
        break;
      case 'abriss_neubau':
        t.bestand.aktiv = false; t.neubau.aktiv = true; t.erweiterung.aktiv = false;
        b.neubau.aktiv = true; b.erweiterung.aktiv = false; b.sanierung.aktiv = false;
        p.bestand_extra.strategie = 'abriss';
        b.neubau.zeilen.b1_abbruch.aktiv = true;
        if (!b.neubau.zeilen.b1_abbruch.wert) b.neubau.zeilen.b1_abbruch.wert = 95;
        break;
      case 'sanierung':
        t.bestand.aktiv = true; t.neubau.aktiv = false; t.erweiterung.aktiv = false;
        b.neubau.aktiv = false; b.erweiterung.aktiv = false; b.sanierung.aktiv = true;
        p.bestand_extra.strategie = 'sanierung';
        break;
      case 'sanierung_erweiterung':
        t.bestand.aktiv = true; t.neubau.aktiv = false; t.erweiterung.aktiv = true;
        b.neubau.aktiv = false; b.erweiterung.aktiv = true; b.sanierung.aktiv = true;
        p.bestand_extra.strategie = 'sanierung';
        break;
    }

    A.TEILE.forEach(function (T) {
      var teil = t[T.id];
      if (!teil || !teil.aktiv) return;
      if (!Array.isArray(teil.nutzungen) || !teil.nutzungen.length) {
        teil.nutzungen = A.standardNutzungen();
      }
    });
    return p;
  };

  /* ---------------------------------------------------------------
     Migration älterer Projektdateien
     --------------------------------------------------------------- */

  A.migrate = function (p) {
    if (!p || typeof p !== 'object') return null;

    var version = p.schema || 1;

    /* --- Schema 2 -> 3: Phasendauern in Monaten, Vollgeschosse ohne
       Attika, Umrechnungsfaktor neutral. -------------------------------- */
    if (version < 3) {
      if (p.zeit) {
        ['dauer_entwicklung', 'dauer_bewilligung', 'dauer_vorbereitung', 'dauer_bau',
         'verkaufsstart_rel_bb', 'dauer_verkauf', 'exit_verzoegerung'].forEach(function (k) {
          if (typeof p.zeit[k] === 'number') p.zeit[k] = Math.round(p.zeit[k] * 12 * 10) / 10;
        });
      }
      /* Bisher zählte das oberste Geschoss als Dachgeschoss mit; neu sind
         die Geschosse Vollgeschosse und die Attika kommt separat dazu. */
      if (p.grundstueck && p.grundstueck.geschosse > 1 && p.grundstueck.attika_anrechenbar === undefined) {
        p.grundstueck.attika_anrechenbar = true;
      }
      p.zeit_in_monaten = true;
    }

    /* --- Schema 1 -> 2: Nutzungen wurden von festen Feldern zu freien
       Zeilen, die Kubatur bekam eigene Bereiche für Untergeschoss und
       Einstellhalle. --------------------------------------------------- */
    var altesSchema = version < 2;

    if (altesSchema) {
      A.TEILE.forEach(function (T) {
        var t = p.teile && p.teile[T.id];
        if (!t) return;

        /* Nutzungen: Objekt -> Liste */
        if (t.nutzungen && !Array.isArray(t.nutzungen)) {
          var alt = t.nutzungen, liste = [];
          A.NUTZUNGEN.forEach(function (n) {
            var c = alt[n.id];
            if (!c) return;
            if (!(c.anteil > 0 || c.flaeche_manuell > 0)) return;
            liste.push(A.defNutzung({
              bezeichnung: n.label, art: n.id,
              anteil: c.anteil, flaeche_manuell: c.flaeche_manuell,
              miete: c.miete, preis: c.preis, verwertung: c.verwertung,
              selbst: c.selbst, exit_rendite: c.exit_rendite
            }));
          });
          if (t.pp > 0) {
            liste.push(A.defNutzung({
              bezeichnung: 'Parkplätze', art: 'parkplatz', anteil: 100,
              miete: t.pp_miete !== undefined ? t.pp_miete : 150,
              preis: t.pp_preis !== undefined ? t.pp_preis : 45000,
              verwertung: t.pp_verwertung || 'stwe'
            }));
          }
          t.nutzungen = liste;
        }

        /* Untergeschoss: war Anteil der Geschossfläche oberirdisch,
           ist neu Anteil der Gebäudegrundfläche. */
        if (t.gf_ug > 0 && !t.ug_quote_migriert) {
          t.ug_flaeche_alt = t.gf_ug;
        }
        if (t.ug_quote === undefined || t.ug_quote <= 20) t.ug_quote = 80;
        t.ug_quote_migriert = true;
      });

      /* Umgebungsfläche wird neu aus der Gebäudegrundfläche gerechnet.
         Ein früher gesetzter Anteil bleibt als fester Wert erhalten. */
      if (p.grundstueck && p.grundstueck.umgebung_anteil > 0 && !p.grundstueck.umgebung_manuell) {
        p.grundstueck.umgebung_manuell =
          Math.round(p.grundstueck.flaeche * p.grundstueck.umgebung_anteil / 100);
      }

      /* Baukosten: die alten Zeilen für Rohbau, Technik, Ausbau, Parkierung
         und Honorare gehen in den neuen, zusammengefassten Zeilen BKP 20–29
         auf. Eine rechnerische Umschlüsselung wäre nur scheingenau — die
         neuen Zeilen starten deshalb auf den Kennwerten der Bibliothek und
         werden als prüfbedürftig markiert. */
      ['neubau', 'erweiterung', 'sanierung'].forEach(function (bid) {
        var b = p.bau && p.bau[bid];
        if (!b || !b.zeilen) return;
        if (b.reserve > 0 && b.zeilen.b2_reserve === undefined) {
          b.reserve_alt = b.reserve;
        }
        ['b2_rohbau', 'b2_technik', 'b2_ausbau', 'b2_park', 'b2_honorare'].forEach(function (k) {
          if (b.zeilen[k]) { b.zeilen[k + '_alt'] = b.zeilen[k]; delete b.zeilen[k]; }
        });
      });
      /* Vor dem Zusammenführen ableiten, sonst überschreibt die Vorgabe
         (heutiges Datum) das aus dem Startjahr gewonnene Datum. */
      if (!p.startdatum && p.startjahr) p.startdatum = p.startjahr + '-01-01';
      p.baukosten_pruefen = true;
    }

    /* Fehlende Zweige aus dem Default ergänzen (rekursiv, ohne Werte zu
       überschreiben). Listen bleiben unangetastet. */
    var def = A.defaultProject();
    (function merge(target, source) {
      Object.keys(source).forEach(function (k) {
        if (target[k] === undefined) {
          target[k] = A.clone(source[k]);
        } else if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k]) &&
                   target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
          merge(target[k], source[k]);
        }
      });
    })(p, def);

    /* Nutzungszeilen auf Vollständigkeit bringen */
    A.TEILE.forEach(function (T) {
      var t = p.teile[T.id];
      if (!Array.isArray(t.nutzungen)) t.nutzungen = [];
      t.nutzungen = t.nutzungen.map(function (n) { return A.defNutzung(n); });
    });

    /* Einheiten des Wohnungsspiegels einer Nutzungszeile zuordnen */
    if (p.spiegel && Array.isArray(p.spiegel.einheiten)) {
      var teil = p.teile[p.spiegel.teil];
      var standard = teil && teil.nutzungen
        ? (teil.nutzungen.find(function (n) { return n.art === 'wohnen'; }) || {}).id
        : null;
      p.spiegel.einheiten.forEach(function (e) {
        if (!e.zeile) e.zeile = p.spiegel.zeile || standard || null;
      });
      delete p.spiegel.zeile;
    }

    /* --- Schema 3 -> 4: Dritthonorare wandern in die Baukosten (BKP 558.1),
       BKP 20–29 rechnen neu über die Kubatur, «Anpassungen an bestehende
       Bauten» über die Grundstücksfläche, neue Zeile BKP 1 Vorbereitungs-
       arbeiten. Läuft bewusst nach dem Zusammenführen mit den Vorgaben,
       damit die Geometrie für die Umrechnung vollständig vorliegt.
       Alle Umstellungen sind betragsneutral: der Kennwert wird so
       umgerechnet, dass derselbe Frankenbetrag herauskommt. ------------- */
    if (version < 4) {
      var geo = null;
      try { geo = A.engine.flaechen(p, []); } catch (e) { geo = null; }

      function umbasieren(z, bid, neu) {
        if (!geo || !z || z.basis === neu) return;
        var alt = A.engine.mengeFor(z.basis, bid, geo, p);
        var neuM = A.engine.mengeFor(neu, bid, geo, p);
        var betrag = z.basis === 'pauschal' ? num0(z.wert) : alt * num0(z.wert);
        z.basis = neu;
        z.wert = neuM > 0 ? Math.round(betrag / neuM * 100) / 100 : 0;
      }

      ['neubau', 'erweiterung', 'sanierung'].forEach(function (bid) {
        var b = p.bau && p.bau[bid];
        if (!b || !b.zeilen) return;
        umbasieren(b.zeilen.b2_oi_stwe,    bid, 'gv_oi_stwe');
        umbasieren(b.zeilen.b2_oi_miete,   bid, 'gv_oi_miete');
        umbasieren(b.zeilen.b2_oi_gewerbe, bid, 'gv_oi_gewerbe');
        umbasieren(b.zeilen.b1_anpassung,  bid, 'gsf');

        /* Neue Zeile Vorbereitungsarbeiten: startet auf 0 %, damit die
           Umstellung an bestehenden Kalkulationen nichts verschiebt. Der
           Prozentwert ist von Hand zu setzen — neue Projekte starten auf
           dem Kennwert der Bibliothek. */
        b.zeilen.b1_vorbereitung = b.zeilen.b1_vorbereitung ||
          { aktiv: true, menge_manuell: 0 };
        b.zeilen.b1_vorbereitung.basis = 'pct_bkp2';
        b.zeilen.b1_vorbereitung.wert = 0;

        /* Dritthonorare aus den Erwerbskosten übernehmen. Der Prozentsatz
           bezog sich früher auf die Anlagekosten, neu auf BKP 1–4 — der
           Betrag ändert sich dadurch. */
        var e = p.erwerb || {};
        var traeger = (p.bau.neubau && p.bau.neubau.aktiv) ? 'neubau'
                    : (p.bau.sanierung && p.bau.sanierung.aktiv) ? 'sanierung' : 'erweiterung';
        b.zeilen.b5_dritt = b.zeilen.b5_dritt || { aktiv: true, menge_manuell: 0 };
        b.zeilen.b5_dritt.basis = 'pct_bkp1_4';
        b.zeilen.b5_dritt.wert = 0;
        if (bid === traeger) {
          if (e.dritthonorare_basis === 'pauschal' && num0(e.dritthonorare_fix) > 0) {
            b.zeilen.b5_dritt.basis = 'pauschal';
            b.zeilen.b5_dritt.wert = num0(e.dritthonorare_fix);
          } else {
            b.zeilen.b5_dritt.wert = num0(e.dritthonorare_pct);
          }
        }
      });

      if (p.erwerb) {
        delete p.erwerb.dritthonorare_basis;
        delete p.erwerb.dritthonorare_pct;
        delete p.erwerb.dritthonorare_fix;
        if (p.erwerb.entwicklung_basis === 'anlagekosten') p.erwerb.entwicklung_basis = 'erwerb_bau';
      }
      if (p.ist) {
        delete p.ist['erwerb.dritthonorare'];
      }
    }

    /* --- Schema 4 -> 5: Die Baunebenkosten BKP 5 beziehen sich neu auf
       BKP 20–29 statt auf BKP 1–4. Der Prozentsatz bleibt stehen, der
       Betrag ändert sich dadurch bewusst — die bisherige Bezugsgrösse
       war zu weit gefasst. ---------------------------------------------- */
    if (version < 5) {
      ['neubau', 'erweiterung', 'sanierung'].forEach(function (bid) {
        var b = p.bau && p.bau[bid];
        if (!b || !b.zeilen || !b.zeilen.b5_bnk) return;
        if (b.zeilen.b5_bnk.basis === 'pct_bkp1_4') b.zeilen.b5_bnk.basis = 'pct_bkp2';
      });
    }

    /* --- Schema 5 -> 6: Der Kapitalisierungssatz Exit ist neu eine Vorgabe
       in den Bewertungsannahmen. Bestehende Nutzungszeilen behalten ihren
       eigenen Satz, damit sich nichts verschiebt; die Vorgabe übernimmt den
       Satz der ersten Exit-Zeile, sonst bleibt sie auf 4.00 %. --------- */
    if (version < 6) {
      var ersterExit = 0;
      A.TEILE.forEach(function (T) {
        ((p.teile[T.id] || {}).nutzungen || []).forEach(function (n) {
          if (!ersterExit && n.verwertung === 'exit' && num0(n.exit_rendite) > 0) {
            ersterExit = num0(n.exit_rendite);
          }
        });
      });
      if (p.bewertung && ersterExit > 0) p.bewertung.exit_rendite = ersterExit;

      /* Wohnungsspiegel: jede bestehende Einheit steht für genau eine Wohnung. */
      if (p.spiegel && Array.isArray(p.spiegel.einheiten)) {
        p.spiegel.einheiten.forEach(function (e) {
          if (!(num0(e.anzahl) > 0)) e.anzahl = 1;
        });
      }
    }

    /* --- Schema 6 -> 7: Eigenkapitalquote je Phase. Bestehende Projekte
       übernehmen ihre bisherige Quote für beide Phasen, damit sich nichts
       verschiebt. Der kalkulatorische Eigenkapitalzins bleibt dort
       ausgeschaltet, wo er es war — neue Projekte starten mit ihm. ----- */
    if (version < 7 && p.finanzierung) {
      /* Läuft nach dem Zusammenführen mit den Vorgaben — die dort
         ergänzten Werte werden hier bewusst durch die bisherige Quote
         des Projektes ersetzt. */
      p.finanzierung.ek_quote_vor_bb = num0(p.finanzierung.ek_quote);
      p.finanzierung.ek_quote_nach_bb = num0(p.finanzierung.ek_quote);
    }

    /* --- Schema 7 -> 8: Zahlungsstand je Kostenzeile. Ohne erfasste
       Beträge ändert sich an der Rechnung nichts. ---------------------- */
    if (version < 8) {
      if (!p.bezahlt || typeof p.bezahlt !== 'object') p.bezahlt = {};
      if (!p.vertrag || typeof p.vertrag !== 'object') p.vertrag = {};
      if (!p.stichtag) p.stichtag = A.heute();
    }

    /* --- Schema 8 -> 9: Verkaufsstand kennt neu eine eigene Liste für
       Projekte ohne öffentliche Vermarktungsseite. Eine bestehende
       Zuordnung zur Übersicht bleibt bestehen. ------------------------ */
    if (version < 9 && p.verkauf) {
      if (!p.verkauf.modus) p.verkauf.modus = p.verkauf.projekt_id ? 'uebersicht' : '';
      if (!Array.isArray(p.verkauf.manuell)) p.verkauf.manuell = [];
    }

    /* --- Schema 9 -> 10: Zahlungsplan kennt neu eine Firmenvorgabe.
       Bestehende Projekte behalten ihren Plan — sie gelten als eigener
       Plan, damit eine Vorgabe sie nicht rückwirkend umstellt. -------- */
    if (version < 10 && p.vermarktung) {
      p.vermarktung.zahlungsplan_eigen = true;
    }

    /* --- Schema 10 -> 11: Freigabe und Zahlungsdatum je Rate,
       Beurkundungsdatum je verkaufte Einheit. Ohne Eintrag rechnet alles
       wie bisher. --------------------------------------------------- */
    if (version < 11) {
      if (p.verkauf && (!p.verkauf.daten || typeof p.verkauf.daten !== 'object')) {
        p.verkauf.daten = {};
      }
      if (p.vermarktung && Array.isArray(p.vermarktung.zahlungsplan)) {
        p.vermarktung.zahlungsplan.forEach(function (r) {
          if (r.frei === undefined) r.frei = false;
          if (r.datum === undefined) r.datum = '';
        });
      }
    }

    /* --- Schema 11 -> 12: «bei Übergabe» bezieht seinen Termin neu aus
       dem Übergabedatum der Einheit statt aus dem Bauende. Der Schlüssel
       heisst deshalb «uebergabe»; «fertigstellung» wird umgeschrieben. -- */
    if (version < 12) {
      if (p.vermarktung && Array.isArray(p.vermarktung.zahlungsplan)) {
        p.vermarktung.zahlungsplan.forEach(function (r) {
          if (r.bezug === 'fertigstellung') r.bezug = 'uebergabe';
        });
      }
      if (p.verkauf && (!p.verkauf.uebergaben || typeof p.verkauf.uebergaben !== 'object')) {
        p.verkauf.uebergaben = {};
      }
    }

    /* --- Schema 12 -> 13: Standort für die Karte. Ohne Koordinaten
       erscheint das Projekt schlicht nicht auf ihr. ------------------- */
    if (version < 13 && (!p.geo || typeof p.geo !== 'object')) {
      p.geo = { lat: 0, lon: 0, bezeichnung: '', gesucht: '' };
    }

    /* --- Schema 13 -> 14: Beteiligte je Projekt. Ohne Liste gibt es
       keine Empfänger für Protokolle und keine Zuständigen für
       Aufgaben. ------------------------------------------------------- */
    if (version < 14 && !Array.isArray(p.beteiligte)) p.beteiligte = [];

    /* --- Schema 14 -> 15: Terminplan je Projekt. -------------------- */
    if (version < 15 || !p.termine || typeof p.termine !== 'object') {
      p.termine = p.termine && typeof p.termine === 'object' ? p.termine : {};
    }
    if (!Array.isArray(p.termine.phasen)) p.termine.phasen = [];
    if (!Array.isArray(p.termine.eigene)) p.termine.eigene = [];

    /* --- Schema 15 -> 16: Briefkopfwahl und projekteigene
       Standardtraktanden. ------------------------------------------- */
    if (typeof p.briefkopf !== 'string') p.briefkopf = '';
    if (!Array.isArray(p.standardpunkte)) p.standardpunkte = [];

    /* --- Schema 16 -> 17: Thema und Priorität an den Protokollpunkten.
       Die Punkte selbst liegen in der Tabelle «sitzungen» und werden
       beim Lesen ergänzt (A.defPunkt); hier nur die projekteigenen
       Standardpunkte. ------------------------------------------------ */
    (p.standardpunkte || []).forEach(function (x) {
      if (typeof x.thema !== 'string') x.thema = '';
      if (typeof x.prio !== 'string') x.prio = '';
    });

    /* --- Schema 20 -> 21: Der Terminplan wird ein echtes Gantt.
       Aus den SIA-Phasen mit Von/Bis und den eigenen Terminen werden
       Vorgänge mit Start und Dauer in Tagen. Die alten Listen bleiben
       vorerst liegen — ein Projekt, das noch mit der vorigen Fassung
       geöffnet wird, verliert dadurch nichts. ------------------------ */
    if (!Array.isArray(p.termine.vorgaenge)) {
      var neue = [];
      (p.termine.phasen || []).forEach(function (e) {
        if (!e.von && !e.bis) return;
        var ph = A.SIA_PHASEN.find(function (x) { return x.id === e.id; });
        var tage = A.tageZwischen(e.von, e.bis);
        neue.push(A.defVorgang({
          label: ph ? (ph.sia ? ph.label + ' (SIA ' + ph.sia + ')' : ph.label) : e.id,
          sia: e.id, start: e.von || '', tage: tage > 0 ? tage + 1 : 30,
          dashboard: !!e.dashboard,
          farbe: { entwicklung: 'dunkelblau', bewilligung: 'gelb',
                   vorbereitung: 'grau', bau: 'blau' }[ph && ph.rechen] || 'blau'
        }));
      });
      (p.termine.eigene || []).forEach(function (e) {
        var von = e.von || e.bis, bis = e.bis || e.von;
        if (!von) return;
        var t = A.tageZwischen(von, bis);
        neue.push(A.defVorgang({
          label: e.text || 'Termin', start: von,
          tage: e.meilenstein ? 1 : (t > 0 ? t + 1 : 1),
          dashboard: !!e.dashboard, farbe: e.meilenstein ? 'gruen' : 'tuerkis'
        }));
      });
      /* Die Reihenfolge ist die zeitliche — so, wie man einen Plan
         liest. Verkettet wird nichts: Wer Abhängigkeiten will, setzt
         sie selbst, statt dass ihm eine erfundene Kette untergeschoben
         wird. */
      neue.sort(function (a, b) {
        return String(a.start || '9999').localeCompare(String(b.start || '9999'));
      });
      p.termine.vorgaenge = neue;
    }

    /* --- Schema 19 -> 20: Baurecht-Check. Bestehende Projekte
       starten mit leeren Einträgen; die Fragen kommen aus dem
       firmenweiten Katalog. -------------------------------------- */
    if (!p.baurecht || typeof p.baurecht !== 'object') p.baurecht = {};
    if (!p.baurecht.eintraege || typeof p.baurecht.eintraege !== 'object') {
      p.baurecht.eintraege = {};
    }
    if (!Array.isArray(p.baurecht.eigene)) p.baurecht.eigene = [];

    /* Startdatum aus einem vorhandenen Startjahr ableiten */
    if (!p.startdatum && p.startjahr) p.startdatum = p.startjahr + '-01-01';
    if (p.startdatum) p.startjahr = parseInt(String(p.startdatum).slice(0, 4), 10) || p.startjahr;

    p.schema = A.SCHEMA;
    if (!p.id) p.id = A.uid();
    return p;
  };

  /* ---------------------------------------------------------------
     Persistenz (localStorage) — Portfolio als Liste von Projekten
     --------------------------------------------------------------- */

  var KEY = 'projektrechner.v1';

  function readAll() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return { projekte: [], aktiv: null };
      var d = JSON.parse(raw);
      if (!d || !Array.isArray(d.projekte)) return { projekte: [], aktiv: null };
      return d;
    } catch (e) {
      console.warn('Speicher nicht lesbar:', e);
      return { projekte: [], aktiv: null };
    }
  }

  function writeAll(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); return true; }
    catch (e) { console.warn('Speichern fehlgeschlagen:', e); return false; }
  }

  /* Die Auswahl des aktiven Projektes ist eine Vorliebe des Anwenders
     und bleibt auch im Firmenbetrieb lokal. */
  A.aktivMerken = {
    lesen: function () { try { return localStorage.getItem(KEY + '.aktiv'); } catch (e) { return null; } },
    setzen: function (id) { try { localStorage.setItem(KEY + '.aktiv', id || ''); } catch (e) {} }
  };

  /* Lokale Speicherung — Einzelplatz, ohne Anmeldung.
     Gleiche Schnittstelle wie die Serverspeicherung in store-server.js,
     damit die Anwendung nicht wissen muss, woher die Daten kommen. */
  A.storeLokal = {
    modus: 'lokal',
    init: function () { return Promise.resolve(); },
    alle: function (mitArchiv) {
      return readAll().projekte.map(A.migrate).filter(function (p) {
        return mitArchiv ? true : !p.archiviert_am;
      });
    },
    all: function () { return A.storeLokal.alle(false); },
    aktivId: function () { return A.aktivMerken.lesen() || readAll().aktiv; },
    setAktiv: function (id) { A.aktivMerken.setzen(id); var d = readAll(); d.aktiv = id; writeAll(d); },
    load: function (id) {
      var p = readAll().projekte.find(function (x) { return x.id === id; });
      return p ? A.migrate(p) : null;
    },
    save: function (p) {
      var d = readAll(), i = d.projekte.findIndex(function (x) { return x.id === p.id; });
      p.stand = A.heute();
      if (i >= 0) d.projekte[i] = p; else d.projekte.push(p);
      d.aktiv = p.id;
      return Promise.resolve({ ok: writeAll(d) });
    },
    archivieren: function (id) {
      var d = readAll(), p = d.projekte.find(function (x) { return x.id === id; });
      if (p) { p.archiviert_am = new Date().toISOString(); writeAll(d); }
      return Promise.resolve({ ok: true });
    },
    reaktivieren: function (id) {
      var d = readAll(), p = d.projekte.find(function (x) { return x.id === id; });
      if (p) { p.archiviert_am = null; writeAll(d); }
      return Promise.resolve({ ok: true });
    },
    remove: function (id) {
      var d = readAll();
      d.projekte = d.projekte.filter(function (x) { return x.id !== id; });
      if (d.aktiv === id) d.aktiv = d.projekte.length ? d.projekte[0].id : null;
      return Promise.resolve({ ok: writeAll(d) });
    },
    replaceAll: function (list) {
      var d = { projekte: list, aktiv: list.length ? list[0].id : null };
      return Promise.resolve({ ok: writeAll(d) });
    },
    protokoll: function () { return Promise.resolve([]); },
    kommentare: function () { return Promise.resolve([]); },
    kommentieren: function () { return Promise.resolve(null); },

    /* --- Sitzungsprotokolle ------------------------------------------
       Eigener Speicherplatz, nicht im Projekt: ein Protokoll wird
       geschrieben, während jemand anders an den Zahlen rechnet. Im
       lokalen Modus gibt es zwar niemand anderen, aber dieselbe
       Schnittstelle wie auf dem Server. */
    sitzungen: function (projektId) {
      var liste = leseSitzungen().filter(function (s) { return s.projekt_id === projektId; });
      return Promise.resolve(liste.map(A.sitzungLesen).filter(Boolean));
    },
    sitzungSpeichern: function (s) {
      var alle = leseSitzungen();
      var i = alle.findIndex(function (x) { return x.id === s.id; });
      s.version = (s.version || 0) + 1;
      s.geaendert_am = new Date().toISOString();
      if (i >= 0) alle[i] = s; else alle.push(s);
      schreibeSitzungen(alle);
      return Promise.resolve({ ok: true, sitzung: s });
    },
    sitzungLoeschen: function (id) {
      schreibeSitzungen(leseSitzungen().filter(function (x) { return x.id !== id; }));
      return Promise.resolve({ ok: true });
    }
  };

  var SITZUNGEN_KEY = 'projektrechner.sitzungen';

  function leseSitzungen() {
    try {
      var l = JSON.parse(localStorage.getItem(SITZUNGEN_KEY) || '[]');
      return Array.isArray(l) ? l : [];
    } catch (e) { return []; }
  }

  function schreibeSitzungen(liste) {
    try { localStorage.setItem(SITZUNGEN_KEY, JSON.stringify(liste)); return true; }
    catch (e) { return false; }
  }

  A.store = A.storeLokal;   // wird beim Start ggf. auf den Server umgestellt

  /* ---------------------------------------------------------------
     Zahlenformate (CH)
     --------------------------------------------------------------- */

  A.fmt = function (n, dez) {
    if (n === undefined || n === null || isNaN(n)) return '–';
    dez = dez === undefined ? 0 : dez;
    var s = Math.abs(n).toFixed(dez), parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '’');
    return (n < 0 ? '−' : '') + parts.join('.');
  };

  /* Text für die Ausgabe in HTML entschärfen. Projektnamen sind freie
     Eingabe und landen etwa in den Kartenkarten im Markup. */
  A.escape = function (t) {
    return String(t === null || t === undefined ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  A.fmtMio = function (n) {
    if (n === undefined || n === null || isNaN(n)) return '–';
    if (Math.abs(n) >= 1e6) return A.fmt(n / 1e6, 2) + ' Mio.';
    if (Math.abs(n) >= 1e3) return A.fmt(n / 1e3, 0) + '′000';
    return A.fmt(n, 0);
  };

  A.fmtPct = function (n, dez) {
    if (n === undefined || n === null || isNaN(n) || !isFinite(n)) return '–';
    return A.fmt(n, dez === undefined ? 1 : dez) + ' %';
  };

})(window.APP);
