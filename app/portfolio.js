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

    /* Kapitalbedarf über die Kalenderjahre */
    var jahre = {};
    berechnet.forEach(function (x) {
      x.r.fin.jahre.forEach(function (j) {
        var kj = (x.p.startjahr || new Date().getFullYear()) + j.jahr;
        if (!jahre[kj]) jahre[kj] = { ek: 0, fk: 0, projekte: [] };
        jahre[kj].ek += j.ek; jahre[kj].fk += j.fk;
        if (j.ek + j.fk > 0) jahre[kj].projekte.push(x.p.name);
      });
    });
    var keys = Object.keys(jahre).map(Number).sort(function (a, b) { return a - b; });
    if (keys.length) {
      var W = 900, H = 210, oben = 16, unten = 44, links = 58;
      var max = Math.max.apply(null, keys.map(function (k) { return jahre[k].ek + jahre[k].fk; }).concat([1]));
      var y = function (v) { return oben + (max - v) / max * (H - oben - unten); };
      var gap = (W - links) / keys.length, bw = gap * 0.55;
      var kinder = [s('line', { x1: links, y1: y(0), x2: W, y2: y(0), stroke: '#a9b3c0' })];
      [max, max / 2].forEach(function (v) {
        kinder.push(s('line', { x1: links, y1: y(v), x2: W, y2: y(v), stroke: '#eef1f5' }));
        kinder.push(s('text', { x: links - 6, y: y(v) + 3.5, 'text-anchor': 'end', 'font-size': 10,
          fill: '#6b7484', class: 'n' }, A.fmtMio(v)));
      });
      keys.forEach(function (kj, i) {
        var d = jahre[kj], x0 = links + i * gap + (gap - bw) / 2;
        kinder.push(s('rect', { x: x0, y: y(d.ek), width: bw, height: Math.max(0, y(0) - y(d.ek)),
          fill: '#7c93b3', rx: 1.5 }));
        kinder.push(s('rect', { x: x0, y: y(d.ek + d.fk), width: bw, height: Math.max(0, y(0) - y(d.fk)),
          fill: '#c0662e', rx: 1.5 }));
        kinder.push(s('text', { x: x0 + bw / 2, y: H - unten + 15, 'text-anchor': 'middle',
          'font-size': 10, fill: '#6b7484', class: 'n' }, String(kj)));
        kinder.push(s('text', { x: x0 + bw / 2, y: H - unten + 28, 'text-anchor': 'middle',
          'font-size': 9.5, fill: '#a2abb8' }, d.projekte.length + ' Proj.'));
      });
      out.appendChild(U.panel('Kapitalbedarf über alle Projekte', 'Summe der gebundenen Mittel je Kalenderjahr', [
        el('div', { class: 'panelbody' }, [U.svg(W, H, kinder, { h: H }),
          el('div', { class: 'legende' }, [
            el('span', {}, [el('i', { style: 'background:#7c93b3' }), el('span', { text: 'Eigenkapital' })]),
            el('span', {}, [el('i', { style: 'background:#c0662e' }), el('span', { text: 'Fremdkapital' })])
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
