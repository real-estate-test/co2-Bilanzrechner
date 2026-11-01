/* =====================================================================
   Projektrechner · Excel-Import

   Der Architekt bekommt die Vorlage aus vorlagen/, füllt sie aus und
   gibt sie zurück. Hier wird sie gelesen, mit dem Projekt verglichen
   und — erst nach einer Vorschau — übernommen.

   Die Vorschau ist kein Beiwerk. Eine verrutschte Spalte oder eine
   Datei zum falschen Projekt schreibt sonst still Zahlen über, an denen
   die ganze Kalkulation hängt. Erst wenn danebensteht, was sich ändert,
   lässt sich das vor dem Übernehmen sehen.

   Übernommen wird nur, was in der Datei steht. Eine leere Zelle heisst
   «weiss ich nicht» und lässt den vorhandenen Wert stehen — sonst
   löschte eine halb ausgefüllte Vorlage die halbe Rechnung.
   ===================================================================== */
window.APP = window.APP || {};
(function (A) {
  'use strict';

  var U = A.ui, el = U.el;
  var IX = {};
  A.importExcel = IX;

  var X = null;   // A.xlsx, beim ersten Gebrauch geholt

  IX.VORLAGE = 'vorlagen/projektrechner-vorlage.xlsx';

  /* ---------------------------------------------------------------
     Spaltenköpfe der Vorlage

     Sie stehen hier und in der Vorlage — geändert werden muss also
     beides. Dafür erkennt der Import auch eine Datei, in der Zeilen
     eingefügt oder die Tabelle verschoben wurde.
     --------------------------------------------------------------- */

  var SP_FLAECHEN = ['Objekt', 'Geschossfläche oberirdisch m²', 'Vollgeschosse',
    'Untergeschoss m²', 'Nutzfläche NWF m²', 'Parkplätze Stk.', 'Fläche je Parkplatz m²'];

  var SP_KUBATUR = ['Objekt', 'Regelgeschosshöhe m', 'Dachgeschosshöhe m',
    'Höhe Untergeschoss m', 'Höhe Einstellhalle m', 'Volumen oberirdisch m³',
    'Volumen Untergeschoss m³', 'Volumen Einstellhalle m³'];

  /* «Nr.» und «Geschoss» heissen so wie die Spalten im Wohnungsspiegel
     des Werkzeugs — beim Übertragen soll niemand umdenken müssen. */
  var SP_SPIEGEL = ['Haus', 'Verwertung', 'Nr.', 'Geschoss', 'Zimmer', 'Fläche m²',
    'Preis CHF', 'Miete CHF/Monat', 'Anzahl'];

  /* Nach aussen gegeben, damit sich die Vorlage dagegen prüfen lässt.
     Beide Listen — hier und in vorlagen/vorlage-bauen.py — müssen
     übereinstimmen; weicht eine ab, findet der Import die Spalte nicht
     mehr und übergeht sie stillschweigend. Genau das ist mit der
     Spalte «Nr.» einmal passiert. */
  IX.SPALTEN = {
    'Flächen': SP_FLAECHEN,
    'Kubaturen': SP_KUBATUR,
    'Wohnungsspiegel': SP_SPIEGEL
  };

  /* Objektnamen in der Vorlage auf die Kennungen im Projekt. */
  var OBJEKTE = { 'neubau': 'neubau', 'bestand': 'bestand', 'erweiterung': 'erweiterung' };

  function objektId(text) {
    return OBJEKTE[String(text || '').trim().toLowerCase()] || null;
  }

  /* Der Anzeigename eines Objekts — die Liste steht in A.TEILE. */
  function objektName(id) {
    var t = A.TEILE.find(function (x) { return x.id === id; });
    return t ? t.label : id;
  }

  /* ---------------------------------------------------------------
     Auswerten

     Ergebnis: { aenderungen: [...], spiegel: {...}|null, warnungen: [] }
     Eine Änderung ist { gruppe, label, pfad, alt, neu, einheit }.
     --------------------------------------------------------------- */

  IX.auswerten = function (mappe, p) {
    X = A.xlsx;
    var raus = { aenderungen: [], spiegel: null, warnungen: [], blaetter: [] };

    mappe.blaetter.forEach(function (b) { raus.blaetter.push(b.name); });

    var fl = blatt(mappe, 'Flächen');
    var kb = blatt(mappe, 'Kubaturen');
    var ws = blatt(mappe, 'Wohnungsspiegel');

    if (!fl && !kb && !ws) {
      raus.warnungen.push(
        'In der Datei stehen keine Blätter mit den Namen «Flächen», ' +
        '«Kubaturen» oder «Wohnungsspiegel». Gefunden wurde: ' +
        raus.blaetter.join(', ') + '. Stammt die Datei aus unserer Vorlage?');
      return raus;
    }

    if (fl) flaechenLesen(fl, p, raus);
    if (kb) kubaturLesen(kb, p, raus);
    if (ws) spiegelLesen(ws, p, raus);

    return raus;
  };

  function blatt(mappe, name) {
    return mappe.blaetter.find(function (b) {
      return b.name.trim().toLowerCase() === name.toLowerCase();
    }) || null;
  }

  /* Trägt eine Änderung ein — aber nur, wenn sich wirklich etwas
     ändert. Eine Liste, in der zwanzig unveränderte Werte stehen,
     verdeckt die zwei, auf die es ankommt. */
  function merken(raus, gruppe, label, pfad, alt, neu, einheit) {
    if (neu === null || neu === undefined) return;
    var a = Number(alt) || 0, n = Number(neu) || 0;
    if (Math.abs(a - n) < 0.005) return;
    raus.aenderungen.push({
      gruppe: gruppe, label: label, pfad: pfad,
      alt: alt, neu: neu, einheit: einheit || ''
    });
  }

  function flaechenLesen(b, p, raus) {
    var kopf = X.kopfFinden(b.zeilen, SP_FLAECHEN);
    if (!kopf) {
      raus.warnungen.push('Im Blatt «Flächen» wurde die Kopfzeile nicht gefunden. ' +
        'Wurden die Spaltenüberschriften geändert?');
      return;
    }

    for (var i = kopf.zeile + 1; i < b.zeilen.length; i++) {
      var z = b.zeilen[i] || [];
      var id = objektId(z[kopf.spalten['Objekt']]);
      if (!id) continue;
      var t = p.teile[id];
      if (!t) continue;

      var pfad = 'teile.' + id + '.';
      var name = objektName(id);
      var gf = zahl(z, kopf, 'Geschossfläche oberirdisch m²');

      merken(raus, name, 'Geschossfläche oberirdisch', pfad + 'gf_oi', t.gf_oi, gf, 'm²');
      merken(raus, name, 'Vollgeschosse', pfad + 'geschosse', t.geschosse,
        zahl(z, kopf, 'Vollgeschosse'), 'Stk.');
      merken(raus, name, 'Untergeschoss direkt', pfad + 'gf_ug_manuell', t.gf_ug_manuell,
        zahl(z, kopf, 'Untergeschoss m²'), 'm²');
      merken(raus, name, 'Nutzfläche NWF direkt', pfad + 'nwf_manuell', t.nwf_manuell,
        zahl(z, kopf, 'Nutzfläche NWF m²'), 'm²');
      merken(raus, name, 'Parkplätze', pfad + 'pp', t.pp,
        zahl(z, kopf, 'Parkplätze Stk.'), 'Stk.');
      merken(raus, name, 'Fläche je Parkplatz', pfad + 'flaeche_pro_pp', t.flaeche_pro_pp,
        zahl(z, kopf, 'Fläche je Parkplatz m²'), 'm²');

      /* Geschossfläche und Geschosszahl aus einer Studie wirken nur im
         Modus «aus Studie» — sonst leitet die Rechnung alles aus der
         Ausnutzungsziffer ab und die eingelesenen Zahlen blieben ohne
         Wirkung. Das gehört in die Vorschau, nicht stillschweigend
         nebenher. */
      if (gf !== null && gf > 0) {
        if (t.modus !== 'studie') {
          raus.aenderungen.push({ gruppe: name, label: 'Flächenherkunft',
            pfad: pfad + 'modus', alt: 'aus Ausnutzung', neu: 'aus Studie',
            einheit: '', text: true });
        }
        if (!t.aktiv) {
          raus.aenderungen.push({ gruppe: name, label: 'Objekt', pfad: pfad + 'aktiv',
            alt: 'nicht aktiv', neu: 'aktiv', einheit: '', text: true, wahr: true });
        }
      }
    }
  }

  function kubaturLesen(b, p, raus) {
    var kopf = X.kopfFinden(b.zeilen, SP_KUBATUR);
    if (!kopf) {
      raus.warnungen.push('Im Blatt «Kubaturen» wurde die Kopfzeile nicht gefunden.');
      return;
    }

    for (var i = kopf.zeile + 1; i < b.zeilen.length; i++) {
      var z = b.zeilen[i] || [];
      var id = objektId(z[kopf.spalten['Objekt']]);
      if (!id || !p.teile[id]) continue;
      var t = p.teile[id];
      var pfad = 'teile.' + id + '.';
      var name = objektName(id) + ' · Kubatur';

      merken(raus, name, 'Regelgeschosshöhe', pfad + 'h_regel', t.h_regel,
        zahl(z, kopf, 'Regelgeschosshöhe m'), 'm');
      merken(raus, name, 'Dachgeschosshöhe', pfad + 'h_dach', t.h_dach,
        zahl(z, kopf, 'Dachgeschosshöhe m'), 'm');
      merken(raus, name, 'Höhe Untergeschoss', pfad + 'h_ug', t.h_ug,
        zahl(z, kopf, 'Höhe Untergeschoss m'), 'm');
      merken(raus, name, 'Höhe Einstellhalle', pfad + 'h_aeh', t.h_aeh,
        zahl(z, kopf, 'Höhe Einstellhalle m'), 'm');

      var vo = zahl(z, kopf, 'Volumen oberirdisch m³');
      merken(raus, name, 'Volumen oberirdisch', pfad + 'v_oi', t.v_oi, vo, 'm³');
      merken(raus, name, 'Volumen Untergeschoss', pfad + 'v_ug', t.v_ug,
        zahl(z, kopf, 'Volumen Untergeschoss m³'), 'm³');
      merken(raus, name, 'Volumen Einstellhalle', pfad + 'v_aeh', t.v_aeh,
        zahl(z, kopf, 'Volumen Einstellhalle m³'), 'm³');

      /* Volumen wirken nur, wenn die Kubatur direkt erfasst wird. */
      if (vo !== null && vo > 0 && t.kubatur_modus !== 'volumen') {
        raus.aenderungen.push({ gruppe: name, label: 'Kubatur',
          pfad: pfad + 'kubatur_modus', alt: 'über Höhen', neu: 'Volumen direkt',
          einheit: '', text: true });
      }
    }
  }

  function zahl(zeile, kopf, spalte) {
    var ix = kopf.spalten[spalte];
    if (ix === undefined) return null;
    return X.zahl(zeile[ix]);
  }

  /* ---------------------------------------------------------------
     Wohnungsspiegel

     Der Spiegel wird nicht zeilenweise abgeglichen, sondern als Ganzes
     ersetzt: Eine Wohnungsliste ist eine Aufstellung, keine Sammlung
     einzelner Werte. Welche der bisherigen Wohnung die neue «A 1.2»
     entspricht, weiss niemand — und ein Rateversuch führte zu einem
     Spiegel, der weder der alte noch der neue ist.
     --------------------------------------------------------------- */

  function spiegelLesen(b, p, raus) {
    var kopf = X.kopfFinden(b.zeilen, SP_SPIEGEL);
    if (!kopf) {
      raus.warnungen.push('Im Blatt «Wohnungsspiegel» wurde die Kopfzeile nicht gefunden.');
      return;
    }

    var haeuser = [];
    var nachName = {};
    var zeilen = 0;

    for (var i = kopf.zeile + 1; i < b.zeilen.length; i++) {
      var z = b.zeilen[i] || [];
      var hausName = X.text(z[kopf.spalten['Haus']]);
      var bez = X.text(z[kopf.spalten['Nr.']]);
      var flaeche = zahl(z, kopf, 'Fläche m²');

      /* Eine Zeile zählt, sobald sie ein Haus und entweder eine Nummer
         oder eine Fläche trägt. Reste der Beispielzeilen und leere
         Zeilen fallen damit weg. */
      if (!hausName || (!bez && flaeche === null)) continue;

      var verw = X.text(z[kopf.spalten['Verwertung']]).toLowerCase();
      var istMiete = verw.indexOf('miet') >= 0;

      var h = nachName[hausName];
      if (!h) {
        h = nachName[hausName] = {
          id: A.uid(), name: hausName, zeile: null,
          preismodus: 'einheit', mietmodus: 'monat',
          einheiten: [], _miete: istMiete
        };
        haeuser.push(h);
      }

      var anzahl = zahl(z, kopf, 'Anzahl');
      var gesch = zahl(z, kopf, 'Geschoss');
      h.einheiten.push({
        nr: bez,
        anzahl: (anzahl !== null && anzahl > 0) ? anzahl : 1,
        /* Das Geschoss darf 0 sein — das ist das Erdgeschoss, nicht
           ein fehlender Wert. Deshalb gegen null geprüft und nicht
           gegen «falsch». */
        geschoss: gesch === null ? '' : gesch,
        zimmer: zahl(z, kopf, 'Zimmer') || 0,
        flaeche: flaeche || 0,
        preis: zahl(z, kopf, 'Preis CHF') || 0,
        miete: zahl(z, kopf, 'Miete CHF/Monat') || 0,
        preis_m2: 0, miete_m2: 0
      });
      zeilen++;
    }

    if (!zeilen) return;

    /* Jedes Haus einer Nutzungszeile zuordnen, denn von dort erbt es
       Art und Verwertung. Passt keine, bleibt die Zuordnung leer — dann
       gilt Stockwerkeigentum, und die Vorschau sagt das. */
    var teilId = (p.spiegel && p.spiegel.teil) || 'neubau';
    var teil = p.teile[teilId] || p.teile.neubau;
    var nutzungen = (teil && teil.nutzungen) || [];

    var ohneZeile = [];
    haeuser.forEach(function (h) {
      var passend = nutzungen.find(function (n) {
        if (n.art === 'parkplatz') return false;
        var nMiete = n.verwertung !== 'stwe';
        return nMiete === h._miete;
      });
      if (passend) h.zeile = passend.id;
      else if (h._miete) ohneZeile.push(h.name);
      delete h._miete;
    });

    if (ohneZeile.length) {
      raus.warnungen.push(
        'Für ' + (ohneZeile.length === 1 ? 'das Haus' : 'die Häuser') + ' ' +
        ohneZeile.join(', ') + ' steht «Miete», aber unter ' +
        objektName(teilId) +
        ' gibt es keine Nutzungszeile mit einer Mietverwertung. ' +
        (ohneZeile.length === 1 ? 'Das Haus wird' : 'Die Häuser werden') +
        ' als Stockwerkeigentum geführt, bis Sie dort eine Zeile anlegen.');
    }

    var alt = A.spiegelEinheiten(p).length;
    var neu = haeuser.reduce(function (s, h) {
      return s + h.einheiten.reduce(function (t, e) { return t + (e.anzahl || 1); }, 0);
    }, 0);

    raus.spiegel = {
      haeuser: haeuser, zeilen: zeilen, wohnungen: neu, alt: alt, teil: teilId
    };
  }

  /* ---------------------------------------------------------------
     Übernehmen
     --------------------------------------------------------------- */

  IX.uebernehmen = function (p, auswertung, mitSpiegel) {
    (auswertung.aenderungen || []).forEach(function (a) {
      if (a.wahr) A.set(p, a.pfad, true);
      else if (a.text) A.set(p, a.pfad, schluesselAus(a.pfad, a.neu));
      else A.set(p, a.pfad, a.neu);
    });

    if (mitSpiegel && auswertung.spiegel) {
      if (!p.spiegel) p.spiegel = { aktiv: true, teil: 'neubau', haeuser: [] };
      p.spiegel.haeuser = auswertung.spiegel.haeuser;
      p.spiegel.aktiv = true;
    }

    /* Neu rechnen, nicht nur neu zeichnen. A.render() baut die Seite
       aus dem zuletzt gerechneten Stand auf; ohne recompute stünden
       die eingelesenen Zahlen zwar im Projekt, die Kalkulation zeigte
       aber weiter die alten — bis jemand zufällig ein Feld anfasst.
       recompute markiert das Projekt auch als ungespeichert. */
    A.recompute();
  };

  /* Die Anzeigetexte der Umschalter zurück auf ihre Kennungen. */
  function schluesselAus(pfad, text) {
    if (/\.modus$/.test(pfad)) return text === 'aus Studie' ? 'studie' : 'ausnutzung';
    if (/kubatur_modus$/.test(pfad)) return text === 'Volumen direkt' ? 'volumen' : 'hoehe';
    return text;
  }

  /* ---------------------------------------------------------------
     Der Dialog
     --------------------------------------------------------------- */

  IX.dialog = function (p) {
    var stand = { mappe: null, auswertung: null, spiegelNehmen: true, dateiname: '' };

    var inhalt = el('div', {});
    var uebernehmen = el('button', { class: 'primary', text: 'Übernehmen', disabled: '' });

    var bg = U.modal('Aus Excel übernehmen', [inhalt], [uebernehmen]);

    function zeichnen() {
      U.leeren(inhalt);

      /* --- Schritt 1: Datei wählen ------------------------------- */
      var wahl = el('input', { type: 'file', accept: '.xlsx', style: 'display:none' });
      wahl.addEventListener('change', function () {
        var d = wahl.files && wahl.files[0];
        wahl.value = '';
        if (d) einlesen(d);
      });

      var ablage = el('div', { class: 'xlablage', tabindex: '0' }, [
        el('span', { text: stand.dateiname || 'Ausgefüllte Vorlage hierher ziehen oder auswählen' }),
        el('button', { class: 'ghost sm', text: 'Datei wählen',
          onclick: function (ev) { ev.stopPropagation(); wahl.click(); } }),
        wahl
      ]);
      ablage.addEventListener('click', function () { wahl.click(); });
      ablageZiel(ablage, einlesen);
      inhalt.appendChild(ablage);

      inhalt.appendChild(el('div', { class: 'hilfe', style: 'margin:8px 0 12px' }, [
        el('span', { text: 'Noch keine Vorlage? ' }),
        el('a', { href: IX.VORLAGE, download: 'projektrechner-vorlage.xlsx',
          text: 'Leere Vorlage herunterladen' }),
        el('span', { text: ' und dem Architekten geben.' })
      ]));

      if (!stand.auswertung) return;

      /* --- Schritt 2: Vorschau ----------------------------------- */
      var a = stand.auswertung;

      a.warnungen.forEach(function (w) {
        inhalt.appendChild(U.hinweis('warn', w));
      });

      if (!a.aenderungen.length && !a.spiegel) {
        inhalt.appendChild(U.hinweis('info',
          'Die Datei wurde gelesen, aber es ergibt sich keine Änderung — ' +
          'entweder ist sie noch leer, oder alles steht bereits so im Projekt.'));
        return;
      }

      if (a.aenderungen.length) {
        var gruppen = {};
        a.aenderungen.forEach(function (x) {
          (gruppen[x.gruppe] = gruppen[x.gruppe] || []).push(x);
        });

        Object.keys(gruppen).forEach(function (g) {
          inhalt.appendChild(el('h3', { class: 'zt', style: 'margin-top:12px', text: g }));
          var zeilen = gruppen[g].map(function (x) {
            return el('tr', {}, [
              el('td', { text: x.label }),
              el('td', { class: 'n muted', text: wertText(x, x.alt) }),
              el('td', { class: 'n', style: 'font-weight:640', text: wertText(x, x.neu) })
            ]);
          });
          inhalt.appendChild(U.tabelle(
            [{ label: 'Feld' }, { label: 'bisher', n: true, w: '25%' },
             { label: 'neu', n: true, w: '25%' }], zeilen));
        });
      }

      if (a.spiegel) {
        inhalt.appendChild(el('h3', { class: 'zt', style: 'margin-top:14px',
          text: 'Wohnungsspiegel' }));

        var kasten = el('div', { class: 'panelbody', style: 'background:var(--panel2);border-radius:6px' });
        kasten.appendChild(el('div', { style: 'font-size:12.5px' }, [
          el('span', { text: a.spiegel.haeuser.length + ' Häuser, ' +
            a.spiegel.zeilen + ' Zeilen, ' + a.spiegel.wohnungen + ' Wohnungen' })
        ]));
        a.spiegel.haeuser.forEach(function (h) {
          var w = h.einheiten.reduce(function (s, e) { return s + (e.anzahl || 1); }, 0);
          kasten.appendChild(el('div', { class: 'hilfe',
            text: '· ' + h.name + ': ' + w + ' Wohnungen' }));
        });

        /* Der Spiegel wird als Ganzes ersetzt — bei vorhandenen
           Wohnungen muss das ausdrücklich bestätigt werden. */
        if (a.spiegel.alt > 0) {
          var hk = el('input', { type: 'checkbox', checked: stand.spiegelNehmen ? '' : null,
            style: 'width:auto' });
          hk.addEventListener('change', function () { stand.spiegelNehmen = hk.checked; });
          kasten.appendChild(el('label', {
            style: 'display:flex;gap:7px;align-items:flex-start;margin-top:9px;font-size:12.5px' }, [
            hk,
            el('span', { text: 'Den bisherigen Wohnungsspiegel mit seinen ' +
              a.spiegel.alt + ' Wohnungen ersetzen. Der alte Stand geht dabei verloren.' })
          ]));
        }
        inhalt.appendChild(kasten);
      }

      uebernehmen.disabled = null;
    }

    function wertText(x, w) {
      if (x.text || x.wahr) return String(w);
      return A.fmt(w, Math.abs(w) < 100 && w % 1 !== 0 ? 2 : 0) +
             (x.einheit ? ' ' + x.einheit : '');
    }

    function einlesen(datei) {
      if (!/\.xlsx$/i.test(datei.name)) {
        A.meldung('warn', 'Bitte eine .xlsx-Datei wählen. Ältere .xls-Dateien ' +
          'lassen sich nicht lesen — in Excel als .xlsx speichern.');
        return;
      }
      stand.dateiname = datei.name;
      A.xlsx.lesen(datei).then(function (mappe) {
        stand.mappe = mappe;
        stand.auswertung = IX.auswerten(mappe, p);
        zeichnen();
      }).catch(function (f) {
        stand.auswertung = null;
        zeichnen();
        A.meldung('warn', 'Die Datei liess sich nicht lesen: ' + f.message);
      });
    }

    uebernehmen.addEventListener('click', function () {
      if (!stand.auswertung) return;
      var a = stand.auswertung;
      IX.uebernehmen(p, a, stand.spiegelNehmen);
      bg.remove();
      A.meldung('ok', a.aenderungen.length + ' Werte übernommen' +
        (a.spiegel && stand.spiegelNehmen
          ? ', Wohnungsspiegel mit ' + a.spiegel.wohnungen + ' Wohnungen ersetzt' : '') + '.');
      A.render();
    });

    zeichnen();
    return bg;
  };

  function ablageZiel(knoten, aufnehmen) {
    function hatDateien(e) {
      var t = e.dataTransfer && e.dataTransfer.types;
      return !!t && Array.prototype.indexOf.call(t, 'Files') >= 0;
    }
    knoten.addEventListener('dragover', function (e) {
      if (!hatDateien(e)) return;
      e.preventDefault();
      knoten.classList.add('drueber');
    });
    knoten.addEventListener('dragleave', function () { knoten.classList.remove('drueber'); });
    knoten.addEventListener('drop', function (e) {
      if (!hatDateien(e)) return;
      e.preventDefault();
      knoten.classList.remove('drueber');
      var d = e.dataTransfer.files[0];
      if (d) aufnehmen(d);
    });
  }
})(window.APP);
