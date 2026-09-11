/* =====================================================================
   Projektrechner · Terminplan

   Der Rechenkern kennt nur Dauern in Monaten ab Startdatum. Der
   Terminplan arbeitet mit Kalenderdaten und speist sich aus drei
   Quellen:

     · SIA-Phasen        — von Hand gesetzt oder aus dem Bauzeitmodell
                           vorgeschlagen
     · Protokollaufgaben — Start = Sitzungsdatum, Ende = Termin
     · eigene Einträge   — Termine und Meilensteine ohne Protokollbezug

   Beide Zeitwelten bleiben getrennt: Ein verschobener Sitzungstermin
   verändert die Marge nicht. Die Übernahme in die Rechnung geschieht
   auf Knopfdruck und ist damit eine Entscheidung, kein Nebeneffekt.
   ===================================================================== */
window.APP = window.APP || {};
(function (A) {
  'use strict';

  var U = A.ui, el = U.el, s = U.s;
  var T = {};
  A.terminplan = T;

  /* Farben der vier Rechenphasen — dieselben wie im Portfolio, damit
     ein Balken überall dasselbe bedeutet. */
  T.RECHENFARBEN = {
    entwicklung:  '#7c93b3',
    bewilligung:  '#b0871f',
    vorbereitung: '#8a8f99',
    bau:          '#1f5fd0'
  };

  /* ---------------------------------------------------------------
     Phasen des Projekts
     --------------------------------------------------------------- */

  T.phase = function (p, id) {
    return (p.termine.phasen || []).find(function (x) { return x.id === id; }) || null;
  };

  T.phaseSetzen = function (p, id, werte) {
    var ph = T.phase(p, id);
    if (!ph) {
      ph = { id: id, von: '', bis: '', dashboard: false };
      p.termine.phasen.push(ph);
    }
    Object.keys(werte || {}).forEach(function (k) { ph[k] = werte[k]; });
    return ph;
  };

  /* Vorschlag aus dem Bauzeitmodell: Die SIA-Phasen teilen sich den
     Zeitraum ihrer Rechenphase der Reihe nach. Das ist ein Startpunkt
     zum Korrigieren, keine Planung — deshalb nur auf Knopfdruck und
     mit Rückfrage, wenn schon Daten stehen. */
  T.vorschlagen = function (p, r) {
    if (!p.startdatum) return 0;
    var Z = r.zeit;
    var grenzen = {
      entwicklung:  [0, Z.t_baueingabe],
      bewilligung:  [Z.t_baueingabe, Z.t_bb],
      vorbereitung: [Z.t_bb, Z.t_baustart],
      bau:          [Z.t_baustart, Z.t_bauende]
    };
    var n = 0;
    Object.keys(grenzen).forEach(function (rechen) {
      /* Sammelrubriken (gewicht 0) bekommen keine Zeitspanne — sie
         laufen quer durchs Projekt und wären als Balken irreführend. */
      var drin = A.SIA_PHASEN.filter(function (ph) {
        return ph.rechen === rechen && ph.gewicht > 0;
      });
      if (!drin.length) return;
      var von = grenzen[rechen][0], bis = grenzen[rechen][1];
      var summe = drin.reduce(function (a, ph) { return a + ph.gewicht; }, 0);
      var laufend = von;
      drin.forEach(function (ph) {
        var dauer = (bis - von) * ph.gewicht / summe;
        T.phaseSetzen(p, ph.id, {
          von: A.datumPlusJahre(p.startdatum, laufend),
          bis: A.datumPlusJahre(p.startdatum, laufend + dauer)
        });
        laufend += dauer;
        n++;
      });
    });
    return n;
  };

  /* ---------------------------------------------------------------
     Alle Balken einsammeln

     Ein Balken: { id, art, text, von, bis, phase, beteiligter, status,
                   quelle, herkunft, meilenstein }
     art: phase | aufgabe | entscheid | eigen | meilenstein
     --------------------------------------------------------------- */

  T.balken = function (p, opts) {
    opts = opts || {};
    var raus = [];
    var beteiligte = A.beteiligteListe(p);

    function person(id) {
      return beteiligte.find(function (b) { return b.id === id; }) || null;
    }

    /* 1 · Phasen */
    if (!opts.ohnePhasen) {
      A.SIA_PHASEN.forEach(function (ph) {
        var e = T.phase(p, ph.id);
        if (!e || !e.von || !e.bis) return;
        raus.push({
          id: 'phase:' + ph.id, art: 'phase', text: A.phaseLabel(ph.id),
          von: e.von, bis: e.bis, phase: ph.id, rechen: ph.rechen,
          dashboard: !!e.dashboard, quelle: 'phase'
        });
      });
    }

    /* 2 · Aufgaben und Entscheide aus den Protokollen */
    var sitzungen = (A.protokolle && A.protokolle.stand.projekt === p.id)
      ? A.protokolle.stand.liste : [];
    sitzungen.forEach(function (si) {
      var reihe = A.reihe(si.reihe);
      (si.punkte || []).forEach(function (pt) {
        if (pt.typ === 'info') return;
        var ende = pt.termin || si.datum;
        if (!ende) return;
        var start = pt.start || si.datum || ende;
        raus.push({
          id: 'punkt:' + pt.id, art: pt.typ,
          text: pt.text || '(ohne Text)',
          von: start, bis: ende,
          phase: pt.phase, thema: pt.thema, beteiligter: pt.beteiligter,
          person: person(pt.beteiligter),
          status: pt.status,
          meilenstein: pt.typ === 'entscheid',
          quelle: 'protokoll',
          herkunft: (reihe ? (reihe.kuerzel || reihe.label) : si.reihe) + ' ' + si.nummer +
                    ' · ' + A.datum(si.datum),
          sitzung: si.id
        });
      });
    });

    /* 3 · Eigene Termine und Meilensteine */
    (p.termine.eigene || []).forEach(function (e) {
      if (!e.bis && !e.von) return;
      raus.push({
        id: 'eigen:' + e.id, art: e.meilenstein ? 'meilenstein' : 'eigen',
        text: e.text || '(ohne Text)',
        von: e.von || e.bis, bis: e.bis || e.von,
        phase: e.phase, thema: e.thema || '', beteiligter: e.beteiligter,
        person: person(e.beteiligter),
        status: e.status || 'offen',
        meilenstein: !!e.meilenstein,
        dashboard: !!e.dashboard,
        quelle: 'eigen', eintrag: e
      });
    });

    return raus;
  };

  /* Gliederung wie im Protokoll: Phase → Zuständigkeit → Einträge.
     Der Phasenbalken selbst führt seine Gruppe an. */
  T.nachPhasen = function (p, balken) {
    var beteiligte = A.beteiligteListe(p);
    var reihenfolge = {};
    beteiligte.forEach(function (b, i) { reihenfolge[b.id] = i; });

    var gruppen = [];
    A.SIA_PHASEN.forEach(function (ph) {
      var drin = balken.filter(function (b) { return b.phase === ph.id; });
      if (!drin.length) return;

      var kopf = drin.find(function (b) { return b.art === 'phase'; }) || null;
      var rest = drin.filter(function (b) { return b.art !== 'phase'; });

      var planer = [];
      rest.forEach(function (b) {
        var key = b.beteiligter || '';
        var g = planer.find(function (x) { return x.id === key; });
        if (!g) {
          var pers = beteiligte.find(function (x) { return x.id === key; });
          g = { id: key, person: pers || null,
                label: pers ? [pers.rolle, pers.name].filter(Boolean).join(' · ')
                            : 'ohne Zuständigkeit',
                sort: pers ? reihenfolge[pers.id] : 9999, eintraege: [] };
          planer.push(g);
        }
        g.eintraege.push(b);
      });
      planer.sort(function (a, b) { return a.sort - b.sort; });
      planer.forEach(function (g) {
        g.eintraege.sort(function (a, b) { return String(a.bis).localeCompare(String(b.bis)); });
      });

      gruppen.push({ phase: ph, kopf: kopf, planer: planer });
    });

    /* Einträge ohne Phase kommen ans Ende — sie gingen sonst verloren */
    var ohne = balken.filter(function (b) {
      return b.art !== 'phase' && !A.SIA_PHASEN.some(function (ph) { return ph.id === b.phase; });
    });
    if (ohne.length) {
      gruppen.push({
        phase: { id: '', label: 'ohne Phase', sia: '' }, kopf: null,
        planer: [{ id: '', person: null, label: 'nicht zugeordnet', sort: 0, eintraege: ohne }]
      });
    }
    return gruppen;
  };

  /* Nach Themen — dieselbe Ordnung wie im Protokoll. Die Phasenbalken
     bleiben aussen vor: Eine Phase ist ein Zeitraum, kein Thema. */
  T.nachThemen = function (p, balken) {
    var gruppen = A.themenListe().map(function (t) {
      return { thema: t, nr: A.themaNummer(t.id), eintraege: [] };
    });
    var ohne = { thema: { id: '', label: 'ohne Thema', farbe: '#aab2bd' },
                 nr: 0, eintraege: [] };

    balken.forEach(function (b) {
      if (b.art === 'phase') return;
      var g = gruppen.find(function (x) { return x.thema.id === b.thema; });
      (g || ohne).eintraege.push(b);
    });

    gruppen.forEach(function (g) {
      g.eintraege.sort(function (a, b) {
        return String(a.bis || '9999').localeCompare(String(b.bis || '9999'));
      });
    });
    if (ohne.eintraege.length) gruppen.push(ohne);
    return gruppen.filter(function (g) { return g.eintraege.length; });
  };

  /* Flach und nach Enddatum sortiert — ohne die Phasenbalken, die in
     dieser Sicht nur stören würden. */
  T.nachFristen = function (balken) {
    return balken.filter(function (b) { return b.art !== 'phase'; })
      .slice()
      .sort(function (a, b) {
        var x = String(a.bis || '9999'), y = String(b.bis || '9999');
        if (x !== y) return x.localeCompare(y);
        return String(a.text).localeCompare(String(b.text), 'de');
      });
  };

  /* ---------------------------------------------------------------
     Zeichnung
     --------------------------------------------------------------- */

  function farbe(b) {
    if (b.art === 'phase') return T.RECHENFARBEN[b.rechen] || '#8a8f99';
    if (b.status === 'erledigt') return '#0d7a45';
    if (b.status === 'warten' || b.status === A.STATUS_UEBERNOMMEN) return '#8a8f99';
    if (b.bis && b.bis < A.heute()) return '#c02e26';     // überfällig
    if (b.art === 'entscheid' || b.meilenstein) return '#0d7a45';
    return '#1f5fd0';
  }

  T.zeichnen = function (p, zeilen, opts) {
    opts = opts || {};
    /* Zeilen: [{ tiefe, label, balken (Array), gruppe }] */
    var alle = [];
    zeilen.forEach(function (z) { alle = alle.concat(z.balken || []); });
    if (!alle.length) {
      return el('div', { class: 'muted', text: 'Noch kein Termin erfasst.' });
    }

    var min = alle.reduce(function (m, b) {
      return (!m || String(b.von) < m) ? String(b.von) : m; }, null);
    var max = alle.reduce(function (m, b) {
      return (!m || String(b.bis) > m) ? String(b.bis) : m; }, null);

    /* Auf ganze Monate runden, damit die Achse ruhig steht */
    var vonD = new Date(min.slice(0, 8) + '01');
    var bisD = new Date(max.slice(0, 8) + '01');
    bisD.setMonth(bisD.getMonth() + 1);
    var spanne = Math.max(1, (bisD - vonD) / 86400000);

    var W = 1080, links = opts.links || 330, rechts = 14;
    var zeileH = 22, kopf = 34, fuss = 10;
    var H = kopf + zeilen.length * zeileH + fuss;
    var px = function (iso) {
      var d = Date.parse(String(iso).slice(0, 10));
      if (!isFinite(d)) return links;
      return links + Math.max(0, Math.min(1, (d - vonD) / 86400000 / spanne)) *
        (W - links - rechts);
    };

    var kinder = [];

    /* Jahresraster mit Quartalsstrichen */
    var j = new Date(vonD);
    while (j <= bisD) {
      var x = px(j.toISOString().slice(0, 10));
      var jahresanfang = j.getMonth() === 0;
      kinder.push(s('line', { x1: x, y1: kopf - 14, x2: x, y2: H - fuss,
        stroke: jahresanfang ? '#cfd6df' : '#eef1f5' }));
      if (jahresanfang || j.getTime() === vonD.getTime()) {
        kinder.push(s('text', { x: x + 3, y: kopf - 18, 'font-size': 10.5, fill: '#3c4553',
          'font-weight': '640' }, String(j.getFullYear())));
      } else if (j.getMonth() % 3 === 0) {
        kinder.push(s('text', { x: x + 3, y: kopf - 18, 'font-size': 9, fill: '#8a929e' },
          'Q' + (j.getMonth() / 3 + 1)));
      }
      j.setMonth(j.getMonth() + 3);
    }

    /* Heute */
    var heute = A.heute();
    if (heute >= min && heute <= max) {
      var xh = px(heute);
      kinder.push(s('line', { x1: xh, y1: kopf - 14, x2: xh, y2: H - fuss,
        stroke: '#c02e26', 'stroke-width': 1.3 }));
      kinder.push(s('text', { x: xh + 3, y: kopf - 4, 'font-size': 9.5, fill: '#c02e26' }, 'heute'));
    }

    zeilen.forEach(function (z, i) {
      var y = kopf + i * zeileH;

      if (z.gruppe) {
        kinder.push(s('rect', { x: 0, y: y - 2, width: W, height: zeileH,
          fill: '#f4f6f8' }));
      }

      var text = z.label.length > 52 ? z.label.slice(0, 51) + '…' : z.label;
      kinder.push(s('text', { x: 6 + (z.tiefe || 0) * 13, y: y + 13, 'font-size': 11,
        fill: z.gruppe ? '#232c39' : '#3c4553',
        'font-weight': z.gruppe ? '640' : '400' }, text));

      (z.balken || []).forEach(function (b) {
        var f = farbe(b);
        var x0 = px(b.von), x1 = px(b.bis);

        var form;
        if (b.meilenstein || Math.abs(x1 - x0) < 3) {
          /* Meilenstein: Raute auf dem Datum */
          var m = px(b.bis), yy = y + 9;
          form = s('polygon', {
            points: [m, yy - 6, m + 6, yy, m, yy + 6, m - 6, yy].join(' '),
            fill: f, stroke: '#fff', 'stroke-width': 1 });
        } else {
          form = s('rect', { x: x0, y: y + 3, width: Math.max(3, x1 - x0),
            height: b.art === 'phase' ? 13 : 11, rx: 2.5, fill: f,
            opacity: b.art === 'phase' ? 0.9 : 0.95 });
        }
        /* Der volle Text samt Herkunft — die Beschriftung links ist
           abgeschnitten, der Tooltip ist es nicht. */
        form.appendChild(s('title', {}, [
          b.text,
          b.von === b.bis ? A.datum(b.bis) : A.datum(b.von) + ' – ' + A.datum(b.bis),
          b.person ? 'Zuständig: ' + (b.person.name || b.person.kuerzel) : '',
          b.herkunft ? 'aus ' + b.herkunft : '',
          b.status && b.art !== 'phase' ? 'Status: ' + b.status : ''
        ].filter(Boolean).join('\n')));
        kinder.push(form);

        /* Kürzel des Zuständigen an den Balken */
        if (b.person && b.person.kuerzel && x1 - x0 > 26) {
          kinder.push(s('text', { x: x0 + 4, y: y + 12, 'font-size': 9,
            fill: '#fff' }, b.person.kuerzel));
        }
      });
    });

    var svg = U.svg(W, H, kinder, { h: H });
    /* Beschriftungen als Titel — im SVG gibt es keine Tooltips */
    return svg;
  };

  /* ---------------------------------------------------------------
     Legende
     --------------------------------------------------------------- */

  /* ---------------------------------------------------------------
     Die Panels für die Seite «Phasen & Termine»
     --------------------------------------------------------------- */

  /* Sortiermodus und Filter überleben den Seitenwechsel */
  var Z = { modus: 'phasen', erledigte: false };
  T.ansicht = Z;
  /* ---------------------------------------------------------------
     Die Seite «Phasen & Termine»

     Oben das Gantt: links die Vorgangstabelle, rechts die Balken auf
     einer Monatsachse, dazwischen Pfeile für die Abhängigkeiten.
     Darunter die Termine aus den Protokollen als Meilensteine — sie
     haben keine Dauer und keine Abhängigkeit und gehören deshalb nicht
     in dieselbe Tabelle.
     --------------------------------------------------------------- */

  /* Ansichtszustand, überlebt den Seitenwechsel */
  /* Ein Terminplan über fünf Jahre hat sechzig Monate; bei mittlerer
     Breite sähe man davon ein Jahr. Deshalb beginnt die Achse eng. */
  var Z = { modus: 'fristen', erledigte: false, zoom: 0, schmal: false };
  T.ansicht = Z;

  /* Breite eines Monats in Pixeln je Zoomstufe. Stufe 0 rechnet sich
     aus der Plandauer: So passt der ganze Verlauf ins Bild und aufs
     Blatt — ein quer gedrucktes A4 fasst rund 950 Pixel. */
  var MONATSBREITE = [0, 26, 40, 62];
  var PASSEND_BREITE = 950;

  function monatsbreite(anzahl) {
    var b = MONATSBREITE[Z.zoom];
    if (b) return b;
    return Math.max(7, Math.min(62, Math.floor(PASSEND_BREITE / Math.max(1, anzahl))));
  }
  var ZEILE = 30;          // Höhe einer Gantt-Zeile
  var KOPF = 38;           // Höhe der Zeitachse

  T.panels = function (p) {
    var box = el('div', {});

    /* Die Protokolle liegen in einer eigenen Tabelle — ohne sie fehlen
       dem Plan die Termine aus den Sitzungen. Einmal nachladen, aber
       nicht nach einem Fehlschlag: Laden ruft render, render riefe
       wieder laden. */
    var ps = A.protokolle && A.protokolle.stand;
    if (ps && !ps.laedt && !ps.fehler && (ps.projekt !== p.id || !ps.geladen)) {
      A.protokolle.laden(p.id);
    }
    if (ps && ps.fehler) {
      box.appendChild(U.panel('Termine aus Protokollen fehlen',
        'der Terminplan selbst steht trotzdem', [A.protokolle.fehlerhinweis()]));
    }

    box.appendChild(ganttPanel(p));
    box.appendChild(meilensteinPanel(p));
    return box;
  };

  /* ---------------------------------------------------------------
     Das Gantt
     --------------------------------------------------------------- */

  function ganttPanel(p) {
    var liste = A.vorgaenge(p);
    var gerechnet = A.terminplanRechnen(p);

    var koerper = [werkzeugleiste(p, liste, gerechnet)];

    if (!liste.length) {
      koerper.push(el('div', { class: 'panelbody' }, [
        el('div', { class: 'muted', style: 'padding:10px 0',
          text: 'Noch kein Vorgang erfasst. «SIA-Phasen einsetzen» legt die zehn ' +
                'Phasen als verkettete Zeilen an, «+ Vorgang» eine einzelne.' })
      ]));
    } else {
      koerper.push(el('div', { class: 'panelbody ganttbody' },
        [ganttTafel(p, liste, gerechnet)]));
    }

    if (gerechnet.ringe.length) {
      koerper.push(el('div', { class: 'panelbody noprint' }, [
        U.hinweis('warn', 'Bei ' + gerechnet.ringe.length + ' Vorgang/Vorgängen läuft die ' +
          'Abhängigkeit im Kreis. Sie stehen auf ihrem eigenen Startdatum, bis die Kette ' +
          'aufgelöst ist — betroffene Zeilen sind rot umrandet.')
      ]));
    }

    koerper.push(el('div', { class: 'panelbody noprint' }, [
      U.hinweis('info', 'Ein Vorgang mit <b>Abhängigkeit</b> beginnt am Tag nach dem Ende ' +
        'seines Vorgängers; die <b>Verzögerung</b> schiebt ihn um weitere Tage. Sein ' +
        'Startdatum wird dann gerechnet und ist nicht mehr eingebbar. Die <b>Dauer</b> zählt ' +
        'Kalendertage, nicht Arbeitstage. Verschiebt sich ein Vorgang, wandert die ganze ' +
        'Kette mit.<br>Ein <b>Balken</b> lässt sich schieben, am rechten Rand verlängern — ' +
        'bei einem abhängigen Vorgang ändert das Schieben die Verzögerung. Die <b>Nummer</b> ' +
        'links ist der Griff: daran zieht man eine Zeile an eine andere Stelle.')
    ]));

    return U.panel('Terminplan', liste.length + (liste.length === 1
      ? ' Vorgang' : ' Vorgänge'), koerper);
  }

  function werkzeugleiste(p, liste, gerechnet) {
    var zoom = el('div', { class: 'seg noprint', style: 'display:flex;gap:0' });
    ['passend', 'eng', 'mittel', 'weit'].forEach(function (label, i) {
      var b = el('button', { class: Z.zoom === i ? 'on' : '', text: label });
      b.addEventListener('click', function () { Z.zoom = i; A.render(); });
      zoom.appendChild(b);
    });

    return el('div', { class: 'panelbody noprint',
      style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, [
      el('button', { class: 'primary schreibend', text: '+ Vorgang',
        onclick: function () { vorgangAnlegen(p); } }),
      el('button', { class: 'schreibend', text: 'SIA-Phasen einsetzen',
        title: 'Die zehn SIA-Phasen als verkettete Vorgänge anlegen',
        onclick: function () { siaEinsetzen(p); } }),
      el('button', { text: 'Dauern in die Rechnung übernehmen …',
        title: 'Ändert Kapitalbedarf, Zinsen und damit die Marge',
        disabled: liste.length ? null : '',
        onclick: function () { uebernehmen(p, gerechnet); } }),
      (function () {
        /* Die Tabelle nimmt viel Breite; wer den Zeitverlauf sehen
           will, blendet die Eingabespalten weg. Bearbeiten lässt sich
           dann nur noch Bezeichnung, Start, Dauer und der Haken. */
        var c = el('input', { type: 'checkbox', style: 'width:auto',
          checked: Z.schmal ? '' : null });
        c.addEventListener('change', function () { Z.schmal = c.checked; A.render(); });
        return el('label', { style: 'display:flex;gap:6px;align-items:center;font-size:12px',
          title: 'Abhängigkeit, Verzögerung, Ende und Farbe ausblenden' }, [
          c, el('span', { text: 'schmale Tabelle' })
        ]);
      })(),
      el('span', { class: 'muted', style: 'font-size:11px;letter-spacing:.06em;' +
        'text-transform:uppercase;margin-left:auto', text: 'Achse' }),
      zoom
    ]);
  }

  function vorgangAnlegen(p) {
    var liste = A.vorgaenge(p);
    var letzter = liste[liste.length - 1];
    liste.push(A.defVorgang({
      label: '',
      /* Ein neuer Vorgang hängt sich hinten an — das ist der Fall, den
         man fast immer meint. Lösen lässt er sich mit einem Handgriff. */
      abh: letzter ? letzter.id : '',
      start: letzter ? '' : (p.startdatum || A.heute()),
      tage: 20
    }));
    p.termine.vorgaenge = liste;
    A.markDirty(); A.render();
  }

  function siaEinsetzen(p) {
    var da = A.vorgaenge(p).length;
    if (da && !confirm('Die zehn SIA-Phasen als Vorgänge anlegen?\n\n' +
        'Die ' + da + ' bereits erfassten Zeilen bleiben stehen; die Phasen kommen ' +
        'darunter dazu.')) return;
    p.termine.vorgaenge = A.vorgaenge(p).concat(A.vorgaengeAusSia(p, A.state.r));
    A.markDirty(); A.render();
    A.meldung('ok', 'SIA-Phasen eingesetzt — Dauern aus dem Bauzeitmodell, verkettet.');
  }

  /* ---------------------------------------------------------------
     Tabelle und Balken nebeneinander
     --------------------------------------------------------------- */

  function ganttTafel(p, liste, gerechnet) {
    /* Zeitraum: vom frühesten Start bis zum spätesten Ende, auf ganze
       Monate gerundet, mit einem Monat Luft auf jeder Seite. */
    var von = null, bis = null;
    liste.forEach(function (v) {
      var g = gerechnet.byId[v.id];
      if (!g) return;
      if (!von || g.start < von) von = g.start;
      if (!bis || g.ende > bis) bis = g.ende;
    });
    if (!von) { von = p.startdatum || A.heute(); bis = von; }

    var m0 = new Date(von.slice(0, 8) + '01');
    m0.setMonth(m0.getMonth() - 1);
    var m1 = new Date(bis.slice(0, 8) + '01');
    m1.setMonth(m1.getMonth() + 2);

    var monate = [];
    var lauf = new Date(m0);
    while (lauf < m1) {
      monate.push(new Date(lauf));
      lauf.setMonth(lauf.getMonth() + 1);
    }
    var breite = monatsbreite(monate.length);
    var tagBreite = breite / 30.44;
    var gesamt = monate.length * breite;

    function x(iso) {
      var t = A.tageZwischen(m0.toISOString().slice(0, 10), iso);
      return t === null ? 0 : t * tagBreite;
    }

    /* --- linke Seite: die Tabelle --- */
    var tabelle = el('div', { class: 'gtab' });
    tabelle.appendChild(kopfzeile());
    liste.forEach(function (v, i) {
      tabelle.appendChild(vorgangZeile(p, v, i, liste, gerechnet));
    });

    /* --- rechte Seite: Achse und Balken --- */
    var flaeche = el('div', { class: 'gplan', style: 'width:' + gesamt + 'px' });
    flaeche.appendChild(zeitachse(monate, breite));

    var raster = el('div', { class: 'graster',
      style: 'height:' + (liste.length * ZEILE) + 'px' });
    monate.forEach(function (m, i) {
      raster.appendChild(el('div', { class: 'glinie' + (m.getMonth() === 0 ? ' jahr' : ''),
        style: 'left:' + (i * breite) + 'px' }));
    });

    /* Heute-Linie */
    var xh = x(A.heute());
    if (xh >= 0 && xh <= gesamt) {
      raster.appendChild(el('div', { class: 'gheute', style: 'left:' + xh + 'px',
        title: 'heute — ' + A.datum(A.heute()) }));
    }

    liste.forEach(function (v, i) {
      var g = gerechnet.byId[v.id];
      if (!g) return;
      var x0 = x(g.start), x1 = x(A.datumPlusTage(g.ende, 1));
      var balken = el('div', {
        class: 'gbalken' + (v.erledigt ? ' zu' : '') + (g.tage === 1 ? ' punkt' : ''),
        style: 'left:' + x0 + 'px;top:' + (i * ZEILE + 7) + 'px;' +
               'width:' + Math.max(4, x1 - x0) + 'px;' +
               (v.erledigt ? '' : 'background:' + A.ganttFarbe(v.farbe) + ';'),
        title: (v.label || 'ohne Bezeichnung') + '\n' +
               A.datum(g.start) + ' – ' + A.datum(g.ende) + ' · ' + g.tage + ' Tage' +
               (v.erledigt ? '\nerledigt' : '') });
      ziehbar(p, v, g, balken, tagBreite);
      raster.appendChild(balken);
    });

    flaeche.appendChild(raster);
    flaeche.appendChild(pfeile(liste, gerechnet, x, function (id) {
      return liste.findIndex(function (v) { return v.id === id; });
    }, gesamt));

    /* Beim Öffnen dorthin rollen, wo gearbeitet wird: Die Heute-Linie
       kommt ins linke Drittel, sonst steht man am Planbeginn und sucht
       die Gegenwart. */
    var scroll = el('div', { class: 'gscroll' }, [flaeche]);
    setTimeout(function () {
      if (!scroll.isConnected) return;
      var ziel = xh - scroll.clientWidth / 3;
      if (ziel > 0) scroll.scrollLeft = ziel;
    }, 0);

    return el('div', { class: 'gantt' + (Z.schmal ? ' schmal' : '') }, [tabelle, scroll]);
  }

  /* ---------------------------------------------------------------
     Balken ziehen

     Zwei Griffe in einem: Die letzten sechs Pixel verlängern den
     Vorgang, der Rest verschiebt ihn. Gerechnet wird in Tagen — die
     Mausbewegung wird durch die Tagesbreite geteilt und gerundet.

     Während des Ziehens wird nichts neu gezeichnet: Nur der Balken
     selbst wandert, und erst beim Loslassen gehen die Werte in die
     Daten. Ein Neuaufbau mitten in der Bewegung würde den Balken unter
     dem Zeiger austauschen.
     --------------------------------------------------------------- */

  function ziehbar(p, v, g, balken, tagBreite) {
    if (v.erledigt) return;          // Abgeschlossenes bleibt, wie es ist

    var RAND = 6;                    // Breite des Griffs zum Verlängern
    var zieht = null;

    balken.addEventListener('pointermove', function (e) {
      if (zieht) return;
      var amRand = e.offsetX > balken.offsetWidth - RAND;
      balken.style.cursor = amRand ? 'col-resize' : 'grab';
    });

    balken.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || !A.darfBearbeiten()) return;
      e.preventDefault();
      zieht = {
        art: e.offsetX > balken.offsetWidth - RAND ? 'laenge' : 'schieben',
        x: e.clientX,
        links0: parseFloat(balken.style.left) || 0,
        breite0: parseFloat(balken.style.width) || 0,
        tage0: g.tage, verz0: Math.round(num0(v.verz)),
        start0: g.start, tageVersatz: 0
      };
      balken.setPointerCapture(e.pointerId);
      balken.classList.add('zieht');
      anzeigeZeigen(balken, v, g, zieht);
    });

    balken.addEventListener('pointermove', function (e) {
      if (!zieht) return;
      var tage = Math.round((e.clientX - zieht.x) / tagBreite);
      if (zieht.art === 'laenge') {
        /* Unter einen Tag geht es nicht. */
        tage = Math.max(tage, 1 - zieht.tage0);
        balken.style.width = Math.max(4, zieht.breite0 + tage * tagBreite) + 'px';
      } else {
        /* Ein abhängiger Vorgang hat kein eigenes Startdatum — bei ihm
           wandert die Verzögerung, und die kann nicht negativ werden. */
        if (v.abh) tage = Math.max(tage, -zieht.verz0);
        balken.style.left = (zieht.links0 + tage * tagBreite) + 'px';
      }
      zieht.tageVersatz = tage;
      anzeigeZeigen(balken, v, g, zieht);
    });

    function beenden(e) {
      if (!zieht) return;
      var stand = zieht;
      zieht = null;
      balken.classList.remove('zieht');
      anzeigeWeg();
      try { balken.releasePointerCapture(e.pointerId); } catch (f) { /* egal */ }

      if (!stand.tageVersatz) { A.render(); return; }

      if (stand.art === 'laenge') {
        v.tage = Math.max(1, stand.tage0 + stand.tageVersatz);
      } else if (v.abh) {
        v.verz = Math.max(0, stand.verz0 + stand.tageVersatz);
      } else {
        v.start = A.datumPlusTage(stand.start0, stand.tageVersatz);
      }
      A.markDirty(); A.render();
    }
    balken.addEventListener('pointerup', beenden);
    balken.addEventListener('pointercancel', beenden);
  }

  /* Während des Ziehens steht das entstehende Datum über dem Balken —
     die Tabelle links wird ja erst nach dem Loslassen nachgeführt. */
  var anzeige = null;

  function anzeigeZeigen(balken, v, g, zieht) {
    if (!anzeige) {
      anzeige = el('div', { class: 'gzieher' });
      document.body.appendChild(anzeige);
    }
    var start = g.start, tage = g.tage;
    if (zieht.art === 'laenge') {
      tage = Math.max(1, zieht.tage0 + zieht.tageVersatz);
    } else {
      start = A.datumPlusTage(zieht.start0, zieht.tageVersatz);
    }
    anzeige.textContent = A.datum(start) + ' – ' +
      A.datum(A.datumPlusTage(start, tage - 1)) + ' · ' + tage + ' Tage' +
      (zieht.art === 'schieben' && v.abh
        ? ' · Verzug ' + Math.max(0, zieht.verz0 + zieht.tageVersatz) + ' T' : '');
    var k = balken.getBoundingClientRect();
    anzeige.style.left = (k.left + window.scrollX) + 'px';
    anzeige.style.top = (k.top + window.scrollY - 24) + 'px';
  }

  function anzeigeWeg() {
    if (anzeige) { anzeige.remove(); anzeige = null; }
  }

  function num0(x) { var n = parseFloat(x); return isFinite(n) ? n : 0; }

  function kopfzeile() {
    return el('div', { class: 'gzeile gkopf' }, [
      el('span', { class: 'gc gc-nr', text: 'Nr.' }),
      el('span', { class: 'gc gc-label', text: 'Vorgang' }),
      el('span', { class: 'gc gc-abh', text: 'Abh.', title: 'Nummer des Vorgängers' }),
      el('span', { class: 'gc gc-verz', text: 'Verz.', title: 'Verzögerung in Tagen' }),
      el('span', { class: 'gc gc-datum', text: 'Start' }),
      el('span', { class: 'gc gc-tage', text: 'Tage' }),
      el('span', { class: 'gc gc-datum', text: 'Ende' }),
      el('span', { class: 'gc gc-haken', text: '✓', title: 'erledigt' }),
      el('span', { class: 'gc gc-farbe', text: 'Farbe' }),
      el('span', { class: 'gc gc-weg' })
    ]);
  }

  function vorgangZeile(p, v, i, liste, gerechnet) {
    var g = gerechnet.byId[v.id] || { start: '', ende: '', tage: v.tage, ring: false };
    var zeile = el('div', { class: 'gzeile' + (v.erledigt ? ' zu' : '') +
      (g.ring ? ' ring' : '') });

    function geaendert() { A.markDirty(); A.render(); }

    /* Die Nummer ist zugleich der Griff zum Umsortieren. Nur sie ist
       ziehbar, nicht die ganze Zeile — sonst liesse sich in den
       Eingabefeldern kein Text mehr markieren. */
    var griff = el('span', { class: 'gc gc-nr', text: String(i + 1),
      draggable: 'true', title: 'ziehen, um die Reihenfolge zu ändern' });
    griff.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', v.id);
      e.dataTransfer.effectAllowed = 'move';
      zeile.classList.add('nimmt');
    });
    griff.addEventListener('dragend', function () {
      zeile.classList.remove('nimmt');
      alleMarkenWeg();
    });
    zeile.appendChild(griff);

    /* Abgelegt wird auf der ganzen Zeile: Die Marke zeigt, ob der
       gezogene Vorgang darüber oder darunter einsortiert wird. */
    zeile.addEventListener('dragover', function (e) {
      if (!ziehtZeile) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      var k = zeile.getBoundingClientRect();
      var oben = (e.clientY - k.top) < k.height / 2;
      zeile.classList.toggle('ueber-oben', oben);
      zeile.classList.toggle('ueber-unten', !oben);
    });
    zeile.addEventListener('dragleave', function () {
      zeile.classList.remove('ueber-oben', 'ueber-unten');
    });
    zeile.addEventListener('drop', function (e) {
      e.preventDefault();
      var id = e.dataTransfer.getData('text/plain');
      alleMarkenWeg();
      if (!id || id === v.id) return;
      var k = zeile.getBoundingClientRect();
      einsortieren(p, id, v.id, (e.clientY - k.top) < k.height / 2);
    });

    /* Bezeichnung */
    var name = el('input', { type: 'text', value: v.label || '',
      placeholder: 'Vorgang' });
    name.addEventListener('input', function () { v.label = name.value; A.markDirty(); });
    zeile.appendChild(el('span', { class: 'gc gc-label' }, [name]));

    /* Abhängigkeit — eingetragen wird die Nummer, gespeichert die Id.
       Nummern verschieben sich beim Umsortieren, Ids nicht. */
    var abh = el('input', { type: 'text', class: 'mittig',
      value: v.abh ? String(A.vorgangNummer(p, v.abh)) : '', placeholder: '–' });
    abh.addEventListener('change', function () {
      var roh = abh.value.trim();
      if (!roh) { v.abh = ''; geaendert(); return; }
      var ziel = A.vorgangNachNummer(p, roh);
      if (!ziel) {
        A.meldung('warn', 'Es gibt keinen Vorgang mit der Nummer ' + roh + '.');
        A.render(); return;
      }
      if (!A.abhaengigkeitErlaubt(p, v.id, ziel.id)) {
        A.meldung('warn', 'Das ergäbe einen Ringschluss: Vorgang ' + (i + 1) +
          ' hängt bereits — über Umwege — an Nummer ' + roh + '.');
        A.render(); return;
      }
      v.abh = ziel.id;
      geaendert();
    });
    zeile.appendChild(el('span', { class: 'gc gc-abh' }, [abh]));

    /* Verzögerung */
    var verz = el('input', { type: 'number', class: 'mittig', value: String(v.verz || 0),
      disabled: v.abh ? null : '' });
    verz.addEventListener('change', function () {
      v.verz = Math.round(parseFloat(verz.value) || 0); geaendert();
    });
    zeile.appendChild(el('span', { class: 'gc gc-verz' }, [verz]));

    /* Start — bei Abhängigkeit gerechnet und nur zum Lesen */
    if (v.abh) {
      zeile.appendChild(el('span', { class: 'gc gc-datum gerechnet',
        text: A.datum(g.start), title: 'gerechnet aus der Abhängigkeit' }));
    } else {
      var st = el('input', { type: 'date', value: v.start || '' });
      st.addEventListener('change', function () { v.start = st.value; geaendert(); });
      zeile.appendChild(el('span', { class: 'gc gc-datum' }, [st]));
    }

    /* Dauer */
    var tage = el('input', { type: 'number', class: 'mittig', min: '1',
      value: String(v.tage || 1) });
    tage.addEventListener('change', function () {
      v.tage = Math.max(1, Math.round(parseFloat(tage.value) || 1)); geaendert();
    });
    zeile.appendChild(el('span', { class: 'gc gc-tage' }, [tage]));

    /* Ende — immer gerechnet. Wer es ändert, ändert die Dauer. */
    var en = el('input', { type: 'date', value: g.ende || '' });
    en.addEventListener('change', function () {
      var t = A.tageZwischen(g.start, en.value);
      if (t === null || t < 0) {
        A.meldung('warn', 'Das Ende liegt vor dem Start.');
        A.render(); return;
      }
      v.tage = t + 1;
      geaendert();
    });
    zeile.appendChild(el('span', { class: 'gc gc-datum' }, [en]));

    /* Erledigt */
    var hk = el('input', { type: 'checkbox', checked: v.erledigt ? '' : null });
    hk.addEventListener('change', function () { v.erledigt = hk.checked; geaendert(); });
    zeile.appendChild(el('span', { class: 'gc gc-haken' }, [hk]));

    /* Farbe */
    var fw = el('select');
    A.GANTT_FARBEN.forEach(function (f) {
      fw.appendChild(el('option', { value: f.id, text: f.label,
        selected: v.farbe === f.id ? '' : null }));
    });
    fw.addEventListener('change', function () { v.farbe = fw.value; geaendert(); });
    zeile.appendChild(el('span', { class: 'gc gc-farbe' }, [
      el('span', { class: 'farbtupfer', style: 'background:' + A.ganttFarbe(v.farbe) }),
      fw
    ]));

    /* Verschieben und Löschen */
    zeile.appendChild(el('span', { class: 'gc gc-weg' }, [
      el('button', { class: 'ghost sm schreibend', text: '↑', title: 'nach oben',
        disabled: i === 0 ? '' : null,
        onclick: function () { verschieben(p, i, -1); } }),
      el('button', { class: 'ghost sm schreibend', text: '↓', title: 'nach unten',
        disabled: i === liste.length - 1 ? '' : null,
        onclick: function () { verschieben(p, i, 1); } }),
      el('button', { class: 'ghost sm schreibend', text: '×', title: 'Vorgang löschen',
        onclick: function () { loeschen(p, v); } })
    ]));

    return zeile;
  }

  /* Läuft gerade ein Zeilenumzug? Ohne diese Merkhilfe würde jede
     fremde Ablage (eine Datei aus dem Dateimanager etwa) die Zeilen
     durcheinanderbringen. */
  var ziehtZeile = false;
  document.addEventListener('dragstart', function (e) {
    ziehtZeile = !!(e.target && e.target.classList &&
                    e.target.classList.contains('gc-nr'));
  });
  document.addEventListener('dragend', function () { ziehtZeile = false; });

  function alleMarkenWeg() {
    Array.prototype.forEach.call(
      document.querySelectorAll('.gzeile.ueber-oben, .gzeile.ueber-unten'),
      function (z) { z.classList.remove('ueber-oben', 'ueber-unten'); });
  }

  /* Den gezogenen Vorgang vor oder hinter das Ziel setzen. Die
     Abhängigkeiten zeigen auf Ids, nicht auf Nummern — sie überstehen
     das Umsortieren unverändert. */
  function einsortieren(p, id, zielId, davor) {
    var liste = A.vorgaenge(p);
    var von = liste.findIndex(function (x) { return x.id === id; });
    if (von < 0) return;
    var bewegt = liste.splice(von, 1)[0];
    var ziel = liste.findIndex(function (x) { return x.id === zielId; });
    if (ziel < 0) { liste.splice(von, 0, bewegt); return; }
    liste.splice(davor ? ziel : ziel + 1, 0, bewegt);
    A.markDirty(); A.render();
  }

  function verschieben(p, i, richtung) {
    var liste = A.vorgaenge(p);
    var j = i + richtung;
    if (j < 0 || j >= liste.length) return;
    var h = liste[i]; liste[i] = liste[j]; liste[j] = h;
    A.markDirty(); A.render();
  }

  function loeschen(p, v) {
    var liste = A.vorgaenge(p);
    var haengt = liste.filter(function (x) { return x.abh === v.id; });
    if (!confirm('Vorgang «' + (v.label || 'ohne Bezeichnung') + '» löschen?' +
        (haengt.length ? '\n\n' + haengt.length + ' Vorgang/Vorgänge hängen daran und ' +
         'bekommen ihr eigenes Startdatum.' : ''))) return;
    /* Wer am Gelöschten hing, erbt dessen Startdatum — sonst spränge
       die halbe Kette an den Projektanfang. */
    var g = A.terminplanRechnen(p).byId[v.id];
    haengt.forEach(function (x) {
      x.abh = v.abh;
      if (!x.abh && g) x.start = g.start;
    });
    p.termine.vorgaenge = liste.filter(function (x) { return x.id !== v.id; });
    A.markDirty(); A.render();
  }

  /* ---------------------------------------------------------------
     Zeitachse, Pfeile
     --------------------------------------------------------------- */

  function zeitachse(monate, breite) {
    var jahre = el('div', { class: 'gjahre' });
    var mon = el('div', { class: 'gmonate' });

    var i = 0;
    while (i < monate.length) {
      var jahr = monate[i].getFullYear(), n = 0;
      while (i + n < monate.length && monate[i + n].getFullYear() === jahr) n++;
      jahre.appendChild(el('div', { class: 'gjahr', style: 'width:' + (n * breite) + 'px',
        text: String(jahr) }));
      i += n;
    }
    monate.forEach(function (m) {
      /* Bei enger Achse nur der Anfangsbuchstabe — sonst überlappen
         die Beschriftungen. */
      var name = m.toLocaleDateString('de-CH', { month: 'short' }).replace('.', '');
      mon.appendChild(el('div', { class: 'gmonat', style: 'width:' + breite + 'px',
        text: breite < 34 ? name.slice(0, 1) : name,
        title: m.toLocaleDateString('de-CH', { month: 'long', year: 'numeric' }) }));
    });
    return el('div', { class: 'gachse', style: 'height:' + KOPF + 'px' }, [jahre, mon]);
  }

  /* Die Abhängigkeitspfeile liegen als eigene Ebene über den Balken.
     Geführt werden sie vom Ende des Vorgängers zum Anfang des
     Nachfolgers, mit einem Knick — gerade Linien quer über die Tafel
     wären nicht zu verfolgen. */
  function pfeile(liste, gerechnet, x, stelle, gesamt) {
    /* U.s setzt den dritten Parameter als Text — Kinder gehören
       angehängt, nicht übergeben. */
    function sk(tag, attrs, kinder) {
      var e = s(tag, attrs);
      (kinder || []).forEach(function (k) { e.appendChild(k); });
      return e;
    }

    var kinder = [sk('defs', {}, [
      sk('marker', { id: 'gpfeilspitze', markerWidth: '7', markerHeight: '6',
        refX: '6', refY: '3', orient: 'auto' }, [
        s('polygon', { points: '0 0, 7 3, 0 6', fill: '#8a929e' })
      ])
    ])];

    liste.forEach(function (v) {
      if (!v.abh) return;
      var vonI = stelle(v.abh), bisI = stelle(v.id);
      var gv = gerechnet.byId[v.abh], gb = gerechnet.byId[v.id];
      if (vonI < 0 || bisI < 0 || !gv || !gb) return;

      var x0 = x(A.datumPlusTage(gv.ende, 1));
      var y0 = vonI * ZEILE + ZEILE / 2;
      var x1 = x(gb.start);
      var y1 = bisI * ZEILE + ZEILE / 2;

      /* Rückwärts laufende Pfeile (der Nachfolger beginnt links vom
         Vorgänger) bekommen eine Schlaufe aussen herum. */
      var d;
      if (x1 >= x0 + 8) {
        d = 'M' + x0 + ' ' + y0 + ' H' + (x1 - 6) + ' V' + y1 + ' H' + (x1 - 2);
      } else {
        var aus = x0 + 8;
        d = 'M' + x0 + ' ' + y0 + ' H' + aus +
            ' V' + (y1 - ZEILE / 2 + 3) + ' H' + (x1 - 8) +
            ' V' + y1 + ' H' + (x1 - 2);
      }
      kinder.push(s('path', { d: d, fill: 'none', stroke: '#8a929e',
        'stroke-width': '1.2', 'marker-end': 'url(#gpfeilspitze)',
        opacity: v.erledigt ? '0.35' : '0.75' }));
    });

    return sk('svg', { class: 'gpfeile', width: gesamt,
      height: liste.length * ZEILE,
      viewBox: '0 0 ' + gesamt + ' ' + (liste.length * ZEILE) }, kinder);
  }

  /* ---------------------------------------------------------------
     Meilensteine aus den Protokollen
     --------------------------------------------------------------- */

  function meilensteinPanel(p) {
    var alle = T.balken(p).filter(function (b) { return b.art !== 'phase'; });
    var sichtbar = Z.erledigte ? alle : alle.filter(function (b) {
      return b.status !== 'erledigt' && b.status !== A.STATUS_UEBERNOMMEN;
    });

    var wahl = el('div', { class: 'seg noprint', style: 'display:flex;gap:0' });
    [{ id: 'fristen', label: 'nach Datum' },
     { id: 'themen', label: 'nach Themen' }].forEach(function (m) {
      var b = el('button', { class: Z.modus === m.id ? 'on' : '', text: m.label });
      b.addEventListener('click', function () { Z.modus = m.id; A.render(); });
      wahl.appendChild(b);
    });

    var erl = el('input', { type: 'checkbox', style: 'width:auto',
      checked: Z.erledigte ? '' : null });
    erl.addEventListener('change', function () { Z.erledigte = erl.checked; A.render(); });

    var koerper = [el('div', { class: 'panelbody noprint',
      style: 'display:flex;gap:14px;align-items:center;flex-wrap:wrap' }, [
      wahl,
      el('label', { style: 'display:flex;gap:6px;align-items:center;font-size:12px' }, [
        erl, el('span', { text: 'erledigte zeigen' })
      ]),
      el('span', { class: 'muted', style: 'font-size:11.5px;margin-left:auto',
        text: alle.filter(function (b) { return b.quelle === 'protokoll'; }).length +
              ' aus Protokollen' })
    ])];

    var zeilen = [];
    if (Z.modus === 'themen') {
      T.nachThemen(p, sichtbar).forEach(function (g) {
        zeilen.push({ tiefe: 0, gruppe: true,
          label: (g.nr ? g.nr + ' · ' : '') + g.thema.label, balken: [] });
        g.eintraege.forEach(function (b) {
          zeilen.push({ tiefe: 1, balken: [b],
            label: b.text + (b.person ? '  (' + (b.person.kuerzel || b.person.name) + ')' : '') });
        });
      });
    } else {
      T.nachFristen(sichtbar).forEach(function (b) {
        zeilen.push({ tiefe: 0, balken: [b],
          label: A.datum(b.bis) + '  ' + b.text +
                 (b.person ? '  (' + (b.person.kuerzel || b.person.name) + ')' : '') });
      });
    }

    koerper.push(el('div', { class: 'panelbody' }, [
      zeilen.length
        ? T.zeichnen(p, zeilen, {})
        : el('div', { class: 'muted', text: 'Keine Termine aus den Protokollen.' })
    ]));

    koerper.push(el('div', { class: 'panelbody noprint' }, [
      U.hinweis('info', 'Diese Termine stammen aus den <b>Protokollen</b> und werden dort ' +
        'geändert. Sie haben weder Dauer noch Abhängigkeit und stehen deshalb nicht im ' +
        'Gantt darüber. Der Balken läuft vom Sitzungsdatum bis zum Termin; überfällige ' +
        'Aufgaben sind rot.')
    ]));

    return U.panel('Termine aus den Protokollen',
      sichtbar.length + (sichtbar.length === 1 ? ' Termin' : ' Termine'), koerper);
  }

  /* ---------------------------------------------------------------
     Dauern in die Rechnung übernehmen

     Der Plan rechnet für sich; die Kalkulation kennt nur Monatsdauern.
     Übertragen wird auf Knopfdruck und mit Anzeige dessen, was sich
     ändert — ein verschobener Termin darf die Marge nie still
     verändern.
     --------------------------------------------------------------- */

  function uebernehmen(p, gerechnet) {
    var raender = {};
    A.vorgaenge(p).forEach(function (v) {
      if (!v.sia) return;
      var ph = A.SIA_PHASEN.find(function (x) { return x.id === v.sia; });
      var g = gerechnet.byId[v.id];
      if (!ph || !g) return;
      var r = raender[ph.rechen] || (raender[ph.rechen] = { von: g.start, bis: g.ende });
      if (g.start < r.von) r.von = g.start;
      if (g.ende > r.bis) r.bis = g.ende;
    });

    var fehlt = ['entwicklung', 'bewilligung', 'vorbereitung', 'bau']
      .filter(function (k) { return !raender[k]; });
    if (fehlt.length) {
      A.meldung('warn', 'Für ' + fehlt.map(rechenLabel).join(', ') +
        ' fehlen Vorgänge mit SIA-Zuordnung — diese Dauern bleiben unverändert.');
    }

    var monate = function (a, b) {
      var t = A.tageZwischen(a, b);
      return t === null ? null : Math.max(0, Math.round(t / 30.44));
    };
    var alt = JSON.parse(JSON.stringify(p.zeit));
    var neu = {};

    if (raender.entwicklung) {
      /* Der Nullpunkt ist das Startdatum, nicht der Phasenbeginn */
      var m = monate(p.startdatum || raender.entwicklung.von, raender.entwicklung.bis);
      if (m !== null) neu.dauer_entwicklung = m;
    }
    ['bewilligung', 'vorbereitung', 'bau'].forEach(function (k) {
      if (!raender[k]) return;
      var mm = monate(raender[k].von, raender[k].bis);
      if (mm !== null) neu['dauer_' + k] = mm;
    });

    var zeilen = Object.keys(neu).map(function (k) {
      return el('tr', {}, [
        el('td', { text: LABELS[k] || k }),
        el('td', { class: 'n muted', text: A.fmt(alt[k], 0) + ' Mte.' }),
        el('td', { class: 'n', text: A.fmt(neu[k], 0) + ' Mte.' }),
        el('td', { class: 'n', style: 'color:' + (neu[k] === alt[k] ? 'var(--muted)' :
            (neu[k] > alt[k] ? 'var(--neg)' : 'var(--pos)')),
          text: (neu[k] - alt[k] > 0 ? '+' : '') + A.fmt(neu[k] - alt[k], 0) })
      ]);
    });

    if (!zeilen.length) {
      A.meldung('warn', 'Kein Vorgang trägt eine SIA-Zuordnung — es gibt nichts zu ' +
        'übernehmen. «SIA-Phasen einsetzen» legt solche Vorgänge an.');
      return;
    }

    U.modal('Dauern aus dem Terminplan übernehmen', el('div', {}, [
      el('div', { class: 'panelbody' }, [U.tabelle([
        { label: 'Phase' }, { label: 'bisher', n: true }, { label: 'neu', n: true },
        { label: 'Δ Monate', n: true }
      ], zeilen)]),
      el('div', { class: 'panelbody' }, [
        U.hinweis('warn', 'Das ändert die <b>Rechnung</b>: Kapitalbedarf, Bauzinsen und ' +
          'Zahlungsplan verschieben sich, und damit Marge und Rendite. Der Terminplan selbst ' +
          'bleibt, wie er ist.')
      ])
    ]), [
      el('button', { class: 'primary', text: 'Übernehmen', onclick: function () {
        Object.keys(neu).forEach(function (k) { p.zeit[k] = neu[k]; });
        A.markDirty(); A.recompute(); A.render();
        A.meldung('ok', 'Dauern übernommen — die Kennzahlen sind nachgeführt.');
        var bg = document.querySelector('.modal-bg');
        if (bg) bg.remove();
      } })
    ]);
  }

  function rechenLabel(id) {
    return { entwicklung: 'Entwicklung', bewilligung: 'Bewilligung',
             vorbereitung: 'Vorbereitung', bau: 'Bau' }[id] || id;
  }

  var LABELS = {
    dauer_entwicklung: 'Erwerb → Baueingabe',
    dauer_bewilligung: 'Baueingabe → Bewilligung',
    dauer_vorbereitung: 'Bewilligung → Baustart',
    dauer_bau: 'Bauzeit'
  };

  T.legende = function () {
    var eintraege = [
      { f: T.RECHENFARBEN.entwicklung,  l: 'Phase Entwicklung' },
      { f: T.RECHENFARBEN.bewilligung,  l: 'Phase Bewilligung' },
      { f: T.RECHENFARBEN.vorbereitung, l: 'Phase Vorbereitung' },
      { f: T.RECHENFARBEN.bau,          l: 'Phase Bau' },
      { f: '#1f5fd0', l: 'Aufgabe offen' },
      { f: '#c02e26', l: 'überfällig' },
      { f: '#0d7a45', l: 'erledigt / Entscheid' },
      { f: '#8a8f99', l: 'wartet / übernommen' }
    ];
    return el('div', { class: 'legende' }, eintraege.map(function (e) {
      return el('span', {}, [el('i', { style: 'background:' + e.f }), el('span', { text: e.l })]);
    }));
  };

})(window.APP);
