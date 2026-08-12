/* =====================================================================
   Projektrechner · Zugriff auf die Firmendatenbank

   Dünne Schicht über die REST- und Anmeldeschnittstelle von Supabase,
   bewusst nur mit fetch — keine Fremdbibliothek, kein Build-Schritt.

   Die Rechteprüfung findet ausschliesslich in der Datenbank statt.
   Alles hier ist Bequemlichkeit, kein Schutz.
   ===================================================================== */
window.APP = window.APP || {};
(function (A) {
  'use strict';

  var API = {};
  A.api = API;

  var CFG = window.APP_CONFIG || {};
  var SITZUNG_KEY = 'projektrechner.sitzung';

  /* Das Supabase-Dashboard zeigt die Adresse je nach Unterseite mit
     angehängtem /rest/v1. Gebraucht wird hier aber nur der Grundteil,
     weil jeder Aufruf seinen eigenen Pfad mitbringt. Statt den Anwender
     an dieser Feinheit scheitern zu lassen, räumen wir sie selbst weg. */
  function grundadresse(roh) {
    return String(roh || '')
      .trim()
      .replace(/\/+$/, '')                 // Schrägstriche am Ende
      .replace(/\/(rest|auth)\/v1$/i, '')  // versehentlich mitkopierter Pfad
      .replace(/\/+$/, '');
  }
  CFG.url = grundadresse(CFG.url);
  API.grundadresse = grundadresse;

  API.aktiv = function () { return !!(CFG.url && CFG.key); };

  /* ---------------------------------------------------------------
     Sitzung
     --------------------------------------------------------------- */

  var sitzung = null;

  function sitzungLesen() {
    if (sitzung) return sitzung;
    try {
      var roh = localStorage.getItem(SITZUNG_KEY);
      sitzung = roh ? JSON.parse(roh) : null;
    } catch (e) { sitzung = null; }
    return sitzung;
  }

  function sitzungSchreiben(s) {
    sitzung = s;
    try {
      if (s) localStorage.setItem(SITZUNG_KEY, JSON.stringify(s));
      else localStorage.removeItem(SITZUNG_KEY);
    } catch (e) { /* privater Modus: Sitzung gilt dann nur für dieses Fenster */ }
  }

  API.angemeldet = function () {
    var s = sitzungLesen();
    return !!(s && s.refresh_token);
  };

  API.benutzer = function () {
    var s = sitzungLesen();
    return s ? s.benutzer : null;
  };

  API.profil = null;      // wird nach der Anmeldung geladen

  API.rolle = function () {
    return API.profil ? API.profil.rolle : null;
  };

  API.darfBearbeiten = function () {
    return ['bearbeiter', 'verwalter'].indexOf(API.rolle()) >= 0;
  };

  API.istVerwalter = function () { return API.rolle() === 'verwalter'; };

  /* ---------------------------------------------------------------
     Anfragen
     --------------------------------------------------------------- */

  function kopfzeilen(mitToken) {
    var h = { 'apikey': CFG.key, 'Content-Type': 'application/json' };
    var s = sitzungLesen();
    if (mitToken !== false && s && s.access_token) {
      h['Authorization'] = 'Bearer ' + s.access_token;
    }
    return h;
  }

  function fehlerText(daten, antwort) {
    if (daten && (daten.msg || daten.message || daten.error_description)) {
      return daten.msg || daten.message || daten.error_description;
    }
    if (daten && daten.hint) return daten.hint;
    return 'Server antwortet mit Status ' + antwort.status;
  }

  /* Führt eine Anfrage aus und erneuert bei abgelaufenem Token einmalig. */
  function anfrage(pfad, optionen, schonErneuert) {
    optionen = optionen || {};
    return fetch(CFG.url + pfad, {
      method: optionen.method || 'GET',
      headers: Object.assign(kopfzeilen(), optionen.headers || {}),
      body: optionen.body ? JSON.stringify(optionen.body) : undefined
    }).then(function (antwort) {
      if (antwort.status === 401 && !schonErneuert && API.angemeldet()) {
        return API.erneuern().then(function () {
          return anfrage(pfad, optionen, true);
        });
      }
      if (antwort.status === 204) return null;
      return antwort.text().then(function (text) {
        var daten = null;
        try { daten = text ? JSON.parse(text) : null; } catch (e) { daten = text; }
        if (!antwort.ok) {
          var f = new Error(fehlerText(daten, antwort));
          f.status = antwort.status;
          f.daten = daten;
          throw f;
        }
        return daten;
      });
    });
  }

  API.anfrage = anfrage;

  /* ---------------------------------------------------------------
     Anmeldung
     --------------------------------------------------------------- */

  function sitzungAusAntwort(d) {
    sitzungSchreiben({
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      ablauf: Date.now() + (d.expires_in || 3600) * 1000,
      benutzer: d.user ? { id: d.user.id, email: d.user.email } : null
    });
  }

  API.anmelden = function (email, passwort) {
    return fetch(CFG.url + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: kopfzeilen(false),
      body: JSON.stringify({ email: email, password: passwort })
    }).then(function (a) {
      return a.json().then(function (d) {
        if (!a.ok) throw new Error(fehlerText(d, a));
        sitzungAusAntwort(d);
        return API.profilLaden();
      });
    });
  };

  API.registrieren = function (email, passwort, name) {
    return fetch(CFG.url + '/auth/v1/signup', {
      method: 'POST',
      headers: kopfzeilen(false),
      body: JSON.stringify({ email: email, password: passwort, data: { name: name || '' } })
    }).then(function (a) {
      return a.json().then(function (d) {
        if (!a.ok) throw new Error(fehlerText(d, a));
        if (d.access_token) { sitzungAusAntwort(d); return API.profilLaden(); }
        return { bestaetigung: true };   // E-Mail-Bestätigung eingeschaltet
      });
    });
  };

  API.erneuern = function () {
    var s = sitzungLesen();
    if (!s || !s.refresh_token) return Promise.reject(new Error('Nicht angemeldet'));
    return fetch(CFG.url + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: kopfzeilen(false),
      body: JSON.stringify({ refresh_token: s.refresh_token })
    }).then(function (a) {
      return a.json().then(function (d) {
        if (!a.ok) { sitzungSchreiben(null); throw new Error('Sitzung abgelaufen'); }
        sitzungAusAntwort(d);
        return true;
      });
    });
  };

  API.abmelden = function () {
    var s = sitzungLesen();
    var p = s ? fetch(CFG.url + '/auth/v1/logout', {
      method: 'POST', headers: kopfzeilen()
    }).catch(function () { /* lokal abmelden genügt */ }) : Promise.resolve();
    return p.then(function () { sitzungSchreiben(null); API.profil = null; });
  };

  API.passwortVergessen = function (email) {
    return fetch(CFG.url + '/auth/v1/recover', {
      method: 'POST', headers: kopfzeilen(false), body: JSON.stringify({ email: email })
    }).then(function (a) {
      if (!a.ok) return a.json().then(function (d) { throw new Error(fehlerText(d, a)); });
      return true;
    });
  };

  API.passwortAendern = function (neu) {
    return anfrage('/auth/v1/user', { method: 'PUT', body: { password: neu } });
  };

  /* Prüft ein Passwort erneut, ohne die laufende Sitzung anzutasten.
     Wird vor dem endgültigen Löschen verlangt. */
  API.passwortPruefen = function (passwort) {
    var b = API.benutzer();
    if (!b) return Promise.resolve(false);
    return fetch(CFG.url + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: kopfzeilen(false),
      body: JSON.stringify({ email: b.email, password: passwort })
    }).then(function (a) { return a.ok; }).catch(function () { return false; });
  };

  API.profilLaden = function () {
    var b = API.benutzer();
    if (!b) return Promise.reject(new Error('Nicht angemeldet'));
    return anfrage('/rest/v1/profil?id=eq.' + b.id + '&select=*').then(function (r) {
      API.profil = (r && r[0]) || null;
      if (!API.profil) throw new Error('Zu diesem Konto besteht kein Profil.');
      if (!API.profil.aktiv) throw new Error('Dieses Konto wurde deaktiviert.');
      return API.profil;
    });
  };

  /* ---------------------------------------------------------------
     Tabellenzugriff
     --------------------------------------------------------------- */

  function tabelle(name) { return '/rest/v1/' + name; }

  API.holen = function (name, abfrage) {
    return anfrage(tabelle(name) + (abfrage ? '?' + abfrage : ''));
  };

  API.einfuegen = function (name, zeile) {
    return anfrage(tabelle(name), {
      method: 'POST', body: zeile, headers: { 'Prefer': 'return=representation' }
    });
  };

  API.aktualisieren = function (name, abfrage, aenderung) {
    return anfrage(tabelle(name) + '?' + abfrage, {
      method: 'PATCH', body: aenderung, headers: { 'Prefer': 'return=representation' }
    });
  };

  API.ersetzen = function (name, zeile) {
    return anfrage(tabelle(name), {
      method: 'POST', body: zeile,
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' }
    });
  };

  API.entfernen = function (name, abfrage) {
    return anfrage(tabelle(name) + '?' + abfrage, { method: 'DELETE' });
  };

})(window.APP);
