/* =====================================================================
   Projektrechner · Portfolio, Snapshots, Soll/Ist, Import & Export
   ===================================================================== */
window.APP = window.APP || {};
(function (A) {
  'use strict';

  var U = A.ui, V = A.views, el = U.el, s = U.s;
  function fmt(n, d) { return A.fmt(n, d); }
  function num(v) { return U.parseZahl(v); }

  /* ---------------------------------------------------------------
     Kostenzeilen eines Projektes als flache Liste (Basis für Soll/Ist)
     --------------------------------------------------------------- */

  /* «soll» ist immer der gerechnete Betrag — auch dann, wenn ein Ist-Wert
     ihn in der Kalkulation bereits ersetzt hat. Nur so bleibt der
     Vergleich aussagekräftig. */
  A.kostenzeilen = function (r) {
    var out = [];
    function nimm(key, gruppe, label, z) {
      var soll = z.soll !== undefined ? z.soll : z.betrag;
      if (Math.abs(soll) < 1 && !z.ist) return;
      out.push({ key: key, gruppe: gruppe, label: label, soll: soll, uebernommen: !!z.ist });
    }
    r.erwerb.zeilen.forEach(function (z) {
      nimm('erwerb.' + z.id, 'Erwerb', z.label, z);
    });
    Object.keys(r.bau.bloecke).forEach(function (bid) {
      var b = r.bau.bloecke[bid];
      b.zeilen.forEach(function (z) {
        nimm('bau.' + bid + '.' + z.id, 'Bau · ' + b.label, 'BKP ' + z.bkp + ' · ' + z.label, z);
      });
    });
    r.vermarktung.zeilen.forEach(function (z) {
      nimm('vermarktung.' + z.id, 'Vermarktung', z.label, z);
    });
    /* Der kalkulatorische Eigenkapitalzins zählt zu den Finanzierungs-
       kosten und gehört deshalb in dieselbe Zeile. */
    out.push({ key: 'finanzierung.bauzinsen', gruppe: 'Finanzierung',
      label: 'Bauzinsen, Bereitstellung und EK-Zins',
      soll: r.fin.bauzinsen + r.fin.bereitstellung + r.fin.ek_zins_kalk });
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

  /* Der Statusfilter ist eine Ansichtseinstellung, kein Projektinhalt —
     er bleibt deshalb lokal gespeichert und gilt für alle Auswertungen
     dieser Seite, nicht nur für die Liste. */
  var FILTER_KEY = 'projektrechner.statusfilter';
  var FIRMA_KEY  = 'projektrechner.firmenfilter';

  function filterLesen() {
    try {
      var roh = localStorage.getItem(FILTER_KEY);
      if (!roh) return null;                       // null = alle
      var l = JSON.parse(roh);
      return Array.isArray(l) ? l : null;
    } catch (e) { return null; }
  }

  function filterSchreiben(liste) {
    try {
      if (!liste) localStorage.removeItem(FILTER_KEY);
      else localStorage.setItem(FILTER_KEY, JSON.stringify(liste));
    } catch (e) { /* privater Modus: gilt dann nur für diese Sitzung */ }
  }

  /* Firmenfilter: null = alle Gefässe (Gesamtsicht), sonst die gewählten.
     Der Leerstring steht für Projekte ohne Zuordnung. */
  function firmaLesen() {
    try {
      var roh = localStorage.getItem(FIRMA_KEY);
      if (!roh) return null;
      var l = JSON.parse(roh);
      return Array.isArray(l) ? l : null;
    } catch (e) { return null; }
  }

  function firmaSchreiben(liste) {
    try {
      if (!liste) localStorage.removeItem(FIRMA_KEY);
      else localStorage.setItem(FIRMA_KEY, JSON.stringify(liste));
    } catch (e) {}
  }

  A.statusFilter = filterLesen;
  A.firmenFilter = firmaLesen;

  V.portfolio = function () {
    var out = el('div', {}, [U.kopf('Portfolio',
      'Alle gespeicherten Projekte im Überblick. Der Kapitalbedarf wird über das Kalenderjahr des Erwerbs ' +
      'zusammengeführt — das zeigt, wann sich Projekte in der Finanzierung überlagern.')]);

    var alleProjekte = A.store.alle(zeigeArchiv.wert);
    if (!alleProjekte.length) {
      out.appendChild(U.hinweis('info', 'Noch keine Projekte gespeichert. Das aktuelle Projekt wird ' +
        'automatisch gesichert, sobald Sie es bearbeiten.'));
      return out;
    }

    /* --- Firmenfilter ------------------------------------------------ */
    var firmen = A.firmenListe(alleProjekte);
    var ohneZuordnung = alleProjekte.some(function (x) { return !x.firma; });
    var firmaGewaehlt = firmaLesen();
    /* Eine Firma, die es nicht mehr gibt, darf die Ansicht nicht leeren. */
    if (firmaGewaehlt) {
      firmaGewaehlt = firmaGewaehlt.filter(function (f) {
        return f === '' ? ohneZuordnung : firmen.indexOf(f) >= 0;
      });
      if (!firmaGewaehlt.length) firmaGewaehlt = null;
    }
    var nachFirma = firmaGewaehlt
      ? alleProjekte.filter(function (x) { return firmaGewaehlt.indexOf(x.firma || '') >= 0; })
      : alleProjekte;

    /* --- Statusfilter ------------------------------------------------ */
    var gewaehlt = filterLesen();
    var projekte = gewaehlt
      ? nachFirma.filter(function (x) { return gewaehlt.indexOf(x.status) >= 0; })
      : nachFirma;

    var proStatus = {};
    nachFirma.forEach(function (x) {
      proStatus[x.status] = (proStatus[x.status] || 0) + 1;
    });

    var chips = el('div', { class: 'chips' });
    A.STATUS.forEach(function (st) {
      var an = !gewaehlt || gewaehlt.indexOf(st) >= 0;
      var anzahl = proStatus[st] || 0;
      var c = el('button', { type: 'button',
        class: 'chip' + (an ? ' on' : ''),
        title: anzahl ? anzahl + ' Projekt(e)' : 'kein Projekt in diesem Status' }, [
        el('span', { text: st }),
        el('span', { class: 'zahl', text: String(anzahl) })
      ]);
      c.addEventListener('click', function () {
        var basis = gewaehlt ? gewaehlt.slice() : A.STATUS.slice();
        var i = basis.indexOf(st);
        if (i >= 0) basis.splice(i, 1); else basis.push(st);
        /* Alles gewählt = kein Filter. Eine leere Auswahl bleibt bestehen —
           so lässt sich von «keine» aus gezielt eine Phase einschalten. */
        filterSchreiben(basis.length === A.STATUS.length ? null : basis);
        A.render();
      });
      chips.appendChild(c);
    });

    /* Voreinstellungen aus der Reihenfolge in A.STATUS ableiten, damit sie
       nicht auseinanderlaufen, wenn die Statusliste einmal wächst.
       «Verworfen» bleibt immer draussen — ein aufgegebenes Projekt gehört
       in keine Auswertung. */
    function abStatus(name, ohne) {
      var i = A.STATUS.indexOf(name);
      var raus = ['Verworfen'].concat(ohne || []);
      return A.STATUS.slice(i < 0 ? 0 : i).filter(function (x) { return raus.indexOf(x) < 0; });
    }
    /* Entwicklung: von der Prüfung bis und mit Entwicklung — alles vor
       der Baubewilligung, ohne blosse Ideen. */
    var vonBis = function (von, bis) {
      var a = A.STATUS.indexOf(von), b = A.STATUS.indexOf(bis);
      return A.STATUS.slice(a, b + 1);
    };
    var inEntwicklung = vonBis('Prüfung', 'Entwicklung');
    /* Realisation meint die laufenden Projekte — abgeschlossene sind fertig. */
    var inRealisation = abStatus('Baubewilligung', ['Abgeschlossen']);

    var werkzeuge = el('div', { style: 'display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap' }, [
      el('button', { class: 'sm', text: 'alle', onclick: function () { filterSchreiben(null); A.render(); } }),
      el('button', { class: 'sm', text: 'keine',
        title: 'Auswahl leeren — danach gezielt einzelne Phasen einschalten',
        onclick: function () { filterSchreiben([]); A.render(); } }),
      el('button', { class: 'sm', text: 'Entwicklung',
        title: inEntwicklung.join(' · '),
        onclick: function () { filterSchreiben(inEntwicklung); A.render(); } }),
      el('button', { class: 'sm', text: 'Realisation',
        title: inRealisation.join(' · '),
        onclick: function () { filterSchreiben(inRealisation); A.render(); } }),
      el('span', { class: 'muted', style: 'font-size:11.5px; margin-left:6px',
        text: !gewaehlt
          ? alleProjekte.length + ' Projekte, kein Filter'
          : (gewaehlt.length
              ? projekte.length + ' von ' + alleProjekte.length + ' Projekten — Filter aktiv'
              : 'keine Phase gewählt') })
    ]);

    /* --- Firmenauswahl ----------------------------------------------- */
    var firmenAuswahl = null;
    if (firmen.length || ohneZuordnung) {
      var proFirma = {};
      alleProjekte.forEach(function (x) {
        var k = x.firma || '';
        proFirma[k] = (proFirma[k] || 0) + 1;
      });

      var fchips = el('div', { class: 'chips' });
      var eintraege = firmen.slice();
      if (ohneZuordnung) eintraege.push('');
      eintraege.forEach(function (f) {
        var an = !firmaGewaehlt || firmaGewaehlt.indexOf(f) >= 0;
        var c = el('button', { type: 'button', class: 'chip' + (an ? ' on' : '') }, [
          el('span', { text: f || 'ohne Zuordnung' }),
          el('span', { class: 'zahl', text: String(proFirma[f] || 0) })
        ]);
        c.addEventListener('click', function () {
          var basis = firmaGewaehlt ? firmaGewaehlt.slice() : eintraege.slice();
          var i = basis.indexOf(f);
          if (i >= 0) basis.splice(i, 1); else basis.push(f);
          /* Alles gewählt oder nichts gewählt = Gesamtsicht */
          firmaSchreiben(basis.length === eintraege.length || !basis.length ? null : basis);
          A.render();
        });
        fchips.appendChild(c);
      });

      var fwerkzeuge = el('div', { style: 'display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap' }, [
        el('button', { class: 'sm', text: 'alle Gefässe',
          onclick: function () { firmaSchreiben(null); A.render(); } }),
        el('span', { class: 'muted', style: 'font-size:11.5px;margin-left:6px',
          text: firmaGewaehlt
            ? nachFirma.length + ' von ' + alleProjekte.length + ' Projekten — Gefäss gewählt'
            : 'Gesamtsicht über alle Gefässe' })
      ]);

      firmenAuswahl = U.panel('Immobiliengefäss',
        'Portfolio je Firma oder Gesamtsicht über alle', [
        el('div', { class: 'panelbody' }, [fchips, fwerkzeuge])
      ]);
    }

    if (firmenAuswahl) out.appendChild(firmenAuswahl);

    out.appendChild(U.panel('Auswahl',
      'gilt für sämtliche Auswertungen dieser Seite', [
      el('div', { class: 'panelbody' }, [chips, werkzeuge])
    ]));

    if (!projekte.length) {
      out.appendChild(U.hinweis('info', gewaehlt && !gewaehlt.length
        ? 'Keine Phase gewählt — schalten Sie oben die Phasen ein, die Sie sehen möchten.'
        : 'Die gewählten Phasen enthalten kein Projekt. Wählen Sie oben weitere hinzu.'));
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
    /* Die Überschriften nennen die Auswahl, sobald gefiltert wird —
       «über alle Projekte» wäre bei aktivem Filter schlicht falsch. */
    var umfang = gewaehlt ? 'über die Auswahl' : 'über alle Projekte';
    out.appendChild(U.panel('Summen ' + umfang,
      berechnet.length + ' Projekte' + (gewaehlt ? ' von ' + alleProjekte.length : ''), [
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

    /* Gefässe nebeneinander. Bewusst über alle Firmen, auch wenn oben eine
       einzelne gewählt ist — sonst liesse sich nicht vergleichen. Der
       Statusfilter gilt dagegen mit, damit die Zahlen zur übrigen Seite
       passen. */
    if (firmen.length || ohneZuordnung) {
      var proGefaess = {};
      (gewaehlt ? alleProjekte.filter(function (x) { return gewaehlt.indexOf(x.status) >= 0; })
                : alleProjekte).forEach(function (q) {
        var k = q.firma || '';
        if (!proGefaess[k]) proGefaess[k] = { n: 0, ak: 0, erloes: 0, gewinn: 0, ek: 0 };
        var g = proGefaess[k];
        var rr; try { rr = A.engine.compute(q); } catch (e) { return; }
        g.n += 1; g.ak += rr.kpi.anlagekosten; g.erloes += rr.kpi.erloese;
        g.gewinn += rr.kpi.gewinn; g.ek += rr.kpi.ek_max;
      });

      var gz = Object.keys(proGefaess).sort(function (a, b) {
        return (a || 'zzz').localeCompare(b || 'zzz', 'de');
      }).map(function (k) {
        var g = proGefaess[k];
        return el('tr', {}, [
          el('td', { text: k || 'ohne Zuordnung', class: k ? '' : 'muted' }),
          el('td', { class: 'n', text: String(g.n) }),
          el('td', { class: 'n', text: fmt(g.ak) }),
          el('td', { class: 'n', text: fmt(g.erloes) }),
          el('td', { class: 'n' + (g.gewinn >= 0 ? '' : ' neg'), text: fmt(g.gewinn) }),
          el('td', { class: 'n', text: A.fmtPct(g.ak > 0 ? g.gewinn / g.ak * 100 : 0) }),
          el('td', { class: 'n', text: fmt(g.ek) })
        ]);
      });
      var ges = Object.keys(proGefaess).reduce(function (a, k) {
        var g = proGefaess[k];
        a.n += g.n; a.ak += g.ak; a.erloes += g.erloes; a.gewinn += g.gewinn; a.ek += g.ek;
        return a;
      }, { n: 0, ak: 0, erloes: 0, gewinn: 0, ek: 0 });
      gz.push(el('tr', { class: 'total' }, [
        el('td', { text: 'Alle Gefässe' }),
        el('td', { class: 'n', text: String(ges.n) }),
        el('td', { class: 'n', text: fmt(ges.ak) }),
        el('td', { class: 'n', text: fmt(ges.erloes) }),
        el('td', { class: 'n', text: fmt(ges.gewinn) }),
        el('td', { class: 'n', text: A.fmtPct(ges.ak > 0 ? ges.gewinn / ges.ak * 100 : 0) }),
        el('td', { class: 'n', text: fmt(ges.ek) })
      ]));

      out.appendChild(U.panel('Gefässe im Überblick',
        'unabhängig von der Gefässauswahl oben, damit ein Vergleich möglich bleibt', [
        el('div', { class: 'panelbody' }, [U.tabelle([
          { label: 'Firma' }, { label: 'Projekte', n: true, w: '9%' },
          { label: 'Anlagekosten', n: true, w: '15%' }, { label: 'Erlöse', n: true, w: '15%' },
          { label: 'Gewinn', n: true, w: '13%' }, { label: 'Marge', n: true, w: '9%' },
          { label: 'Eigenkapital', n: true, w: '13%' }
        ], gz)])
      ]));
    }

    /* Standortkarte. Sie folgt der Auswahl der Seite — Gefäss und
       Status gelten mit, damit sie dasselbe zeigt wie die Tabellen. */
    var mitOrt = berechnet.filter(function (x) { return A.karte.hatStandort(x.p); });
    var ohneOrt = berechnet.length - mitOrt.length;
    out.appendChild(U.panel('Standorte',
      mitOrt.length + ' von ' + berechnet.length + ' Projekten verortet' +
      (ohneOrt ? ' · ' + ohneOrt + ' ohne Koordinaten' : ''), [
      A.karte.bauen(berechnet, { hoehe: 440 }),
      el('div', { class: 'panelbody' }, [
        A.karte.legende(),
        ohneOrt
          ? el('div', { class: 'muted', style: 'font-size:11.5px;margin-top:8px',
              text: ohneOrt + ' Projekt(e) fehlen auf der Karte, weil keine Koordinaten ' +
                    'erfasst sind. Sie stehen im Projekt unter «Projekt» — ' +
                    'Knopf «Koordinaten suchen».' })
          : null
      ])
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

    /* Verkaufsstand von Hand nachladen — aktualisiert die zentrale
       Ablage und alle Projekte mit Zuordnung. */
    var vkStand = A.verkauf.gespeichert();
    var vkSchalter = el('button', { class: 'sm schreibend',
      text: 'Verkaufsstand aktualisieren',
      title: vkStand ? 'zuletzt geladen: Stand vom ' + vkStand.datum : 'noch nie geladen',
      onclick: function () { A.verkaufAktualisieren(); } });

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
        { label: 'Marge', n: true }, { label: 'IRR', n: true }, { label: '' }
      ], zeilen)])
    ], [vkSchalter, archivSchalter]));

    /* ---------------------------------------------------------------
       Terminplan: eine Zeile je Projekt auf gemeinsamer Kalenderachse
       --------------------------------------------------------------- */
    /* Markierte Termine heben sich bewusst von den Grobphasen ab —
       sie kommen aus dem Detailplan des Projekts. */
    var MARKENFARBE = '#5b3fa8';
    var PHASENFARBEN = [
      { key: 'entwicklung', label: 'Entwicklung',  f: '#7c93b3' },
      { key: 'bewilligung', label: 'Bewilligung',  f: '#b0871f' },
      { key: 'vorbereitung',label: 'Vorbereitung', f: '#8a8f99' },
      { key: 'bau',         label: 'Bau',          f: '#1f5fd0' },
      { key: 'vermarktung', label: 'Vermarktung',  f: '#0d7a45' }
    ];

    /* Ein Kalenderdatum als Dezimaljahr — die Achse rechnet in Jahren,
       der Terminplan des Projekts in Daten. */
    function jahrDez(iso) {
      var d = new Date(String(iso || '').slice(0, 10));
      if (isNaN(d)) return null;
      return d.getFullYear() + (d.getMonth() + d.getDate() / 30.4) / 12;
    }

    /* Was im Projekt unter «Phasen & Termine» fürs Portfolio markiert
       wurde. Die groben Phasen bleiben, wie sie sind — das hier kommt
       als eigene Zeile dazu. */
    function marken(p) {
      var raus = [];
      ((p.termine && p.termine.phasen) || []).forEach(function (e) {
        if (!e.dashboard || !e.von || !e.bis) return;
        var t0 = jahrDez(e.von), t1 = jahrDez(e.bis);
        if (t0 === null || t1 === null) return;
        raus.push({ t0: t0, t1: t1, meilenstein: false,
          label: A.phaseLabel(e.id) + ' · ' + A.datum(e.von) + ' – ' + A.datum(e.bis) });
      });
      ((p.termine && p.termine.eigene) || []).forEach(function (e) {
        if (!e.dashboard) return;
        var ende = jahrDez(e.bis || e.von);
        if (ende === null) return;
        var anfang = e.meilenstein ? ende : (jahrDez(e.von || e.bis) || ende);
        raus.push({ t0: anfang, t1: ende, meilenstein: !!e.meilenstein,
          label: (e.text || 'Termin') + ' · ' +
                 (e.meilenstein ? A.datum(e.bis || e.von)
                                : A.datum(e.von) + ' – ' + A.datum(e.bis)) });
      });
      return raus;
    }

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
        marken: marken(x.p),
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
      /* Markierte Termine können über die Rechenphasen hinausragen —
         die Achse muss sie mitnehmen, sonst kleben sie am Rand. */
      var alleVon = [], alleBis = [];
      termine.forEach(function (t) {
        alleVon.push(t.von); alleBis.push(t.bis);
        t.marken.forEach(function (m) { alleVon.push(m.t0); alleBis.push(m.t1); });
      });
      var tVon = Math.floor(Math.min.apply(null, alleVon));
      var tBis = Math.ceil(Math.max.apply(null, alleBis));
      var jahre = Math.max(1, tBis - tVon);
      var mitMarken = termine.some(function (t) { return t.marken.length; });
      var W = 980, zeileH = mitMarken ? 54 : 40, links = 190, kopf = 26;
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

        /* Markierte Phasen und Meilensteine aus dem Projektterminplan */
        t.marken.forEach(function (m) {
          var ym = y0 + 36;
          var form;
          if (m.meilenstein) {
            var xm = px(m.t1);
            form = s('polygon', {
              points: [xm, ym - 5, xm + 5, ym, xm, ym + 5, xm - 5, ym].join(' '),
              fill: MARKENFARBE, stroke: '#fff', 'stroke-width': 1 });
          } else {
            form = s('rect', { x: px(m.t0), y: ym - 5,
              width: Math.max(3, px(m.t1) - px(m.t0)), height: 10, rx: 2,
              fill: MARKENFARBE, opacity: .9 });
          }
          /* Der Titel muss im Element hängen, sonst zeigt der Browser
             keinen Tooltip. */
          form.appendChild(s('title', {}, m.label));
          kinder.push(form);
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

      out.appendChild(U.panel('Terminplan',
        'Phasen ' + (gewaehlt ? 'der Auswahl' : 'aller Projekte') + ' auf gemeinsamer Kalenderachse', [
        el('div', { class: 'panelbody' }, [
          U.svg(W, H, kinder, { h: H }),
          el('div', { class: 'legende' }, PHASENFARBEN.map(function (f) {
            return el('span', {}, [el('i', { style: 'background:' + f.f }), el('span', { text: f.label })]);
          }).concat(mitMarken ? [el('span', {}, [
            el('i', { style: 'background:' + MARKENFARBE }),
            el('span', { text: 'markiert im Projektterminplan' })
          ])] : []))
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
      out.appendChild(U.panel('Kapitalbedarf ' + umfang,
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

      out.appendChild(U.panel('Cashflow ' + umfang,
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

    /* Stichtag der Zahlungen — Grenze zwischen geflossen und offen. */
    var stichtagFeld = el('input', { type: 'date', value: p.stichtag || A.heute() });
    stichtagFeld.addEventListener('change', function () {
      p.stichtag = stichtagFeld.value || A.heute();
      A.recompute(); A.markDirty(); A.render();
    });

    out.appendChild(U.panel('Zeitliche Verankerung', null, [
      U.body([
        U.num(p, 'startjahr', 'Kalenderjahr des Erwerbs', { dez: 0,
          hilfe: 'Verankert die Projektjahre im Kalender — Grundlage der Portfolio-Aggregation.' }),
        el('div', { class: 'f' }, [
          el('label', {}, [el('span', { text: 'Stichtag der Zahlungen' })]),
          el('div', { class: 'inp' }, [stichtagFeld]),
          el('div', { class: 'hilfe',
            text: 'Trennt geflossene von noch offenen Beträgen. Bereits bezahlte Positionen ' +
                  'werden bis hierhin verteilt, der Rest erst danach.' })
        ]),
        el('div', { class: 'f' }, [
          el('label', {}, [el('span', { text: 'liegt im Projekt bei' })]),
          el('div', { class: 'kachel' }, [
            U.d(function (r) { return A.fmt(r.zeit.t_stichtag, 2) + ' Jahren'; }),
            el('div', { class: 's', text: 'ab Erwerb gerechnet' })
          ])
        ])
      ], 'c4')
    ]));

    /* Zahlungsstand als Kacheln — sie beantworten die Frage, wie viel
       Geld tatsächlich schon draussen ist. */
    var stand = el('div', { class: 'panelbody' });
    U.derived.push(function () {
      var zs = A.state.r.zahlungsstand;
      U.leeren(stand).appendChild(el('div', { class: 'cols c4' }, [
        U.kachel('bereits bezahlt', fmt(zs.bezahlt),
          (zs.kosten > 0 ? A.fmtPct(zs.bezahlt / zs.kosten * 100) + ' der Kosten' : '') +
          (zs.ueberzahlt > 0.5 ? ' · davon ' + fmt(zs.ueberzahlt) + ' über der Kalkulation' : '')),
        U.kachel('noch offen', fmt(zs.offen), 'kalkulierte Kosten abzüglich bezahlt'),
        U.kachel('vertraglich gesichert', fmt(zs.vertraglich),
          zs.kosten > 0 ? A.fmtPct(zs.vertraglich / zs.kosten * 100) + ' der Kosten' : ''),
        U.kachel('Kosten total', fmt(zs.kosten), 'Ist, wo erfasst, sonst Soll')
      ]));
    });
    out.appendChild(U.panel('Zahlungsstand', 'Stand per Stichtag', [stand]));

    /* Soll/Ist. Die Gruppenzeile trägt die Summe ihrer Phase, die letzte
       Zeile die Gesamtsumme. Beide werden über U.derived nachgeführt,
       damit sie beim Tippen eines Ist-Wertes nicht veralten. */
    if (!p.bezahlt) p.bezahlt = {};
    if (!p.vertrag) p.vertrag = {};

    var zeilen = [], gruppe = null;
    var gruppenListe = [], aktuelleGruppe = null;

    function summenZelle() {
      return { soll: el('td', { class: 'n' }), ist: el('td', { class: 'n' }),
               bez: el('td', { class: 'n' }), vtr: el('td', { class: 'n muted' }),
               off: el('td', { class: 'n' }),
               abw: el('td', { class: 'n' }), pct: el('td', { class: 'n' }) };
    }

    function summeSetzen(zellen, s) {
      var d = s.ist - s.soll;
      zellen.soll.textContent = fmt(s.soll);
      zellen.ist.textContent = fmt(s.ist);
      zellen.bez.textContent = fmt(s.bezahlt);
      zellen.vtr.textContent = s.vertragAnzahl ? s.vertragAnzahl + '×' : '';
      var offenS = s.ist - s.bezahlt;
      zellen.off.textContent = offenS < -0.5 ? 'Nachtrag ' + fmt(-offenS) : fmt(offenS);
      zellen.off.style.color = offenS < -0.5 ? 'var(--neg)' : '';
      zellen.abw.textContent = (d > 0 ? '+' : '') + fmt(d);
      zellen.abw.style.color = d > 0 ? 'var(--neg)' : (d < 0 ? 'var(--pos)' : '');
      zellen.pct.textContent = s.soll > 0 ? A.fmtPct((s.ist / s.soll - 1) * 100) : '';
    }

    A.kostenzeilen(A.state.r).forEach(function (z) {
      if (z.gruppe !== gruppe) {
        gruppe = z.gruppe;
        aktuelleGruppe = { label: gruppe, zellen: summenZelle(), zeilen: [] };
        gruppenListe.push(aktuelleGruppe);
        var g = aktuelleGruppe.zellen;
        zeilen.push(el('tr', { class: 'grp' }, [
          el('td', { text: gruppe }),
          g.soll, g.ist, g.bez, g.vtr, g.off, g.abw, g.pct
        ]));
      }
      aktuelleGruppe.zeilen.push(z);

      var ist = p.ist[z.key], bez = p.bezahlt[z.key];

      var inp = el('input', { type: 'text', inputmode: 'decimal',
        value: (ist === undefined || ist === null) ? '' : A.fmt(ist),
        placeholder: 'offen' });

      /* Bereits geflossener Betrag. Er wirkt allein über den Zeitpunkt:
         Bezahltes ist gebundenes Kapital und verteuert die Finanzierung. */
      var bezInp = el('input', { type: 'text', inputmode: 'decimal',
        value: (bez === undefined || bez === null) ? '' : A.fmt(bez),
        placeholder: '—' });

      /* Vertraglich gesichert — reine Dokumentation ohne Rechenwirkung. */
      var vtrBox = el('input', { type: 'checkbox', checked: p.vertrag[z.key] ? '' : null });

      var offZelle = el('td', { class: 'n' });
      var abwZelle = el('td', { class: 'n' });
      var pctZelle = el('td', { class: 'n muted' });

      function malen() {
        var v = p.ist[z.key];
        var b = num(p.bezahlt[z.key]);
        var wirksam = (v === undefined || v === null || v === '') ? z.soll : v;

        if (v === undefined || v === null || v === '') {
          abwZelle.textContent = '—'; abwZelle.className = 'n muted'; abwZelle.style.color = '';
          pctZelle.textContent = '';
        } else {
          var d = v - z.soll;
          abwZelle.textContent = (d > 0 ? '+' : '') + fmt(d);
          abwZelle.className = 'n';
          abwZelle.style.color = d > 0 ? 'var(--neg)' : (d < 0 ? 'var(--pos)' : '');
          pctZelle.textContent = z.soll > 0 ? A.fmtPct((v / z.soll - 1) * 100) : '';
        }

        /* Mehr bezahlt als kalkuliert kommt durch Nachträge und
           Unvorhergesehenes regelmässig vor. Der Mehrbetrag zählt voll in
           den Kapitalbedarf; markiert wird er nur, damit der Nachtrag auch
           in der Ist-Spalte nachgeführt wird. */
        var offen = wirksam - b;
        var mehr = b - wirksam;
        if (b <= 0) {
          offZelle.textContent = '—'; offZelle.className = 'n muted'; offZelle.style.color = '';
        } else if (mehr > 0.5) {
          offZelle.textContent = 'Nachtrag ' + fmt(mehr);
          offZelle.className = 'n';
          offZelle.style.color = 'var(--neg)';
        } else {
          offZelle.textContent = fmt(offen);
          offZelle.className = 'n';
          offZelle.style.color = '';
        }
        bezInp.classList.toggle('warnfeld', mehr > 0.5);
        bezInp.title = mehr > 0.5
          ? 'Es ist ' + fmt(mehr) + ' CHF mehr bezahlt als kalkuliert. Der Betrag zählt voll ' +
            'in den Kapitalbedarf. Damit er auch Marge und Rendite erreicht, den Nachtrag in ' +
            'der Spalte Ist nachführen.'
          : '';
      }

      inp.addEventListener('input', function () {
        if (inp.value.trim() === '') delete p.ist[z.key];
        else p.ist[z.key] = U.parseZahl(inp.value);
        malen(); summenNachfuehren(); A.recompute(); A.markDirty();
      });
      bezInp.addEventListener('input', function () {
        if (bezInp.value.trim() === '') delete p.bezahlt[z.key];
        else p.bezahlt[z.key] = U.parseZahl(bezInp.value);
        malen(); summenNachfuehren(); A.recompute(); A.markDirty();
      });
      vtrBox.addEventListener('change', function () {
        if (vtrBox.checked) p.vertrag[z.key] = true; else delete p.vertrag[z.key];
        summenNachfuehren(); A.markDirty();
      });

      malen();
      zeilen.push(el('tr', {}, [
        el('td', {}, [el('span', { text: z.label }),
          z.uebernommen ? el('span', { class: 'tag pos', style: 'margin-left:7px', text: 'gerechnet' }) : null]),
        el('td', { class: 'n muted', text: fmt(z.soll) }),
        el('td', { style: 'width:112px' }, [inp]),
        el('td', { style: 'width:112px' }, [bezInp]),
        el('td', { class: 'w1', style: 'text-align:center' }, [vtrBox]),
        offZelle,
        abwZelle,
        pctZelle
      ]));
    });

    var gesamtZellen = summenZelle();
    zeilen.push(el('tr', { class: 'total' }, [
      el('td', { text: 'Total (offene Positionen zum Soll)' }),
      gesamtZellen.soll, gesamtZellen.ist, gesamtZellen.bez, gesamtZellen.vtr,
      gesamtZellen.off, gesamtZellen.abw, gesamtZellen.pct
    ]));

    /* Ein noch nicht erfasster Ist-Wert zählt mit seinem Soll — sonst
       stünde eine Phase im Vergleich künstlich tief da. */
    function wirksamFuer(z) {
      var v = p.ist[z.key];
      return (v === undefined || v === null || v === '') ? z.soll : v;
    }

    function summenNachfuehren() {
      var g = { soll: 0, ist: 0, bezahlt: 0, vertragAnzahl: 0 };
      gruppenListe.forEach(function (gr) {
        var s = { soll: 0, ist: 0, bezahlt: 0, vertragAnzahl: 0 };
        gr.zeilen.forEach(function (z) {
          var w = wirksamFuer(z);
          s.soll += z.soll; s.ist += w;
          s.bezahlt += num(p.bezahlt[z.key]);
          if (p.vertrag[z.key]) s.vertragAnzahl += 1;
        });
        summeSetzen(gr.zellen, s);
        g.soll += s.soll; g.ist += s.ist; g.bezahlt += s.bezahlt;
        g.vertragAnzahl += s.vertragAnzahl;
      });
      summeSetzen(gesamtZellen, g);
    }
    summenNachfuehren();

    var schalter = el('div', { class: 'seg' });
    [['übernehmen', true], ['nur vergleichen', false]].forEach(function (o) {
      var b = el('button', { type: 'button', text: o[0],
        class: (p.ist_uebernehmen !== false) === o[1] ? 'on' : '' });
      b.addEventListener('click', function () {
        p.ist_uebernehmen = o[1]; A.recompute(); A.render();
      });
      schalter.appendChild(b);
    });

    out.appendChild(U.panel('Soll-Ist-Vergleich',
      p.ist_uebernehmen !== false
        ? 'erfasste Ist-Werte ersetzen den Soll-Betrag in der Kalkulation'
        : 'Ist-Werte werden nur gegenübergestellt, nicht gerechnet', [
      el('div', { class: 'panelbody' }, [U.tabelle([
        { label: 'Position' },
        { label: 'Soll CHF', n: true, w: '11%' },
        { label: 'Ist CHF', n: true, w: '11%' },
        { label: 'bereits bezahlt', n: true, w: '11%' },
        { label: 'Vertrag', w: '5%' },
        { label: 'offen', n: true, w: '10%' },
        { label: 'Abweichung', n: true, w: '11%' },
        { label: '%', n: true, w: '7%' }
      ], zeilen)]),
      el('div', { class: 'panelbody' }, [
        el('button', { text: 'Ist-Werte aus CSV einlesen', onclick: function () { istImport(p); } }),
        el('button', { class: 'ghost', text: 'Ist-Werte zurücksetzen', onclick: function () {
          if (confirm('Alle Ist-Werte löschen?')) { p.ist = {}; A.recompute(); A.render(); }
        } }),
        p.ist_uebernehmen !== false
          ? U.hinweis('info', 'Ein erfasster Ist-Wert <b>ersetzt</b> den gerechneten Betrag. ' +
              'Nachgelagerte Grössen — Reserve auf BKP 20–29, Baunebenkosten, ' +
              'Projektmanagement-Honorar sowie Marge und Rendite — ziehen automatisch nach.')
          : null,
        U.hinweis('info', '<b>Bereits bezahlt</b> bestimmt den Zeitpunkt des Mittelabflusses: ' +
          'Der Betrag gilt als bis zum Stichtag geflossen, der Rest der Position erst danach. ' +
          'Weil das Kapital damit früher gebunden ist, steigen die Finanzierungskosten. ' +
          'Ist durch einen <b>Nachtrag</b> mehr bezahlt als kalkuliert, zählt der Mehrbetrag ' +
          'voll in den Kapitalbedarf — für Marge und Rendite gehört er zusätzlich in die Spalte ' +
          '<b>Ist</b>. <b>Vertrag</b> hält fest, welche Eintragung vertraglich gesichert ist, ' +
          'ohne Wirkung auf die Rechnung. <b>Offen</b> ist die Differenz aus Ist und bereits bezahlt.')
      ])
    ], [schalter]));

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
