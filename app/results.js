/* =====================================================================
   Projektrechner · Ergebnis, Analyse, Bericht
   ===================================================================== */
window.APP = window.APP || {};
(function (A) {
  'use strict';

  var U = A.ui, V = A.views, el = U.el, s = U.s;
  function fmt(n, d) { return A.fmt(n, d); }

  var FARBE = {
    erwerb: '#8a6fb0', bau: '#1f5fd0', vermarktung: '#b0871f',
    fin: '#c0662e', steuer: '#8a8f99', gewinn: '#0d7a45',
    erloes: '#2f80ed', ek: '#7c93b3', fk: '#c0662e'
  };

  /* ===================================================================
     Wasserfall
     =================================================================== */

  function wasserfall(r) {
    var k = r.kpi;
    var posten = [
      { label: 'Erlöse', wert: k.erloese + k.mietertrag_projekt, art: 'start', f: FARBE.erloes },
      { label: 'Erwerb', wert: -k.erwerbskosten, f: FARBE.erwerb },
      { label: 'Baukosten', wert: -k.baukosten, f: FARBE.bau },
      { label: 'Finanzierung', wert: -k.finanzierungskosten, f: FARBE.fin },
      { label: 'Vermarktung', wert: -k.vermarktung, f: FARBE.vermarktung },
      { label: 'Steuern', wert: -k.steuern, f: FARBE.steuer },
      { label: 'Gewinn', wert: k.gewinn, art: 'end', f: k.gewinn >= 0 ? FARBE.gewinn : '#c02e26' }
    ];

    var W = 900, H = 250, oben = 22, unten = 46;
    var max = posten[0].wert, min = 0, lauf = 0;
    posten.forEach(function (x) {
      if (x.art === 'start') { lauf = x.wert; }
      else if (x.art === 'end') { }
      else { lauf += x.wert; }
      max = Math.max(max, lauf); min = Math.min(min, lauf);
    });
    var spanne = Math.max(1, max - min);
    var y = function (v) { return oben + (max - v) / spanne * (H - oben - unten); };

    var kinder = [s('line', { x1: 0, y1: y(0), x2: W, y2: y(0), stroke: '#cfd6df' })];
    var bw = W / posten.length * 0.62, gap = W / posten.length;
    lauf = 0;
    posten.forEach(function (x, i) {
      var cx = i * gap + (gap - bw) / 2, y0, y1;
      if (x.art === 'start') { y0 = y(0); y1 = y(x.wert); lauf = x.wert; }
      else if (x.art === 'end') { y0 = y(0); y1 = y(x.wert); }
      else { y0 = y(lauf); lauf += x.wert; y1 = y(lauf); }
      var top = Math.min(y0, y1), hh = Math.max(1.5, Math.abs(y1 - y0));
      kinder.push(s('rect', { x: cx, y: top, width: bw, height: hh, rx: 2, fill: x.f, opacity: .92 }));
      kinder.push(s('text', { x: cx + bw / 2, y: top - 5, 'text-anchor': 'middle',
        'font-size': 11, fill: '#3c4553', class: 'n' }, A.fmtMio(Math.abs(x.wert))));
      kinder.push(s('text', { x: cx + bw / 2, y: H - unten + 16, 'text-anchor': 'middle',
        'font-size': 11, fill: '#6b7484' }, x.label));
      if (x.art !== 'end' && i < posten.length - 2) {
        kinder.push(s('line', { x1: cx + bw, y1: y1, x2: cx + gap, y2: y1,
          stroke: '#cfd6df', 'stroke-dasharray': '2 2' }));
      }
    });
    return U.svg(W, H, kinder, { h: 250 });
  }

  /* ===================================================================
     Cashflow-Grafik: Balken je Jahr + Saldolinie
     =================================================================== */

  function cashflowChart(r) {
    var J = r.fin.jahre, W = 900, H = 230, oben = 18, unten = 34, links = 52;
    var max = 0;
    J.forEach(function (j) { max = Math.max(max, j.ausgaben, j.einnahmen, Math.abs(j.saldo)); });
    max = Math.max(max, 1);
    var y = function (v) { return oben + (max - v) / (2 * max) * (H - oben - unten); };
    var gap = (W - links) / J.length, bw = gap * 0.32;

    var kinder = [s('line', { x1: links, y1: y(0), x2: W, y2: y(0), stroke: '#a9b3c0' })];
    [max, max / 2, -max / 2, -max].forEach(function (v) {
      kinder.push(s('line', { x1: links, y1: y(v), x2: W, y2: y(v), stroke: '#eef1f5' }));
      kinder.push(s('text', { x: links - 6, y: y(v) + 3.5, 'text-anchor': 'end', 'font-size': 10,
        fill: '#6b7484', class: 'n' }, A.fmtMio(v)));
    });

    var punkte = [];
    J.forEach(function (j, i) {
      var x0 = links + i * gap + gap / 2;
      kinder.push(s('rect', { x: x0 - bw - 2, y: y(0), width: bw, height: Math.max(1, y(0) - y(j.ausgaben)),
        rx: 1.5, fill: FARBE.bau, opacity: .8, transform: 'translate(0,0) scale(1,1)' }));
      /* Ausgaben nach unten */
      kinder[kinder.length - 1].setAttribute('y', y(0));
      kinder[kinder.length - 1].setAttribute('height', Math.max(1, Math.abs(y(j.ausgaben) - y(0))));
      kinder.push(s('rect', { x: x0 + 2, y: y(j.einnahmen), width: bw,
        height: Math.max(1, y(0) - y(j.einnahmen)), rx: 1.5, fill: FARBE.gewinn, opacity: .8 }));
      punkte.push([x0, y(-j.saldo)]);
      kinder.push(s('text', { x: x0, y: H - unten + 15, 'text-anchor': 'middle', 'font-size': 10,
        fill: '#6b7484', class: 'n' }, A.jahrLabel(A.state.p, j.jahr)));
      kinder.push(s('text', { x: x0, y: H - unten + 27, 'text-anchor': 'middle', 'font-size': 9.5,
        fill: '#a2abb8' }, j.phase));
    });
    kinder.push(s('polyline', { points: punkte.map(function (q) { return q.join(','); }).join(' '),
      fill: 'none', stroke: '#10151c', 'stroke-width': 1.6 }));
    punkte.forEach(function (q) { kinder.push(s('circle', { cx: q[0], cy: q[1], r: 3, fill: '#10151c' })); });
    return U.svg(W, H, kinder, { h: 230 });
  }

  /* ===================================================================
     Kapitalbedarf: EK/FK gestapelt
     =================================================================== */

  function kapitalChart(r) {
    var J = r.fin.jahre, W = 900, H = 190, oben = 16, unten = 30, links = 52;
    var max = Math.max(1, r.kpi.kapital_peak);
    var y = function (v) { return oben + (max - v) / max * (H - oben - unten); };
    var gap = (W - links) / J.length, bw = gap * 0.5;
    var kinder = [s('line', { x1: links, y1: y(0), x2: W, y2: y(0), stroke: '#a9b3c0' })];
    [max, max / 2].forEach(function (v) {
      kinder.push(s('line', { x1: links, y1: y(v), x2: W, y2: y(v), stroke: '#eef1f5' }));
      kinder.push(s('text', { x: links - 6, y: y(v) + 3.5, 'text-anchor': 'end', 'font-size': 10,
        fill: '#6b7484', class: 'n' }, A.fmtMio(v)));
    });
    J.forEach(function (j, i) {
      var x0 = links + i * gap + (gap - bw) / 2;
      var ekH = Math.max(0, y(0) - y(j.ek)), fkH = Math.max(0, y(0) - y(j.fk));
      kinder.push(s('rect', { x: x0, y: y(j.ek), width: bw, height: ekH, fill: FARBE.ek, rx: 1.5 }));
      kinder.push(s('rect', { x: x0, y: y(j.ek + j.fk), width: bw, height: fkH, fill: FARBE.fk, rx: 1.5 }));
      kinder.push(s('text', { x: x0 + bw / 2, y: H - unten + 14, 'text-anchor': 'middle', 'font-size': 10,
        fill: '#6b7484', class: 'n' }, A.jahrLabel(A.state.p, j.jahr)));
    });
    return U.svg(W, H, kinder, { h: 190 });
  }

  function legende(eintraege) {
    return el('div', { class: 'legende' }, eintraege.map(function (e) {
      return el('span', {}, [el('i', { style: 'background:' + e[1] }), el('span', { text: e[0] })]);
    }));
  }

  /* ===================================================================
     Seite: Ergebnis
     =================================================================== */

  V.ergebnis = function (p) {
    var out = el('div', {}, [U.kopf('Ergebnis',
      'Entwicklungsrechnung über die gesamte Projektdauer. Gehaltene Flächen werden bei Projektende ' +
      'kalkulatorisch zum Marktwert eingesetzt — die Bestandsrechnung auf der Seite Betrieb zeigt die Alternative.')]);

    var kacheln = el('div', { class: 'panelbody' });
    U.derived.push(function () {
      var k = A.state.r.kpi, pp = A.state.p;
      U.leeren(kacheln).appendChild(el('div', { class: 'cols c4' }, [
        U.kachel('Anlagekosten', fmt(k.anlagekosten), fmt(k.ak_pro_nwf) + ' CHF/m² NWF'),
        U.kachel('Gesamtinvestition', fmt(k.gesamtinvestition), 'inkl. Vermarktung'),
        U.kachel('Erlöse total', fmt(k.erloese + k.mietertrag_projekt)),
        U.kachel('Projektgewinn', fmt(k.gewinn), p.steuern.aktiv ? 'nach Steuern' : 'vor Steuern',
          k.gewinn >= 0 ? 'pos' : 'neg'),
        U.kachel('Marge auf Anlagekosten', A.fmtPct(k.marge_ak), 'Ziel ' + A.fmtPct(pp.ziele.marge),
          k.marge_ak >= pp.ziele.marge ? 'pos' : 'neg'),
        U.kachel('Marge auf Erlös', A.fmtPct(k.marge_erloes)),
        U.kachel('Rendite auf Eigenkapital', A.fmtPct(k.roe), 'auf ' + A.fmtMio(k.ek_max) + ' verpflichtet'),
        U.kachel('Interner Zinsfuss', k.irr === null ? '–' : A.fmtPct(k.irr), 'auf Eigenkapital-Cashflow'),
        U.kachel('Spitzenkapitalbedarf', fmt(k.kapital_peak), 'EK ' + A.fmtMio(k.ek_eingesetzt) + ' · FK ' + A.fmtMio(k.fk_peak)),
        U.kachel('Bruttorendite Ertragsflächen', A.fmtPct(k.bruttorendite, 2),
          'auf ' + A.fmtMio(k.ak_ertrag) + ' anteilige AK · Ziel ' + A.fmtPct(pp.ziele.bruttorendite, 2),
          k.bruttorendite >= pp.ziele.bruttorendite ? 'pos' : ''),
        U.kachel('Nettorendite Ertragsflächen', A.fmtPct(k.nettorendite, 2),
          A.fmtPct(k.anteil_ertrag * 100) + ' der Nutzfläche wird gehalten'),
        U.kachel('Projektdauer', A.fmt(k.dauer, 2) + ' Jahre')
      ]));
    });
    out.appendChild(U.panel('Kennzahlen', null, [kacheln]));

    var wf = el('div', { class: 'panelbody' });
    U.derived.push(function () {
      U.leeren(wf).appendChild(wasserfall(A.state.r));
    });
    out.appendChild(U.panel('Vom Erlös zum Gewinn', null, [wf]));

    /* Kostenzusammenzug */
    var zus = el('div', { class: 'panelbody' });
    U.derived.push(function () {
      var r = A.state.r, k = r.kpi, zeilen = [];
      function z(label, wert, klasse, sub) {
        var anteil = k.gesamtinvestition > 0 ? wert / k.gesamtinvestition * 100 : 0;
        return el('tr', { class: klasse || '' }, [
          el('td', {}, [el('span', { text: label }),
            sub ? el('div', { class: 'muted', style: 'font-size:10.5px', text: sub }) : null]),
          el('td', { class: 'n', text: fmt(wert) }),
          el('td', { class: 'n muted', text: A.fmtPct(anteil) }),
          el('td', { class: 'barcell' }, [el('div', { class: 'bar',
            style: 'width:' + Math.max(1, Math.min(100, anteil)) + '%' })])
        ]);
      }
      zeilen.push(z('Erwerbskosten', k.erwerbskosten, '', 'Kaufpreis ' + fmt(r.erwerb.kaufpreis) +
        ' + Nebenkosten ' + fmt(r.erwerb.nebenkosten)));
      Object.keys(r.bau.bloecke).forEach(function (bid) {
        zeilen.push(z('Baukosten ' + A.BLOCK_LABELS[bid], r.bau.bloecke[bid].total, '',
          fmt(r.bau.bloecke[bid].pro_gf) + ' CHF/m² GF'));
      });
      if (r.bau.teuerung > 0) zeilen.push(z('Teuerung', r.bau.teuerung));
      zeilen.push(z('Finanzierungskosten', k.finanzierungskosten, '',
        'Bauzinsen ' + fmt(r.fin.bauzinsen) + ' + Bereitstellung ' + fmt(r.fin.bereitstellung)));
      zeilen.push(z('Vermarktung', k.vermarktung));
      zeilen.push(el('tr', { class: 'total' }, [
        el('td', { text: 'Gesamtinvestition' }), el('td', { class: 'n', text: fmt(k.gesamtinvestition) }),
        el('td', { class: 'n', text: '100.0 %' }), el('td', {})
      ]));
      U.leeren(zus).appendChild(U.tabelle([{ label: 'Kostenblock' }, { label: 'CHF', n: true, w: '16%' },
        { label: 'Anteil', n: true, w: '10%' }, { label: '', w: '14%' }], zeilen));
    });
    out.appendChild(U.panel('Kostenzusammenzug', null, [zus]));

    /* Erlöse — getrennt nach Verwertungsart, damit sich Verkauf und
       Vermietung nicht vermischen (Rückmeldung 9 und 10). */
    var erl = el('div', { class: 'panelbody' });
    U.derived.push(function () {
      var r = A.state.r, zeilen = [];
      var GRUPPEN = [
        { id: 'stwe',  titel: 'Verkauf Stockwerkeigentum' },
        { id: 'miete', titel: 'Vermietung / Halten' },
        { id: 'exit',  titel: 'Verkauf an Endinvestor' }
      ];

      GRUPPEN.forEach(function (g) {
        var pos = r.ertraege.positionen.filter(function (x) { return x.kategorie === g.id; });
        zeilen.push(el('tr', { class: 'grp' }, [el('td', { colspan: 6, text: g.titel })]));
        if (!pos.length) {
          zeilen.push(el('tr', {}, [el('td', { colspan: 6, class: 'muted', text: 'keine Flächen' })]));
          return;
        }
        var sM = 0, sE = 0;
        pos.forEach(function (x) {
          sM += x.sollmiete; sE += (x.erloes || x.wert);
          zeilen.push(el('tr', {}, [
            el('td', { text: x.teil_label }),
            el('td', { text: x.nutzung_label }),
            el('td', { class: 'n', text: fmt(x.flaeche) + ' ' + x.einheit }),
            el('td', {}, [el('span', { class: 'tag', text: x.art_label || '—' })]),
            el('td', { class: 'n', text: x.sollmiete ? fmt(x.sollmiete) : '—' }),
            el('td', { class: 'n', text: fmt(x.erloes || x.wert) })
          ]));
        });
        zeilen.push(el('tr', { class: 'sum' }, [
          el('td', { colspan: 4, text: 'Zwischentotal ' + g.titel }),
          el('td', { class: 'n', text: sM ? fmt(sM) : '—' }),
          el('td', { class: 'n', text: fmt(sE) })
        ]));
      });

      /* Laufende Erträge und Aufwände während der Projektdauer */
      zeilen.push(el('tr', { class: 'grp' }, [el('td', { colspan: 6, text: 'Laufende Rechnung während der Projektdauer' })]));

      var znEnde = A.state.p.bestand_extra.strategie === 'erhalten' ? r.zeit.t_ende : r.zeit.t_baustart;
      var znBrutto = A.state.p.szenario !== 'neubau' && A.state.p.bestand_extra.zwischennutzung
        ? A.state.p.bestand_extra.zn_miete * znEnde : 0;
      zeilen.push(el('tr', {}, [
        el('td', { colspan: 3, text: 'Mieterträge Bestand bis Baustart' }),
        el('td', {}, [el('span', { class: 'tag', text: 'Zwischennutzung' })]),
        el('td', { class: 'n', text: znBrutto ? fmt(znBrutto / Math.max(0.01, znEnde)) : '—' }),
        el('td', { class: 'n', text: znBrutto ? fmt(znBrutto) : '—' })
      ]));

      var mietNeu = r.betrieb.noi_a > 0 ? Math.max(0, r.kpi.mietertrag_projekt - znBrutto * 0.75) : 0;
      zeilen.push(el('tr', {}, [
        el('td', { colspan: 3, text: 'Mieterträge nach Fertigstellung' }),
        el('td', {}, [el('span', { class: 'tag', text: 'Erstvermietung' })]),
        el('td', { class: 'n', text: r.betrieb.sollmiete_a ? fmt(r.betrieb.sollmiete_a) : '—' }),
        el('td', { class: 'n', text: mietNeu ? fmt(mietNeu) : '—' })
      ]));

      zeilen.push(el('tr', {}, [
        el('td', { colspan: 3, text: 'Betriebsaufwand (Bewirtschaftung und Leerstand)' }),
        el('td', {}, [el('span', { class: 'tag', text: 'Aufwand' })]),
        el('td', { class: 'n', text: r.betrieb.total_a || r.betrieb.leerstand_a
          ? '−' + fmt(r.betrieb.total_a + r.betrieb.leerstand_a) : '—' }),
        el('td', { class: 'n muted', text: 'in den Nettomieterträgen enthalten' })
      ]));

      zeilen.push(el('tr', {}, [
        el('td', { colspan: 4, text: 'Nettomieterträge total' }), el('td', {}),
        el('td', { class: 'n', text: fmt(r.kpi.mietertrag_projekt) })
      ]));

      zeilen.push(el('tr', { class: 'total' }, [
        el('td', { colspan: 4, text: 'Erlöse total' }), el('td', {}),
        el('td', { class: 'n', text: fmt(r.kpi.erloese + r.kpi.mietertrag_projekt) })
      ]));

      U.leeren(erl).appendChild(U.tabelle([
        { label: 'Gebäudeteil' }, { label: 'Nutzung' }, { label: 'Menge', n: true },
        { label: 'Verwertung' }, { label: 'Sollmiete CHF/a', n: true }, { label: 'Erlös bzw. Wert', n: true }
      ], zeilen));
    });
    out.appendChild(U.panel('Erlöse und Verwertung', null, [erl]));

    /* Cashflow */
    var cf = el('div', { class: 'panelbody' });
    U.derived.push(function () {
      U.leeren(cf);
      cf.appendChild(cashflowChart(A.state.r));
      cf.appendChild(legende([['Ausgaben', FARBE.bau], ['Einnahmen', FARBE.gewinn],
        ['Kapitalsaldo (Linie, nach unten = Finanzierungsbedarf)', '#10151c']]));
    });

    var cft = el('div', { class: 'panelbody' });
    U.derived.push(function () {
      var r = A.state.r;
      var zeilen = r.fin.jahre.map(function (j) {
        return el('tr', {}, [
          el('td', { class: 'n', text: A.jahrLabel(A.state.p, j.jahr) }),
          el('td', { class: 'muted', text: j.phase }),
          el('td', { class: 'n', text: fmt(j.ausgaben) }),
          el('td', { class: 'n', text: fmt(j.einnahmen) }),
          el('td', { class: 'n', text: A.fmt(j.satz, 2) + ' %' }),
          el('td', { class: 'n', text: fmt(j.zins + j.bereitstellung) }),
          el('td', { class: 'n', text: fmt(j.ek) }),
          el('td', { class: 'n', text: fmt(j.fk) }),
          el('td', { class: 'n', text: fmt(j.saldo) })
        ]);
      });
      zeilen.push(el('tr', { class: 'total' }, [
        el('td', { text: 'Total' }), el('td', {}),
        el('td', { class: 'n', text: fmt(r.reihen.aus.reduce(function (a, b) { return a + b; }, 0)) }),
        el('td', { class: 'n', text: fmt(r.reihen.ein.reduce(function (a, b) { return a + b; }, 0)) }),
        el('td', {}),
        el('td', { class: 'n', text: fmt(r.kpi.finanzierungskosten) }),
        el('td', {}), el('td', {}), el('td', {})
      ]));
      U.leeren(cft).appendChild(U.tabelle([
        { label: 'Periode' }, { label: 'Phase' }, { label: 'Ausgaben', n: true },
        { label: 'Einnahmen', n: true }, { label: 'Zinssatz', n: true }, { label: 'Zins + Komm.', n: true },
        { label: 'Eigenkapital', n: true }, { label: 'Fremdkapital', n: true }, { label: 'Kapitalsaldo', n: true }
      ], zeilen));
    });
    out.appendChild(U.panel('Cashflow', 'Jahresraster · Zinsen auf dem mittleren Kapitalsaldo', [cf, cft]));

    var kap = el('div', { class: 'panelbody' });
    U.derived.push(function () {
      U.leeren(kap);
      kap.appendChild(kapitalChart(A.state.r));
      kap.appendChild(legende([['Eigenkapital', FARBE.ek], ['Fremdkapital', FARBE.fk]]));
    });
    out.appendChild(U.panel('Kapitalbindung', null, [kap]));

    return out;
  };

  /* ===================================================================
     Seite: Analyse
     =================================================================== */

  V.analyse = function (p) {
    var out = el('div', {}, [U.kopf('Analyse',
      'Wie robust ist das Ergebnis? Die Sensitivität zeigt die Hebel, die Rückwärtsrechnung den tragbaren Landpreis.')]);

    var delta = { wert: 10 };

    var tor = el('div', { class: 'panelbody' });
    function zeichneTornado() {
      U.leeren(tor);
      var daten = A.engine.sensitivitaet(A.state.p, delta.wert);
      var basis = A.state.r.kpi.gewinn;
      /* Eigene Spalten: Beschriftung links, Balkenfeld in der Mitte, Werte rechts */
      var W = 900, zeilenH = 34, H = daten.length * zeilenH + 30;
      var textBreite = 190, wertBreite = 96;
      var feldVon = textBreite + 14, feldBis = W - wertBreite;
      var mitte = (feldVon + feldBis) / 2;
      var maxAbw = Math.max.apply(null, daten.map(function (d) {
        return Math.max(Math.abs(d.minus - basis), Math.abs(d.plus - basis));
      }).concat([1]));
      var skala = (feldBis - mitte) / maxAbw;

      var kinder = [s('line', { x1: mitte, y1: 8, x2: mitte, y2: H - 22, stroke: '#a9b3c0' })];
      daten.forEach(function (d, i) {
        var y0 = 12 + i * zeilenH;
        kinder.push(s('text', { x: textBreite, y: y0 + 14, 'text-anchor': 'end', 'font-size': 11.5,
          fill: '#10151c' }, d.label));
        [[d.minus, '−' + delta.wert + ' %', '#c0662e'], [d.plus, '+' + delta.wert + ' %', '#1f5fd0']]
          .forEach(function (v, k) {
            var abw = v[0] - basis, br = Math.abs(abw) * skala;
            var x0 = abw >= 0 ? mitte : mitte - br;
            kinder.push(s('rect', { x: x0, y: y0 + 2 + k * 11, width: Math.max(1, br), height: 9,
              fill: v[2], opacity: .85, rx: 1.5 }));
          });
        kinder.push(s('text', { x: feldBis + 8, y: y0 + 10, 'font-size': 10.5, fill: '#c0662e', class: 'n' },
          A.fmtMio(d.minus)));
        kinder.push(s('text', { x: feldBis + 8, y: y0 + 22, 'font-size': 10.5, fill: '#1f5fd0', class: 'n' },
          A.fmtMio(d.plus)));
      });
      kinder.push(s('text', { x: mitte, y: H - 8, 'text-anchor': 'middle', 'font-size': 10.5,
        fill: '#6b7484', class: 'n' }, 'Basis ' + A.fmtMio(basis)));
      tor.appendChild(U.svg(W, H, kinder, { h: H }));
      tor.appendChild(legende([['Parameter −' + delta.wert + ' %', '#c0662e'],
        ['Parameter +' + delta.wert + ' %', '#1f5fd0']]));
    }

    var deltaWahl = el('div', { class: 'seg' });
    [5, 10, 20].forEach(function (d) {
      var b = el('button', { type: 'button', text: '± ' + d + ' %', class: d === 10 ? 'on' : '' });
      b.addEventListener('click', function () {
        delta.wert = d;
        deltaWahl.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        zeichneTornado();
      });
      deltaWahl.appendChild(b);
    });

    out.appendChild(U.panel('Sensitivität des Projektgewinns', 'sortiert nach Hebelwirkung',
      [tor], [deltaWahl]));
    zeichneTornado();   // bewusst nicht in U.derived: 14 vollständige Durchrechnungen

    /* Residualwert */
    var res = el('div', { class: 'panelbody' });
    function zeichneResidual() {
      U.leeren(res);
      var rw = A.engine.residualwert(A.state.p);
      if (!rw.erreichbar) {
        res.appendChild(U.hinweis('warn', 'Die Zielmarge von <b>' + A.fmtPct(A.state.p.ziele.marge) +
          '</b> wird selbst bei einem Landpreis von null nicht erreicht (Marge dann ' +
          A.fmtPct(rw.marge_bei_null) + '). Die Kosten- oder Ertragsseite muss sich ändern.'));
        return;
      }
      var ist = A.state.r.erwerb.kaufpreis;
      res.appendChild(el('div', { class: 'cols c4' }, [
        U.kachel('tragbarer Kaufpreis', fmt(rw.preis), 'bei Zielmarge ' + A.fmtPct(rw.ziel)),
        U.kachel('je m² Grundstück', fmt(rw.pro_m2_land) + ' CHF'),
        U.kachel('je m² anrechenbare GF', fmt(rw.pro_m2_agf) + ' CHF'),
        U.kachel('Spielraum gegenüber Ist', fmt(rw.preis - ist),
          ist > 0 ? A.fmtPct((rw.preis / ist - 1) * 100) + ' des Kaufpreises' : '',
          rw.preis >= ist ? 'pos' : 'neg')
      ]));
      res.appendChild(U.hinweis(rw.preis >= ist ? 'ok' : 'ziel', rw.preis >= ist
        ? 'Der aktuelle Kaufpreis von <b>' + fmt(ist) + ' CHF</b> liegt innerhalb des tragbaren Rahmens.'
        : 'Der aktuelle Kaufpreis von <b>' + fmt(ist) + ' CHF</b> übersteigt den bei Zielmarge tragbaren Wert um <b>' +
          fmt(ist - rw.preis) + ' CHF</b>.'));
    }
    zeichneResidual();  // bewusst nicht in U.derived: Bisektion mit 60 Durchrechnungen
    out.appendChild(U.panel('Residualer Landwert', 'welchen Kaufpreis trägt das Projekt bei Zielmarge?', [res]));

    /* Bestandsrechnung im Vergleich */
    var verg = el('div', { class: 'panelbody' });
    U.derived.push(function () {
      var r = A.state.r, b = r.bestand;
      U.leeren(verg);
      if (r.ertraege.sollmiete_halten <= 0) {
        verg.appendChild(U.hinweis('info', 'Es sind keine Flächen zum Halten vorgesehen — ' +
          'die Bestandsrechnung entfällt. Stellen Sie auf der Seite <b>Erträge &amp; Verwertung</b> ' +
          'eine Nutzung auf <b>Halten</b>, um sie zu aktivieren.'));
        return;
      }
      verg.appendChild(el('div', { class: 'cols c4' }, [
        U.kachel('Ertragswert (DCF)', fmt(b.ertragswert), A.fmt(A.state.p.bestandsrechnung.haltedauer, 0) + ' Jahre Haltedauer'),
        U.kachel('Marktwert bei Fertigstellung', fmt(r.ertraege.halten_wert + r.ertraege.exit_wert),
          'über Bewertungsrendite'),
        U.kachel('anteilige Anlagekosten', fmt(b.anteil_ak)),
        U.kachel('Wertüberschuss', fmt(b.wertueberschuss), null, b.wertueberschuss >= 0 ? 'pos' : 'neg')
      ]));
    });
    out.appendChild(U.panel('Halten statt verkaufen', 'Barwertrechnung gegen die Entwicklungsrechnung', [verg]));

    return out;
  };

  /* ===================================================================
     Seite: Bericht
     =================================================================== */

  V.bericht = function (p) {
    var out = el('div', {});
    var r = A.state.r;

    out.appendChild(el('div', { class: 'seitenkopf' }, [
      el('h1', { text: p.name || 'Projekt' }),
      el('p', { text: [p.ort, A.KANTONE[p.kanton] ? A.KANTONE[p.kanton].label : '', 'Stand ' + p.stand,
        p.bearbeiter].filter(Boolean).join(' · ') })
    ]));

    var aktionen = [
      el('button', { class: 'primary noprint', text: 'Drucken / als PDF sichern',
        onclick: function () { window.print(); } })
    ];

    /* Steckbrief */
    var sz = A.SZENARIEN.find(function (x) { return x.id === p.szenario; });
    var steck = el('div', { class: 'panelbody' }, [el('div', { class: 'cols c4' }, [
      U.kachel('Szenario', sz ? sz.label : '—'),
      U.kachel('Status', p.status),
      U.kachel('Grundstück', fmt(p.grundstueck.flaeche) + ' m²', 'AZ ' + A.fmt(p.grundstueck.az, 2)),
      U.kachel('Nutzfläche', fmt(r.flaechen.total.nwf) + ' m²',
        fmt(r.flaechen.total.gf) + ' m² GF · ' + fmt(r.flaechen.total.pp) + ' PP')
    ])]);
    out.appendChild(U.panel('Steckbrief', null, [steck], aktionen));

    /* Kennzahlen */
    var k = r.kpi;
    out.appendChild(U.panel('Kennzahlen', null, [el('div', { class: 'panelbody' }, [
      el('div', { class: 'cols c4' }, [
        U.kachel('Anlagekosten', fmt(k.anlagekosten)),
        U.kachel('Erlöse', fmt(k.erloese + k.mietertrag_projekt)),
        U.kachel('Projektgewinn', fmt(k.gewinn), p.steuern.aktiv ? 'nach Steuern' : 'vor Steuern',
          k.gewinn >= 0 ? 'pos' : 'neg'),
        U.kachel('Marge', A.fmtPct(k.marge_ak), 'Ziel ' + A.fmtPct(p.ziele.marge),
          k.marge_ak >= p.ziele.marge ? 'pos' : 'neg'),
        U.kachel('Eigenkapital', fmt(k.ek_max)),
        U.kachel('Rendite auf EK', A.fmtPct(k.roe)),
        U.kachel('Interner Zinsfuss', k.irr === null ? '–' : A.fmtPct(k.irr)),
        U.kachel('Bruttorendite', A.fmtPct(k.bruttorendite, 2))
      ])
    ])]));

    /* Kostenzusammenzug */
    var zeilen = [];
    zeilen.push(el('tr', { class: 'grp' }, [el('td', { colspan: 2, text: 'Erwerb' })]));
    r.erwerb.zeilen.forEach(function (z) {
      if (Math.abs(z.betrag) < 1) return;
      zeilen.push(el('tr', {}, [el('td', { text: z.label }), el('td', { class: 'n', text: fmt(z.betrag) })]));
    });
    zeilen.push(el('tr', { class: 'sum' }, [el('td', { text: 'Erwerbskosten' }),
      el('td', { class: 'n', text: fmt(r.erwerb.total) })]));

    Object.keys(r.bau.bloecke).forEach(function (bid) {
      var b = r.bau.bloecke[bid];
      zeilen.push(el('tr', { class: 'grp' }, [el('td', { colspan: 2, text: 'Baukosten · ' + b.label })]));
      b.zeilen.forEach(function (z) {
        if (Math.abs(z.betrag) < 1) return;
        zeilen.push(el('tr', {}, [
          el('td', {}, [el('span', { class: 'bkp', text: 'BKP ' + z.bkp + '  ' }), el('span', { text: z.label })]),
          el('td', { class: 'n', text: fmt(z.betrag) })]));
      });
      zeilen.push(el('tr', {}, [el('td', { text: 'Reserve / Unvorhergesehenes' }),
        el('td', { class: 'n', text: fmt(b.reserve) })]));
      zeilen.push(el('tr', { class: 'sum' }, [el('td', { text: 'Total ' + b.label }),
        el('td', { class: 'n', text: fmt(b.total) })]));
    });

    zeilen.push(el('tr', { class: 'grp' }, [el('td', { colspan: 2, text: 'Vermarktung' })]));
    r.vermarktung.zeilen.forEach(function (z) {
      if (Math.abs(z.betrag) < 1) return;
      zeilen.push(el('tr', {}, [el('td', { text: z.label }), el('td', { class: 'n', text: fmt(z.betrag) })]));
    });
    zeilen.push(el('tr', { class: 'grp' }, [el('td', { colspan: 2, text: 'Finanzierung' })]));
    zeilen.push(el('tr', {}, [el('td', { text: 'Bauzinsen' }), el('td', { class: 'n', text: fmt(r.fin.bauzinsen) })]));
    zeilen.push(el('tr', {}, [el('td', { text: 'Bereitstellungskommission' }),
      el('td', { class: 'n', text: fmt(r.fin.bereitstellung) })]));
    zeilen.push(el('tr', { class: 'total' }, [el('td', { text: 'Gesamtinvestition' }),
      el('td', { class: 'n', text: fmt(k.gesamtinvestition) })]));

    out.appendChild(U.panel('Kostenzusammenzug', null, [
      el('div', { class: 'panelbody' }, [U.tabelle([{ label: 'Position' }, { label: 'CHF', n: true, w: '20%' }], zeilen)])
    ]));

    /* Annahmenliste */
    var meta = Object.keys(p.meta).filter(function (pf) {
      var m = p.meta[pf]; return m && (m.q === 'annahme' || m.q === 'belegt' || m.note);
    });
    var autoAnnahmen = [];
    Object.keys(U.LABELS).forEach(function (pf) {
      if (p.meta[pf]) return;
      var h = U.herkunft(p, pf);
      if (h.q === 'annahme') autoAnnahmen.push(pf);
    });

    var aZeilen = meta.concat(autoAnnahmen).map(function (pf) {
      var h = U.herkunft(p, pf), v = A.get(p, pf);
      return el('tr', {}, [
        el('td', { text: U.LABELS[pf] || pf }),
        el('td', { class: 'n', text: typeof v === 'number' ? fmt(v, Math.abs(v) < 100 ? 2 : 0) : String(v) }),
        el('td', { class: 'muted', text: U.UNITS[pf] || '' }),
        el('td', {}, [el('span', { class: 'tag ' + (h.q === 'belegt' ? 'pos' : 'warn'),
          text: U.HERKUNFT_LABEL[h.q] })]),
        el('td', { class: 'muted', text: h.note || '' })
      ]);
    });

    out.appendChild(U.panel('Annahmen und Datenherkunft',
      aZeilen.length ? aZeilen.length + ' Positionen weichen vom Standardwert ab' : null, [
      el('div', { class: 'panelbody' }, [
        aZeilen.length
          ? U.tabelle([{ label: 'Position' }, { label: 'Wert', n: true, w: '12%' }, { label: 'Einheit', w: '14%' },
              { label: 'Herkunft', w: '14%' }, { label: 'Quelle / Bemerkung', w: '26%' }], aZeilen)
          : U.hinweis('info', 'Alle Eingaben entsprechen den hinterlegten Standardwerten. ' +
              'Markieren Sie belegte Zahlen über den Punkt neben der Feldbeschriftung.')
      ])
    ]));

    /* Hinweise */
    if (r.warnungen.length) {
      out.appendChild(U.panel('Hinweise', null, [
        el('div', { class: 'panelbody' }, r.warnungen.map(function (w) {
          return U.hinweis(w.art === 'ziel' ? 'ziel' : w.art, w.text);
        }))
      ]));
    }

    out.appendChild(el('p', { class: 'muted', style: 'font-size:11px;margin-top:14px',
      text: 'Diese Auswertung beruht auf den erfassten Annahmen und ersetzt keine Verkehrswertschätzung. ' +
            'Kantonale Gebühren und Steuersätze sind Richtwerte und vor Verwendung zu prüfen.' }));

    return out;
  };

})(window.APP);
