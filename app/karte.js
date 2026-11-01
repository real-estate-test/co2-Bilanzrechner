/* =====================================================================
   Projektrechner · Standortkarte und Adresssuche

   Die Karte zeigt die Projekte des Portfolios dort, wo sie stehen.
   Kacheln kommen von OpenStreetMap (kein Schlüssel, Schweiz und
   Deutschland gleichermassen), die Koordinaten aus der Adresssuche
   Nominatim — beides in app/config.js einstellbar.

   Gesucht wird ausschliesslich auf Knopfdruck und einmal je Projekt;
   das Ergebnis wird im Projekt eingefroren. Die Nutzungsregeln von
   Nominatim erlauben keine Massenabfragen, und ein eingefrorener
   Standort hält die Karte netzwerkunabhängig.
   ===================================================================== */
window.APP = window.APP || {};
(function (A) {
  'use strict';

  var K = {};
  A.karte = K;

  function cfg(schluessel, vorgabe) {
    var c = window.APP_CONFIG || {};
    return c[schluessel] || vorgabe;
  }

  K.kachelAdresse = function () {
    return cfg('kacheln', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  };
  K.kachelHinweis = function () {
    return cfg('kachelnHinweis', '© OpenStreetMap-Mitwirkende');
  };

  /* ---------------------------------------------------------------
     Farben der Marker — nach Projektstatus, wie mit dem Anwender
     festgelegt. «Verworfen» bleibt grau: solche Projekte erscheinen
     nur, wenn man sie im Filter ausdrücklich einschaltet.
     --------------------------------------------------------------- */

  K.FARBEN = [
    { label: 'Idee / Prüfung',            farbe: '#7fb3e8', status: ['Idee', 'Prüfung'] },
    { label: 'Akquisition / Entwicklung', farbe: '#1f5fd0', status: ['Akquisition', 'Entwicklung'] },
    { label: 'ab Baubewilligung',         farbe: '#e08327',
      status: ['Baubewilligung', 'Realisierung', 'Vermarktung', 'Abgeschlossen'] },
    { label: 'verworfen',                 farbe: '#9aa3ae', status: ['Verworfen'] }
  ];

  K.farbeFuer = function (status) {
    var t = K.FARBEN.find(function (g) { return g.status.indexOf(status) >= 0; });
    return t ? t.farbe : '#9aa3ae';
  };

  K.hatStandort = function (p) {
    return !!(p && p.geo && p.geo.lat && p.geo.lon);
  };

  /* ---------------------------------------------------------------
     Koordinaten aus eingefügtem Text

     Die Adresssuche trifft nicht jede Parzelle. Schneller geht es oft
     über Google Maps: Rechtsklick auf die Stelle, «Koordinaten
     kopieren» — oder gleich die Adresszeile des Browsers hierher.

     Verstanden werden zwei Formen. Die blosse Zahlenpaarung
     «47.3769, 8.5417» ist das, was die Zwischenablage nach dem
     Rechtsklick enthält. Eine Google-Maps-Adresse trägt die
     Koordinaten an mehreren Stellen; welche gilt, steht unten.
     --------------------------------------------------------------- */

  function gueltig(lat, lon) {
    return isFinite(lat) && isFinite(lon) &&
           Math.abs(lat) <= 90 && Math.abs(lon) <= 180 &&
           !(lat === 0 && lon === 0);
  }

  K.koordinatenLesen = function (roh) {
    var s = String(roh == null ? '' : roh).trim();
    if (!s) return null;

    /* Kurzadressen tragen keine Koordinaten in sich — sie verweisen
       nur auf einen Eintrag bei Google. Auflösen liesse sich das nur
       mit einem Aufruf dorthin, den der Browser aus Sicherheitsgründen
       ohnehin abweist. Statt es zu versuchen und zu scheitern, wird
       der Fall benannt. */
    if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(s)) {
      return { kurz: true };
    }

    var m;

    if (/google\.[a-z.]+\/maps|maps\.google\./i.test(s)) {
      /* In einer Google-Maps-Adresse stehen bis zu zwei Koordinaten:
         hinter «@» der Mittelpunkt des Kartenausschnitts, in den
         Daten dahinter als !3d/!4d der Ort selbst. Wer eine Parzelle
         anklickt und die Adresse kopiert, meint den Ort — und der
         Ausschnitt ist oft um einige Meter versetzt. Deshalb zuerst
         !3d/!4d. */
      m = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
      if (m && gueltig(+m[1], +m[2])) {
        return { lat: +m[1], lon: +m[2], quelle: 'Google Maps (Ort)' };
      }
      m = s.match(/[?&](?:q|ll|daddr|saddr)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i);
      if (m && gueltig(+m[1], +m[2])) {
        return { lat: +m[1], lon: +m[2], quelle: 'Google Maps' };
      }
      m = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      if (m && gueltig(+m[1], +m[2])) {
        return { lat: +m[1], lon: +m[2], quelle: 'Google Maps (Kartenmitte)' };
      }
      return null;
    }

    /* Ein blosses Zahlenpaar: Komma, Strichpunkt oder Leerzeichen
       dazwischen. Die Breite steht zuerst — so legt es Google in die
       Zwischenablage, und so steht es auf jeder Karte. */
    m = s.match(/^\s*(-?\d{1,3}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/);
    if (m) {
      /* Dezimalkomma ist möglich, aber nur wenn es nicht zugleich der
         Trenner ist — «47,3769 8,5417» geht, «47,3769, 8,5417» wäre
         nicht eindeutig und fällt oben schon durch. */
      var lat = parseFloat(m[1].replace(',', '.'));
      var lon = parseFloat(m[2].replace(',', '.'));
      if (gueltig(lat, lon)) {
        return { lat: lat, lon: lon, quelle: 'eingefügt' };
      }
    }

    return null;
  };

  /* ---------------------------------------------------------------
     Adresssuche. Nominatim liefert mehrere Treffer — die Auswahl
     trifft der Anwender, weil Adressen mehrdeutig sind.
     --------------------------------------------------------------- */

  K.suchtext = function (p) {
    /* Parzellennummer hilft der Suche nicht — sie kennt keine
       Grundbuchdaten. Ort und Adresse genügen; der Kanton grenzt ein. */
    var teile = [p.ort];
    var kanton = A.KANTONE[p.kanton];
    if (kanton && p.kanton !== 'XX' && !/schweiz|deutschland/i.test(p.ort || '')) {
      teile.push(kanton.label);
    }
    return teile.filter(Boolean).join(', ').trim();
  };

  K.suchen = function (text) {
    var url = cfg('adresssuche', 'https://nominatim.openstreetmap.org/search') +
      '?format=jsonv2&limit=6&addressdetails=1' +
      '&countrycodes=ch,de,at,li' +
      '&q=' + encodeURIComponent(text);
    return fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function (a) {
        if (!a.ok) throw new Error('Die Adresssuche antwortet mit HTTP ' + a.status);
        return a.json();
      })
      .then(function (liste) {
        if (!Array.isArray(liste)) throw new Error('Unerwartetes Datenformat');
        return liste.map(function (t) {
          return {
            lat: parseFloat(t.lat), lon: parseFloat(t.lon),
            bezeichnung: String(t.display_name || '')
          };
        }).filter(function (t) { return isFinite(t.lat) && isFinite(t.lon); });
      });
  };

  /* ---------------------------------------------------------------
     Karte aufbauen. Gibt den Knoten zurück; Leaflet braucht eine
     Grösse, deshalb wird die Karte nach dem Einhängen nachgemessen.
     --------------------------------------------------------------- */

  K.verfuegbar = function () { return typeof window.L !== 'undefined'; };

  /* ---------------------------------------------------------------
     Karte zum Platzieren

     Eine Karte für ein einzelnes Projekt: Klick setzt den Punkt, der
     Marker lässt sich ziehen. Für die Fälle, in denen die Adresssuche
     danebenliegt — eine Parzelle am Ortsrand, ein Grundstück ohne
     Hausnummer, eine Strasse, die zwei Gemeinden kennt.

     «setzen» wird bei jeder Änderung mit (lat, lon, wie) gerufen. Die
     Karte zeichnet sich dabei NICHT neu, sondern verschiebt nur ihren
     Marker: Ein Neuaufbau risse sie unter dem Mauszeiger weg und
     setzte den Ausschnitt zurück — mitten im Zielen.
     --------------------------------------------------------------- */

  K.platzieren = function (p, setzen, opts) {
    opts = opts || {};
    var el = A.ui.el;

    if (!K.verfuegbar()) {
      return A.ui.hinweis('warn', 'Die Kartenbibliothek konnte nicht geladen werden. ' +
        'Die Datei <code>vendor/leaflet/leaflet.js</code> fehlt oder wurde blockiert.');
    }

    var knoten = el('div', { class: 'platzkarte',
      style: 'height:' + (opts.hoehe || 260) + 'px' });

    /* Nach aussen gegeben, damit Einfügefeld und Zahlenfelder den
       Marker nachziehen können, ohne die Karte neu zu bauen. */
    var steuer = { karte: null, marke: null, setzeMarke: function () {} };
    knoten.steuer = steuer;

    setTimeout(function () {
      if (!knoten.isConnected) return;

      var hat = K.hatStandort(p);
      /* Ohne Standort ein Ausschnitt, der die Schweiz zeigt. Von dort
         findet man sich zurecht; eine Weltkarte wäre zum Zielen
         unbrauchbar. */
      var mitte = hat ? [p.geo.lat, p.geo.lon] : [46.85, 8.23];

      var m = window.L.map(knoten, { attributionControl: true });
      steuer.karte = m;
      window.L.tileLayer(K.kachelAdresse(), {
        maxZoom: 19, attribution: K.kachelHinweis()
      }).addTo(m);
      m.setView(mitte, hat ? 16 : 7);

      function marke(lat, lon) {
        if (steuer.marke) { steuer.marke.setLatLng([lat, lon]); return; }
        steuer.marke = window.L.marker([lat, lon], { draggable: true }).addTo(m);
        steuer.marke.on('dragend', function () {
          var q = steuer.marke.getLatLng();
          setzen(q.lat, q.lng, 'auf der Karte verschoben');
        });
      }

      steuer.setzeMarke = function (lat, lon, hinziehen) {
        marke(lat, lon);
        if (hinziehen) m.setView([lat, lon], Math.max(m.getZoom(), 16));
      };

      if (hat) marke(p.geo.lat, p.geo.lon);

      m.on('click', function (e) {
        marke(e.latlng.lat, e.latlng.lng);
        setzen(e.latlng.lat, e.latlng.lng, 'auf der Karte gesetzt');
      });

      setTimeout(function () { m.invalidateSize(); }, 60);
    }, 0);

    return knoten;
  };

  /* eintraege: [{ p, r }] wie im Portfolio */
  K.bauen = function (eintraege, opts) {
    opts = opts || {};
    var el = A.ui.el;
    var wrap = el('div', { class: 'kartenrahmen' });

    var mitStandort = eintraege.filter(function (x) { return K.hatStandort(x.p); });

    if (!K.verfuegbar()) {
      return el('div', { class: 'panelbody' }, [
        A.ui.hinweis('warn', 'Die Kartenbibliothek konnte nicht geladen werden. ' +
          'Die Datei <code>vendor/leaflet/leaflet.js</code> fehlt oder wurde blockiert.')
      ]);
    }
    if (!mitStandort.length) {
      return el('div', { class: 'panelbody' }, [
        A.ui.hinweis('info', 'Noch kein Projekt hat einen Standort. Auf der Seite ' +
          '<b>Projekt</b> mit <b>Koordinaten suchen</b> die Adresse auflösen — ' +
          'danach erscheint das Projekt hier.')
      ]);
    }

    var karte = el('div', { style: 'height:' + (opts.hoehe || 420) + 'px;width:100%' });
    wrap.appendChild(karte);

    /* Leaflet misst beim Aufbau die Grösse des Knotens. Der ist zu
       diesem Zeitpunkt noch nicht im Dokument, deshalb erst danach. */
    setTimeout(function () {
      if (!karte.isConnected) return;
      var m = window.L.map(karte, {
        scrollWheelZoom: !opts.fest,
        zoomControl: !opts.fest,
        dragging: !opts.fest,
        attributionControl: true
      });
      window.L.tileLayer(K.kachelAdresse(), {
        maxZoom: 19, attribution: K.kachelHinweis()
      }).addTo(m);

      var punkte = [];
      mitStandort.forEach(function (x) {
        var p = x.p, k = x.r ? x.r.kpi : null;
        var farbe = K.farbeFuer(p.status);
        var mk = window.L.circleMarker([p.geo.lat, p.geo.lon], {
          radius: 9, color: '#fff', weight: 2, opacity: 1,
          fillColor: farbe, fillOpacity: 0.92
        }).addTo(m);

        var zeilen = [
          '<div style="font-weight:640;margin-bottom:2px">' + A.escape(p.name) + '</div>',
          '<div style="color:#6b7484;margin-bottom:5px">' +
            A.escape([p.ort, p.firma].filter(Boolean).join(' · ') || '—') + '</div>'
        ];
        if (k) {
          zeilen.push('<table style="border:0;font-size:11.5px">' +
            zeile('Anlagekosten', A.fmt(k.anlagekosten)) +
            zeile('Erlöse', A.fmt(k.erloese)) +
            zeile('Gewinn', A.fmt(k.gewinn)) +
            zeile('Marge', A.fmtPct(k.marge_ak)) +
            '</table>');
        }
        zeilen.push('<div style="margin-top:5px;color:#6b7484">' +
          A.escape(p.status) + '</div>');

        mk.bindTooltip(zeilen.join(''), {
          direction: 'top', offset: [0, -8], opacity: 1, className: 'kartenkarte'
        });
        if (!opts.fest) {
          mk.on('click', function () { A.projektOeffnen(p.id); A.zeigeSeite('projekt'); });
        }
        punkte.push([p.geo.lat, p.geo.lon]);
      });

      if (punkte.length === 1) m.setView(punkte[0], 13);
      else m.fitBounds(punkte, { padding: [30, 30], maxZoom: 14 });

      /* Nach dem Einblenden noch einmal messen — die Kacheln bleiben
         sonst grau, wenn das Panel beim Aufbau noch keine Breite hat. */
      setTimeout(function () { m.invalidateSize(); }, 60);
    }, 0);

    function zeile(bez, wert) {
      return '<tr><td style="border:0;padding:1px 10px 1px 0;color:#6b7484">' + bez +
        '</td><td style="border:0;padding:1px 0;text-align:right;font-family:ui-monospace,monospace">' +
        wert + '</td></tr>';
    }

    return wrap;
  };

  /* Legende zu den Markerfarben */
  K.legende = function () {
    var el = A.ui.el;
    return el('div', { class: 'legende' }, K.FARBEN.map(function (g) {
      return el('span', {}, [
        el('i', { style: 'background:' + g.farbe }),
        el('span', { text: g.label })
      ]);
    }));
  };

})(window.APP);
