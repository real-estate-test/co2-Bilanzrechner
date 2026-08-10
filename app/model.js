/* =====================================================================
   Projektrechner · Datenmodell, Defaults, Kennwerte, Persistenz
   Klassisches Script (kein Build-Step) — Namespace window.APP
   ===================================================================== */
window.APP = window.APP || {};
(function (A) {
  'use strict';

  A.SCHEMA = 1;

  /* ---------------------------------------------------------------
     Stammlisten
     --------------------------------------------------------------- */

  A.NUTZUNGEN = [
    { id: 'wohnen',  label: 'Wohnen',            kurz: 'Wohnen'  },
    { id: 'buero',   label: 'Büro',              kurz: 'Büro'    },
    { id: 'gewerbe', label: 'Gewerbe',           kurz: 'Gewerbe' },
    { id: 'verkauf', label: 'Verkauf (Retail)',  kurz: 'Retail'  },
    { id: 'lager',   label: 'Lager / Nebenflächen', kurz: 'Lager' }
  ];

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
       nwf           CHF je m² Nutzfläche
       pp            CHF je Parkplatz
       umgebung      CHF je m² Umgebungsfläche
       gv_bestand    CHF je m³ Gebäudevolumen Bestand (Abbruch)
       pct_bkp2      % der Summe BKP 2
       pct_bkp1_4    % der Summe BKP 1–4
     --------------------------------------------------------------- */

  A.BASIS_LABELS = {
    pauschal: 'Pauschal', gf: 'CHF/m² GF', gf_oi: 'CHF/m² GF oi', gv: 'CHF/m³ GV',
    nwf: 'CHF/m² NWF', pp: 'CHF/PP', umgebung: 'CHF/m² Umgeb.',
    gv_bestand: 'CHF/m³ GV Best.', pct_bkp2: '% von BKP 2', pct_bkp1_4: '% von BKP 1–4'
  };

  A.BKP_KATALOG = [
    { id: 'b1_abbruch',   bkp: '1',     label: 'Abbruch / Rückbau Bestand',
      hilfe: 'Nur relevant, wenn der Bestand zurückgebaut wird. Menge = Gebäudevolumen Bestand.' },
    { id: 'b1_altlasten', bkp: '1',     label: 'Altlasten / Entsorgung' },
    { id: 'b1_anpassung', bkp: '1',     label: 'Anpassungen an bestehende Bauten',
      hilfe: 'Anschlüsse, Unterfangungen, Sicherungen an Nachbar- oder Bestandsbauten.' },
    { id: 'b1_pfaehlung', bkp: '1',     label: 'Pfählung / Wasserhaltung / Spezialtiefbau',
      hilfe: 'Baugrundbedingte Zusatzkosten: Pfähle, Spundwände, Grundwasserhaltung.' },
    { id: 'b1_erschl',    bkp: '1',     label: 'Erschliessung / Werkleitungen' },
    { id: 'b2_rohbau',    bkp: '20–22', label: 'Baugrube & Rohbau 1 + 2' },
    { id: 'b2_technik',   bkp: '23–26', label: 'Elektro · HLKS · Transportanlagen' },
    { id: 'b2_ausbau',    bkp: '27–28', label: 'Ausbau 1 + 2' },
    { id: 'b2_park',      bkp: '2',     label: 'Parkierung (Tiefgarage / Aussen)',
      hilfe: 'Vollkosten je Parkplatz. Die Tiefgaragenfläche ist deshalb NICHT in der GF enthalten.' },
    { id: 'b2_honorare',  bkp: '29',    label: 'Honorare Planung (Architekt, Ing., Fach)' },
    { id: 'b3_betrieb',   bkp: '3',     label: 'Betriebseinrichtungen' },
    { id: 'b4_umgebung',  bkp: '4',     label: 'Umgebung' },
    { id: 'b5_bnk',       bkp: '5',     label: 'Baunebenkosten, Bewilligungen, Versicherungen' },
    { id: 'b9_ausstat',   bkp: '9',     label: 'Ausstattung' }
  ];

  /* Kennwert-Bibliothek je Kostenblock. min/max = Plausibilitätsband. */
  A.KENNWERTE = {
    neubau: {
      b1_abbruch:   { basis: 'gv_bestand', wert: 0,     min: 60,   max: 140   },
      b1_altlasten: { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b1_anpassung: { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b1_pfaehlung: { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b1_erschl:    { basis: 'pauschal',   wert: 120000,min: 0,    max: 0     },
      b2_rohbau:    { basis: 'gf',         wert: 1150,  min: 850,  max: 1600  },
      b2_technik:   { basis: 'gf',         wert: 620,   min: 420,  max: 950   },
      b2_ausbau:    { basis: 'gf',         wert: 880,   min: 600,  max: 1500  },
      b2_park:      { basis: 'pp',         wert: 48000, min: 30000,max: 75000 },
      b2_honorare:  { basis: 'pct_bkp2',   wert: 12,    min: 9,    max: 16    },
      b3_betrieb:   { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b4_umgebung:  { basis: 'umgebung',   wert: 280,   min: 150,  max: 550   },
      b5_bnk:       { basis: 'pct_bkp1_4', wert: 3,     min: 1.5,  max: 6     },
      b9_ausstat:   { basis: 'nwf',        wert: 60,    min: 0,    max: 250   }
    },
    erweiterung: {
      b1_abbruch:   { basis: 'gv_bestand', wert: 0,     min: 0,    max: 0     },
      b1_altlasten: { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b1_anpassung: { basis: 'pauschal',   wert: 150000,min: 0,    max: 0     },
      b1_pfaehlung: { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b1_erschl:    { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b2_rohbau:    { basis: 'gf',         wert: 1300,  min: 900,  max: 1900  },
      b2_technik:   { basis: 'gf',         wert: 680,   min: 420,  max: 1050  },
      b2_ausbau:    { basis: 'gf',         wert: 950,   min: 600,  max: 1600  },
      b2_park:      { basis: 'pp',         wert: 48000, min: 30000,max: 75000 },
      b2_honorare:  { basis: 'pct_bkp2',   wert: 14,    min: 10,   max: 18    },
      b3_betrieb:   { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b4_umgebung:  { basis: 'umgebung',   wert: 0,     min: 0,    max: 0     },
      b5_bnk:       { basis: 'pct_bkp1_4', wert: 3,     min: 1.5,  max: 6     },
      b9_ausstat:   { basis: 'nwf',        wert: 60,    min: 0,    max: 250   }
    },
    sanierung: {
      b1_abbruch:   { basis: 'gv_bestand', wert: 0,     min: 0,    max: 0     },
      b1_altlasten: { basis: 'pauschal',   wert: 60000, min: 0,    max: 0     },
      b1_anpassung: { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b1_pfaehlung: { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b1_erschl:    { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b2_rohbau:    { basis: 'gf',         wert: 350,   min: 120,  max: 800   },
      b2_technik:   { basis: 'gf',         wert: 480,   min: 200,  max: 850   },
      b2_ausbau:    { basis: 'gf',         wert: 700,   min: 300,  max: 1400  },
      b2_park:      { basis: 'pp',         wert: 0,     min: 0,    max: 0     },
      b2_honorare:  { basis: 'pct_bkp2',   wert: 15,    min: 10,   max: 20    },
      b3_betrieb:   { basis: 'pauschal',   wert: 0,     min: 0,    max: 0     },
      b4_umgebung:  { basis: 'umgebung',   wert: 0,     min: 0,    max: 0     },
      b5_bnk:       { basis: 'pct_bkp1_4', wert: 3,     min: 1.5,  max: 6     },
      b9_ausstat:   { basis: 'nwf',        wert: 40,    min: 0,    max: 250   }
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

  /* ---------------------------------------------------------------
     Default-Nutzungszeile
     --------------------------------------------------------------- */

  function defNutzung(anteil, miete, preis, verwertung) {
    return {
      anteil: anteil,          // % der NWF des Gebäudeteils
      flaeche_manuell: 0,      // >0 überschreibt den Anteil
      miete: miete,            // CHF/m²/Jahr netto
      preis: preis,            // CHF/m² NWF bei STWE-Verkauf
      verwertung: verwertung,
      selbst: 0,               // % selbstgenutzt
      exit_rendite: 4.0        // Bruttorendite % beim Exit an Investor
    };
  }

  function defTeil(aktiv, modus) {
    var n = {};
    n.wohnen  = defNutzung(100, 320, 9500, 'stwe');
    n.buero   = defNutzung(0,   280, 7000, 'halten_vermietet');
    n.gewerbe = defNutzung(0,   180, 5000, 'halten_vermietet');
    n.verkauf = defNutzung(0,   320, 8000, 'halten_vermietet');
    n.lager   = defNutzung(0,   100, 2500, 'halten_vermietet');
    return {
      aktiv: aktiv,
      modus: modus,            // 'ausnutzung' | 'studie'
      gf_oi: 0,                // Studie: Geschossfläche oberirdisch m²
      gf_ug: 0,                // Studie: UG ohne Tiefgarage m²
      nwf_manuell: 0,          // Studie: NWF direkt (überschreibt hnf_quote)
      gv_manuell: 0,           // Studie: Gebäudevolumen m³
      faktor_gf: 1.10,         // GF oberirdisch je m² aGF
      ug_quote: 15,            // UG (ohne TG) in % der GF oberirdisch
      hnf_quote: 78,           // NWF in % der GF oberirdisch
      gv_faktor: 3.40,         // m³ GV je m² GF
      pp: 0,                   // Anzahl Parkplätze
      pp_miete: 150,           // CHF/Monat
      pp_preis: 45000,         // CHF/PP bei Verkauf
      pp_verwertung: 'stwe',
      nutzungen: n
    };
  }

  function defBaublock(art) {
    var zeilen = {}, kw = A.KENNWERTE[art];
    A.BKP_KATALOG.forEach(function (z) {
      var k = kw[z.id];
      zeilen[z.id] = { aktiv: k.wert !== 0, basis: k.basis, wert: k.wert, menge_manuell: 0 };
    });
    return { aktiv: false, zeilen: zeilen, reserve: 5, bemerkung: '' };
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
      startjahr: new Date().getFullYear(),   // Kalenderjahr des Erwerbs
      stand: A.heute(),
      status: 'Prüfung',
      notiz: '',
      stufe: 'standard',                 // schnell | standard | detail
      szenario: 'neubau',
      erwerbsart: 'kauf',                // kauf | baurecht
      meta: {},                          // Datenherkunft je Feldpfad

      grundstueck: {
        flaeche: 2500,
        az: 0.90,
        umgebung_anteil: 55,             // % der Grundstücksfläche
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
        entwicklung_basis: 'anlagekosten', // anlagekosten | landwert | gewinn
        entwicklung_pct: 2.50,
        dritthonorare_basis: 'pct_ak',   // pct_ak | pauschal
        dritthonorare_pct: 0.50,
        dritthonorare_fix: 0,
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
        einheiten: []                    // {nr, geschoss, zimmer, flaeche, preis}
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

      zeit: {
        dauer_entwicklung: 1.50,         // Kauf → Baueingabe
        dauer_bewilligung: 1.00,         // Baueingabe → rechtskräftige BB
        dauer_vorbereitung: 0.25,        // BB → Baustart
        dauer_bau: 1.75,
        verkaufsstart_rel_bb: 0.00,      // Jahre relativ zur Baubewilligung
        dauer_verkauf: 2.00,
        exit_verzoegerung: 0.25,         // Jahre nach Fertigstellung
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

      steuern: { aktiv: true, satz: 20 },

      ziele: { marge: 15, bruttorendite: 4.0 },

      ist: {},                           // Ist-Werte je Kostenzeile
      snapshots: []
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
      teil.gf_ug = Math.round(gf * 0.15 / 10) * 10;
    }
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
    return p;
  };

  /* ---------------------------------------------------------------
     Migration älterer Projektdateien
     --------------------------------------------------------------- */

  A.migrate = function (p) {
    if (!p || typeof p !== 'object') return null;
    var def = A.defaultProject();
    // Fehlende Zweige aus dem Default ergänzen (rekursiv, ohne Werte zu überschreiben)
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

  A.store = {
    all: function () { return readAll().projekte.map(A.migrate); },
    aktivId: function () { return readAll().aktiv; },
    setAktiv: function (id) { var d = readAll(); d.aktiv = id; writeAll(d); },
    save: function (p) {
      var d = readAll(), i = d.projekte.findIndex(function (x) { return x.id === p.id; });
      p.stand = A.heute();
      if (i >= 0) d.projekte[i] = p; else d.projekte.push(p);
      d.aktiv = p.id;
      return writeAll(d);
    },
    load: function (id) {
      var p = readAll().projekte.find(function (x) { return x.id === id; });
      return p ? A.migrate(p) : null;
    },
    remove: function (id) {
      var d = readAll();
      d.projekte = d.projekte.filter(function (x) { return x.id !== id; });
      if (d.aktiv === id) d.aktiv = d.projekte.length ? d.projekte[0].id : null;
      return writeAll(d);
    },
    replaceAll: function (list) {
      var d = { projekte: list, aktiv: list.length ? list[0].id : null };
      return writeAll(d);
    }
  };

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
