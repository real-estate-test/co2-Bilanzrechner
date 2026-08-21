/* =====================================================================
   Projektrechner · Anbindung der Verkaufsübersicht

   Die zentrale Verkaufsübersicht (real-estate-test.github.io/verkaufs-
   bersicht) liest die Vermarktungsseiten zweiwöchentlich aus und legt
   den Stand als JSON ab. Von dort holen wir ausschliesslich den STATUS
   je Einheit — die Erlöse verkaufter Einheiten trägt der Anwender
   selbst ein, weil die Vermarktungsseiten den Preis meist von der
   Seite nehmen, sobald eine Einheit verkauft ist.

   Aktualisiert wird bewusst nur von Hand (Portfolio und Kopfleiste).
   Beim Aktualisieren wird der Auszug des zugeordneten Projekts im
   Projekt eingefroren: der Rechenkern bleibt netzwerkfrei, Snapshots
   frieren den Verkaufsstand mit ein, das Reporting bleibt
   reproduzierbar.
   ===================================================================== */
window.APP = window.APP || {};
(function (A) {
  'use strict';

  var VK = {};
  A.verkauf = VK;

  VK.URL = 'https://real-estate-test.github.io/verkaufs-bersicht/data/latest.json';
  var LOKAL = 'projektrechner.verkaufsstand';

  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

  /* ---------------------------------------------------------------
     Normalisieren — nur die Felder, die wir brauchen, mit
     geprüften Typen. Der Stand kommt von einer externen Quelle und
     wird gespeichert; alles Weitere bleibt draussen.
     --------------------------------------------------------------- */

  var STATUS_OK = ['available', 'reserved', 'sold', 'unknown'];

  function normalisieren(roh) {
    if (!roh || !Array.isArray(roh.projects)) throw new Error('Unerwartetes Datenformat');
    return {
      datum: String(roh.generatedAt || '').slice(0, 10),
      geholt: A.heute(),
      projekte: roh.projects.filter(function (p) { return p && p.ok !== false; })
        .map(function (p) {
          return {
            id: String(p.id || ''),
            name: String(p.name || p.id || ''),
            einheiten: (p.units || []).map(function (u) {
              return {
                id: String(u.id || ''),
                gruppe: String(u.group || ''),
                zimmer: num(u.rooms),
                flaeche: num(u.area),
                geschoss: u.floor === null || u.floor === undefined ? '' : String(u.floor),
                art: u.kind === 'parking' ? 'parking' : 'unit',
                status: STATUS_OK.indexOf(u.status) >= 0 ? u.status : 'unknown',
                preis: num(u.price)
              };
            })
          };
        })
        .filter(function (p) { return p.id && p.einheiten.length; })
    };
  }

  /* ---------------------------------------------------------------
     Ablage. Lokal immer; im Firmenbetrieb zusätzlich zentral, damit
     alle denselben Stand sehen. Der zentrale Schreibversuch darf
     scheitern (nur der Verwalter darf Einstellungen schreiben) —
     dann gilt der Stand eben nur auf diesem Gerät.
     --------------------------------------------------------------- */

  VK.gespeichert = function () {
    try {
      var raw = localStorage.getItem(LOKAL);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  };

  function ablegen(stand) {
    try { localStorage.setItem(LOKAL, JSON.stringify(stand)); } catch (e) {}
    if (A.store && A.store.modus === 'server') {
      return A.store.einstellungSetzen('verkaufsstand', stand)
        .catch(function () { /* keine Schreibrechte — lokal reicht */ });
    }
    return Promise.resolve();
  }

  /* Beim Start im Firmenbetrieb den zentralen Stand übernehmen, wenn er
     neuer ist als der lokale. */
  VK.zentralLaden = function () {
    if (!A.store || A.store.modus !== 'server') return Promise.resolve(VK.gespeichert());
    return A.store.einstellung('verkaufsstand').then(function (zentral) {
      var lokal = VK.gespeichert();
      if (zentral && (!lokal || String(zentral.geholt) >= String(lokal.geholt))) {
        try { localStorage.setItem(LOKAL, JSON.stringify(zentral)); } catch (e) {}
        return zentral;
      }
      return lokal;
    }).catch(function () { return VK.gespeichert(); });
  };

  /* ---------------------------------------------------------------
     Holen und in die Projekte übernehmen
     --------------------------------------------------------------- */

  VK.holen = function () {
    return fetch(VK.URL, { cache: 'no-store' })
      .then(function (antwort) {
        if (!antwort.ok) throw new Error('Die Verkaufsübersicht antwortet mit HTTP ' + antwort.status);
        return antwort.json();
      })
      .then(function (roh) {
        var stand = normalisieren(roh);
        return ablegen(stand).then(function () { return stand; });
      });
  };

  /* Den Auszug des zugeordneten Projekts im Projekt einfrieren.
     Manuell erfasste Erlöse bleiben dabei immer stehen. */
  VK.uebernehmen = function (p, stand) {
    if (!p.verkauf) p.verkauf = { modus: '', projekt_id: '', stand: null, manuell: [], preise: {} };
    /* Eine eigene Liste wird nie von aussen überschrieben. */
    if (p.verkauf.modus === 'manuell') return false;
    if (!p.verkauf.projekt_id) { p.verkauf.stand = null; return false; }
    var quelle = (stand && stand.projekte || []).find(function (x) {
      return x.id === p.verkauf.projekt_id;
    });
    if (!quelle) {
      /* Projekt taucht in der Übersicht (noch/nicht mehr) auf — dann ist
         nichts verkauft. Die Zuordnung bleibt bestehen. */
      p.verkauf.stand = { datum: stand ? stand.datum : '', geholt: stand ? stand.geholt : '',
                          name: '', einheiten: [] };
      return true;
    }
    p.verkauf.stand = {
      datum: stand.datum, geholt: stand.geholt, name: quelle.name,
      einheiten: A.clone(quelle.einheiten)
    };
    return true;
  };

  /* Alle Projekte mit Zuordnung nachführen — der Portfolio-Schalter.
     Läuft nacheinander, damit die optimistische Sperre je Projekt
     sauber greift. */
  VK.aktualisierenAlle = function () {
    return VK.holen().then(function (stand) {
      var projekte = A.store.alle(true).filter(function (q) {
        return q.verkauf && q.verkauf.modus === 'uebersicht' && q.verkauf.projekt_id;
      });
      var kette = Promise.resolve(0);
      projekte.forEach(function (q) {
        kette = kette.then(function (n) {
          /* Das offene Projekt direkt im Speicher nachführen, sonst
             überschriebe die nächste Autospeicherung den neuen Stand. */
          var ziel = (A.state.p && A.state.p.id === q.id) ? A.state.p : q;
          VK.uebernehmen(ziel, stand);
          return Promise.resolve(A.store.save(ziel)).then(function () { return n + 1; });
        });
      });
      return kette.then(function (n) {
        if (A.state.p) { A.recompute(); }
        return { stand: stand, projekte: n };
      });
    });
  };

  /* ---------------------------------------------------------------
     Vorschlag für den Erlös einer verkauften Einheit.
     Kette: Preis der Übersicht → Wohnungsspiegel gleicher Nummer →
     Ø CHF/m² der verfügbaren Einheiten × Fläche → Ø Preis der
     verfügbaren Einheiten.
     --------------------------------------------------------------- */

  VK.vorschlag = function (p, einheit) {
    var v = p.verkauf || {};
    var alle = v.modus === 'manuell'
      ? (Array.isArray(v.manuell) ? v.manuell : [])
      : ((v.stand && v.stand.einheiten) || []);
    if (einheit.preis > 0) return { wert: einheit.preis, quelle: 'Preis der Quelle' };

    if (p.spiegel && p.spiegel.aktiv && Array.isArray(p.spiegel.einheiten)) {
      var nr = String(einheit.id).trim().toLowerCase();
      var sp = p.spiegel.einheiten.find(function (e) {
        return String(e.nr || '').trim().toLowerCase() === nr;
      });
      if (sp && num(sp.preis) > 0) return { wert: num(sp.preis), quelle: 'Wohnungsspiegel Nr. ' + sp.nr };
    }

    var frei = alle.filter(function (u) {
      return u.art === einheit.art && u.status === 'available' && u.preis > 0;
    });
    if (einheit.flaeche > 0) {
      var mitFlaeche = frei.filter(function (u) { return u.flaeche > 0; });
      if (mitFlaeche.length) {
        var proM2 = mitFlaeche.reduce(function (s, u) { return s + u.preis / u.flaeche; }, 0) / mitFlaeche.length;
        return { wert: Math.round(proM2 * einheit.flaeche), quelle: 'Ø CHF/m² der freien Einheiten' };
      }
    }
    if (frei.length) {
      var mittel = frei.reduce(function (s, u) { return s + u.preis; }, 0) / frei.length;
      return { wert: Math.round(mittel), quelle: 'Ø Preis der freien Einheiten' };
    }
    return { wert: 0, quelle: 'kein Anhaltspunkt — bitte von Hand erfassen' };
  };

})(window.APP);
