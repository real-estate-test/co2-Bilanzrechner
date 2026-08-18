/* =====================================================================
   Projektrechner · Anwendungssteuerung
   Zustand, Navigation, Kennzahlenleiste, Speicherung, Rollen
   ===================================================================== */
window.APP = window.APP || {};
(function (A) {
  'use strict';

  var U = A.ui, V = A.views, API = A.api, el = U.el;

  A.state = { p: null, r: null, seite: 'projekt', dirty: false, konflikt: null };
  A.ziele = null;          // firmenweite Zielwerte (nur im Serverbetrieb)
  A.firmen = null;         // Liste der Immobiliengefässe (nur im Serverbetrieb)

  A.SEITEN = [
    { id: 'portfolio',    ix: '0',  label: 'Portfolio' },
    { id: 'projekt',      ix: '1',  label: 'Projekt & Phasen' },
    { id: 'erwerb',       ix: '2',  label: 'Grundstück & Erwerbskosten' },
    { id: 'flaechen',     ix: '3',  label: 'Flächen & Volumen' },
    { id: 'bestand',      ix: '4',  label: 'Bestand' },
    { id: 'baukosten',    ix: '5',  label: 'Baukosten' },
    { id: 'ertraege',     ix: '6',  label: 'Erträge & Verwertung' },
    { id: 'betrieb',      ix: '7',  label: 'Betrieb' },
    { id: 'vermarktung',  ix: '8',  label: 'Vermarktung' },
    { id: 'finanzierung', ix: '9',  label: 'Finanzierung' },
    { id: 'ergebnis',     ix: '→',  label: 'Ergebnis',  gruppe: 'aus' },
    { id: 'analyse',      ix: '→',  label: 'Analyse' },
    { id: 'tracking',     ix: '→',  label: 'Tracking' },
    { id: 'bericht',      ix: '→',  label: 'Bericht' },
    { id: 'protokoll',    ix: '·',  label: 'Protokoll', gruppe: 'verwaltung', nurServer: true },
    { id: 'verwaltung',   ix: '·',  label: 'Verwaltung', nurVerwalter: true }
  ];

  /* ---------------------------------------------------------------
     Rechte
     --------------------------------------------------------------- */

  A.darfBearbeiten = function () {
    return API.aktiv() ? API.darfBearbeiten() : true;
  };
  A.istVerwalter = function () {
    return API.aktiv() ? API.istVerwalter() : true;
  };

  /* ---------------------------------------------------------------
     Kurzmeldung
     --------------------------------------------------------------- */

  A.meldung = function (art, text, dauer) {
    var box = document.getElementById('meldungen');
    if (!box) {
      box = el('div', { id: 'meldungen', style:
        'position:fixed;right:18px;bottom:18px;z-index:400;display:grid;gap:8px;max-width:380px' });
      document.body.appendChild(box);
    }
    var m = U.hinweis(art, text);
    m.style.boxShadow = '0 8px 26px rgba(16,21,28,.16)';
    m.style.background = m.style.background || '#fff';
    box.appendChild(m);
    setTimeout(function () { m.remove(); }, dauer || 4200);
  };

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
     Speichern
     --------------------------------------------------------------- */

  var timer = null, laeuft = false, nochmal = false;

  A.markDirty = function () {
    if (!A.darfBearbeiten()) return;
    A.state.dirty = true;
    statusZeigen();
    clearTimeout(timer);
    /* Lokal ist Schreiben praktisch gratis, über das Netz nicht — deshalb
       dort sammeln, bis die Eingabe zur Ruhe kommt. */
    var verzug = A.store.modus === 'server'
      ? ((window.APP_CONFIG && window.APP_CONFIG.speicherverzug) || 2500)
      : 400;
    timer = setTimeout(A.speichern, verzug);
  };

  A.speichern = function () {
    clearTimeout(timer);
    if (!A.darfBearbeiten()) return Promise.resolve();
    if (laeuft) { nochmal = true; return Promise.resolve(); }
    laeuft = true;
    statusZeigen('speichert …', 'warten');

    return A.store.save(A.state.p).then(function (r) {
      laeuft = false;
      if (r && r.konflikt) { konfliktZeigen(r.fremd); return; }
      if (r && r.ok === false) {
        A.state.dirty = true;
        statusZeigen('nicht gespeichert — fehlende Berechtigung', 'fehler');
        return;
      }
      A.state.dirty = false;
      statusZeigen('gespeichert', 'gut');
      projektListe();
      if (nochmal) { nochmal = false; A.markDirty(); }
    }).catch(function (f) {
      laeuft = false;
      A.state.dirty = true;
      statusZeigen('nicht gespeichert', 'fehler');
      console.warn('Speichern fehlgeschlagen:', f);
      A.meldung('warn', 'Speichern fehlgeschlagen: ' + f.message +
        ' Ihre Eingaben bleiben im Browser erhalten und werden erneut versucht.');
    });
  };

  /* Jemand anderes hat zwischenzeitlich gespeichert. */
  function konfliktZeigen(fremd) {
    A.state.dirty = true;
    statusZeigen('Konflikt', 'fehler');
    var wann = fremd && fremd.geaendert_am ? fremd.geaendert_am.slice(0, 16).replace('T', ' ') : 'zwischenzeitlich';

    U.modal('Das Projekt wurde zwischenzeitlich geändert', [
      el('p', { text: 'Jemand anderes hat dieses Projekt am ' + wann +
        ' gespeichert, während Sie daran gearbeitet haben. Ihre Änderungen sind noch nicht übernommen.' }),
      el('p', { class: 'muted', style: 'margin-top:9px;font-size:12.5px',
        text: 'Damit nichts unbemerkt verloren geht, entscheiden Sie bitte selbst.' })
    ], [
      el('button', { text: 'Fremden Stand laden (meine Änderungen verwerfen)', onclick: function () {
        document.querySelector('.modal-bg').remove();
        A.store.init().then(function () {
          A.projektOeffnen(A.state.p.id);
          A.meldung('info', 'Der aktuelle Stand aus der Datenbank ist geladen.');
        });
      } }),
      el('button', { class: 'primary', text: 'Meinen Stand durchsetzen', onclick: function () {
        document.querySelector('.modal-bg').remove();
        A.store.ueberschreiben(A.state.p, fremd ? fremd.version : undefined).then(function (r) {
          if (r && r.ok) {
            A.state.dirty = false;
            statusZeigen('gespeichert', 'gut');
            A.meldung('ok', 'Ihr Stand ist gespeichert. Die Überschreibung steht im Protokoll.');
          }
        });
      } })
    ]);
  }

  function statusZeigen(text, klasse) {
    var e = document.getElementById('speicherstatus');
    if (!e) return;
    if (!A.darfBearbeiten()) {
      e.textContent = 'Nur-Lese-Zugriff'; e.className = 'syncstatus'; return;
    }
    e.textContent = text || (A.state.dirty ? 'nicht gesichert' : 'gespeichert');
    e.className = 'syncstatus ' + (klasse || (A.state.dirty ? 'warten' : 'gut'));
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

    var akt = el('div', { class: 'kpi kpi-actions',
      style: 'margin-left:auto;border:0;display:flex;align-items:center;gap:8px' }, [
      el('span', { id: 'speicherstatus', class: 'syncstatus' }),
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
      if (sp.nurVerwalter && !A.istVerwalter()) return;
      if (sp.nurServer && !API.aktiv()) return;
      if (sp.gruppe === 'aus' || sp.gruppe === 'verwaltung') nav.appendChild(el('hr'));
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
    document.body.classList.toggle('nurlesen', !A.darfBearbeiten());
    navigation();
    stufenwahl();
    kontoLeiste();

    var inhalt = document.getElementById('inhalt');
    U.leeren(inhalt);

    var fn = V[A.state.seite];
    if (!fn) { inhalt.appendChild(U.hinweis('warn', 'Unbekannte Seite.')); return; }

    try {
      inhalt.appendChild(fn(A.state.p));
      if (A.state.seite === 'projekt' && A.kommentarPanel) {
        var k = A.kommentarPanel(A.state.p);
        if (k) inhalt.appendChild(k);
      }
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

  function kontoLeiste() {
    var box = document.getElementById('kontoleiste');
    if (!box || !A.auth) return;
    U.leeren(box).appendChild(A.auth.leiste());
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
  A.projektListe = projektListe;

  A.projektOeffnen = function (id) {
    var p = id ? A.store.load(id) : null;
    if (!p) {
      var alle = A.store.all();
      p = alle.length ? alle[0] : neuesProjekt();
    }
    zieleAnwenden(p);
    A.state.p = p;
    A.store.setAktiv(p.id);
    A.state.dirty = false;
    A.recompute();
    A.state.dirty = false;
    projektListe();
    A.render();
  };

  /* Firmenweite Zielwerte überschreiben die Projektwerte, damit die
     Ampeln im Portfolio für alle dasselbe bedeuten. */
  function zieleAnwenden(p) {
    if (A.ziele && p) p.ziele = A.clone(A.ziele);
    return p;
  }
  A.zieleAnwenden = zieleAnwenden;

  function neuesProjekt() {
    var n = A.defaultProject();
    zieleAnwenden(n);
    return n;
  }

  /* ---------------------------------------------------------------
     Beschriftungen vorwärmen (für die Annahmenliste im Bericht)
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

    A.auth.start().then(function (ergebnis) {
      var serverModus = ergebnis.modus === 'server';
      A.store = serverModus ? A.storeServer : A.storeLokal;

      return A.store.init()
        .then(function () {
          if (!serverModus) return null;
          return Promise.all([
            A.store.einstellung('ziele').catch(function () { return null; }),
            A.store.einstellung('firmen').catch(function () { return null; })
          ]);
        })
        .then(function (geladen) {
          if (geladen && geladen[0]) A.ziele = geladen[0];
          if (geladen && Array.isArray(geladen[1])) A.firmen = geladen[1];
          weiter(serverModus);
        });
    }).catch(function (f) {
      console.error('Start fehlgeschlagen:', f);
      document.getElementById('inhalt').appendChild(
        U.hinweis('warn', 'Die Anwendung konnte nicht starten: ' + f.message));
    });
  }

  function weiter(serverModus) {
    var aktiv = A.store.aktivId();
    var p = aktiv ? A.store.load(aktiv) : null;
    if (!p) {
      var alle = A.store.all();
      p = alle.length ? alle[0] : neuesProjekt();
    }
    zieleAnwenden(p);
    A.state.p = p;
    A.state.r = A.engine.compute(p);

    beschriftungenVorwaermen();
    projektListe();

    document.getElementById('projektwahl').addEventListener('change', function (e) {
      A.speichern();
      A.projektOeffnen(e.target.value);
    });

    document.getElementById('btn-neu').addEventListener('click', function () {
      if (!pruefeRecht()) return;
      A.speichern();
      var neu = neuesProjekt();
      neu.name = 'Projekt ' + (A.store.all().length + 1);
      A.store.save(neu).then(function () {
        A.projektOeffnen(neu.id);
        A.zeigeSeite('projekt');
      });
    });

    document.getElementById('btn-duplizieren').addEventListener('click', function () {
      if (!pruefeRecht()) return;
      A.speichern();
      var kopie = A.clone(A.state.p);
      kopie.id = A.uid();
      kopie.name = A.state.p.name + ' (Variante)';
      kopie.snapshots = [];
      kopie.version = 1;
      kopie.archiviert_am = null;
      A.store.save(kopie).then(function () { A.projektOeffnen(kopie.id); });
    });

    document.getElementById('btn-export').addEventListener('click', A.exportModal);

    /* Beim Verlassen der Seite nicht Gesichertes noch wegschreiben. */
    window.addEventListener('beforeunload', function (e) {
      if (!A.state.dirty) return;
      A.speichern();
      if (A.store.modus === 'server') {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    /* Übernahme lokaler Projekte beim ersten Anmelden */
    if (serverModus) uebernahmeAnbieten();

    A.render();
    A.state.dirty = false;
    statusZeigen();
  }

  function pruefeRecht() {
    if (A.darfBearbeiten()) return true;
    A.meldung('warn', 'Ihre Rolle erlaubt nur das Lesen. Ein Verwalter kann Sie hochstufen.');
    return false;
  }
  A.pruefeRecht = pruefeRecht;

  /* Beim ersten Anmelden: im Browser liegende Projekte in die
     Firmendatenbank übernehmen, damit bisherige Arbeit nicht verwaist. */
  function uebernahmeAnbieten() {
    var lokal;
    try { lokal = A.storeLokal.alle(true); } catch (e) { return; }
    if (!lokal || !lokal.length) return;
    if (!A.darfBearbeiten()) return;

    var vorhanden = {};
    A.store.alle(true).forEach(function (p) { vorhanden[p.id] = true; });
    var neu = lokal.filter(function (p) { return !vorhanden[p.id]; });
    if (!neu.length) return;

    U.modal('Lokale Projekte übernehmen?', [
      el('p', { text: 'In diesem Browser liegen ' + neu.length +
        ' Projekt(e), die noch nicht in der Firmendatenbank sind:' }),
      el('ul', { style: 'margin:9px 0 9px 18px' }, neu.map(function (p) {
        return el('li', { text: p.name || 'ohne Namen' });
      })),
      el('p', { class: 'muted', style: 'font-size:12.5px',
        text: 'Nach der Übernahme sind sie für alle im Team sichtbar. Die lokale Kopie ' +
              'bleibt vorerst erhalten.' })
    ], [
      el('button', { class: 'primary', text: 'Übernehmen', onclick: function () {
        document.querySelector('.modal-bg').remove();
        Promise.all(neu.map(function (p) { return A.store.save(zieleAnwenden(p)); }))
          .then(function () { return A.store.init(); })
          .then(function () {
            projektListe();
            A.meldung('ok', neu.length + ' Projekt(e) übernommen.');
          })
          .catch(function (f) { A.meldung('warn', 'Übernahme fehlgeschlagen: ' + f.message); });
      } })
    ]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

})(window.APP);
