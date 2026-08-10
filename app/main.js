/* =====================================================================
   Projektrechner · Anwendungssteuerung
   Zustand, Navigation, Kennzahlenleiste, Speicherung
   ===================================================================== */
window.APP = window.APP || {};
(function (A) {
  'use strict';

  var U = A.ui, V = A.views, el = U.el;

  A.state = { p: null, r: null, seite: 'projekt', dirty: false };

  A.SEITEN = [
    { id: 'portfolio',    ix: '0',  label: 'Portfolio',            gruppe: 'oben' },
    { id: 'projekt',      ix: '1',  label: 'Projekt & Phasen' },
    { id: 'flaechen',     ix: '2',  label: 'Grundstück & Flächen' },
    { id: 'erwerb',       ix: '3',  label: 'Erwerbskosten' },
    { id: 'bestand',      ix: '4',  label: 'Bestand' },
    { id: 'baukosten',    ix: '5',  label: 'Baukosten' },
    { id: 'ertraege',     ix: '6',  label: 'Erträge & Verwertung' },
    { id: 'betrieb',      ix: '7',  label: 'Betrieb' },
    { id: 'vermarktung',  ix: '8',  label: 'Vermarktung' },
    { id: 'finanzierung', ix: '9',  label: 'Finanzierung' },
    { id: 'ergebnis',     ix: '→',  label: 'Ergebnis',  gruppe: 'aus' },
    { id: 'analyse',      ix: '→',  label: 'Analyse' },
    { id: 'tracking',     ix: '→',  label: 'Tracking' },
    { id: 'bericht',      ix: '→',  label: 'Bericht' }
  ];

  /* ---------------------------------------------------------------
     Berechnung und Aktualisierung
     --------------------------------------------------------------- */

  A.recompute = function () {
    try {
      A.state.r = A.engine.compute(A.state.p);
    } catch (e) {
      console.error('Berechnung fehlgeschlagen:', e);
      A.hinweisZeigen([{ art: 'warn', text: 'Die Berechnung ist fehlgeschlagen: ' + e.message }]);
      return;
    }
    U.derived.forEach(function (f) {
      try { f(); } catch (e) { console.warn('Anzeige nicht aktualisierbar:', e); }
    });
    kpiLeiste();
    A.hinweisZeigen(A.state.r.warnungen);
    A.markDirty();
  };

  /* ---------------------------------------------------------------
     Speicherung mit Verzögerung
     --------------------------------------------------------------- */

  var timer = null;
  A.markDirty = function () {
    A.state.dirty = true;
    statusZeigen();
    clearTimeout(timer);
    timer = setTimeout(A.speichern, 600);
  };

  A.speichern = function () {
    clearTimeout(timer);
    var ok = A.store.save(A.state.p);
    A.state.dirty = !ok;
    statusZeigen(ok ? 'gespeichert' : 'Speichern fehlgeschlagen');
    projektListe();
  };

  function statusZeigen(text) {
    var e = document.getElementById('speicherstatus');
    if (!e) return;
    e.textContent = text || (A.state.dirty ? 'nicht gesichert' : 'gespeichert');
    e.style.color = A.state.dirty ? 'var(--warn)' : 'var(--muted)';
  }

  /* ---------------------------------------------------------------
     Kennzahlenleiste
     --------------------------------------------------------------- */

  function kpiLeiste() {
    var bar = document.getElementById('kpibar');
    var k = A.state.r.kpi, p = A.state.p;
    U.leeren(bar);

    function kpi(label, wert, klasse, sub) {
      var d = el('div', { class: 'kpi' }, [el('div', { class: 'k', text: label })]);
      var v = el('div', { class: 'v ' + (klasse || ''), text: wert });
      if (sub) v.appendChild(el('small', { text: '  ' + sub }));
      d.appendChild(v);
      return d;
    }

    bar.appendChild(kpi('Anlagekosten', A.fmtMio(k.anlagekosten)));
    bar.appendChild(kpi('Erlöse', A.fmtMio(k.erloese + k.mietertrag_projekt)));
    bar.appendChild(kpi('Gewinn', A.fmtMio(k.gewinn), k.gewinn >= 0 ? 'pos' : 'neg'));
    bar.appendChild(kpi('Marge', A.fmtPct(k.marge_ak),
      k.marge_ak >= p.ziele.marge ? 'pos' : 'warnc'));
    bar.appendChild(kpi('Rendite EK', A.fmtPct(k.roe)));
    bar.appendChild(kpi('IRR', k.irr === null ? '–' : A.fmtPct(k.irr)));
    bar.appendChild(kpi('Kapitalspitze', A.fmtMio(k.kapital_peak)));
    bar.appendChild(kpi('Bruttorendite', A.fmtPct(k.bruttorendite, 2),
      k.bruttorendite >= p.ziele.bruttorendite ? 'pos' : ''));
    bar.appendChild(kpi('Nutzfläche', A.fmt(A.state.r.flaechen.total.nwf) + ' m²'));

    var akt = el('div', { class: 'kpi kpi-actions',
      style: 'margin-left:auto;border:0;display:flex;align-items:center;gap:8px' }, [
      el('span', { id: 'speicherstatus', class: 'muted', style: 'font-size:11px' }),
      el('button', { class: 'sm', text: 'Bericht',
        onclick: function () { A.zeigeSeite('bericht'); } })
    ]);
    bar.appendChild(akt);
    statusZeigen();
  }

  A.hinweisZeigen = function (liste) {
    var box = document.getElementById('warnbar');
    U.leeren(box);
    (liste || []).slice(0, 4).forEach(function (w) {
      box.appendChild(U.hinweis(w.art === 'ziel' ? 'ziel' : w.art, w.text));
    });
  };

  /* ---------------------------------------------------------------
     Navigation
     --------------------------------------------------------------- */

  function navigation() {
    var nav = document.getElementById('seiten');
    U.leeren(nav);
    A.SEITEN.forEach(function (sp) {
      if (sp.gruppe === 'aus') nav.appendChild(el('hr'));
      var a = el('a', { class: A.state.seite === sp.id ? 'on' : '' }, [
        el('span', { class: 'ix', text: sp.ix }), el('span', { text: sp.label })
      ]);
      if (sp.id === 'bestand' && A.state.p.szenario === 'neubau') a.style.opacity = '.45';
      a.addEventListener('click', function () { A.zeigeSeite(sp.id); });
      nav.appendChild(a);
    });
  }

  A.zeigeSeite = function (id) {
    A.state.seite = id;
    A.render();
    window.scrollTo(0, 0);
  };

  /* ---------------------------------------------------------------
     Rendern
     --------------------------------------------------------------- */

  A.render = function () {
    U.derived = [];
    navigation();
    stufenwahl();
    var inhalt = document.getElementById('inhalt');
    U.leeren(inhalt);

    var fn = V[A.state.seite];
    if (!fn) { inhalt.appendChild(U.hinweis('warn', 'Unbekannte Seite.')); return; }

    try {
      inhalt.appendChild(fn(A.state.p));
    } catch (e) {
      console.error(e);
      inhalt.appendChild(U.hinweis('warn', 'Diese Seite konnte nicht aufgebaut werden: ' + e.message));
    }

    U.derived.forEach(function (f) {
      try { f(); } catch (e) { console.warn(e); }
    });
    kpiLeiste();
    A.hinweisZeigen(A.state.r.warnungen);
  };

  function stufenwahl() {
    var box = document.getElementById('stufenwahl');
    box.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.stufe === A.state.p.stufe);
      b.onclick = function () {
        A.state.p.stufe = b.dataset.stufe;
        A.markDirty(); A.render();
      };
    });
  }

  function projektListe() {
    var sel = document.getElementById('projektwahl');
    if (!sel) return;
    var liste = A.store.all();
    U.leeren(sel);
    liste.forEach(function (p) {
      sel.appendChild(el('option', { value: p.id, text: p.name || 'ohne Namen',
        selected: p.id === A.state.p.id ? '' : null }));
    });
    if (!liste.length) {
      sel.appendChild(el('option', { value: A.state.p.id, text: A.state.p.name, selected: '' }));
    }
  }

  A.projektOeffnen = function (id) {
    var p = id ? A.store.load(id) : null;
    if (!p) {
      var alle = A.store.all();
      p = alle.length ? alle[0] : A.defaultProject();
    }
    A.state.p = p;
    A.store.setAktiv(p.id);
    A.recompute();
    projektListe();
    A.render();
  };

  /* ---------------------------------------------------------------
     Beschriftungen vorwärmen, damit die Annahmenliste vollständig ist
     --------------------------------------------------------------- */

  function beschriftungenVorwaermen() {
    var echteDerived = U.derived, echtesProjekt = A.state.p;
    U.derived = [];
    var probe = A.migrate(A.clone(echtesProjekt));
    probe.stufe = 'detail';
    A.applySzenario(probe, 'sanierung_erweiterung');
    probe.grundstueck.mehrwertabgabe_aktiv = true;
    probe.bau.teuerung_aktiv = true;
    probe.finanzierung.ek_zins_aktiv = true;
    A.state.p = probe;
    ['projekt', 'flaechen', 'erwerb', 'bestand', 'baukosten', 'ertraege',
     'betrieb', 'vermarktung', 'finanzierung', 'tracking'].forEach(function (k) {
      try { V[k](probe); } catch (e) { /* nur die Beschriftungen zählen */ }
    });
    A.state.p = echtesProjekt;
    U.derived = echteDerived;
  }

  /* ---------------------------------------------------------------
     Start
     --------------------------------------------------------------- */

  function start() {
    U.DEF = A.defaultProject();

    var aktiv = A.store.aktivId();
    var p = aktiv ? A.store.load(aktiv) : null;
    if (!p) {
      var alle = A.store.all();
      p = alle.length ? alle[0] : A.defaultProject();
    }
    A.state.p = p;
    A.state.r = A.engine.compute(p);

    beschriftungenVorwaermen();
    projektListe();

    document.getElementById('projektwahl').addEventListener('change', function (e) {
      A.speichern();
      A.projektOeffnen(e.target.value);
    });

    document.getElementById('btn-neu').addEventListener('click', function () {
      A.speichern();
      var neu = A.defaultProject();
      neu.name = 'Projekt ' + (A.store.all().length + 1);
      A.store.save(neu);
      A.projektOeffnen(neu.id);
      A.zeigeSeite('projekt');
    });

    document.getElementById('btn-duplizieren').addEventListener('click', function () {
      A.speichern();
      var kopie = A.clone(A.state.p);
      kopie.id = A.uid();
      kopie.name = A.state.p.name + ' (Variante)';
      kopie.snapshots = [];
      A.store.save(kopie);
      A.projektOeffnen(kopie.id);
    });

    document.getElementById('btn-export').addEventListener('click', A.exportModal);

    window.addEventListener('beforeunload', function () {
      if (A.state.dirty) A.speichern();
    });

    A.render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

})(window.APP);
