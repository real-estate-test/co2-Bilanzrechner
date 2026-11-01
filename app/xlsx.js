/* =====================================================================
   Projektrechner · Excel-Dateien lesen

   Eine .xlsx ist ein ZIP-Archiv mit XML darin. Beides kann der Browser
   von sich aus: DecompressionStream packt aus, DOMParser liest das XML.
   Deshalb kommt der Import ohne Fremdbibliothek aus — eine
   Tabellenbibliothek wöge mehrere hundert Kilobyte und könnte weit
   mehr, als hier je gebraucht wird.

   Gelesen wird nur, nie geschrieben. Die Vorlage, die der Architekt
   ausfüllt, liegt als fertige Datei unter vorlagen/ im Repository.

   Was hier absichtlich fehlt: Formeln werden nicht gerechnet. Excel
   legt zu jeder Formel den zuletzt berechneten Wert mit ab, und den
   lesen wir. Eine Vorlage, die nie in Excel geöffnet wurde, hätte
   diese Werte nicht — deshalb steht in der Anleitung, dass die Datei
   aus Excel heraus zu speichern ist.
   ===================================================================== */
window.APP = window.APP || {};
(function (A) {
  'use strict';

  var X = {};
  A.xlsx = X;

  /* ---------------------------------------------------------------
     ZIP

     Gelesen wird über das zentrale Verzeichnis am Dateiende, nicht
     über die einzelnen Kopfsätze: Dort stehen die Einträge vollständig
     und an einer Stelle, und ein Archiv mit Anhängseln — manche
     Programme hängen etwas an — bleibt lesbar.
     --------------------------------------------------------------- */

  var SIG_EOCD = 0x06054b50;
  var SIG_CD   = 0x02014b50;

  function eocdSuchen(dv, laenge) {
    /* Der Abschluss ist 22 Byte lang und kann bis zu 65535 Byte
       Kommentar hinter sich haben. Von hinten suchen. */
    var min = Math.max(0, laenge - 22 - 65535);
    for (var i = laenge - 22; i >= min; i--) {
      if (dv.getUint32(i, true) === SIG_EOCD) return i;
    }
    return -1;
  }

  function nameLesen(bytes, von, laenge) {
    /* Dateinamen in XLSX sind reines ASCII; UTF-8 schadet nicht. */
    return new TextDecoder('utf-8').decode(bytes.subarray(von, von + laenge));
  }

  /* Gibt eine Zusage auf { pfad: Uint8Array } zurück. */
  X.zipLesen = function (puffer) {
    var bytes = new Uint8Array(puffer);
    var dv = new DataView(puffer);
    var eocd = eocdSuchen(dv, bytes.length);
    if (eocd < 0) {
      return Promise.reject(new Error('Das ist keine Excel-Datei (kein ZIP-Abschluss gefunden).'));
    }

    var anzahl = dv.getUint16(eocd + 10, true);
    var cdStart = dv.getUint32(eocd + 16, true);

    var eintraege = [];
    var p = cdStart;
    for (var i = 0; i < anzahl; i++) {
      if (p + 46 > bytes.length || dv.getUint32(p, true) !== SIG_CD) break;
      var methode   = dv.getUint16(p + 10, true);
      var groesse_k = dv.getUint32(p + 20, true);   // komprimiert
      var groesse_o = dv.getUint32(p + 24, true);   // original
      var nameLen   = dv.getUint16(p + 28, true);
      var extraLen  = dv.getUint16(p + 30, true);
      var kommLen   = dv.getUint16(p + 32, true);
      var lokal     = dv.getUint32(p + 42, true);
      eintraege.push({
        name: nameLesen(bytes, p + 46, nameLen),
        methode: methode, groesse_k: groesse_k, groesse_o: groesse_o, lokal: lokal
      });
      p += 46 + nameLen + extraLen + kommLen;
    }

    if (!eintraege.length) {
      return Promise.reject(new Error('Die Datei enthält keine lesbaren Einträge.'));
    }

    var raus = {};
    var reihe = Promise.resolve();

    eintraege.forEach(function (e) {
      reihe = reihe.then(function () {
        /* Im Kopfsatz am Ort stehen Namens- und Zusatzlänge erneut —
           und zwar oft anders als im zentralen Verzeichnis. Nur diese
           beiden gelten für die Lage der Daten. */
        var q = e.lokal;
        if (dv.getUint32(q, true) !== 0x04034b50) return;
        var nLen = dv.getUint16(q + 26, true);
        var xLen = dv.getUint16(q + 28, true);
        var von = q + 30 + nLen + xLen;
        var daten = bytes.subarray(von, von + e.groesse_k);

        if (e.methode === 0) {              // unkomprimiert abgelegt
          raus[e.name] = daten;
          return;
        }
        if (e.methode !== 8) return;        // andere Verfahren kommen nicht vor

        return auspacken(daten).then(function (roh) { raus[e.name] = roh; });
      });
    });

    return reihe.then(function () { return raus; });
  };

  function auspacken(daten) {
    if (typeof DecompressionStream !== 'function') {
      return Promise.reject(new Error(
        'Dieser Browser kann keine Excel-Dateien auspacken. Bitte einen ' +
        'aktuellen Browser verwenden.'));
    }
    /* «deflate-raw»: im ZIP liegen die Daten ohne zlib-Kopf. */
    var strom = new Blob([daten]).stream()
      .pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(strom).arrayBuffer().then(function (b) {
      return new Uint8Array(b);
    });
  }

  function text(bytes) {
    return bytes ? new TextDecoder('utf-8').decode(bytes) : '';
  }

  /* ---------------------------------------------------------------
     Die Arbeitsmappe
     --------------------------------------------------------------- */

  function xmlLesen(s) {
    var d = new DOMParser().parseFromString(s, 'application/xml');
    if (d.getElementsByTagName('parsererror').length) {
      throw new Error('Die Datei ist beschädigt (XML nicht lesbar).');
    }
    return d;
  }

  /* Spaltenbuchstaben in eine Nummer: A=1, B=2 … AA=27 */
  X.spalteNummer = function (bezug) {
    var m = String(bezug || '').match(/^([A-Z]+)/i);
    if (!m) return 0;
    var s = m[1].toUpperCase(), n = 0;
    for (var i = 0; i < s.length; i++) {
      n = n * 26 + (s.charCodeAt(i) - 64);
    }
    return n;
  };

  X.zeileNummer = function (bezug) {
    var m = String(bezug || '').match(/(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
  };

  /* Liest eine Datei und gibt die Blätter als Zeilenraster zurück:
     { blaetter: [{ name, zeilen: [[zelle, zelle, …], …] }] }

     Leere Zellen sind ''. Zahlen kommen als Zahl, alles andere als
     Text — was in der Zelle steht, entscheidet, nicht die Spalte. */
  X.lesen = function (datei) {
    return datei.arrayBuffer().then(X.zipLesen).then(function (dateien) {
      var wbRoh = dateien['xl/workbook.xml'];
      if (!wbRoh) {
        throw new Error('Das ist keine Excel-Arbeitsmappe (xl/workbook.xml fehlt).');
      }

      /* Gemeinsame Zeichenketten: Excel legt Text einmal ab und
         verweist aus den Zellen darauf. */
      var gemeinsam = [];
      if (dateien['xl/sharedStrings.xml']) {
        var sd = xmlLesen(text(dateien['xl/sharedStrings.xml']));
        var si = sd.getElementsByTagName('si');
        for (var i = 0; i < si.length; i++) {
          /* Ein Eintrag kann in mehrere <t> zerfallen, wenn Teile
             verschieden formatiert sind — alle zusammensetzen. */
          var ts = si[i].getElementsByTagName('t');
          var s = '';
          for (var j = 0; j < ts.length; j++) s += ts[j].textContent;
          gemeinsam.push(s);
        }
      }

      /* Blattnamen aus der Mappe, Zuordnung über die Beziehungen. */
      var wb = xmlLesen(text(wbRoh));
      var rels = {};
      if (dateien['xl/_rels/workbook.xml.rels']) {
        var rd = xmlLesen(text(dateien['xl/_rels/workbook.xml.rels']));
        var rl = rd.getElementsByTagName('Relationship');
        for (var k = 0; k < rl.length; k++) {
          rels[rl[k].getAttribute('Id')] = rl[k].getAttribute('Target');
        }
      }

      var blaetter = [];
      var sh = wb.getElementsByTagName('sheet');
      for (var b = 0; b < sh.length; b++) {
        var name = sh[b].getAttribute('name') || ('Blatt ' + (b + 1));
        var rid = sh[b].getAttribute('r:id') ||
                  sh[b].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
        var ziel = rels[rid] || ('worksheets/sheet' + (b + 1) + '.xml');
        if (ziel.charAt(0) === '/') ziel = ziel.slice(1);
        else if (ziel.indexOf('xl/') !== 0) ziel = 'xl/' + ziel;

        var roh = dateien[ziel];
        if (!roh) continue;
        blaetter.push({ name: name, zeilen: blattZeilen(text(roh), gemeinsam) });
      }

      if (!blaetter.length) {
        throw new Error('Die Arbeitsmappe enthält kein lesbares Blatt.');
      }
      return { blaetter: blaetter };
    });
  };

  function blattZeilen(xml, gemeinsam) {
    var d = xmlLesen(xml);
    var rows = d.getElementsByTagName('row');
    var raster = [];

    for (var i = 0; i < rows.length; i++) {
      var nr = parseInt(rows[i].getAttribute('r') || (i + 1), 10);
      var zellen = rows[i].getElementsByTagName('c');
      var zeile = [];

      for (var j = 0; j < zellen.length; j++) {
        var c = zellen[j];
        var bezug = c.getAttribute('r') || '';
        var spalte = bezug ? X.spalteNummer(bezug) : (j + 1);
        var typ = c.getAttribute('t') || 'n';
        var wert = '';

        if (typ === 'inlineStr') {
          var its = c.getElementsByTagName('t');
          for (var m = 0; m < its.length; m++) wert += its[m].textContent;
        } else {
          var v = c.getElementsByTagName('v')[0];
          var roh = v ? v.textContent : '';
          if (typ === 's') {
            /* Verweis auf die gemeinsamen Zeichenketten. */
            var ix = parseInt(roh, 10);
            wert = (isFinite(ix) && gemeinsam[ix] !== undefined) ? gemeinsam[ix] : '';
          } else if (typ === 'b') {
            wert = roh === '1' ? 'wahr' : 'falsch';
          } else if (roh === '') {
            wert = '';
          } else {
            var z = parseFloat(roh);
            wert = isFinite(z) ? z : roh;
          }
        }

        /* Auf die Spaltennummer setzen, nicht anhängen: Excel lässt
           leere Zellen weg, und ohne das verrutschte alles danach. */
        while (zeile.length < spalte - 1) zeile.push('');
        zeile[spalte - 1] = wert;
      }

      while (raster.length < nr - 1) raster.push([]);
      raster[nr - 1] = zeile;
    }

    return raster;
  }

  /* ---------------------------------------------------------------
     Hilfen für das Auswerten
     --------------------------------------------------------------- */

  /* Eine Zahl aus einer Zelle. Excel liefert Zahlen als Zahl; steht
     dort Text, wird das Schweizer und das deutsche Format verstanden —
     «1'250.50», «1.250,50», «1 250». Was keine Zahl ist, gibt null,
     damit der Aufrufer den Unterschied zu einer echten 0 sieht. */
  X.zahl = function (zelle) {
    if (typeof zelle === 'number') return isFinite(zelle) ? zelle : null;
    var s = String(zelle == null ? '' : zelle).trim();
    if (!s) return null;
    s = s.replace(/[’'`\s]/g, '').replace(/(m²|m2|m³|m3|chf|stk\.?|%)/gi, '').trim();

    /* Stehen Punkt und Komma nebeneinander, entscheidet das hintere:
       «1.250,50» ist deutsch, «1,250.50» englisch. Das vordere ist
       dann der Tausendertrenner und fällt weg. Ohne diese Unterscheidung
       würde aus 1.250,50 die Zahl 1.25. */
    var kPunkt = s.lastIndexOf('.');
    var kKomma = s.lastIndexOf(',');
    if (kPunkt >= 0 && kKomma >= 0) {
      if (kKomma > kPunkt) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (kKomma >= 0) {
      /* Nur Komma: als Dezimaltrenner lesen. «1,250» wird damit zu
         1.25 — im deutschsprachigen Raum die richtige Lesart. Wer
         Tausender trennt, schreibt hier 1'250 oder 1250. */
      s = s.replace(',', '.');
    }

    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  };

  X.text = function (zelle) {
    return String(zelle == null ? '' : zelle).trim();
  };

  /* Findet die Kopfzeile eines Blattes und ordnet Spaltennamen zu.
     Gesucht wird die erste Zeile, in der mindestens zwei der erwarteten
     Überschriften stehen — so stören Titel und Erklärungen darüber
     nicht, und eine verschobene Tabelle wird trotzdem gefunden. */
  X.kopfFinden = function (zeilen, erwartet) {
    var ziel = erwartet.map(function (s) { return s.toLowerCase(); });
    for (var i = 0; i < zeilen.length && i < 30; i++) {
      var z = zeilen[i] || [];
      var treffer = 0, karte = {};
      for (var j = 0; j < z.length; j++) {
        var w = X.text(z[j]).toLowerCase();
        if (!w) continue;
        var k = ziel.indexOf(w);
        if (k >= 0) { karte[erwartet[k]] = j; treffer++; }
      }
      if (treffer >= 2) return { zeile: i, spalten: karte };
    }
    return null;
  };
})(window.APP);
