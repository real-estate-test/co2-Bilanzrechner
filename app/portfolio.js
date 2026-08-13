/* =====================================================================
   Projektrechner · Portfolio, Snapshots, Soll/Ist, Import & Export
   ===================================================================== */
window.APP = window.APP || {};
(function (A) {
  'use strict';

  var U = A.ui, V = A.views, el = U.el, s = U.s;
  function fmt(n, d) { return A.fmt(n, d); }

  /* ---------------------------------------------------------------
     Kostenzeilen eines Projektes als flache Liste (Basis für Soll/Ist)
     --------------------------------------------------------------- */

  A.kostenzeilen = function (r) {
    var out = [];
    r.erwerb.zeilen.forEach(function (z) {
      if (Math.abs(z.betrag) < 1) return;
      out.push({ key: 'erwerb.' + z.id, gruppe: 'Erwerb', label: z.label, soll: z.betrag });
    });
    Object.keys(r.bau.bloecke).forEach(function (bid) {
      var b = r.bau.bloecke[bid];
      b.zeilen.forEach(function (z) {
        if (Math.abs(z.betrag) < 1) return;
        out.push({ key: 'bau.' + bid + '.' + z.id, gruppe: 'Bau · ' + b.label,
          label: 'BKP ' + z.bkp + ' · ' + z.label, soll: z.betrag });
      });
      out.push({ key: 'bau.' + bid + '.reserve', gruppe: 'Bau · ' + b.label,
        label: 'Reserve / Unvorhergesehenes', soll: b.reserve });
    });
    r.vermarktung.zeilen.forEach(function (z) {
      if (Math.abs(z.betrag) < 1) return;
      out.push({ key: 'vermarktung.' + z.id, gruppe: 'Vermarktung', label: z.label, soll: z.betrag });
    });
    out.push({ key: 'finanzierung.bauzinsen', gruppe: 'Finanzierung', label: 'Bauzinsen',
      soll: r.fin.bauzinsen + r.fin.bereitstellung });
    return out;
  };

  /* ===================================================================
     Seite: Portfolio
     =================================================================== */

  /* ---------------------------------------------------------------
     Archivieren und Löschen
     --------------------------------------------------------------- */

  A.archivieren = function (p) {
    if (!A.pruefeRecht()) return;
    if (!confirm('Projekt «' + p.name + '» archivieren?\n\n' +
      'Es verschwindet aus Listen und Portfolio, bleibt aber vollständig erhalten ' +
      'und lässt sich jederzeit zurückholen.')) return;
    A.store.archivieren(p.id).then(function () {
      A.meldung('ok', '«' + p.name + '» ist archiviert.');
      if (A.state.p.id === p.id) A.projektOeffnen(null); else A.render();
    }).catch(function (f) { A.meldung('warn', f.message); });
  };

  A.reaktivieren = function (p) {
    if (!A.pruefeRecht()) return;
    A.store.reaktivieren(p.id).then(function () {
      A.meldung('ok', '«' + p.name + '» ist wieder aktiv.');
      A.render();
    }).catch(function (f) { A.meldung('warn', f.message); });
  };

  /* Endgültiges Löschen. Die Datenbank lässt das ausschliesslich für
     Verwalter zu; die Abfragen hier verhindern Fehlgriffe. */
  A.endgueltigLoeschen = function (p) {
    if (!A.istVerwalter()) {
      A.meldung('warn', 'Endgültiges Löschen ist Verwaltern vorbehalten. Archivieren Sie das Projekt stattdessen.');
      return;
    }
    var name = prompt('Endgültiges Löschen kann nicht rückgängig gemacht werden.\n\n' +
      'Zur Bestätigung den Projektnamen eingeben:\n\n  ' + p.name);
    if (name === null) return;
    if (name.trim() !== (p.name || '').trim()) {
      A.meldung('warn', 'Der Name stimmt nicht — es wurde nichts gelöscht.');
      return;
    }
    A.auth.passwortBestaetigen('Projekt «' + p.name + '» endgültig löschen').then(function (ok) {
      if (!ok) return;
      A.store.remove(p.id).then(function () {
        A.meldung('ok', '«' + p.name + '» wurde gelöscht. Der Vorgang steht im Protokoll.');
        if (A.state.p.id === p.id) A.projektOeffnen(null); else A.render();
      }).catch(function (f) {
        A.meldung('warn', 'Löschen abgelehnt: ' + f.message);
      });
    });
  };

  /* ===================================================================
     Seite: Portfolio
     =================================================================== */

  var zeigeArchiv = { wert: false };

  V.portfolio = function () {
    var out = el('div', {}, [U.kopf('Portfolio',
      'Alle gespeicherten Projekte im Überblick. Der Kapitalbedarf wird über das Kalenderjahr des Erwerbs ' +
      'zusammengeführt — das zeigt, wann sich Projekte in der Finanzierung überlagern.')]);

    var projekte = A.store.alle(zeigeArchiv.wert);
    if (!projekte.length) {
      out.appendChild(U.hinweis('info', 'Noch keine Projekte gespeichert. Das aktuelle Projekt wird ' +
        'automatisch gesichert, sobald Sie es bearbeiten.'));
      return out;
    }

    var berechnet = projekte.map(function (p) {
      var r;
      try { r = A.engine.compute(p); } catch (e) { r = null; }
      return { p: p, r: r };
    }).filter(function (x) { return x.r; });

    /* Summenkacheln */
    var sum = { ak: 0, erloes: 0, gewinn: 0, ek: 0, peak: 0, nwf: 0 };
    berechnet.forEach(function (x) {
      sum.ak += x.r.kpi.anlagekosten; sum.erloes += x.r.kpi.erloese;
      sum.gewinn += x.r.kpi.gewinn; sum.ek += x.r.kpi.ek_max;
      sum.peak += x.r.kpi.kapital_peak; sum.nwf += x.r.flaechen.total.nwf;
    });
    out.appendChild(U.panel('Summen über alle Projekte', berechnet.length + ' Projekte', [
      el('div', { class: 'panelbody' }, [el('div', { class: 'cols c4' }, [
        U.kachel('Anlagekosten', fmt(sum.ak)),
        U.kachel('Erlöse', fmt(sum.erloes)),
        U.kachel('Projektgewinn', fmt(sum.gewinn), null, sum.gewinn >= 0 ? 'pos' : 'neg'),
        U.kachel('Marge gesamt', A.fmtPct(sum.ak > 0 ? sum.gewinn / sum.ak * 100 : 0)),
        U.kachel('Eigenkapital verpflichtet', fmt(sum.ek)),
        U.kachel('Nutzfläche', fmt(sum.nwf) + ' m²'),
        U.kachel('Projekte in Realisierung', String(berechnet.filter(function (x) {
          return ['Realisierung', 'Vermarktung'].indexOf(x.p.status) >= 0; }).length)),
        U.kachel('Projekte unter Zielmarge', String(berechnet.filter(function (x) {
          return x.r.kpi.marge_ak < x.p.ziele.marge; }).length))
      ])])
    ]));

    /* Projektliste */
    var zeilen = berechnet.map(function (x) {
      var k = x.r.kpi, aktiv = x.p.id === A.state.p.id;
      var tr = el('tr', { style: aktiv ? 'background:var(--accent2)' : '' });
      tr.appendChild(el('td', {}, [
        el('button', { class: 'ghost', style: 'font-weight:640;padding:0;color:var(--accent)',
          text: x.p.name, onclick: function () { A.projektOeffnen(x.p.id); } }),
        el('div', { class: 'muted', style: 'font-size:10.5px',
          text: [x.p.ort, A.KANTONE[x.p.kanton] && A.KANTONE[x.p.kanton].label].filter(Boolean).join(' · ') })
      ]));
      tr.appendChild(el('td', {}, [el('span', {
        class: 'tag' + (x.p.archiviert_am ? ' warn' : ''),
        text: x.p.archiviert_am ? 'archiviert' : x.p.status })]));
      tr.appendChild(el('td', { class: 'muted', text: String(x.p.startjahr) }));
      tr.appendChild(el('td', { class: 'n', text: fmt(x.r.flaechen.total.nwf) }));
      tr.appendChild(el('td', { class: 'n', text: fmt(k.anlagekosten) }));
      tr.appendChild(el('td', { class: 'n', text: fmt(k.erloese) }));
      tr.appendChild(el('td', { class: 'n', text: fmt(k.gewinn) }));
      tr.appendChild(el('td', { class: 'n' }, [el('span', {
        class: 'tag ' + (k.marge_ak >= x.p.ziele.marge ? 'pos' : 'neg'),
        text: A.fmtPct(k.marge_ak) })]));
      tr.appendChild(el('td', { class: 'n', text: k.irr === null ? '–' : A.fmtPct(k.irr) }));
      tr.appendChild(el('td', { class: 'n', text: fmt(k.kapital_peak) }));
      tr.appendChild(el('td', { class: 'w1', style: 'white-space:nowrap' }, [
        x.p.archiviert_am
          ? el('button', { class: 'ghost sm schreibend', text: 'zurückholen',
              title: 'Projekt wieder aktiv setzen',
              onclick: function () { A.reaktivieren(x.p); } })
          : el('button', { class: 'ghost sm schreibend', text: 'archivieren',
              title: 'Aus Listen und Portfolio ausblenden — jederzeit umkehrbar',
              onclick: function () { A.archivieren(x.p); } }),
        A.istVerwalter()
          ? el('button', { class: 'ghost sm danger schreibend', text: '×',
              title: 'Endgültig löschen (nur Verwalter)',
              onclick: function () { A.endgueltigLoeschen(x.p); } })
          : null
      ]));
      return tr;
    });

    var archivSchalter = el('div', { class: 'seg' });
    [['Aktive', false], ['inkl. Archiv', true]].forEach(function (o) {
      var b = el('button', { type: 'button', text: o[0],
        class: zeigeArchiv.wert === o[1] ? 'on' : '' });
      b.addEventListener('click', function () { zeigeArchiv.wert = o[1]; A.render(); });
      archivSchalter.appendChild(b);
    });

    out.appendChild(U.panel('Projekte', null, [
      el('div', { class: 'panelbody' }, [U.tabelle([
        { label: 'Projekt' }, { label: 'Status' }, { label: 'Start' }, { label: 'NWF m²', n: true },
        { label: 'Anlagekosten', n: true }, { label: 'Erlöse', n: true }, { label: 'Gewinn', n: true },
        { label: 'Marge', n: true }, { label: 'IRR', n: true }, { label: 'Kapitalspitze', n: true }, { label: '' }
      ], zeilen)])
    ], [archivSchalter]));

    /* ---------------------------------------------------------------
       Terminplan: eine Zeile je Projekt auf gemeinsamer Kalenderachse
       --------------------------------------------------------------- */
    var PHASENFARBEN = [
      { key: 'entwicklung', label: 'Entwicklung',  f: '#7c93b3' },
      { key: 'bewilligung', label: 'Bewilligung',  f: '#b0871f' },
      { key: 'vorbereitung',label: 'Vorbereitung', f: '#8a8f99' },
      { key: 'bau',         label: 'Bau',          f: '#1f5fd0' },
      { key: 'vermarktung', label: 'Vermarktung',  f: '#0d7a45' }
    ];

    var termine = berechnet.map(function (x) {
      var Z = x.r.zeit, start = x.p.startjahr || new Date().getFullYear();
      var startFrac = 0;
      if (x.p.startdatum) {
        var d = new Date(x.p.startdatum);
        if (!isNaN(d)) startFrac = (d.getMonth() + d.getDate() / 30.4) / 12;
      }
      var b = start + startFrac;
      return {
        p: x.p, r: x.r, von: b, bis: b + Z.t_ende,
        phasen: [
          { key: 'entwicklung',  t0: b,                  t1: b + Z.t_baueingabe },
          { key: 'bewilligung',  t0: b + Z.t_baueingabe, t1: b + Z.t_bb },
          { key: 'vorbereitung', t0: b + Z.t_bb,         t1: b + Z.t_baustart },
          { key: 'bau',          t0: b + Z.t_baustart,   t1: b + Z.t_bauende },
          { key: 'vermarktung',  t0: b + Z.t_vk_start,   t1: b + Z.t_vk_ende, reihe: 1 }
        ]
      };
    });

    if (termine.length) {
      var tVon = Math.floor(Math.min.apply(null, termine.map(function (t) { return t.von; })));
      var tBis = Math.ceil(Math.max.apply(null, termine.map(function (t) { return t.bis; })));
      var jahre = Math.max(1, tBis - tVon);
      var W = 980, zeileH = 40, links = 190, kopf = 26;
      var fussH = 46;
      var H = kopf + termine.length * zeileH + fussH;
      var px = function (t) { return links + (t - tVon) / jahre * (W - links - 12); };

      var kinder = [];
      /* Jahresraster */
      for (var jj = 0; jj <= jahre; jj++) {
        var xj = px(tVon + jj);
        kinder.push(s('line', { x1: xj, y1: kopf - 12, x2: xj, y2: H - fussH + 6, stroke: '#e2e6ec' }));
        kinder.push(s('text', { x: xj + 3, y: kopf - 16, 'font-size': 10, fill: '#6b7484', class: 'n' },
          String(tVon + jj)));
      }
      /* Heute-Linie */
      var heute = new Date();
      var heuteT = heute.getFullYear() + (heute.getMonth() + heute.getDate() / 30.4) / 12;
      if (heuteT >= tVon && heuteT <= tBis) {
        kinder.push(s('line', { x1: px(heuteT), y1: kopf - 12, x2: px(heuteT), y2: H - fussH + 6,
          stroke: '#c02e26', 'stroke-width': 1.4 }));
        kinder.push(s('text', { x: px(heuteT) + 4, y: H - fussH + 18, 'font-size': 10, fill: '#c02e26' }, 'heute'));
      }

      termine.forEach(function (t, i) {
        var y0 = kopf + i * zeileH;
        kinder.push(s('text', { x: 0, y: y0 + 15, 'font-size': 11.5, fill: '#10151c' },
          t.p.name.length > 26 ? t.p.name.slice(0, 25) + '…' : t.p.name));
        kinder.push(s('text', { x: 0, y: y0 + 28, 'font-size': 10, fill: '#6b7484' }, t.p.status || ''));
        t.phasen.forEach(function (ph) {
          var farbe = PHASENFARBEN.find(function (f) { return f.key === ph.key; });
          var breite = Math.max(2, px(ph.t1) - px(ph.t0));
          kinder.push(s('rect', { x: px(ph.t0), y: y0 + (ph.reihe ? 19 : 4), width: breite, height: 14,
            rx: 2.5, fill: farbe.f, opacity: ph.reihe ? .75 : .92 }));
        });
      });

      /* Auslastung: wie viele Projekte sind je Jahr in Ausführung? */
      var auslastung = [];
      for (var a = 0; a < jahre; a++) {
        var jahrVon = tVon + a, jahrBis = jahrVon + 1, n = 0;
        termine.forEach(function (t) {
          var bau = t.phasen.find(function (x) { return x.key === 'bau'; });
          if (bau.t0 < jahrBis && bau.t1 > jahrVon) n++;
        });
        auslastung.push(n);
      }
      var maxA = Math.max(1, Math.max.apply(null, auslastung));
      auslastung.forEach(function (n, a) {
        if (!n) return;
        var x0 = px(tVon + a), x1 = px(tVon + a + 1);
        var hoehe = 16 * n / maxA;
        kinder.push(s('rect', { x: x0 + 1, y: H - fussH + 26 - hoehe, width: x1 - x0 - 2, height: hoehe,
          fill: '#1f5fd0', opacity: .28, rx: 1.5 }));
        kinder.push(s('text', { x: (x0 + x1) / 2, y: H - fussH + 38, 'text-anchor': 'middle',
          'font-size': 9.5, fill: '#6b7484', class: 'n' }, String(n)));
      });
      kinder.push(s('text', { x: 0, y: H - fussH + 32, 'font-size': 10, fill: '#6b7484' },
        'in Ausführung'));

      out.appendChild(U.panel('Terminplan', 'Phasen aller Projekte auf gemeinsamer Kalenderachse', [
        el('div', { class: 'panelbody' }, [
          U.svg(W, H, kinder, { h: H }),
          el('div', { class: 'legende' }, PHASENFARBEN.map(function (f) {
            return el('span', {}, [el('i', { style: 'background:' + f.f }), el('span', { text: f.label })]);
          }))
        ])
      ]));
    }

    /* ---------------------------------------------------------------
       Kapitalbedarf und Cashflow über die Kalenderjahre
       --------------------------------------------------------------- */
    var jahreDaten = {};
    berechnet.forEach(function (x) {
      x.r.fin.jahre.forEach(function (j) {
        var kj = (x.p.startjahr || new Date().getFullYear()) + j.jahr;
        if (!jahreDaten[kj]) jahreDaten[kj] = { ek: 0, fk: 0, aus: 0, ein: 0, projekte: [] };
        jahreDaten[kj].ek += j.ek; jahreDaten[kj].fk += j.fk;
        jahreDaten[kj].aus += j.ausgaben; jahreDaten[kj].ein += j.einnahmen;
        if (j.ek + j.fk > 0) jahreDaten[kj].projekte.push(x.p.name);
      });
    });
    var keys = Object.keys(jahreDaten).map(Number).sort(function (a, b) { return a - b; });

    if (keys.length) {
      /* Kapitalbindung */
      var W2 = 980, H2 = 210, oben = 16, unten = 44, links2 = 62;
      var maxK = Math.max.apply(null, keys.map(function (k) {
        return jahreDaten[k].ek + jahreDaten[k].fk; }).concat([1]));
      var yK = function (v) { return oben + (maxK - v) / maxK * (H2 - oben - unten); };
      var gap2 = (W2 - links2) / keys.length, bw2 = gap2 * 0.55;
      var kk = [s('line', { x1: links2, y1: yK(0), x2: W2, y2: yK(0), stroke: '#a9b3c0' })];
      [maxK, maxK / 2].forEach(function (v) {
        kk.push(s('line', { x1: links2, y1: yK(v), x2: W2, y2: yK(v), stroke: '#eef1f5' }));
        kk.push(s('text', { x: links2 - 6, y: yK(v) + 3.5, 'text-anchor': 'end', 'font-size': 10,
          fill: '#6b7484', class: 'n' }, A.fmtMio(v)));
      });
      keys.forEach(function (kj, i) {
        var d = jahreDaten[kj], x0 = links2 + i * gap2 + (gap2 - bw2) / 2;
        kk.push(s('rect', { x: x0, y: yK(d.ek), width: bw2, height: Math.max(0, yK(0) - yK(d.ek)),
          fill: '#7c93b3', rx: 1.5 }));
        kk.push(s('rect', { x: x0, y: yK(d.ek + d.fk), width: bw2, height: Math.max(0, yK(0) - yK(d.fk)),
          fill: '#c0662e', rx: 1.5 }));
        kk.push(s('text', { x: x0 + bw2 / 2, y: H2 - unten + 15, 'text-anchor': 'middle',
          'font-size': 10, fill: '#6b7484', class: 'n' }, String(kj)));
        kk.push(s('text', { x: x0 + bw2 / 2, y: H2 - unten + 28, 'text-anchor': 'middle',
          'font-size': 9.5, fill: '#a2abb8' }, d.projekte.length + ' Proj.'));
      });
      out.appendChild(U.panel('Kapitalbedarf über alle Projekte',
        'Summe der gebundenen Mittel je Kalenderjahr', [
        el('div', { class: 'panelbody' }, [U.svg(W2, H2, kk, { h: H2 }),
          el('div', { class: 'legende' }, [
            el('span', {}, [el('i', { style: 'background:#7c93b3' }), el('span', { text: 'Eigenkapital' })]),
            el('span', {}, [el('i', { style: 'background:#c0662e' }), el('span', { text: 'Fremdkapital' })])
          ])])
      ]));

      /* Cashflow über alle Projekte */
      var H3 = 240, oben3 = 18, unten3 = 40;
      var maxC = Math.max.apply(null, keys.map(function (k) {
        return Math.max(jahreDaten[k].aus, jahreDaten[k].ein); }).concat([1]));
      var yC = function (v) { return oben3 + (maxC - v) / (2 * maxC) * (H3 - oben3 - unten3); };
      var kc = [s('line', { x1: links2, y1: yC(0), x2: W2, y2: yC(0), stroke: '#a9b3c0' })];
      [maxC, maxC / 2, -maxC / 2, -maxC].forEach(function (v) {
        kc.push(s('line', { x1: links2, y1: yC(v), x2: W2, y2: yC(v), stroke: '#eef1f5' }));
        kc.push(s('text', { x: links2 - 6, y: yC(v) + 3.5, 'text-anchor': 'end', 'font-size': 10,
          fill: '#6b7484', class: 'n' }, A.fmtMio(v)));
      });
      var bw3 = gap2 * 0.30, kum = 0, punkte = [];
      keys.forEach(function (kj, i) {
        var d = jahreDaten[kj], x0 = links2 + i * gap2 + gap2 / 2;
        kc.push(s('rect', { x: x0 - bw3 - 2, y: yC(0), width: bw3,
          height: Math.max(1, Math.abs(yC(d.aus) - yC(0))), rx: 1.5, fill: '#1f5fd0', opacity: .8 }));
        kc.push(s('rect', { x: x0 + 2, y: yC(d.ein), width: bw3,
          height: Math.max(1, yC(0) - yC(d.ein)), rx: 1.5, fill: '#0d7a45', opacity: .8 }));
        kum += d.ein - d.aus;
        punkte.push([x0, yC(Math.max(-maxC, Math.min(maxC, kum)))]);
        kc.push(s('text', { x: x0, y: H3 - unten3 + 16, 'text-anchor': 'middle', 'font-size': 10,
          fill: '#6b7484', class: 'n' }, String(kj)));
      });
      kc.push(s('polyline', { points: punkte.map(function (q) { return q.join(','); }).join(' '),
        fill: 'none', stroke: '#10151c', 'stroke-width': 1.6 }));
      punkte.forEach(function (q) { kc.push(s('circle', { cx: q[0], cy: q[1], r: 3, fill: '#10151c' })); });

      out.appendChild(U.panel('Cashflow über alle Projekte',
        'Ausgaben, Einnahmen und kumulierter Saldo je Kalenderjahr', [
        el('div', { class: 'panelbody' }, [U.svg(W2, H3, kc, { h: H3 }),
          el('div', { class: 'legende' }, [
            el('span', {}, [el('i', { style: 'background:#1f5fd0' }), el('span', { text: 'Ausgaben' })]),
            el('span', {}, [el('i', { style: 'background:#0d7a45' }), el('span', { text: 'Einnahmen' })]),
            el('span', {}, [el('i', { style: 'background:#10151c' }), el('span', { text: 'kumulierter Saldo' })])
          ])])
      ]));
    }

    return out;
  };

  /* ===================================================================
     Seite: Tracking (Soll/Ist und Snapshots)
     =================================================================== */

  V.tracking = function (p) {
    var out = el('div', {}, [U.kopf('Tracking',
      'Soll-Ist-Vergleich der Kostenpositionen und eingefrorene Projektstände zum Vergleich über die Zeit.')]);

    out.appendChild(U.panel('Zeitliche Verankerung', null, [
      U.body([
        U.num(p, 'startjahr', 'Kalenderjahr des Erwerbs', { dez: 0,
          hilfe: 'Verankert die Projektjahre im Kalender — Grundlage der Portfolio-Aggregation.' })
      ], 'c4')
    ]));

    /* Soll/Ist */
    var zeilen = [], gruppe = null, sollT = 0, istT = 0;
    A.kostenzeilen(A.state.r).forEach(function (z) {
      if (z.gruppe !== gruppe) {
        gruppe = z.gruppe;
        zeilen.push(el('tr', { class: 'grp' }, [el('td', { colspan: 5, text: gruppe })]));
      }
      var ist = p.ist[z.key];
      sollT += z.soll;
      istT += (ist === undefined || ist === null || ist === '') ? z.soll : ist;
      var inp = el('input', { type: 'text', inputmode: 'decimal',
        value: (ist === undefined || ist === null) ? '' : A.fmt(ist),
        placeholder: 'offen' });
      var abwZelle = el('td', { class: 'n' });
      function malen() {
        var v = p.ist[z.key];
        if (v === undefined || v === null || v === '') { abwZelle.textContent = '—'; abwZelle.className = 'n muted'; return; }
        var d = v - z.soll;
        abwZelle.textContent = (d > 0 ? '+' : '') + fmt(d);
        abwZelle.className = 'n' + (d > 0 ? ' ' : '');
        abwZelle.style.color = d > 0 ? 'var(--neg)' : (d < 0 ? 'var(--pos)' : '');
      }
      inp.addEventListener('input', function () {
        if (inp.value.trim() === '') delete p.ist[z.key];
        else p.ist[z.key] = U.parseZahl(inp.value);
        malen(); A.markDirty();
      });
      malen();
      zeilen.push(el('tr', {}, [
        el('td', { text: z.label }),
        el('td', { class: 'n', text: fmt(z.soll) }),
        el('td', { style: 'width:120px' }, [inp]),
        abwZelle,
        el('td', { class: 'n muted', text: z.soll > 0 && p.ist[z.key] !== undefined
          ? A.fmtPct((p.ist[z.key] / z.soll - 1) * 100) : '' })
      ]));
    });
    zeilen.push(el('tr', { class: 'total' }, [
      el('td', { text: 'Total (offene Positionen zum Soll)' }),
      el('td', { class: 'n', text: fmt(sollT) }),
      el('td', { class: 'n', text: fmt(istT) }),
      el('td', { class: 'n', text: (istT - sollT > 0 ? '+' : '') + fmt(istT - sollT) }),
      el('td', { class: 'n', text: sollT > 0 ? A.fmtPct((istT / sollT - 1) * 100) : '' })
    ]));

    out.appendChild(U.panel('Soll-Ist-Vergleich', 'leere Felder gelten als noch offen und werden mit dem Soll gerechnet', [
      el('div', { class: 'panelbody' }, [U.tabelle([
        { label: 'Position' }, { label: 'Soll CHF', n: true, w: '15%' }, { label: 'Ist CHF', n: true, w: '15%' },
        { label: 'Abweichung', n: true, w: '13%' }, { label: '%', n: true, w: '9%' }
      ], zeilen)]),
      el('div', { class: 'panelbody' }, [
        el('button', { text: 'Ist-Werte aus CSV einlesen', onclick: function () { istImport(p); } }),
        el('button', { class: 'ghost', text: 'Ist-Werte zurücksetzen', onclick: function () {
          if (confirm('Alle Ist-Werte löschen?')) { p.ist = {}; A.markDirty(); A.render(); }
        } })
      ])
    ]));

    /* Snapshots */
    var snapZeilen = p.snapshots.map(function (sn, i) {
      var k = sn.kpi, jetzt = A.state.r.kpi;
      function delta(a, b, dez) {
        var d = b - a;
        return el('span', { style: 'color:' + (d >= 0 ? 'var(--pos)' : 'var(--neg)'),
          text: (d >= 0 ? '+' : '') + fmt(d, dez || 0) });
      }
      return el('tr', {}, [
        el('td', {}, [el('span', { text: sn.label }),
          el('div', { class: 'muted', style: 'font-size:10.5px', text: sn.datum })]),
        el('td', { class: 'n', text: fmt(k.anlagekosten) }),
        el('td', { class: 'n', text: fmt(k.erloese) }),
        el('td', { class: 'n', text: fmt(k.gewinn) }),
        el('td', { class: 'n', text: A.fmtPct(k.marge_ak) }),
        el('td', { class: 'n' }, [delta(k.gewinn, jetzt.gewinn)]),
        el('td', { class: 'w1' }, [
          el('button', { class: 'ghost sm', text: 'laden', title: 'Diesen Stand als aktuelles Projekt übernehmen',
            onclick: function () {
              if (!confirm('Aktuellen Stand durch den Snapshot «' + sn.label + '» ersetzen?')) return;
              var wieder = A.migrate(A.clone(sn.projekt));
              wieder.id = p.id; wieder.snapshots = p.snapshots;
              A.state.p = wieder; A.recompute(); A.speichern(); A.render();
            } }),
          el('button', { class: 'ghost sm danger', text: '×',
            onclick: function () { p.snapshots.splice(i, 1); A.markDirty(); A.render(); } })
        ])
      ]);
    });
    snapZeilen.push(el('tr', { class: 'total' }, [
      el('td', { text: 'aktueller Stand' }),
      el('td', { class: 'n', text: fmt(A.state.r.kpi.anlagekosten) }),
      el('td', { class: 'n', text: fmt(A.state.r.kpi.erloese) }),
      el('td', { class: 'n', text: fmt(A.state.r.kpi.gewinn) }),
      el('td', { class: 'n', text: A.fmtPct(A.state.r.kpi.marge_ak) }),
      el('td', {}), el('td', {})
    ]));

    out.appendChild(U.panel('Snapshots', 'eingefrorene Projektstände für den Verlauf', [
      el('div', { class: 'panelbody' }, [U.tabelle([
        { label: 'Stand' }, { label: 'Anlagekosten', n: true }, { label: 'Erlöse', n: true },
        { label: 'Gewinn', n: true }, { label: 'Marge', n: true },
        { label: 'Δ Gewinn zu heute', n: true }, { label: '' }
      ], snapZeilen)]),
      el('div', { class: 'panelbody' }, [
        el('button', { class: 'primary', text: 'Aktuellen Stand einfrieren', onclick: function () {
          var label = prompt('Bezeichnung des Snapshots:',
            'Stand ' + A.heute() + (p.status ? ' · ' + p.status : ''));
          if (!label) return;
          p.snapshots.push({ datum: A.heute(), label: label,
            kpi: A.clone(A.state.r.kpi), projekt: A.clone(p) });
          A.speichern(); A.render();
        } })
      ])
    ]));

    return out;
  };

  function istImport(p) {
    var ta = el('textarea', { placeholder:
      'Je Zeile: Schlüssel;Betrag\nBeispiel:\nbau.neubau.b2_rohbau;2450000\nerwerb.kaufpreis;3500000' });
    var hinweis = el('div', { class: 'muted', style: 'font-size:11px;margin-bottom:8px' });
    hinweis.textContent = 'Verfügbare Schlüssel: ' +
      A.kostenzeilen(A.state.r).map(function (z) { return z.key; }).join(', ');
    var bg = U.modal('Ist-Werte einlesen', [hinweis, ta], [
      el('button', { class: 'primary', text: 'Übernehmen', onclick: function () {
        var n = 0;
        ta.value.split(/\r?\n/).forEach(function (zeile) {
          var t = zeile.split(/[;,\t]/);
          if (t.length < 2) return;
          var key = t[0].trim(), wert = U.parseZahl(t[1]);
          if (!key) return;
          p.ist[key] = wert; n++;
        });
        bg.remove(); A.markDirty(); A.render();
        alert(n + ' Positionen übernommen.');
      } })
    ]);
  }

  /* ===================================================================
     Import & Export
     =================================================================== */

  function download(name, inhalt, typ) {
    var b = new Blob([inhalt], { type: typ || 'application/json' });
    var url = URL.createObjectURL(b);
    var a = el('a', { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function csvProjekt(p, r) {
    var zeilen = [['Position', 'Basis', 'CHF']];
    zeilen.push(['— Erwerb —', '', '']);
    r.erwerb.zeilen.forEach(function (z) { zeilen.push([z.label, z.basis, Math.round(z.betrag)]); });
    Object.keys(r.bau.bloecke).forEach(function (bid) {
      var b = r.bau.bloecke[bid];
      zeilen.push(['— Baukosten ' + b.label + ' —', '', '']);
      b.zeilen.forEach(function (z) {
        zeilen.push(['BKP ' + z.bkp + ' ' + z.label, A.BASIS_LABELS[z.basis] || '', Math.round(z.betrag)]);
      });
      zeilen.push(['Reserve', '', Math.round(b.reserve)]);
    });
    zeilen.push(['— Vermarktung —', '', '']);
    r.vermarktung.zeilen.forEach(function (z) { zeilen.push([z.label, z.basis, Math.round(z.betrag)]); });
    zeilen.push(['— Kennzahlen —', '', '']);
    [['Anlagekosten', r.kpi.anlagekosten], ['Gesamtinvestition', r.kpi.gesamtinvestition],
     ['Erlöse', r.kpi.erloese], ['Projektgewinn', r.kpi.gewinn],
     ['Marge %', r.kpi.marge_ak], ['ROE %', r.kpi.roe], ['IRR %', r.kpi.irr || 0],
     ['Bruttorendite %', r.kpi.bruttorendite]].forEach(function (x) {
      zeilen.push([x[0], '', Math.round(x[1] * 100) / 100]);
    });
    zeilen.push(['— Cashflow —', '', '']);
    zeilen.push(['Jahr', 'Ausgaben', 'Einnahmen', 'Zins', 'Eigenkapital', 'Fremdkapital', 'Saldo']);
    r.fin.jahre.forEach(function (j) {
      zeilen.push([j.jahr, Math.round(j.ausgaben), Math.round(j.einnahmen),
        Math.round(j.zins + j.bereitstellung), Math.round(j.ek), Math.round(j.fk), Math.round(j.saldo)]);
    });
    return '﻿' + zeilen.map(function (z) {
      return z.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(';');
    }).join('\n');
  }

  A.exportModal = function () {
    var p = A.state.p, r = A.state.r;
    var datei = el('input', { type: 'file', accept: '.json', style: 'display:none' });
    datei.addEventListener('change', function () {
      var f = datei.files[0]; if (!f) return;
      var leser = new FileReader();
      leser.onload = function () {
        try {
          var d = JSON.parse(leser.result);
          if (!A.pruefeRecht()) return;
          var liste = (Array.isArray(d) ? d : (d.projekte || [d]))
            .map(A.migrate).filter(Boolean);
          Promise.all(liste.map(function (q) {
            q.id = A.uid();                       // stets als neues Projekt anlegen
            q.version = 1;
            q.archiviert_am = null;
            if (A.zieleAnwenden) A.zieleAnwenden(q);
            return A.store.save(q);
          })).then(function () {
            return A.store.init ? A.store.init() : null;
          }).then(function () {
            A.meldung('ok', liste.length + ' Projekt(e) importiert.');
            A.projektOeffnen(null);
          }).catch(function (fehler) {
            A.meldung('warn', 'Import fehlgeschlagen: ' + fehler.message);
          });
        } catch (e) { alert('Datei konnte nicht gelesen werden: ' + e.message); }
      };
      leser.readAsText(f);
    });

    U.modal('Export & Import', [
      el('p', { class: 'muted', style: 'margin-bottom:12px',
        text: 'Projektdaten liegen ausschliesslich in diesem Browser. Für Sicherung und Weitergabe ' +
              'exportieren Sie die Projektdatei.' }),
      el('div', { style: 'display:grid;gap:8px' }, [
        el('button', { text: 'Aktuelles Projekt als JSON sichern', onclick: function () {
          download((p.name || 'projekt').replace(/[^\wäöüÄÖÜ -]/g, '') + '.json', JSON.stringify(p, null, 2));
        } }),
        el('button', { text: 'Gesamtes Portfolio als JSON sichern', onclick: function () {
          download('portfolio-' + A.heute() + '.json', JSON.stringify({ projekte: A.store.all() }, null, 2));
        } }),
        el('button', { text: 'Aktuelles Projekt als CSV (Excel) exportieren', onclick: function () {
          download((p.name || 'projekt').replace(/[^\wäöüÄÖÜ -]/g, '') + '.csv',
            csvProjekt(p, r), 'text/csv;charset=utf-8');
        } }),
        el('button', { class: 'primary', text: 'Projekt oder Portfolio importieren',
          onclick: function () { datei.click(); } }),
        datei
      ])
    ]);
  };

})(window.APP);
