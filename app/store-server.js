/* =====================================================================
   Projektrechner · Speicherung in der Firmendatenbank

   Gleiche Schnittstelle wie A.storeLokal. Der Unterschied: Schreibvorgänge
   sind Zusagen (Promises), Lesevorgänge kommen aus einem Zwischenspeicher.
   Dadurch bleibt die Oberfläche synchron und views.js/results.js
   unverändert.
   ===================================================================== */
window.APP = window.APP || {};
(function (A) {
  'use strict';

  var API = A.api;
  var cache = {};        // id -> Projekt (vollständig)
  var meta  = {};        // id -> { version, geaendert_von_name, geaendert_am }

  /* Spalten, die zusätzlich zum JSON gepflegt werden, damit das Portfolio
     und spätere Auswertungen ohne die vollständigen Daten auskommen. */
  function zeileAus(p) {
    var kpi = null;
    try {
      var r = A.engine.compute(p);
      kpi = {
        anlagekosten: r.kpi.anlagekosten,
        gesamtinvestition: r.kpi.gesamtinvestition,
        erloese: r.kpi.erloese + r.kpi.mietertrag_projekt,
        gewinn: r.kpi.gewinn,
        marge_ak: r.kpi.marge_ak,
        roe: r.kpi.roe,
        irr: r.kpi.irr,
        ek_max: r.kpi.ek_max,
        kapital_peak: r.kpi.kapital_peak,
        bruttorendite: r.kpi.bruttorendite,
        nwf: r.flaechen.total.nwf,
        dauer: r.kpi.dauer
      };
    } catch (e) { /* unvollständige Eingaben blockieren das Speichern nicht */ }

    return {
      id: p.id,
      name: p.name || 'Neues Projekt',
      ort: p.ort || null,
      kanton: p.kanton || null,
      status: p.status || null,
      startjahr: p.startjahr || null,
      daten: p,
      kpi: kpi
    };
  }

  function uebernehmen(zeilen) {
    (zeilen || []).forEach(function (z) {
      var p = A.migrate(z.daten) || {};
      p.id = z.id;
      p.archiviert_am = z.archiviert_am || null;
      p.version = z.version;
      cache[z.id] = p;
      meta[z.id] = {
        version: z.version,
        geaendert_am: z.geaendert_am,
        geaendert_von: z.geaendert_von
      };
    });
  }

  var S = {
    modus: 'server',

    init: function () {
      return API.holen('projekte', 'select=*&order=geaendert_am.desc').then(function (zeilen) {
        cache = {}; meta = {};
        uebernehmen(zeilen);
        return true;
      });
    },

    alle: function (mitArchiv) {
      return Object.keys(cache).map(function (k) { return cache[k]; })
        .filter(function (p) { return mitArchiv ? true : !p.archiviert_am; })
        .sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    },

    all: function () { return S.alle(false); },

    load: function (id) { return cache[id] || null; },

    aktivId: function () { return A.aktivMerken.lesen(); },
    setAktiv: function (id) { A.aktivMerken.setzen(id); },

    meta: function (id) { return meta[id] || null; },

    /* Speichert mit optimistischem Sperren: Die Änderung greift nur, wenn
       die Version in der Datenbank noch die ist, die wir geladen haben.
       Sonst hat jemand anderes zwischenzeitlich gespeichert. */
    save: function (p) {
      var zeile = zeileAus(p);
      var bekannt = meta[p.id];

      if (!bekannt) {
        return API.einfuegen('projekte', zeile).then(function (r) {
          uebernehmen(r);
          return { ok: true };
        });
      }

      return API.aktualisieren(
        'projekte',
        'id=eq.' + encodeURIComponent(p.id) + '&version=eq.' + bekannt.version,
        zeile
      ).then(function (r) {
        if (!r || !r.length) {
          /* Keine Zeile getroffen: entweder Konflikt oder fehlende Rechte.
             Wir holen den aktuellen Stand, um beides unterscheiden zu können. */
          return API.holen('projekte', 'id=eq.' + encodeURIComponent(p.id) + '&select=*')
            .then(function (aktuell) {
              var a = aktuell && aktuell[0];
              if (a && a.version !== bekannt.version) {
                return { ok: false, konflikt: true, fremd: a };
              }
              return { ok: false, konflikt: false };
            });
        }
        uebernehmen(r);
        return { ok: true };
      });
    },

    /* Konflikt aufgelöst: eigenen Stand über den fremden legen. */
    ueberschreiben: function (p, fremdeVersion) {
      meta[p.id] = { version: fremdeVersion };
      return S.save(p);
    },

    archivieren: function (id) {
      return API.aktualisieren('projekte', 'id=eq.' + encodeURIComponent(id),
        { archiviert_am: new Date().toISOString() }).then(function (r) {
        uebernehmen(r);
        return { ok: !!(r && r.length) };
      });
    },

    reaktivieren: function (id) {
      return API.aktualisieren('projekte', 'id=eq.' + encodeURIComponent(id),
        { archiviert_am: null }).then(function (r) {
        uebernehmen(r);
        return { ok: !!(r && r.length) };
      });
    },

    /* Endgültiges Löschen. Die Datenbank lässt das nur für Verwalter zu —
       die Prüfung hier dient allein der Benutzerführung. */
    remove: function (id) {
      return API.entfernen('projekte', 'id=eq.' + encodeURIComponent(id)).then(function () {
        delete cache[id]; delete meta[id];
        return { ok: true };
      });
    },

    replaceAll: function (liste) {
      return Promise.all(liste.map(function (p) {
        return API.ersetzen('projekte', zeileAus(p));
      })).then(function () { return S.init(); }).then(function () { return { ok: true }; });
    },

    /* ---------------------------------------------------------------
       Protokoll und Kommentare
       --------------------------------------------------------------- */

    protokoll: function (projektId, grenze) {
      var q = 'select=*&order=zeit.desc&limit=' + (grenze || 200);
      if (projektId) q += '&projekt_id=eq.' + encodeURIComponent(projektId);
      return API.holen('protokoll', q);
    },

    kommentare: function (projektId) {
      return API.holen('kommentare',
        'select=*,profil(name,email)&projekt_id=eq.' + encodeURIComponent(projektId) +
        '&order=erstellt_am.desc');
    },

    kommentieren: function (projektId, text) {
      var b = API.benutzer();
      return API.einfuegen('kommentare',
        { projekt_id: projektId, text: text, verfasser: b ? b.id : null });
    },

    kommentarLoeschen: function (id) {
      return API.entfernen('kommentare', 'id=eq.' + encodeURIComponent(id));
    },

    /* ---------------------------------------------------------------
       Sitzungsprotokolle

       Eigene Tabelle statt Projekt-JSON: ein Protokoll wird geschrieben,
       während jemand anders am selben Projekt rechnet — beide Stände
       würden sich sonst gegenseitig verwerfen. Die Punkte liegen als
       JSON in der Zeile; sie gehören zum Protokoll und werden immer
       zusammen gespeichert.
       --------------------------------------------------------------- */

    sitzungen: function (projektId) {
      return API.holen('sitzungen',
        'projekt_id=eq.' + encodeURIComponent(projektId) +
        '&select=*&order=datum.desc,nummer.desc')
        .then(function (zeilen) {
          return (zeilen || []).map(A.sitzungLesen).filter(Boolean);
        });
    },

    /* Speichert mit optimistischem Sperren, wie bei den Projekten: Wer
       eine ältere Fassung in der Hand hat, überschreibt nichts. */
    sitzungSpeichern: function (s) {
      var zeile = {
        id: s.id, projekt_id: s.projekt_id, reihe: s.reihe, nummer: s.nummer,
        datum: s.datum || null, zeit_von: s.zeit_von || null, zeit_bis: s.zeit_bis || null,
        ort: s.ort || null, verfasser: s.verfasser || null,
        status: s.status || 'entwurf',
        versendet_am: s.versendet_am || null,
        teilnehmer: s.teilnehmer || [], entschuldigt: s.entschuldigt || [],
        verteiler: s.verteiler || [], punkte: s.punkte || []
      };
      if (!s.version) {
        return API.einfuegen('sitzungen', zeile).then(function (r) {
          return { ok: true, sitzung: A.sitzungLesen((r && r[0]) || zeile) };
        });
      }
      return API.aktualisieren('sitzungen',
        'id=eq.' + encodeURIComponent(s.id) + '&version=eq.' + s.version, zeile
      ).then(function (r) {
        if (!r || !r.length) {
          return API.holen('sitzungen', 'id=eq.' + encodeURIComponent(s.id) + '&select=*')
            .then(function (aktuell) {
              var a = aktuell && aktuell[0];
              if (a && a.version !== s.version) {
                return { ok: false, konflikt: true, fremd: A.sitzungLesen(a) };
              }
              return { ok: false, konflikt: false };
            });
        }
        return { ok: true, sitzung: A.sitzungLesen(r[0]) };
      });
    },

    sitzungLoeschen: function (id) {
      return API.entfernen('sitzungen', 'id=eq.' + encodeURIComponent(id))
        .then(function () { return { ok: true }; });
    },

    /* ---------------------------------------------------------------
       Benutzer und Einstellungen
       --------------------------------------------------------------- */

    benutzerliste: function () {
      return API.holen('profil', 'select=*&order=email.asc');
    },

    rolleSetzen: function (id, rolle) {
      return API.aktualisieren('profil', 'id=eq.' + encodeURIComponent(id), { rolle: rolle });
    },

    kontoSperren: function (id, aktiv) {
      return API.aktualisieren('profil', 'id=eq.' + encodeURIComponent(id), { aktiv: aktiv });
    },

    einstellung: function (schluessel) {
      return API.holen('einstellungen', 'schluessel=eq.' + schluessel + '&select=*')
        .then(function (r) { return r && r[0] ? r[0].wert : null; });
    },

    einstellungSetzen: function (schluessel, wert) {
      /* Upsert statt PATCH: Schlüssel, die das Schema nicht vorbesetzt
         (firmen, verkaufsstand), würden sonst still verloren gehen —
         ein PATCH auf eine fehlende Zeile ändert null Zeilen und meldet
         trotzdem Erfolg. */
      return API.ersetzen('einstellungen', { schluessel: schluessel, wert: wert });
    }
  };

  A.storeServer = S;

})(window.APP);
