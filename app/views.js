/* =====================================================================
   Projektrechner · Eingabeseiten
   ===================================================================== */
window.APP = window.APP || {};
(function (A) {
  'use strict';

  var U = A.ui, el = null, V = {};
  A.views = V;

  function init() { el = U.el; }

  function fmt(n, d) { return A.fmt(n, d); }
  function opts(list) { return list.map(function (x) { return { id: x.id, label: x.label }; }); }

  /* Betrag einer Baukostenzeile aus dem Resultat holen */
  function betrag(r, bid, zid) {
    var b = r.bau.bloecke[bid]; if (!b) return 0;
    var z = b.zeilen.filter(function (x) { return x.id === zid; });
    return z.reduce(function (s, x) { return s + x.betrag; }, 0);
  }
  function menge(r, bid, zid) {
    var b = r.bau.bloecke[bid]; if (!b) return null;
    var z = b.zeilen.find(function (x) { return x.id === zid; });
    return z ? z.menge : null;
  }

  /* ===================================================================
     1 · Projekt, Szenario, Phasen
     =================================================================== */

  V.projekt = function (p) {
    init();
    var out = el('div', {}, [U.kopf('Projekt & Phasen',
      'Rahmendaten, Szenario und Zeitachse. Phasendauern werden in Monaten erfasst und ' +
      'bauen auf dem Startdatum auf.')]);

    /* Stammdaten */
    out.appendChild(U.panel('Stammdaten', null, [
      U.body([
        U.txt(p, 'name', 'Projektbezeichnung'),
        U.txt(p, 'ort', 'Ort / Adresse', { stufe: 'standard' }),
        U.sel(p, 'kanton', Object.keys(A.KANTONE).map(function (k) {
          return { id: k, label: A.KANTONE[k].label };
        }), 'Kanton', {
          ohneBadge: true, stufe: 'standard',
          onchange: function (v) { A.applyKanton(p, v); },
          hilfe: 'Setzt Handänderungssteuer, Grundbuchgebühren und Steuersatz auf kantonale Richtwerte — bitte prüfen.'
        }),
        U.txt(p, 'bearbeiter', 'Bearbeitung', { stufe: 'standard' }),
        (function () {
          /* Startdatum des Erwerbs — alle Termine bauen darauf auf. */
          var i = el('input', { type: 'date', value: p.startdatum || '' });
          i.addEventListener('change', function () {
            p.startdatum = i.value;
            p.startjahr = parseInt(String(i.value).slice(0, 4), 10) || p.startjahr;
            A.recompute(); A.render();
          });
          return el('div', { class: 'f' }, [
            el('label', {}, [el('span', { text: 'Startdatum (Erwerb)' })]),
            el('div', { class: 'inp' }, [i]),
            el('div', { class: 'hilfe', text: 'Nullpunkt der Zeitachse; alle Phasen bauen darauf auf.' })
          ]);
        })(),
        U.sel(p, 'status', A.STATUS.map(function (s) { return { id: s, label: s }; }), 'Projektstatus', { ohneBadge: true, stufe: 'standard' }),
        U.txt(p, 'notiz', 'Kurznotiz', { stufe: 'standard', platzhalter: 'z. B. Variante gemäss Studie Meier 03/26' })
      ], 'c3')
    ]));

    /* Szenario */
    var szBody = el('div', { class: 'panelbody' });
    var grid = el('div', { class: 'cols c4' });
    A.SZENARIEN.forEach(function (s) {
      var an = p.szenario === s.id;
      var b = el('button', { type: 'button', style:
        'text-align:left;padding:10px 12px;height:100%;' +
        (an ? 'border-color:var(--accent);background:var(--accent2);color:var(--ink)' : '') });
      b.appendChild(el('div', { style: 'font-weight:640;margin-bottom:3px', text: s.label }));
      b.appendChild(el('div', { class: 'muted', style: 'font-size:11.5px;line-height:1.35', text: s.hint }));
      b.addEventListener('click', function () { A.applySzenario(p, s.id); A.recompute(); A.render(); });
      grid.appendChild(b);
    });
    szBody.appendChild(grid);
    out.appendChild(U.panel('Szenario', 'bestimmt, welche Gebäudeteile und Kostenblöcke aktiv sind', [szBody]));

    /* Erwerbsart und Ziele */
    out.appendChild(U.panel('Erwerbsart & Zielwerte', null, [
      U.body([
        U.seg(p, 'erwerbsart', [
          { id: 'kauf', label: 'Kauf', hint: 'Erwerb des Grundstücks zu Eigentum' },
          { id: 'baurecht', label: 'Baurecht', hint: 'Baurechtszins statt Kaufpreis' }
        ], 'Erwerbsart', { stufe: 'standard' }),
        /* Im Firmenbetrieb sind die Zielwerte firmenweit gesetzt — nur so
           bedeutet «unter Ziel» im Portfolio bei allen dasselbe. */
        A.ziele
          ? el('div', { class: 'f' }, [
              el('label', {}, [el('span', { text: 'Zielwerte (firmenweit)' })]),
              el('div', { class: 'kachel' }, [
                el('div', { class: 'v', style: 'font-size:14px',
                  text: 'Marge ≥ ' + A.fmtPct(p.ziele.marge) + ' · Bruttorendite ≥ ' +
                        A.fmtPct(p.ziele.bruttorendite, 2) }),
                el('div', { class: 's', text: 'änderbar nur unter Verwaltung' })
              ])
            ])
          : U.num(p, 'ziele.marge', 'Zielmarge', { unit: '% der Anlagekosten', dez: 1 }),
        A.ziele ? null
          : U.num(p, 'ziele.bruttorendite', 'Ziel-Bruttorendite', { unit: '%', dez: 2, stufe: 'standard' }),
        U.chk(p, 'steuern.aktiv', 'Gewinn nach Steuern rechnen', { stufe: 'standard' }),
        U.num(p, 'steuern.satz', 'Effektiver Steuersatz', { unit: '%', dez: 1, stufe: 'standard',
          hilfe: 'Vereinfacht: Grundstückgewinn- bzw. Gewinnsteuer als ein Satz auf den Projektgewinn.' })
      ], 'c3')
    ]));

    /* Zeitachse */
    var zeitBody = U.body([
      U.num(p, 'zeit.dauer_entwicklung', 'Erwerb → Baueingabe', { unit: 'Monate', dez: 0 }),
      U.num(p, 'zeit.dauer_bewilligung', 'Baueingabe → Bewilligung', { unit: 'Monate', dez: 0 }),
      U.num(p, 'zeit.dauer_vorbereitung', 'Bewilligung → Baustart', { unit: 'Monate', dez: 0, stufe: 'standard' }),
      U.num(p, 'zeit.dauer_bau', 'Bauzeit', { unit: 'Monate', dez: 0 }),
      U.num(p, 'zeit.verkaufsstart_rel_bb', 'Verkaufsstart ab Bewilligung', { unit: 'Monate', dez: 0, stufe: 'standard',
        hilfe: 'Negativ = Vermarktung startet bereits vor der Baubewilligung.' }),
      U.num(p, 'zeit.dauer_verkauf', 'Dauer Vermarktung', { unit: 'Monate', dez: 0, stufe: 'standard' }),
      U.num(p, 'zeit.exit_verzoegerung', 'Exit nach Fertigstellung', { unit: 'Monate', dez: 0, stufe: 'detail' }),
      U.seg(p, 'zeit.kostenkurve', [
        { id: 's', label: 'S-Kurve' }, { id: 'linear', label: 'linear' }
      ], 'Verlauf der Baukosten', { stufe: 'detail' })
    ], 'c4');

    var achse = el('div', { class: 'panelbody' });
    U.derived.push(function () { U.leeren(achse).appendChild(phasenBalken(A.state.r)); });
    out.appendChild(U.panel('Zeitachse', 'Jahresraster · Zinsen auf dem mittleren Kapitalsaldo', [zeitBody, achse]));

    return out;
  };

  function phasenBalken(r) {
    var Z = r.zeit, W = 900, H = 74, px = function (t) { return 8 + t / Z.t_ende * (W - 16); };
    var phasen = [
      { t0: 0, t1: Z.t_baueingabe, label: 'Entwicklung', f: '#7c93b3' },
      { t0: Z.t_baueingabe, t1: Z.t_bb, label: 'Bewilligung', f: '#b0871f' },
      { t0: Z.t_bb, t1: Z.t_baustart, label: 'Vorbereitung', f: '#8a8f99' },
      { t0: Z.t_baustart, t1: Z.t_bauende, label: 'Bau', f: '#1f5fd0' },
      { t0: Z.t_vk_start, t1: Z.t_vk_ende, label: 'Vermarktung', f: '#0d7a45', reihe: 1 }
    ];
    var kinder = [];
    phasen.forEach(function (ph) {
      var y = ph.reihe ? 36 : 12, b = Math.max(2, px(ph.t1) - px(ph.t0));
      kinder.push(U.s('rect', { x: px(ph.t0), y: y, width: b, height: 19, rx: 3, fill: ph.f, opacity: .92 }));
      if (b > 62) kinder.push(U.s('text', { x: px(ph.t0) + 7, y: y + 13.5, fill: '#fff', 'font-size': 11 }, ph.label));
      else kinder.push(U.s('text', { x: px(ph.t0) + b + 5, y: y + 13.5, fill: '#6b7484', 'font-size': 11 }, ph.label));
    });
    /* Jahresraster in Kalenderjahren */
    for (var j = 0; j <= Math.ceil(Z.t_ende); j++) {
      kinder.push(U.s('line', { x1: px(j), y1: 6, x2: px(j), y2: 60, stroke: '#e2e6ec' }));
      kinder.push(U.s('text', { x: px(j) + 3, y: 70, fill: '#6b7484', 'font-size': 10, class: 'n' },
        A.jahrLabel(A.state.p, j)));
    }
    [['Baubewilligung', Z.t_bb], ['Baustart', Z.t_baustart], ['Bezug', Z.t_bauende]].forEach(function (m) {
      kinder.push(U.s('line', { x1: px(m[1]), y1: 6, x2: px(m[1]), y2: 60, stroke: '#10151c', 'stroke-dasharray': '3 2' }));
    });
    return U.svg(W, H, kinder, { h: 74 });
  }

  /* ===================================================================
     2 · Grundstück & Flächen
     =================================================================== */

  V.flaechen = function (p) {
    init();
    var out = el('div', {}, [U.kopf('Grundstück & Flächen',
      'Die Kaskade läuft von der anrechenbaren Geschossfläche bis zur vermietbaren Fläche. ' +
      'Untergeschoss und Einstellhalle werden getrennt geführt, weil sie unterschiedlich kosten.')]);

    var istAgf = p.grundstueck.az_modus === 'agf';

    out.appendChild(U.panel('Grundstück', null, [
      U.body([
        U.num(p, 'grundstueck.flaeche', 'Grundstücksfläche', { unit: 'm²', gross: true }),
        U.seg(p, 'grundstueck.az_modus', [
          { id: 'az', label: 'über Ausnützungsziffer' },
          { id: 'agf', label: 'aGF direkt' }
        ], 'Herkunft der Geschossfläche'),
        istAgf
          ? U.num(p, 'grundstueck.agf_direkt', 'Anrechenbare Geschossfläche', { unit: 'm²', gross: true })
          : U.num(p, 'grundstueck.az', 'Ausnützungsziffer AZ', { dez: 2,
              derive: function (r) { return 'ergibt ' + fmt(r.flaechen.agf_zulaessig) + ' m² aGF'; } }),
        istAgf ? null : U.num(p, 'grundstueck.az_bonus', 'Bonus auf die Ziffer', { unit: '%', dez: 1,
          hilfe: 'Arealbonus o. ä. — aGF = Grundstück × Ziffer × (1 + Bonus).' }),
        U.num(p, 'grundstueck.geschosse', 'Anzahl Vollgeschosse', { dez: 0,
          hilfe: 'Ohne Attika. Die Attika wird unten separat erfasst.',
          derive: function (r) { return 'Gebäudegrundfläche ' + fmt(r.flaechen.total.grundflaeche) + ' m²'; } }),
        U.num(p, 'grundstueck.umgebung_manuell', 'Umgebungsfläche manuell', { unit: 'm²', gross: true, stufe: 'detail',
          hilfe: 'Leer = Grundstück minus Gebäudegrundfläche.',
          derive: function (r) { return 'gerechnet: ' + fmt(r.flaechen.umgebung) + ' m²'; } }),
        U.chk(p, 'grundstueck.mehrwertabgabe_aktiv', 'Mehrwertabgabe bei Auf-/Einzonung', { stufe: 'standard' }),
        U.txt(p, 'grundstueck.bemerkung', 'Bemerkung zur Ausnutzung',
          { platzhalter: 'z. B. Arealbonus gemäss Vorentscheid 04/26' })
      ], 'c3'),

      /* Attikageschoss — es zählt nur dann zur aGF, wenn es anrechenbar ist.
         Der Fussabdruck bemisst sich immer am Vollgeschoss. */
      el('div', { class: 'panelbody' }, [
        el('div', { class: 'cols c3' }, [
          el('div', { class: 'f' }, [
            el('label', {}, [el('span', { text: 'Attikageschoss anrechenbar' })]),
            U.seg(p, 'grundstueck.attika_anrechenbar', [
              { id: true, label: 'ja' }, { id: false, label: 'nein' }
            ]),
            el('div', { class: 'hilfe', text: p.grundstueck.attika_anrechenbar
              ? 'Die Attika steckt in der anrechenbaren Geschossfläche und wird nicht separat gezählt.'
              : 'Die Attikafläche kommt zusätzlich zur aGF hinzu.' })
          ]),
          p.grundstueck.attika_anrechenbar ? null
            : U.num(p, 'grundstueck.attika_pct', 'Attika', { unit: '% der Gebäudegrundfläche', dez: 0,
                hilfe: 'Die Attika ist in der Regel kleiner als das Geschoss darunter — sonst wäre sie ein Vollgeschoss.',
                derive: function (r) { return fmt(r.flaechen.total.attika) + ' m² Attikafläche'; } })
        ])
      ]),
      p.grundstueck.mehrwertabgabe_aktiv ? U.body([
        U.num(p, 'grundstueck.mehrwert_basis', 'Planungsmehrwert', { unit: 'CHF', gross: true }),
        U.num(p, 'grundstueck.mehrwertabgabe_pct', 'Abgabesatz', { unit: '%', dez: 0 })
      ], 'c3') : null
    ]));

    A.TEILE.forEach(function (T) {
      var t = p.teile[T.id];
      var kopfAktionen = [el('label', { class: 'check', style: 'padding:0' }, [
        el('input', { type: 'checkbox', checked: t.aktiv ? '' : null,
          onchange: function (e) {
            t.aktiv = e.target.checked;
            if (t.aktiv && (!t.nutzungen || !t.nutzungen.length)) t.nutzungen = A.standardNutzungen();
            A.recompute(); A.render();
          } }),
        el('span', { style: 'font-size:11.5px;text-transform:none;letter-spacing:0', text: 'aktiv' })
      ])];
      if (!t.aktiv) {
        out.appendChild(U.panel(T.label, 'nicht Teil des Szenarios', [], kopfAktionen));
        return;
      }

      var pfad = 'teile.' + T.id + '.';
      var felder = [];

      if (T.id === 'neubau') {
        felder.push(U.seg(p, pfad + 'modus', [
          { id: 'ausnutzung', label: 'aus Ausnutzung' }, { id: 'studie', label: 'aus Studie' }
        ], 'Flächenherkunft'));
      }
      if (t.modus === 'ausnutzung' && T.id === 'neubau') {
        felder.push(U.num(p, pfad + 'faktor_gf', 'GF oberirdisch je m² aGF', { dez: 2, stufe: 'standard' }));
      } else {
        felder.push(U.num(p, pfad + 'gf_oi', 'Geschossfläche oberirdisch', { unit: 'm²', gross: true }));
      }
      felder.push(U.num(p, pfad + 'ug_quote', 'Untergeschoss', { unit: '% der Grundfläche', dez: 0,
        hilfe: 'Ohne Einstellhalle — die wird über die Parkplätze gerechnet.',
        derive: function (r) { return fmt(r.flaechen.teile[T.id].gf_ug) + ' m² UG'; } }));
      felder.push(U.num(p, pfad + 'hnf_quote', 'Nutzfläche NWF', { unit: '% der GF o.i.', dez: 0,
        derive: function (r) { return fmt(r.flaechen.teile[T.id].nwf) + ' m² NWF'; } }));
      felder.push(U.num(p, pfad + 'nwf_manuell', 'NWF direkt', { unit: 'm²', gross: true, stufe: 'detail',
        hilfe: 'Grösser als 0 überschreibt die Quote.' }));
      felder.push(U.num(p, pfad + 'pp', 'Parkplätze', { unit: 'Stk.', dez: 0 }));
      felder.push(U.num(p, pfad + 'flaeche_pro_pp', 'Fläche je Parkplatz', { unit: 'm²', dez: 1,
        derive: function (r) { return fmt(r.flaechen.teile[T.id].f_aeh) + ' m² Einstellhalle'; } }));

      /* Kubaturen */
      var kub = [U.seg(p, pfad + 'kubatur_modus', [
        { id: 'hoehe', label: 'über Höhen' }, { id: 'volumen', label: 'Volumen direkt' }
      ], 'Kubatur')];
      if (t.kubatur_modus === 'volumen') {
        kub.push(U.num(p, pfad + 'v_oi', 'Volumen oberirdisch', { unit: 'm³', gross: true,
          derive: function (r) { return 'entspricht ' + A.fmt(r.flaechen.teile[T.id].h_oi_ist, 2) + ' m Gesamthöhe'; } }));
        kub.push(U.num(p, pfad + 'v_ug', 'Volumen Untergeschoss', { unit: 'm³', gross: true,
          derive: function (r) { return A.fmt(r.flaechen.teile[T.id].h_ug_ist, 2) + ' m'; } }));
        kub.push(U.num(p, pfad + 'v_aeh', 'Volumen Einstellhalle', { unit: 'm³', gross: true,
          derive: function (r) { return A.fmt(r.flaechen.teile[T.id].h_aeh_ist, 2) + ' m'; } }));
      } else {
        kub.push(U.num(p, pfad + 'h_regel', 'Höhe Regelgeschoss', { unit: 'm', dez: 2 }));
        kub.push(U.num(p, pfad + 'h_dach', 'Höhe Dachgeschoss', { unit: 'm', dez: 2 }));
        kub.push(U.num(p, pfad + 'h_ug', 'Höhe Untergeschoss', { unit: 'm', dez: 2 }));
        kub.push(U.num(p, pfad + 'h_aeh', 'Höhe Einstellhalle', { unit: 'm', dez: 2 }));
      }

      var tabelle = el('div', { class: 'panelbody' });
      U.derived.push(function () {
        var fo = A.state.r.flaechen.teile[T.id], g = A.state.r.flaechen.geschosse;
        function z(l, v, u, stark) {
          return el('tr', { class: stark ? 'sum' : '' }, [
            el('td', { text: l }), el('td', { class: 'n', text: fmt(v) }),
            el('td', { class: 'muted', text: u })
          ]);
        }
        U.leeren(tabelle).appendChild(U.tabelle(
          [{ label: 'Flächen- und Volumenkaskade' }, { label: 'Wert', n: true }, { label: 'Einheit' }], [
            z('Gebäudegrundfläche (÷ ' + g + ' Vollgeschosse)', fo.grundflaeche, 'm²'),
            fo.attika > 0 ? z('Attikageschoss (nicht anrechenbar)', fo.attika, 'm²') : null,
            z('Geschossfläche oberirdisch', fo.gf_oi, 'm²', true),
            z('Untergeschoss ohne Einstellhalle', fo.gf_ug, 'm²'),
            z('Einstellhalle', fo.f_aeh, 'm²'),
            z('Nutzfläche NWF (vermiet-/verkaufbar)', fo.nwf, 'm²', true),
            z('Volumen oberirdisch (Höhe ' + A.fmt(fo.h_oi_ist, 2) + ' m)', fo.gv_oi, 'm³'),
            z('Volumen Untergeschoss', fo.gv_ug, 'm³'),
            z('Volumen Einstellhalle', fo.gv_aeh, 'm³'),
            z('Volumen total', fo.gv, 'm³', true)
          ].filter(Boolean)));
      });

      out.appendChild(U.panel(T.label, null, [
        U.body(felder, 'c4'), U.body(kub, 'c4'), tabelle
      ], kopfAktionen));
    });

    var check = el('div', { class: 'panelbody' });
    U.derived.push(function () {
      var fl = A.state.r.flaechen;
      var quote = fl.agf_zulaessig > 0 ? fl.agf_genutzt / fl.agf_zulaessig * 100 : 0;
      U.leeren(check).appendChild(el('div', { class: 'cols c4' }, [
        U.kachel('zulässige aGF', fmt(fl.agf_zulaessig) + ' m²'),
        U.kachel('geplante aGF', fmt(fl.agf_genutzt) + ' m²'),
        U.kachel('Ausschöpfung', A.fmtPct(quote), null, quote > 100.5 ? 'neg' : 'pos'),
        U.kachel('Umgebungsfläche', fmt(fl.umgebung) + ' m²', 'Mengenbasis BKP 4')
      ]));
    });
    out.appendChild(U.panel('Ausnutzungskontrolle', null, [check]));

    return out;
  };

  /* ===================================================================
     3 · Erwerbskosten
     =================================================================== */

  V.erwerb = function (p) {
    init();
    var out = el('div', {}, [U.kopf('Erwerbskosten',
      'Kaufpreis und sämtliche Nebenkosten. Sätze sind Richtwerte und frei überschreibbar.')]);

    if (p.erwerbsart === 'baurecht') {
      out.appendChild(U.panel('Baurecht', null, [U.body([
        U.num(p, 'erwerb.baurecht_einmal', 'Einmalentschädigung', { unit: 'CHF', gross: true }),
        U.num(p, 'erwerb.baurecht_zins', 'Baurechtszins', { unit: 'CHF/Jahr', gross: true,
          hilfe: 'Läuft ab Erwerb über die gesamte Projektdauer.' })
      ], 'c3')]));
    } else {
      out.appendChild(U.panel('Kaufpreis', 'die drei Eingabearten sind gleichwertig', [
        U.body([U.seg(p, 'erwerb.preis_modus', [
          { id: 'total', label: 'Total' },
          { id: 'm2_land', label: 'CHF/m² Land' },
          { id: 'm2_agf', label: 'CHF/m² aGF' }
        ], 'Eingabeart')]),
        U.body([
          p.erwerb.preis_modus === 'total' ? U.num(p, 'erwerb.preis_total', 'Kaufpreis', { unit: 'CHF', gross: true }) : null,
          p.erwerb.preis_modus === 'm2_land' ? U.num(p, 'erwerb.preis_m2_land', 'Preis je m² Grundstück', { unit: 'CHF/m²', gross: true }) : null,
          p.erwerb.preis_modus === 'm2_agf' ? U.num(p, 'erwerb.preis_m2_agf', 'Preis je m² aGF', { unit: 'CHF/m²', gross: true }) : null,
          el('div', { class: 'f' }, [
            el('label', {}, [el('span', { text: 'ergibt' })]),
            el('div', { class: 'kachel' }, [
              U.d(function (r) { return fmt(r.erwerb.kaufpreis) + ' CHF'; }),
              el('div', { class: 's' }, [U.d(function (r, pp) {
                var lf = A.get(pp, 'grundstueck.flaeche') || 1;
                return fmt(r.erwerb.kaufpreis / lf) + ' CHF/m² Land · ' +
                  fmt(r.flaechen.agf_zulaessig > 0 ? r.erwerb.kaufpreis / r.flaechen.agf_zulaessig : 0) + ' CHF/m² aGF';
              }, '')])
            ])
          ])
        ], 'c3')
      ]));
    }

    out.appendChild(U.panel('Kaufnebenkosten', 'Prozentsätze auf den Kaufpreis', [
      U.body([
        U.num(p, 'erwerb.notariat', 'Notariat / Beurkundung', { unit: '%', dez: 2,
            derive: function (r) {
              var z = r.erwerb.zeilen.find(function (x) { return x.id === 'notariat'; });
              return z ? fmt(z.betrag) + ' CHF' : '';
            } }),
        U.num(p, 'erwerb.grundbuch', 'Grundbuchgebühren', { unit: '%', dez: 2,
            derive: function (r) {
              var z = r.erwerb.zeilen.find(function (x) { return x.id === 'grundbuch'; });
              return z ? fmt(z.betrag) + ' CHF' : '';
            } }),
        U.num(p, 'erwerb.handaenderung', 'Handänderungssteuer', { unit: '%', dez: 2,
            derive: function (r) {
              var z = r.erwerb.zeilen.find(function (x) { return x.id === 'handaenderung'; });
              return z ? fmt(z.betrag) + ' CHF' : '';
            } }),
        U.num(p, 'erwerb.handaenderung_anteil', 'davon zu Lasten Käufer', { unit: '%', dez: 0, stufe: 'standard' }),
        U.num(p, 'erwerb.courtage', 'Einkaufskommission / Courtage', { unit: '%', dez: 2,
            derive: function (r) {
              var z = r.erwerb.zeilen.find(function (x) { return x.id === 'courtage'; });
              return z ? fmt(z.betrag) + ' CHF' : '';
            } }),
        U.num(p, 'erwerb.dd', 'Due Diligence / Altlasten', { unit: 'CHF', gross: true, stufe: 'standard' }),
        U.num(p, 'erwerb.geometer', 'Vermessung / Geometer', { unit: 'CHF', gross: true, stufe: 'detail' }),
        U.num(p, 'erwerb.recht', 'Rechtsberatung / Verträge', { unit: 'CHF', gross: true, stufe: 'detail' })
      ], 'c4')
    ]));

    out.appendChild(U.panel('Honorare', null, [
      U.body([
        U.sel(p, 'erwerb.entwicklung_basis', [
          { id: 'erwerb_bau', label: 'auf Erwerbs- und Baukosten' },
          { id: 'anlagekosten', label: 'auf Anlagekosten' },
          { id: 'landwert', label: 'auf Landwert' },
          { id: 'gewinn', label: 'auf Projektgewinn' }
        ], 'Entwicklungshonorar — Basis', { stufe: 'standard' }),
        U.num(p, 'erwerb.entwicklung_pct', 'Entwicklungshonorar', { unit: '%', dez: 2,
          derive: function (r) {
            var z = r.erwerb.zeilen.find(function (x) { return x.id === 'entwicklung'; });
            return z ? fmt(z.betrag) + ' CHF' : '';
          } }),
        el('div', { class: 'f' }, [
          el('label', {}, [el('span', { text: 'Bezugsgrösse des Honorars' })]),
          el('div', { class: 'kachel' }, [
            U.d(function (r) { return fmt(r.erwerb.entwicklung_basis_betrag) + ' CHF'; }),
            el('div', { class: 's', text: p.erwerb.entwicklung_basis === 'erwerb_bau'
              ? 'Erwerbskosten ohne dieses Honorar zuzüglich Baukosten ohne Projektmanagement-Honorar'
              : 'gemäss gewählter Basis' })
          ])
        ])
      ], 'c4'),
      el('div', { class: 'panelbody' }, [
        U.hinweis('info', 'Die <b>Dritthonorare</b> stehen neu unter <b>Baukosten</b> als Zeile ' +
          '<b>BKP 558.1</b>. Sie werden dort je Kostenblock erfasst und fliessen damit in die ' +
          'Baukosten statt in die Erwerbskosten.')
      ])
    ]));

    var tab = el('div', { class: 'panelbody' });
    U.derived.push(function () {
      var r = A.state.r;
      var zeilen = r.erwerb.zeilen.map(function (z) {
        return el('tr', {}, [
          el('td', { text: z.label }),
          el('td', { class: 'muted', text: z.basis }),
          el('td', { class: 'n', text: fmt(z.betrag) })
        ]);
      });
      zeilen.push(el('tr', { class: 'total' }, [
        el('td', { text: 'Erwerbskosten total' }), el('td', {}),
        el('td', { class: 'n', text: fmt(r.erwerb.total) })
      ]));
      U.leeren(tab).appendChild(U.tabelle(
        [{ label: 'Position' }, { label: 'Basis', w: '20%' }, { label: 'CHF', n: true, w: '18%' }], zeilen));
    });
    out.appendChild(U.panel('Zusammenzug', null, [tab]));

    return out;
  };

  /* ===================================================================
     4 · Bestand
     =================================================================== */

  V.bestand = function (p) {
    init();
    var out = el('div', {}, [U.kopf('Bestand',
      'Umgang mit dem bestehenden Gebäude sowie Erträge aus einer Zwischennutzung bis zum Baustart.')]);

    if (p.szenario === 'neubau') {
      out.appendChild(U.hinweis('info', 'Das gewählte Szenario <b>Grüne Wiese · Neubau</b> kennt keinen Bestand. ' +
        'Wechseln Sie das Szenario auf der Seite <b>Projekt &amp; Phasen</b>, wenn ein Gebäude vorhanden ist.'));
      return out;
    }

    out.appendChild(U.panel('Umgang mit dem Bestand', null, [
      U.body([
        U.seg(p, 'bestand_extra.strategie', [
          { id: 'abriss', label: 'Rückbau' },
          { id: 'sanierung', label: 'Sanierung' },
          { id: 'erhalten', label: 'unverändert halten' }
        ], 'Strategie'),
        U.num(p, 'bestand_extra.gv', 'Gebäudevolumen Bestand', { unit: 'm³', gross: true,
          hilfe: 'Mengenbasis für die Rückbaukosten. Leer = aus den Flächenangaben des Bestands abgeleitet.' })
      ], 'c3')
    ]));

    out.appendChild(U.panel('Zwischennutzung', 'Mieterträge bis zum Baustart', [
      U.body([
        U.chk(p, 'bestand_extra.zwischennutzung', 'Zwischennutzung berücksichtigen'),
        U.num(p, 'bestand_extra.zn_miete', 'Nettomietertrag', { unit: 'CHF/Jahr', gross: true }),
        U.num(p, 'bestand_extra.zn_kosten_pct', 'Bewirtschaftungskosten', { unit: '% der Miete', dez: 0, stufe: 'standard' }),
        el('div', { class: 'f' }, [
          el('label', {}, [el('span', { text: 'Ertrag über die Laufzeit' })]),
          el('div', { class: 'kachel' }, [U.d(function (r, pp) {
            var Z = r.zeit;
            var ende = pp.bestand_extra.strategie === 'erhalten' ? Z.t_ende : Z.t_baustart;
            var netto = pp.bestand_extra.zn_miete * (1 - pp.bestand_extra.zn_kosten_pct / 100);
            return fmt(netto * ende) + ' CHF';
          }), el('div', { class: 's', text: 'netto, bis Baustart bzw. Projektende' })])
        ])
      ], 'c4')
    ]));

    return out;
  };

  /* ===================================================================
     5 · Baukosten
     =================================================================== */

  V.baukosten = function (p) {
    init();
    var out = el('div', {}, [U.kopf('Baukosten',
      'BKP 20–29 sind zu Vollkosten je Bereich zusammengefasst — Rohbau, Technik, Ausbau und ' +
      'Planerhonorare stecken im Kennwert. Die Mengen der oberirdischen Zeilen folgen dem ' +
      'Nutzungsmix aus «Erträge & Verwertung».')]);

    if (p.baukosten_pruefen) {
      out.appendChild(U.hinweis('warn',
        'Die Baukostenstruktur wurde umgestellt. Die früheren Zeilen für Rohbau, Technik, Ausbau, ' +
        'Parkierung und Honorare sind in den Zeilen <b>BKP 20–29</b> aufgegangen. Diese starten auf ' +
        'den Kennwerten der Bibliothek — eine rechnerische Umschlüsselung wäre nur scheingenau. ' +
        '<b>Bitte die Kennwerte prüfen.</b>'));
    }

    ['neubau', 'erweiterung', 'sanierung'].forEach(function (bid) {
      var b = p.bau[bid];
      var aktionen = [el('label', { class: 'check', style: 'padding:0' }, [
        el('input', { type: 'checkbox', checked: b.aktiv ? '' : null,
          onchange: function (e) { b.aktiv = e.target.checked; A.recompute(); A.render(); } }),
        el('span', { style: 'font-size:11.5px;text-transform:none;letter-spacing:0', text: 'aktiv' })
      ])];
      if (!b.aktiv) { out.appendChild(U.panel(A.BLOCK_LABELS[bid], 'nicht Teil des Szenarios', [], aktionen)); return; }

      if (!b.eigene) b.eigene = [];
      var kw = A.KENNWERTE[bid];
      var katalog = A.BKP_KATALOG.concat(b.eigene);

      var zeilen = katalog.map(function (kat, idx) {
        var eigen = idx >= A.BKP_KATALOG.length;
        if (!b.zeilen[kat.id]) {
          b.zeilen[kat.id] = { aktiv: true, basis: 'pauschal', wert: 0, menge_manuell: 0 };
        }
        var z = b.zeilen[kat.id], band = kw[kat.id] || {};
        var tr = el('tr', {});
        tr.appendChild(el('td', { class: 'w1' }, [U.zelleChk(z, 'aktiv')]));
        tr.appendChild(el('td', { class: 'w1' }, [el('span', { class: 'bkp', text: kat.bkp })]));

        if (eigen) {
          var bez = el('input', { type: 'text', value: kat.label });
          bez.addEventListener('input', function () { kat.label = bez.value; A.markDirty(); });
          tr.appendChild(el('td', {}, [bez]));
        } else {
          tr.appendChild(el('td', {}, [
            el('span', { text: kat.label }),
            kat.hilfe && U.sichtbar('detail')
              ? el('div', { class: 'muted', style: 'font-size:10.5px', text: kat.hilfe }) : null
          ]));
        }

        tr.appendChild(el('td', { class: 'w1' }, [U.zelleSel(z, 'basis',
          Object.keys(A.BASIS_LABELS).map(function (k) {
            return { id: k, label: A.BASIS_LABELS[k] };
          }), { rerender: false })]));
        tr.appendChild(U.dTd(function (r) {
          var m = menge(r, bid, kat.id);
          return z.basis === 'pauschal' ? '—' : fmt(m, m !== null && m < 100 ? 1 : 0);
        }, 'muted'));
        tr.appendChild(el('td', { style: 'width:110px' }, [
          U.zelleNum(z, 'wert', {
            dez: z.basis.indexOf('pct_') === 0 ? 2 : 0,
            gross: z.basis === 'pauschal' || z.basis === 'pp',
            min: z.aktiv ? band.min : undefined, max: z.aktiv ? band.max : 0 })
        ]));
        tr.appendChild(el('td', { style: 'width:110px' }, [
          U.zelleNum(z, 'menge_manuell', { gross: true, leerBei0: true, platzhalter: 'auto' })
        ]));
        tr.appendChild(U.dTd(function (r) { return fmt(betrag(r, bid, kat.id)); }));
        tr.appendChild(el('td', { class: 'w1' }, [
          eigen ? el('button', { class: 'ghost sm schreibend', text: '×',
            onclick: function () {
              b.eigene.splice(idx - A.BKP_KATALOG.length, 1);
              delete b.zeilen[kat.id];
              A.recompute(); A.render();
            } }) : null
        ]));
        return tr;
      });

      var tabWrap = el('div', { class: 'panelbody' });
      tabWrap.appendChild(U.tabelle([
        { label: '', w: '1%' }, { label: 'BKP', w: '1%' }, { label: 'Position' },
        { label: 'Bezug', w: '13%' }, { label: 'Menge', n: true, w: '10%' },
        { label: 'Kennwert', n: true, w: '10%' }, { label: 'Menge manuell', n: true, w: '10%' },
        { label: 'CHF', n: true, w: '12%' }, { label: '', w: '1%' }
      ], zeilen));

      var werkzeuge = el('div', { class: 'panelbody' }, [
        el('button', { class: 'schreibend', text: '+ eigene Zeile', onclick: function () {
          var id = 'x' + A.uid();
          b.eigene.push({ id: id, bkp: '5', label: 'Eigene Position' });
          b.zeilen[id] = { aktiv: true, basis: 'pauschal', wert: 0, menge_manuell: 0 };
          A.recompute(); A.render();
        } }),
        b.reserve > 0 ? el('span', { class: 'tag warn', style: 'margin-left:10px',
          text: 'Altprojekt: zusätzliche Pauschalreserve ' + A.fmt(b.reserve, 1) + ' % auf BKP 1+2 aktiv' }) : null
      ]);

      var summe = el('div', { class: 'panelbody' });
      U.derived.push(function () {
        var bl = A.state.r.bau.bloecke[bid];
        U.leeren(summe);
        if (!bl) return;
        summe.appendChild(el('div', { class: 'cols c4' }, [
          U.kachel('BKP 1 Vorbereitung', fmt(bl.bkp1)),
          U.kachel('BKP 20–29 inkl. Reserve', fmt(bl.bkp2)),
          U.kachel('Baukosten je m³', fmt(bl.pro_gv) + ' CHF/m³',
            fmt(bl.gv_rel) + ' m³ — oberirdisch, UG und Einstellhalle'),
          U.kachel('Total', fmt(bl.total), fmt(bl.pro_gf) + ' CHF/m² GF')
        ]));
      });

      out.appendChild(U.panel(A.BLOCK_LABELS[bid], null, [tabWrap, werkzeuge, summe], aktionen));
    });

    out.appendChild(U.panel('Teuerung & Mehrwertsteuer', null, [
      U.body([
        U.chk(p, 'bau.teuerung_aktiv', 'Teuerung über die Bauzeit einrechnen', { stufe: 'standard' }),
        p.bau.teuerung_aktiv ? U.num(p, 'bau.teuerung_pct', 'Teuerung', { unit: '% p.a.', dez: 2,
          derive: function (r) { return fmt(r.bau.teuerung) + ' CHF auf die Bauzeitmitte'; } }) : null,
        U.seg(p, 'bau.mwst_modus', [
          { id: 'inkl', label: 'inkl. MWST' }, { id: 'exkl', label: 'exkl. MWST' }
        ], 'Kennwerte verstehen sich', { stufe: 'standard' }),
        U.num(p, 'bau.mwst_satz', 'MWST-Satz', { unit: '%', dez: 1, stufe: 'detail' })
      ], 'c4')
    ]));

    /* Kennwerte je Kostenblock und darunter die Zusammenfassung. Die
       Kubatur umfasst oberirdisch, Untergeschoss und Einstellhalle —
       dieselbe Bezugsgrösse wie in den Blockkacheln. */
    var kennTab = el('div', { class: 'panelbody' });
    U.derived.push(function () {
      var r = A.state.r, F = r.flaechen;
      var zeilen = [];
      ['neubau', 'erweiterung', 'sanierung'].forEach(function (bid) {
        var bl = r.bau.bloecke[bid];
        if (!bl) return;
        zeilen.push(el('tr', {}, [
          el('td', { text: A.BLOCK_LABELS[bid] }),
          el('td', { class: 'n', text: fmt(bl.total) }),
          el('td', { class: 'n', text: fmt(bl.pro_gf) }),
          el('td', { class: 'n', text: fmt(bl.pro_nwf) }),
          el('td', { class: 'n', text: fmt(bl.pro_gv) })
        ]));
      });
      var gvGesamt = F.total.gv_oi + F.total.gv_ug + F.total.gv_aeh;
      if (r.bau.teuerung > 0) {
        zeilen.push(el('tr', {}, [
          el('td', { class: 'muted', text: 'Teuerung über die Bauzeit' }),
          el('td', { class: 'n muted', text: fmt(r.bau.teuerung) }),
          el('td', {}), el('td', {}), el('td', {})
        ]));
      }
      zeilen.push(el('tr', { class: 'total' }, [
        el('td', { text: 'Zusammenfassung' }),
        el('td', { class: 'n', text: fmt(r.bau.total) }),
        el('td', { class: 'n', text: fmt(r.kpi.bau_pro_gf) }),
        el('td', { class: 'n', text: fmt(F.total.nwf > 0 ? r.bau.total / F.total.nwf : 0) }),
        el('td', { class: 'n', text: fmt(gvGesamt > 0 ? r.bau.total / gvGesamt : 0) })
      ]));
      U.leeren(kennTab).appendChild(U.tabelle([
        { label: 'Kostenblock' }, { label: 'CHF', n: true, w: '18%' },
        { label: 'CHF/m² GF', n: true, w: '15%' },
        { label: 'CHF/m² NWF', n: true, w: '15%' },
        { label: 'CHF/m³', n: true, w: '15%' }
      ], zeilen));
    });

    var gesamt = el('div', { class: 'panelbody' });
    U.derived.push(function () {
      var r = A.state.r, F = r.flaechen;
      var gvGesamt = F.total.gv_oi + F.total.gv_ug + F.total.gv_aeh;
      U.leeren(gesamt).appendChild(el('div', { class: 'cols c4' }, [
        U.kachel('Baukosten total', fmt(r.bau.total) + ' CHF'),
        U.kachel('je m² Geschossfläche', fmt(r.kpi.bau_pro_gf) + ' CHF/m²'),
        U.kachel('je m² Nutzfläche', fmt(F.total.nwf > 0 ? r.bau.total / F.total.nwf : 0) + ' CHF/m²'),
        U.kachel('je m³ Kubatur', fmt(gvGesamt > 0 ? r.bau.total / gvGesamt : 0) + ' CHF/m³',
          fmt(gvGesamt) + ' m³ — oberirdisch, UG und Einstellhalle')
      ]));
    });
    out.appendChild(U.panel('Baukosten gesamt',
      'Kennwerte je Kostenblock, darunter die Zusammenfassung über alle Blöcke', [kennTab, gesamt]));

    return out;
  };

  /* ===================================================================
     6 · Erträge & Verwertung
     =================================================================== */

  V.ertraege = function (p) {
    init();
    var out = el('div', {}, [U.kopf('Erträge & Verwertung',
      'Je Gebäudeteil beliebig viele Nutzungszeilen. So lassen sich Wohnen im Stockwerkeigentum und ' +
      'Wohnen zur Miete im selben Projekt trennen — eine Fläche gehört immer genau einer Zeile und ' +
      'wird deshalb nur einmal gezählt.')]);

    out.appendChild(U.panel('Bewertungsannahmen', null, [
      U.body([
        U.num(p, 'bewertung.rendite_halten', 'Bewertungsrendite gehaltener Flächen', { unit: '% brutto', dez: 2,
          hilfe: 'Marktwert = Sollmiete geteilt durch diese Rendite.' }),
        U.chk(p, 'bewertung.exit_netto', 'Exit an Investor über Nettorendite rechnen', { stufe: 'standard' })
      ], 'c3')
    ]));

    A.TEILE.forEach(function (T) {
      var t = p.teile[T.id];
      if (!t.aktiv) return;

      var zeilen = t.nutzungen.map(function (n, i) {
        var istPP = n.art === 'parkplatz';
        var band = A.MARKT.miete[n.art] || [0, 0];
        var bandP = A.MARKT.preis[n.art] || [0, 0];
        var tr = el('tr', {});

        /* Bezeichnung */
        var bez = el('input', { type: 'text', value: n.bezeichnung });
        bez.addEventListener('input', function () { n.bezeichnung = bez.value; A.markDirty(); });
        tr.appendChild(el('td', { style: 'min-width:160px' }, [bez]));

        /* Art */
        tr.appendChild(el('td', { style: 'width:120px' }, [
          U.zelleSel(n, 'art', opts(A.NUTZUNGEN), { rerender: true })]));

        /* Anteil */
        tr.appendChild(el('td', { style: 'width:78px' }, [U.zelleNum(n, 'anteil', { dez: 1 })]));

        /* Menge */
        tr.appendChild(U.dTd(function (r) {
          var m = r.flaechen.teile[T.id].nutzungen[n.id] || 0;
          return fmt(m, istPP ? 1 : 0) + ' ' + (istPP ? 'Stk.' : 'm²');
        }, 'muted'));

        /* Miete */
        tr.appendChild(el('td', { style: 'width:92px' }, [
          U.zelleNum(n, 'miete', istPP ? { dez: 0 } : { min: band[0], max: band[1] })]));

        /* Preis */
        tr.appendChild(el('td', { style: 'width:104px' }, [
          U.zelleNum(n, 'preis', { gross: true,
            min: istPP ? undefined : bandP[0], max: istPP ? 0 : bandP[1] })]));

        /* Verwertung */
        tr.appendChild(el('td', { style: 'width:172px' }, [
          U.zelleSel(n, 'verwertung', opts(A.VERWERTUNG), { rerender: true })]));

        /* Exit-Rendite — dient allein der Preisfindung beim Verkauf an einen Investor */
        tr.appendChild(el('td', { style: 'width:80px' }, [
          n.verwertung === 'exit'
            ? U.zelleNum(n, 'exit_rendite', { dez: 2 })
            : el('span', { class: 'muted', text: '—' })]));

        /* Kostengruppe */
        tr.appendChild(el('td', { style: 'width:150px' }, [
          istPP ? el('span', { class: 'muted', text: 'Einstellhalle' })
                : U.zelleSel(n, 'kostengruppe', opts(A.KOSTENGRUPPEN), { rerender: false })]));

        /* Sollmiete und Erlös */
        tr.appendChild(U.dTd(function (r) {
          var pos = r.ertraege.positionen.find(function (x) { return x.nutzung === n.id; });
          return pos && pos.sollmiete ? fmt(pos.sollmiete) : '—';
        }));
        tr.appendChild(U.dTd(function (r) {
          var pos = r.ertraege.positionen.find(function (x) { return x.nutzung === n.id; });
          return pos ? fmt(pos.erloes || pos.wert) : '—';
        }));

        tr.appendChild(el('td', { class: 'w1' }, [
          el('button', { class: 'ghost sm schreibend', text: '×', title: 'Zeile entfernen',
            onclick: function () { t.nutzungen.splice(i, 1); A.recompute(); A.render(); } })
        ]));
        return tr;
      });

      var knoepfe = el('div', { class: 'panelbody' }, [
        el('button', { class: 'schreibend', text: '+ Nutzungszeile', onclick: function () {
          t.nutzungen.push(A.defNutzung({ bezeichnung: 'Neue Nutzung', art: 'wohnen',
            anteil: 0, verwertung: 'halten_vermietet' }));
          A.recompute(); A.render();
        } }),
        el('button', { class: 'schreibend', text: '+ Parkplatzzeile', onclick: function () {
          t.nutzungen.push(A.defNutzung({ bezeichnung: 'Parkplätze', art: 'parkplatz',
            anteil: 0, miete: 150, preis: 45000, verwertung: 'halten_vermietet' }));
          A.recompute(); A.render();
        } }),
        el('span', { class: 'muted', style: 'margin-left:10px;font-size:11.5px',
          text: 'Anteil in % der Nutzfläche, bei Parkplätzen in % der Gesamtzahl.' })
      ]);

      out.appendChild(U.panel(T.label, null, [
        el('div', { class: 'panelbody' }, [U.tabelle([
          { label: 'Bezeichnung' }, { label: 'Art' }, { label: 'Anteil %', n: true },
          { label: 'Menge', n: true }, { label: 'Miete CHF/m²/a bzw. CHF/Mt.', n: true },
          { label: 'Preis CHF/m² bzw. CHF/PP', n: true }, { label: 'Verwertung' },
          { label: 'Exit-Rendite %', n: true }, { label: 'Kostengruppe BKP 20–29' },
          { label: 'Sollmiete CHF/a', n: true }, { label: 'Erlös bzw. Wert', n: true }, { label: '' }
        ], zeilen)]),
        knoepfe
      ]));
    });

    /* Wohnungsspiegel — jede Einheit ist einer Nutzungszeile zugeordnet und
       erbt von dort Art und Verwertung. */
    var aktiveTeile = A.TEILE.filter(function (T) { return p.teile[T.id].aktiv; });
    var spiegelTeil = p.teile[p.spiegel.teil] || p.teile.neubau;
    var zeilenAuswahl = (spiegelTeil.nutzungen || [])
      .filter(function (n) { return n.art !== 'parkplatz'; })
      .map(function (n) { return { id: n.id, label: n.bezeichnung }; });

    var spiegelKoerper = [U.body([
      U.chk(p, 'spiegel.aktiv', 'Wohnungsspiegel verwenden'),
      p.spiegel.aktiv ? U.sel(p, 'spiegel.teil',
        aktiveTeile.map(function (T) { return { id: T.id, label: T.label }; }),
        'gilt für', { ohneBadge: true }) : null
    ], 'c3')];

    if (p.spiegel.aktiv) {
      var zs = p.spiegel.einheiten.map(function (e, i) {
        var zeile = (spiegelTeil.nutzungen || []).find(function (n) { return n.id === e.zeile; });
        var tr = el('tr', {});
        tr.appendChild(el('td', { style: 'width:66px' }, [(function () {
          var inp = el('input', { type: 'text', value: e.nr || '' });
          inp.addEventListener('input', function () { e.nr = inp.value; A.markDirty(); });
          return inp;
        })()]));
        tr.appendChild(el('td', { style: 'width:66px' }, [U.zelleNum(e, 'geschoss', { dez: 0 })]));
        tr.appendChild(el('td', { style: 'width:66px' }, [U.zelleNum(e, 'zimmer', { dez: 1 })]));
        tr.appendChild(el('td', { style: 'width:86px' }, [U.zelleNum(e, 'flaeche', { dez: 0 })]));
        tr.appendChild(el('td', { style: 'width:106px' }, [U.zelleNum(e, 'preis', { gross: true })]));
        tr.appendChild(U.dTd(function () { return e.flaeche > 0 ? fmt(e.preis / e.flaeche) : '—'; }, 'muted'));
        tr.appendChild(el('td', { style: 'width:180px' }, [
          zeilenAuswahl.length
            ? U.zelleSel(e, 'zeile', zeilenAuswahl, { rerender: true })
            : el('span', { class: 'muted', text: 'keine Nutzungszeile' })]));
        tr.appendChild(el('td', { class: 'muted', style: 'width:150px',
          text: zeile ? ((A.NUTZUNGEN.find(function (x) { return x.id === zeile.art; }) || {}).label + ' · ' +
                (A.VERWERTUNG.find(function (x) { return x.id === zeile.verwertung; }) || {}).label) : '—' }));
        tr.appendChild(el('td', { class: 'w1' }, [el('button', { class: 'ghost sm schreibend', text: '×',
          onclick: function () { p.spiegel.einheiten.splice(i, 1); A.recompute(); A.render(); } })]));
        return tr;
      });

      /* Zwischentotale je Nutzungszeile */
      zeilenAuswahl.forEach(function (za) {
        zs.push(U.el('tr', { class: 'sum' }, [
          el('td', { colspan: 3, text: 'Total ' + za.label }),
          U.dTd(function (r) { var g = (r.flaechen.teile[p.spiegel.teil].spiegel || {})[za.id];
            return g ? fmt(g.flaeche) : '—'; }),
          U.dTd(function (r) { var g = (r.flaechen.teile[p.spiegel.teil].spiegel || {})[za.id];
            return g ? fmt(g.erloes) : '—'; }),
          U.dTd(function (r) { var g = (r.flaechen.teile[p.spiegel.teil].spiegel || {})[za.id];
            return g ? fmt(g.preis_m2) : '—'; }),
          el('td', { colspan: 3, class: 'muted' }, [U.d(function (r) {
            var g = (r.flaechen.teile[p.spiegel.teil].spiegel || {})[za.id];
            return g ? g.anzahl + ' Einheiten' : '';
          }, 'muted')])
        ]));
      });

      spiegelKoerper.push(el('div', { class: 'panelbody' }, [U.tabelle([
        { label: 'Nr.' }, { label: 'Geschoss', n: true }, { label: 'Zimmer', n: true },
        { label: 'Fläche m²', n: true }, { label: 'Preis CHF', n: true }, { label: 'CHF/m²', n: true },
        { label: 'Nutzungszeile' }, { label: 'Art · Verwertung' }, { label: '' }
      ], zs)]));

      spiegelKoerper.push(el('div', { class: 'panelbody' }, [
        el('button', { class: 'schreibend', text: '+ Einheit', onclick: function () {
          p.spiegel.einheiten.push({ nr: String(p.spiegel.einheiten.length + 1), geschoss: 0,
            zimmer: 3.5, flaeche: 95, preis: 900000,
            zeile: zeilenAuswahl.length ? zeilenAuswahl[0].id : null });
          A.recompute(); A.render();
        } }),
        U.hinweis('info', 'Die Flächen der zugeordneten Nutzungszeilen werden durch den Spiegel ' +
          '<b>ersetzt</b>, ebenso deren Preis je m². Gewerbe, Lager und Parkplätze laufen weiterhin ' +
          'über die Nutzungszeilen.')
      ]));
    }

    out.appendChild(U.panel('Wohnungsspiegel', p.spiegel.aktiv
      ? 'Einheiten einzeln bepreisen — sie speisen die zugeordneten Nutzungszeilen'
      : 'solange kein Spiegel vorliegt, gilt der Durchschnittspreis der Nutzungszeile', spiegelKoerper));

    var zus = el('div', { class: 'panelbody' });
    U.derived.push(function () {
      var e = A.state.r.ertraege;
      U.leeren(zus).appendChild(el('div', { class: 'cols c4' }, [
        U.kachel('Verkaufserlös Stockwerkeigentum', fmt(e.stwe_erloes)),
        U.kachel('Exit an Investor', fmt(e.exit_wert), 'zählt nicht zum STWE'),
        U.kachel('Marktwert gehaltener Flächen', fmt(e.halten_wert)),
        U.kachel('Sollmiete Miet- und Exit-Flächen', fmt(e.sollmiete) + ' /a',
          'ohne verkaufte STWE-Flächen')
      ]));
    });
    out.appendChild(U.panel('Zusammenzug Verwertung', null, [zus]));

    return out;
  };

  /* ===================================================================
     7 · Betrieb & Bestandsrechnung
     =================================================================== */

  V.betrieb = function (p) {
    init();
    var out = el('div', {}, [U.kopf('Betrieb & Bestandsrechnung',
      'Bewirtschaftungskosten der vermieteten Flächen sowie die Haltrechnung über die Haltedauer.')]);

    var BASEN = [
      { id: 'pct_miete', label: '% der Sollmiete' },
      { id: 'pct_ak', label: '% der Baukosten' },
      { id: 'chf_m2', label: 'CHF je m² NWF' }
    ];
    var POS = [
      ['verwaltung', 'Verwaltung'], ['unterhalt', 'Unterhalt / Instandsetzung'],
      ['versicher', 'Versicherungen / Abgaben'], ['nk_nicht_um', 'Nicht umlagefähige Nebenkosten'],
      ['erneuerung', 'Erneuerungsfonds / Rückstellungen']
    ];
    var zeilen = POS.map(function (x) {
      var cfg = p.betrieb[x[0]];
      return el('tr', {}, [
        el('td', { text: x[1] }),
        el('td', { style: 'width:170px' }, [U.zelleSel(cfg, 'basis', BASEN, { rerender: false })]),
        el('td', { style: 'width:90px' }, [U.zelleNum(cfg, 'wert', { dez: 2 })]),
        U.dTd(function (r) {
          var z = r.betrieb.zeilen.find(function (y) { return y.id === x[0]; });
          return z ? fmt(z.betrag) : '—';
        })
      ]);
    });
    zeilen.push(el('tr', { class: 'sum' }, [
      el('td', { text: 'Bewirtschaftungskosten total' }), el('td', {}), el('td', {}),
      U.dTd(function (r) { return fmt(r.betrieb.total_a); })
    ]));

    out.appendChild(U.panel('Bewirtschaftungskosten', 'Jahreswerte für die vermieteten Flächen', [
      el('div', { class: 'panelbody' }, [U.tabelle([
        { label: 'Position' }, { label: 'Basis' }, { label: 'Wert', n: true }, { label: 'CHF/Jahr', n: true }
      ], zeilen)]),
      U.body([
        U.num(p, 'betrieb.leerstand', 'Leerstandsquote', { unit: '% der Sollmiete', dez: 1, stufe: 'standard' }),
        U.num(p, 'betrieb.erstvermietung', 'Dauer Erstvermietung', { unit: 'Jahre', dez: 2, stufe: 'standard' })
      ], 'c4')
    ]));

    var noi = el('div', { class: 'panelbody' });
    U.derived.push(function () {
      var b = A.state.r.betrieb;
      U.leeren(noi).appendChild(el('div', { class: 'cols c4' }, [
        U.kachel('Sollmiete gehaltene Flächen', fmt(b.sollmiete_a) + ' /a'),
        U.kachel('abzüglich Leerstand', '−' + fmt(b.leerstand_a) + ' /a'),
        U.kachel('abzüglich Bewirtschaftung', '−' + fmt(b.total_a) + ' /a'),
        U.kachel('Nettoertrag NOI', fmt(b.noi_a) + ' /a', null, 'pos')
      ]));
    });
    out.appendChild(U.panel('Nettoertrag', null, [noi]));

    out.appendChild(U.panel('Bestandsrechnung', 'Barwertrechnung für den gehaltenen Anteil — unabhängig von der Entwicklungsrechnung', [
      U.body([
        U.num(p, 'bestandsrechnung.haltedauer', 'Haltedauer', { unit: 'Jahre', dez: 0, stufe: 'standard' }),
        U.num(p, 'bestandsrechnung.diskontsatz', 'Diskontsatz', { unit: '%', dez: 2, stufe: 'standard' }),
        U.num(p, 'bestandsrechnung.exit_cap', 'Kapitalisierungssatz Terminal Value', { unit: '%', dez: 2, stufe: 'standard' }),
        U.num(p, 'bestandsrechnung.wachstum_miete', 'Mietzinswachstum', { unit: '% p.a.', dez: 2, stufe: 'detail' }),
        U.num(p, 'bestandsrechnung.hypothek_ltv', 'Hypothek nach Fertigstellung', { unit: '% des Werts', dez: 0, stufe: 'standard' }),
        U.num(p, 'bestandsrechnung.hypothek_zins', 'Hypothekarzins', { unit: '%', dez: 2, stufe: 'standard' })
      ], 'c3'),
      (function () {
        var k = el('div', { class: 'panelbody' });
        U.derived.push(function () {
          var b = A.state.r.bestand;
          U.leeren(k).appendChild(el('div', { class: 'cols c4' }, [
            U.kachel('Barwert der Erträge', fmt(b.barwert_cf)),
            U.kachel('Barwert Terminal Value', fmt(b.terminal_bw)),
            U.kachel('Ertragswert', fmt(b.ertragswert), 'Diskontsatz ' + A.fmtPct(p.bestandsrechnung.diskontsatz, 2)),
            U.kachel('Cashflow nach Hypothekarzins', fmt(b.cashflow_nach_zins_a) + ' /a')
          ]));
        });
        return k;
      })()
    ]));

    return out;
  };

  /* ===================================================================
     8 · Vermarktung
     =================================================================== */

  V.vermarktung = function (p) {
    init();
    var out = el('div', {}, [U.kopf('Vermarktungskosten',
      'Provisionen, Marketing und der Zahlungsplan beim Verkauf von Stockwerkeigentum.')]);

    out.appendChild(U.panel('Provisionen & Marketing', null, [
      U.body([
        U.num(p, 'vermarktung.verkauf_pct', 'Verkaufsprovision Stockwerkeigentum', { unit: '% Erlös', dez: 2 }),
        U.num(p, 'vermarktung.beurkundung_verkauf', 'Beurkundung Verkauf', { unit: '% Erlös', dez: 2, stufe: 'standard' }),
        U.num(p, 'vermarktung.exit_nebenkosten', 'Nebenkosten Exit an Investor', { unit: '% Erlös', dez: 2, stufe: 'standard' }),
        U.num(p, 'vermarktung.vermietung_monate', 'Erstvermietungsprovision', { unit: 'Monatsmieten', dez: 2, stufe: 'standard' }),
        U.sel(p, 'vermarktung.marketing_basis', [
          { id: 'pct', label: '% vom Erlös' }, { id: 'pauschal', label: 'Pauschal' }
        ], 'Marketing — Basis', { stufe: 'standard' }),
        p.vermarktung.marketing_basis === 'pauschal'
          ? U.num(p, 'vermarktung.marketing_fix', 'Marketing / Werbung', { unit: 'CHF', gross: true, stufe: 'standard' })
          : U.num(p, 'vermarktung.marketing_pct', 'Marketing / Werbung', { unit: '%', dez: 2, stufe: 'standard' }),
        U.num(p, 'vermarktung.muster', 'Musterwohnung / Visualisierung', { unit: 'CHF', gross: true, stufe: 'standard' })
      ], 'c4')
    ]));

    /* Zahlungsplan */
    var plan = p.vermarktung.zahlungsplan;
    var zp = plan.map(function (r, i) {
      return el('tr', {}, [
        el('td', {}, [(function () {
          var inp = el('input', { type: 'text', value: r.label });
          inp.addEventListener('input', function () { r.label = inp.value; A.markDirty(); });
          return inp;
        })()]),
        el('td', { style: 'width:170px' }, [U.zelleSel(r, 'bezug', Object.keys(A.ZAHLUNG_BEZUG).map(function (k) {
          return { id: k, label: A.ZAHLUNG_BEZUG[k] };
        }), { rerender: false })]),
        el('td', { style: 'width:90px' }, [U.zelleNum(r, 'anteil', { dez: 1 })]),
        el('td', { class: 'w1' }, [el('button', { class: 'ghost sm', text: '×',
          onclick: function () { plan.splice(i, 1); A.recompute(); A.render(); } })])
      ]);
    });
    /* Die Summe muss mitlaufen, wenn eine Rate geändert wird — als
       fester Text wäre sie nach der ersten Eingabe falsch. */
    function ratensumme() {
      return plan.reduce(function (a, r) { return a + U.parseZahl(r.anteil); }, 0);
    }
    var summeZelle = U.dTd(function () { return A.fmt(ratensumme(), 1) + ' %'; });
    var summeHinweis = el('td', {});
    U.derived.push(function () {
      var d = Math.abs(ratensumme() - 100) > 0.1;
      summeZelle.style.color = d ? 'var(--warn)' : '';
      U.leeren(summeHinweis);
      if (d) summeHinweis.appendChild(el('span', { class: 'tag warn', text: 'nicht 100 %' }));
    });
    zp.push(el('tr', { class: 'total' }, [
      el('td', { text: 'Summe' }), el('td', {}), summeZelle, summeHinweis
    ]));

    out.appendChild(U.panel('Zahlungsplan Stockwerkeigentum',
      'steuert, wann die Käuferzahlungen den Baukredit entlasten', [
      el('div', { class: 'panelbody' }, [U.tabelle([
        { label: 'Rate' }, { label: 'fällig' }, { label: 'Anteil %', n: true }, { label: '' }
      ], zp)]),
      el('div', { class: 'panelbody' }, [
        el('button', { text: '+ Rate', onclick: function () {
          plan.push({ label: 'Rate', anteil: 0, bezug: 'fertigstellung' }); A.recompute(); A.render();
        } }),
        U.hinweis('info', 'Ergeben die Raten nicht 100 %, verteilt das Modell die Erlöse ' +
          'anteilig auf die erfassten Raten.')
      ])
    ]));

    var zus = el('div', { class: 'panelbody' });
    U.derived.push(function () {
      var v = A.state.r.vermarktung;
      var zeilen = v.zeilen.map(function (z) {
        return el('tr', {}, [el('td', { text: z.label }), el('td', { class: 'muted', text: z.basis }),
          el('td', { class: 'n', text: fmt(z.betrag) })]);
      });
      zeilen.push(el('tr', { class: 'total' }, [el('td', { text: 'Vermarktung total' }), el('td', {}),
        el('td', { class: 'n', text: fmt(v.total) })]));
      U.leeren(zus).appendChild(U.tabelle([{ label: 'Position' }, { label: 'Basis', w: '25%' },
        { label: 'CHF', n: true, w: '18%' }], zeilen));
    });
    out.appendChild(U.panel('Zusammenzug', null, [zus]));

    return out;
  };

  /* ===================================================================
     9 · Finanzierung
     =================================================================== */

  V.finanzierung = function (p) {
    init();
    var out = el('div', {}, [U.kopf('Finanzierung',
      'Eigen- und Fremdkapital über die Projektdauer. Der Zinssatz unterscheidet die Phase vor und nach der ' +
      'Baubewilligung; der Vorverkauf senkt sowohl die Marge der Bank als auch den Kreditbedarf.')]);

    out.appendChild(U.panel('Kapitalstruktur', null, [
      U.body([
        U.num(p, 'finanzierung.ek_quote', 'Eigenkapitalquote', { unit: '% der Gesamtinvestition', dez: 0 }),
        U.num(p, 'finanzierung.ltc_max', 'Maximale Belehnung', { unit: '% (LTC)', dez: 0, stufe: 'standard' }),
        U.seg(p, 'finanzierung.ek_einsatz', [
          { id: 'proportional', label: 'proportional', hint: 'Jede Periode wird nach Quote aufgeteilt' },
          { id: 'zuerst', label: 'Eigenmittel zuerst', hint: 'Bankpraxis: Eigenmittel werden vorab eingebracht' }
        ], 'Einsatz der Eigenmittel', { stufe: 'standard' })
      ], 'c3')
    ]));

    out.appendChild(U.panel('Zinssätze', null, [
      U.body([
        U.num(p, 'finanzierung.zins_vor_bb', 'Fremdkapital vor Baubewilligung', { unit: '% p.a.', dez: 2 }),
        U.num(p, 'finanzierung.zins_nach_bb', 'Fremdkapital nach Baubewilligung', { unit: '% p.a.', dez: 2 }),
        U.num(p, 'finanzierung.bereitstellung', 'Bereitstellungskommission', { unit: '% p.a.', dez: 2, stufe: 'standard',
          hilfe: 'Auf der nicht beanspruchten Kreditlimite.' }),
        U.chk(p, 'finanzierung.bauzinsen_aktivieren', 'Bauzinsen aktivieren (Teil der Anlagekosten)', { stufe: 'standard' }),
        U.chk(p, 'finanzierung.ek_zins_aktiv', 'Eigenkapital kalkulatorisch verzinsen', { stufe: 'standard' }),
        p.finanzierung.ek_zins_aktiv ? U.num(p, 'finanzierung.ek_zins', 'Kalkulatorischer EK-Zins', { unit: '% p.a.', dez: 2, stufe: 'standard' }) : null
      ], 'c3')
    ]));

    /* Vorverkaufsstaffel */
    var st = p.finanzierung.staffel;
    var zs = st.map(function (s, i) {
      return el('tr', {}, [
        el('td', { style: 'width:120px' }, [U.zelleNum(s, 'ab', { dez: 0 })]),
        el('td', { style: 'width:120px' }, [U.zelleNum(s, 'bp', { dez: 0 })]),
        el('td', { class: 'muted' }, [el('span', { text: 'entspricht −' + A.fmt(s.bp / 100, 2) + ' Prozentpunkten' })]),
        el('td', { class: 'w1' }, [el('button', { class: 'ghost sm', text: '×',
          onclick: function () { st.splice(i, 1); A.recompute(); A.render(); } })])
      ]);
    });

    out.appendChild(U.panel('Vorverkauf', 'senkt Zinssatz und Kreditbedarf vor Baustart', [
      U.body([
        U.num(p, 'finanzierung.vorverkauf_quote', 'Vorverkaufsquote bei Baustart', { unit: '% des Verkaufserlöses', dez: 0,
          derive: function (r) {
            return r.fin.rabatt_bp > 0
              ? 'Zinsrabatt ' + r.fin.rabatt_bp + ' Basispunkte'
              : 'kein Zinsrabatt erreicht';
          } })
      ], 'c3'),
      el('div', { class: 'panelbody' }, [U.tabelle([
        { label: 'ab Vorverkaufsquote %', n: true }, { label: 'Zinsrabatt Basispunkte', n: true },
        { label: '' }, { label: '' }
      ], zs)]),
      el('div', { class: 'panelbody' }, [
        el('button', { text: '+ Stufe', onclick: function () {
          st.push({ ab: 60, bp: 75 }); A.recompute(); A.render();
        } }),
        U.hinweis('info', 'Die Käuferzahlungen aus dem Vorverkauf entlasten den Baukredit automatisch — ' +
          'gesteuert über den <b>Zahlungsplan</b> auf der Seite Vermarktung.')
      ])
    ]));

    var k = el('div', { class: 'panelbody' });
    U.derived.push(function () {
      var r = A.state.r;
      U.leeren(k).appendChild(el('div', { class: 'cols c4' }, [
        U.kachel('Eigenkapital verpflichtet', fmt(r.kpi.ek_max)),
        U.kachel('davon effektiv gebunden (Spitze)', fmt(r.kpi.ek_eingesetzt)),
        U.kachel('Fremdkapital Spitze', fmt(r.kpi.fk_peak), A.fmtPct(r.kpi.ltc_ist) + ' der Gesamtinvestition'),
        U.kachel('Finanzierungskosten total', fmt(r.kpi.finanzierungskosten))
      ]));
    });
    out.appendChild(U.panel('Ergebnis der Finanzierung', null, [k]));

    return out;
  };

})(window.APP);
