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
          phase: pt.phase, beteiligter: pt.beteiligter,
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
        phase: e.phase, beteiligter: e.beteiligter,
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
    if (b.status === 'verschoben') return '#8a8f99';
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

  T.panels = function (p) {
    var box = el('div', {});

    /* Die Protokolle liegen in einer eigenen Tabelle — ohne sie fehlen
       dem Plan die Aufgaben. Einmal nachladen, aber nicht nach einem
       Fehlschlag: Laden ruft render, render riefe wieder laden. */
    var ps = A.protokolle && A.protokolle.stand;
    if (ps && !ps.laedt && !ps.fehler && (ps.projekt !== p.id || !ps.geladen)) {
      A.protokolle.laden(p.id);
    }
    if (ps && ps.fehler) {
      box.appendChild(U.hinweis('warn', 'Die Protokolle konnten nicht geladen werden — ' +
        'Aufgaben fehlen deshalb im Plan: ' + A.escape(ps.fehler)));
    }

    var alle = T.balken(p);
    var sichtbar = Z.erledigte ? alle : alle.filter(function (b) {
      return b.art === 'phase' || b.status !== 'erledigt';
    });

    box.appendChild(planPanel(p, sichtbar, alle));
    box.appendChild(phasenPanel(p));
    box.appendChild(eigenePanel(p));
    return box;
  };

  function planPanel(p, sichtbar, alle) {
    var koerper = [];

    /* Umschalter */
    var wahl = el('div', { class: 'seg', style: 'display:flex;gap:0' });
    [{ id: 'phasen', label: 'nach Phasen' }, { id: 'fristen', label: 'nach Fristen' }]
      .forEach(function (m) {
        var b = el('button', { class: Z.modus === m.id ? 'primary' : '', text: m.label });
        b.addEventListener('click', function () { Z.modus = m.id; A.render(); });
        wahl.appendChild(b);
      });

    var erl = el('input', { type: 'checkbox', style: 'width:auto',
      checked: Z.erledigte ? '' : null });
    erl.addEventListener('change', function () { Z.erledigte = erl.checked; A.render(); });

    koerper.push(el('div', { class: 'panelbody noprint',
      style: 'display:flex;gap:14px;align-items:center;flex-wrap:wrap' }, [
      wahl,
      el('label', { style: 'display:flex;gap:6px;align-items:center;font-size:12px' }, [
        erl, el('span', { text: 'erledigte zeigen' })
      ]),
      el('span', { class: 'muted', style: 'font-size:11.5px;margin-left:auto',
        text: alle.filter(function (b) { return b.quelle === 'protokoll'; }).length +
              ' aus Protokollen · ' +
              alle.filter(function (b) { return b.quelle === 'eigen'; }).length + ' eigene' })
    ]));

    /* Zeilen aufbauen */
    var zeilen = [];
    if (Z.modus === 'phasen') {
      T.nachPhasen(p, sichtbar).forEach(function (g) {
        zeilen.push({ tiefe: 0, gruppe: true,
          label: (g.phase.sia ? g.phase.sia + ' · ' : '') + g.phase.label,
          balken: g.kopf ? [g.kopf] : [] });
        g.planer.forEach(function (pl) {
          zeilen.push({ tiefe: 1, gruppe: false, label: pl.label, balken: [] });
          pl.eintraege.forEach(function (b) {
            zeilen.push({ tiefe: 2, label: b.text, balken: [b] });
          });
        });
      });
    } else {
      T.nachFristen(sichtbar).forEach(function (b) {
        zeilen.push({ tiefe: 0,
          label: A.datum(b.bis) + '  ' + b.text +
                 (b.person ? '  (' + (b.person.kuerzel || b.person.name) + ')' : ''),
          balken: [b] });
      });
    }

    koerper.push(el('div', { class: 'panelbody' }, [
      T.zeichnen(p, zeilen, {}),
      T.legende()
    ]));

    koerper.push(el('div', { class: 'panelbody noprint' }, [
      U.hinweis('info', 'Aufgaben und Entscheide stammen aus den <b>Protokollen</b> und werden ' +
        'dort geändert. Der Balken läuft vom Sitzungsdatum bis zum Termin; überfällige ' +
        'Aufgaben sind rot. <b>Nach Fristen</b> zeigt alle Termine ohne Phasenbalken, nach ' +
        'Enddatum sortiert.')
    ]));

    return U.panel('Terminplan',
      Z.modus === 'phasen' ? 'Phase → Zuständigkeit → Termine' : 'alle Termine nach Enddatum',
      koerper);
  }

  /* Phasen mit Von/Bis und der Markierung fürs Portfolio */
  function phasenPanel(p) {
    var zeilen = A.SIA_PHASEN.map(function (ph) {
      var e = T.phase(p, ph.id) || { id: ph.id, von: '', bis: '', dashboard: false };
      var gesetzt = !!(e.von && e.bis);
      return el('tr', { style: gesetzt ? '' : 'opacity:.62' }, [
        el('td', { class: 'muted n', style: 'width:52px', text: ph.sia || '—' }),
        el('td', { text: ph.label }),
        el('td', { style: 'width:150px' }, [datumZelle(p, ph.id, 'von')]),
        el('td', { style: 'width:150px' }, [datumZelle(p, ph.id, 'bis')]),
        el('td', { class: 'n muted', style: 'width:100px',
          text: gesetzt ? dauerText(e.von, e.bis) : '—' }),
        el('td', { style: 'width:110px' }, [(function () {
          var c = el('input', { type: 'checkbox', style: 'width:auto',
            checked: e.dashboard ? '' : null,
            title: 'Diese Phase zusätzlich im Portfolio-Terminplan zeigen' });
          c.addEventListener('change', function () {
            T.phaseSetzen(p, ph.id, { dashboard: c.checked });
            A.markDirty(); A.render();
          });
          return c;
        })()]),
        el('td', { class: 'muted', style: 'width:130px',
          text: rechenLabel(ph.rechen) })
      ]);
    });

    var koerper = [el('div', { class: 'panelbody' }, [U.tabelle([
      { label: 'SIA', n: true }, { label: 'Phase' }, { label: 'von' }, { label: 'bis' },
      { label: 'Dauer', n: true }, { label: 'im Portfolio' }, { label: 'Rechenphase' }
    ], zeilen)])];

    koerper.push(el('div', { class: 'panelbody noprint',
      style: 'display:flex;gap:10px;flex-wrap:wrap;align-items:center' }, [
      el('button', { class: 'schreibend', text: 'Phasen aus Bauzeitmodell vorschlagen',
        onclick: function () {
          if (!p.startdatum) {
            A.meldung('warn', 'Ohne Startdatum gibt es keinen Nullpunkt — bitte auf der ' +
              'Seite «Projekt» eintragen.');
            return;
          }
          var belegt = (p.termine.phasen || []).some(function (x) { return x.von || x.bis; });
          if (belegt && !window.confirm('Die vorhandenen Phasendaten werden überschrieben. ' +
              'Fortfahren?')) return;
          var n = T.vorschlagen(p, A.state.r);
          A.markDirty(); A.render();
          A.meldung('ok', n + ' Phasen aus den Dauern abgeleitet — bitte prüfen und anpassen.');
        } }),
      el('button', { class: 'schreibend', text: 'Dauern aus Terminplan übernehmen',
        title: 'Schreibt die Phasendaten zurück in die Rechnung',
        onclick: function () { uebernehmen(p); } }),
      el('span', { class: 'muted', style: 'font-size:11.5px',
        text: 'Der Terminplan wirkt nicht von selbst auf die Rechnung.' })
    ]));

    return U.panel('Phasen nach SIA 102',
      'Kalendertermine der Planungs- und Bauphasen', koerper);
  }

  function rechenLabel(id) {
    var m = { entwicklung: 'Entwicklung', bewilligung: 'Bewilligung',
              vorbereitung: 'Vorbereitung', bau: 'Bau' };
    return m[id] || id;
  }

  function dauerText(von, bis) {
    var tage = A.tageZwischen(von, bis);
    if (tage === null) return '—';
    if (tage < 0) return 'negativ';
    var monate = tage / 30.44;
    return monate >= 1.5 ? A.fmt(monate, 1) + ' Mte.' : tage + ' Tage';
  }

  function datumZelle(p, phaseId, feld) {
    var e = T.phase(p, phaseId) || {};
    var i = el('input', { type: 'date', value: e[feld] || '', style: 'width:100%',
      class: 'nichtdrucken' });
    var t = el('span', { class: 'nurdruck', text: e[feld] ? A.datum(e[feld]) : '—' });
    i.addEventListener('change', function () {
      var werte = {}; werte[feld] = i.value;
      T.phaseSetzen(p, phaseId, werte);
      A.markDirty(); A.render();
    });
    return el('span', {}, [i, t]);
  }

  /* Phasendaten zurück in die Rechendauern. Nur die vier Rechenphasen
     lassen sich abbilden — der Rechenkern kennt nicht mehr. Gerechnet
     wird über die äusseren Ränder der zugeordneten SIA-Phasen. */
  function uebernehmen(p) {
    var raender = {};
    A.SIA_PHASEN.forEach(function (ph) {
      var e = T.phase(p, ph.id);
      if (!e || !e.von || !e.bis) return;
      var r = raender[ph.rechen] || (raender[ph.rechen] = { von: e.von, bis: e.bis });
      if (e.von < r.von) r.von = e.von;
      if (e.bis > r.bis) r.bis = e.bis;
    });

    var fehlt = ['entwicklung', 'bewilligung', 'vorbereitung', 'bau']
      .filter(function (k) { return !raender[k]; });
    if (fehlt.length) {
      A.meldung('warn', 'Für ' + fehlt.map(rechenLabel).join(', ') +
        ' fehlen Termine — diese Dauern bleiben unverändert.');
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
    if (raender.bewilligung) {
      var mb = monate(raender.bewilligung.von, raender.bewilligung.bis);
      if (mb !== null) neu.dauer_bewilligung = mb;
    }
    if (raender.vorbereitung) {
      var mv = monate(raender.vorbereitung.von, raender.vorbereitung.bis);
      if (mv !== null) neu.dauer_vorbereitung = mv;
    }
    if (raender.bau) {
      var mba = monate(raender.bau.von, raender.bau.bis);
      if (mba !== null) neu.dauer_bau = mba;
    }

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
      A.meldung('warn', 'Keine vollständige Phase gefunden — es gibt nichts zu übernehmen.');
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

  var LABELS = {
    dauer_entwicklung: 'Erwerb → Baueingabe',
    dauer_bewilligung: 'Baueingabe → Bewilligung',
    dauer_vorbereitung: 'Bewilligung → Baustart',
    dauer_bau: 'Bauzeit'
  };

  /* Eigene Termine und Meilensteine */
  function eigenePanel(p) {
    var beteiligte = A.beteiligteListe(p);

    var zeilen = (p.termine.eigene || []).map(function (e, i) {
      return el('tr', {}, [
        el('td', {}, [U.zelleTxt(e, 'text', { platzhalter: 'Bezeichnung' })]),
        el('td', { style: 'width:120px' }, [(function () {
          var c = el('input', { type: 'checkbox', style: 'width:auto',
            checked: e.meilenstein ? '' : null });
          c.addEventListener('change', function () {
            e.meilenstein = c.checked; A.markDirty(); A.render();
          });
          return c;
        })()]),
        el('td', { style: 'width:150px' }, [eigenDatum(e, 'von', !e.meilenstein)]),
        el('td', { style: 'width:150px' }, [eigenDatum(e, 'bis', true)]),
        el('td', { style: 'width:170px' }, [(function () {
          var sel = el('select');
          sel.appendChild(el('option', { value: '', text: '— ohne Phase —' }));
          A.SIA_PHASEN.forEach(function (ph) {
            sel.appendChild(el('option', { value: ph.id,
              text: ph.sia ? ph.sia + ' · ' + ph.label : ph.label,
              selected: e.phase === ph.id ? '' : null }));
          });
          sel.addEventListener('change', function () {
            e.phase = sel.value; A.markDirty(); A.render();
          });
          return sel;
        })()]),
        el('td', { style: 'width:160px' }, [(function () {
          var sel = el('select');
          sel.appendChild(el('option', { value: '', text: '— ohne —' }));
          beteiligte.forEach(function (b) {
            sel.appendChild(el('option', { value: b.id,
              text: [b.kuerzel, b.name].filter(Boolean).join(' · '),
              selected: e.beteiligter === b.id ? '' : null }));
          });
          sel.addEventListener('change', function () {
            e.beteiligter = sel.value; A.markDirty(); A.render();
          });
          return sel;
        })()]),
        el('td', { style: 'width:110px' }, [(function () {
          var c = el('input', { type: 'checkbox', style: 'width:auto',
            checked: e.dashboard ? '' : null,
            title: 'Im Portfolio-Terminplan zeigen' });
          c.addEventListener('change', function () {
            e.dashboard = c.checked; A.markDirty(); A.render();
          });
          return c;
        })()]),
        el('td', { class: 'w1' }, [el('button', { class: 'ghost sm schreibend', text: '×',
          onclick: function () {
            p.termine.eigene.splice(i, 1); A.markDirty(); A.render();
          } })])
      ]);
    });

    if (!zeilen.length) {
      zeilen.push(el('tr', {}, [el('td', { colspan: 8, class: 'muted',
        text: 'Kein eigener Termin erfasst.' })]));
    }

    return U.panel('Eigene Termine und Meilensteine',
      'was nicht aus einem Protokoll kommt', [
      el('div', { class: 'panelbody' }, [U.tabelle([
        { label: 'Bezeichnung' }, { label: 'Meilenstein' }, { label: 'von' }, { label: 'bis' },
        { label: 'Phase' }, { label: 'Zuständig' }, { label: 'im Portfolio' }, { label: '' }
      ], zeilen)]),
      el('div', { class: 'panelbody noprint' }, [
        el('button', { class: 'schreibend', text: '+ Termin', onclick: function () {
          p.termine.eigene.push({ id: A.uid(), text: '', von: A.heute(), bis: A.heute(),
            phase: '', beteiligter: '', meilenstein: false, dashboard: false, status: 'offen' });
          A.markDirty(); A.render();
        } }),
        el('button', { class: 'schreibend', style: 'margin-left:8px', text: '+ Meilenstein',
          onclick: function () {
            p.termine.eigene.push({ id: A.uid(), text: '', von: '', bis: A.heute(),
              phase: '', beteiligter: '', meilenstein: true, dashboard: true, status: 'offen' });
            A.markDirty(); A.render();
          } }),
        U.hinweis('info', 'Ein <b>Meilenstein</b> hat nur ein Datum und erscheint als Raute. ' +
          'Mit <b>im Portfolio</b> markierte Phasen und Meilensteine erscheinen zusätzlich im ' +
          'Terminplan der Portfolioübersicht — dort bleiben sonst nur die groben Phasen.')
      ])
    ]);
  }

  function eigenDatum(e, feld, aktiv) {
    if (!aktiv) return el('span', { class: 'muted', text: '—' });
    var i = el('input', { type: 'date', value: e[feld] || '', style: 'width:100%',
      class: 'nichtdrucken' });
    var t = el('span', { class: 'nurdruck', text: e[feld] ? A.datum(e[feld]) : '—' });
    i.addEventListener('change', function () {
      e[feld] = i.value; A.markDirty(); A.render();
    });
    return el('span', {}, [i, t]);
  }

  T.legende = function () {
    var eintraege = [
      { f: T.RECHENFARBEN.entwicklung,  l: 'Phase Entwicklung' },
      { f: T.RECHENFARBEN.bewilligung,  l: 'Phase Bewilligung' },
      { f: T.RECHENFARBEN.vorbereitung, l: 'Phase Vorbereitung' },
      { f: T.RECHENFARBEN.bau,          l: 'Phase Bau' },
      { f: '#1f5fd0', l: 'Aufgabe offen' },
      { f: '#c02e26', l: 'überfällig' },
      { f: '#0d7a45', l: 'erledigt / Entscheid' },
      { f: '#8a8f99', l: 'verschoben' }
    ];
    return el('div', { class: 'legende' }, eintraege.map(function (e) {
      return el('span', {}, [el('i', { style: 'background:' + e.f }), el('span', { text: e.l })]);
    }));
  };

})(window.APP);
