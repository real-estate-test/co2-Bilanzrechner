/* =====================================================================
   Projektrechner · Datenmodell, Defaults, Kennwerte, Persistenz
   Klassisches Script (kein Build-Step) — Namespace window.APP
   ===================================================================== */
window.APP = window.APP || {};
(function (A) {
  'use strict';

  A.SCHEMA = 4;

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
    pct_bkp1_4:    '% von BKP 1–4',
    pct_bkp1_5:    '% von BKP 1–5'
  };

  A.BKP_KATALOG = [
    { id: 'b1_abbruch',   bkp: '1',     label: 'Abbruch / Rückbau Bestand',
      hilfe: 'Nur relevant, wenn der Bestand zurückgebaut wird. Menge = Gebäudevolumen Bestand.' },
    { id: 'b1_altlasten', bkp: '1',     label: 'Altlasten / Entsorgung' },
    { id: 'b1_vorbereitung', bkp: '1',  label: 'Vorbereitungsarbeiten',
      hilfe: 'Prozentual auf BKP 20–29 vor Reserve — also auf Stockwerkeigentum, Miete, ' +
             'Gewerbe, Untergeschoss und Einstellhalle.' },
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
    { id: 'b2_reserve',   bkp: '202',   label: 'Reserve auf BKP 20–29' },

    { id: 'b3_betrieb',   bkp: '3',     label: 'Betriebseinrichtungen' },
    { id: 'b4_umgebung',  bkp: '4',     label: 'Umgebung' },
    { id: 'b5_dritt',     bkp: '558.1', label: 'Dritthonorare',
      hilfe: 'Externe Fachplanung und Beratung ausserhalb der Kennwerte der BKP 20–29.' },
    { id: 'b5_bnk',       bkp: '5',     label: 'Baunebenkosten, Bewilligungen, Versicherungen' },
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
      b2_reserve:    { basis: 'pct_bkp2',      wert: 3,    min: 0,    max: 10   },
      b3_betrieb:    { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b4_umgebung:   { basis: 'umgebung',   wert: 150,   min: 80,   max: 550   },
      b5_dritt:      { basis: 'pct_bkp1_4', wert: 0.5,   min: 0,    max: 4     },
      b5_bnk:        { basis: 'pct_bkp1_4', wert: 3,     min: 1.5,  max: 6     },
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
      b2_reserve:    { basis: 'pct_bkp2',      wert: 3,    min: 0,    max: 10   },
      b3_betrieb:    { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b4_umgebung:   { basis: 'umgebung',   wert: 0,     min: 0,    max: 0     },
      b5_dritt:      { basis: 'pct_bkp1_4', wert: 0.5,   min: 0,    max: 4     },
      b5_bnk:        { basis: 'pct_bkp1_4', wert: 3,     min: 1.5,  max: 6     },
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
      b5_bnk:        { basis: 'pct_bkp1_4', wert: 3,     min: 1.5,  max: 6     },
      b5_pm:         { basis: 'pct_bkp1_5', wert: 2.5,   min: 0.5,  max: 5     },
      b9_ausstat:    { basis: 'nwf',        wert: 40,    min: 0,    max: 250   }
    }
  };

  A.ZAHLUNG_BEZUG = {
    beurkundung:    'bei Beurkundung',
    baustart:       'bei Baustart',
    rohbau:         'bei Rohbau fertig',
    fertigstellung: 'bei Übergabe'
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
      exit_rendite: o.exit_rendite !== undefined ? o.exit_rendite : 4.0,
      kostengruppe: o.kostengruppe || A.kostengruppeFuer(art, o.verwertung || 'stwe')
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
      flaeche_pro_pp: 30,      // m² Einstellhalle je Parkplatz

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
        /* Je Einheit: {nr, geschoss, zimmer, flaeche, preis, zeile}
           «zeile» verweist auf eine Nutzungszeile — darüber erbt die
           Einheit Art und Verwertung. Ohne Spiegel gilt der
           Durchschnittspreis der Zeile. */
        einheiten: []
      },

      vermarktung: {
        verkauf_pct: 3.00,               // % Verkaufserlös STWE
        vermietung_monate: 1.50,         // Monatsmieten je Erstvermietung
        marketing_basis: 'pct',          // pct | pauschal
        marketing_pct: 0.50,             // % vom Erlös
        marketing_fix: 0,
        muster: 60000,                   // Musterwohnung / Visualisierung
        beurkundung_verkauf: 0.15,       // % Verkaufserlös (Anteil Verkäufer)
        exit_nebenkosten: 1.00,          // % Exit-Erlös
        zahlungsplan: [
          { label: 'Beurkundung / Anzahlung', anteil: 20, bezug: 'beurkundung' },
          { label: 'Baustart',                anteil: 30, bezug: 'baustart' },
          { label: 'Rohbau fertig',           anteil: 30, bezug: 'rohbau' },
          { label: 'Übergabe',                anteil: 20, bezug: 'fertigstellung' }
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
        kostenkurve: 's'                 // s | linear
      },

      finanzierung: {
        ek_quote: 30,                    // % der Gesamtinvestition
        ek_einsatz: 'proportional',      // proportional | zuerst
        ltc_max: 70,                     // % Deckel Fremdkapital
        zins_vor_bb: 3.50,
        zins_nach_bb: 2.75,
        bereitstellung: 0.25,            // % p.a. auf nicht beanspruchte Limite
        ek_zins_aktiv: false,
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
        exit_netto: false                // true = Nettorendite statt Brutto beim Exit
      },

      steuern: { aktiv: false, satz: 20 },

      ziele: { marge: 15, bruttorendite: 4.0 },

      ist: {},                           // Ist-Werte je Kostenzeile
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
    kommentieren: function () { return Promise.resolve(null); }
  };

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
