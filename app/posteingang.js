/* =====================================================================
   Projektrechner · Posteingang

   Ein Landeplatz für Mails, aus denen eine Aufgabe werden soll. Man
   fügt die Mail ein, ohne sich sofort festlegen zu müssen, in welches
   Projekt sie gehört und wer sie erledigt — das kommt beim Zuweisen.

   Warum nicht gleich eine Aufgabe: Aufgaben hängen an einer Sitzung,
   Sitzungen an einem Projekt. Eine Mail, die hereinkommt, kennt ihr
   Projekt nicht. Sie irgendeinem zuzuordnen und später zu verschieben
   hiesse, dass sie zwischendurch im falschen Projekt steht — in dessen
   Protokoll, dessen Auswertung, dessen Aufgabenliste.

   Der Posteingang ist zugleich der Anschlusspunkt für später: Kommen
   Mails einmal über eine Weiterleitung oder aus Power Automate, füllen
   sie dieselbe Tabelle, und hier ändert sich nichts.
   ===================================================================== */
window.APP = window.APP || {};
(function (A) {
  'use strict';

  var U = A.ui, el = U.el;
  var PE = {};
  A.posteingangModul = PE;

  var M = {
    geladen: false,
    laeuft: false,
    fehler: '',
    liste: [],
    entwurf: null,      // was gerade eingefügt, aber noch nicht abgelegt ist
    offen: {}           // welche Einträge aufgeklappt sind
  };
  PE.state = M;

  function verfuegbar() {
    return A.api && A.api.aktiv() && A.api.angemeldet();
  }

  /* ---------------------------------------------------------------
     Laden
     --------------------------------------------------------------- */

  PE.laden = function (erzwingen) {
    if (M.laeuft || (M.geladen && !erzwingen)) return;
    if (!verfuegbar()) { M.geladen = true; return; }
    M.laeuft = true;
    M.fehler = '';
    Promise.resolve(A.store.posteingang(false))
      .then(function (liste) { M.liste = liste || []; M.geladen = true; })
      .catch(function (f) {
        M.fehler = (f && f.message) ? f.message : String(f);
        M.geladen = true;
      })
      .then(function () {
        M.laeuft = false;
        if (A.state.seite === 'meineaufgaben') A.render();
      });
  };

  PE.anzahl = function () { return M.liste.length; };

  /* ---------------------------------------------------------------
     Eine Mail aufnehmen
     --------------------------------------------------------------- */

  /* Der Entwurf entsteht beim Einfügen und wird erst auf Knopfdruck
     abgelegt. So lässt sich vorher sehen — und richtigstellen —, was
     als Betreff und was als Text erkannt wurde. */
  PE.entwurfAus = function (roh) {
    var m = A.mailLesen(roh);
    M.entwurf = {
      betreff: m.betreff,
      inhalt: m.text,
      absender: m.absender,
      absender_name: m.absender_name,
      mail_datum: m.datum,
      erkannt: m.erkannt
    };
    return M.entwurf;
  };

  PE.entwurfAblegen = function () {
    var e = M.entwurf;
    if (!e) return Promise.resolve(null);
    if (!String(e.betreff || '').trim() && !String(e.inhalt || '').trim()) {
      A.meldung('warn', 'Ohne Betreff und ohne Text gibt es nichts abzulegen.');
      return Promise.resolve(null);
    }
    return A.store.posteingangAnlegen({
      betreff: e.betreff, inhalt: e.inhalt,
      absender: e.absender, absender_name: e.absender_name,
      mail_datum: e.mail_datum || null,
      quelle: 'einfuegen'
    }).then(function (neu) {
      if (neu) M.liste.unshift(neu);
      M.entwurf = null;
      A.meldung('ok', 'Im Posteingang abgelegt.');
      A.render();
      return neu;
    }).catch(function (f) {
      A.meldung('warn', 'Nicht abgelegt: ' + fehlerText(f));
      return null;
    });
  };

  /* «relation "posteingang" does not exist» sagt dem Anwender nichts.
     Fehlt die Tabelle, fehlt die Einrichtung — das gehört gesagt. */
  function fehlerText(f) {
    var t = String((f && f.message) || f || '');
    if (/posteingang/i.test(t) && /(does not exist|not find|schema cache)/i.test(t)) {
      return 'Die Tabelle «posteingang» fehlt in der Datenbank. ' +
             'Ein Verwalter richtet sie mit db/update-04.sql ein.';
    }
    return t;
  }
  PE.fehlerText = fehlerText;

  /* ---------------------------------------------------------------
     Zuweisen

     Aus dem Eintrag wird eine Aufgabe in der Sammelsitzung des
     gewählten Projekts — dort, wo auch die von Hand erfassten Aufgaben
     liegen. Die Herkunft bleibt in der Bemerkung stehen: Wer in drei
     Wochen nachfasst, will wissen, von wem die Mail kam.
     --------------------------------------------------------------- */

  PE.herkunftText = function (e) {
    var teile = [];
    var wer = e.absender_name || e.absender;
    if (wer) {
      teile.push('Aus einer Mail von ' + wer +
        (e.absender_name && e.absender ? ' <' + e.absender + '>' : ''));
    } else {
      teile.push('Aus einer Mail');
    }
    if (e.mail_datum) teile.push('vom ' + A.datum(e.mail_datum));
    return teile.join(' ') + '.';
  };

  PE.zuweisen = function (e, ziel) {
    /* Die Sitzungen des Zielprojekts frisch holen, statt die Liste des
       Sammelreiters zu benutzen. Ist der noch nicht geladen, wäre sie
       leer — und A.sammelSitzung legte eine zweite Sammelsitzung neben
       der vorhandenen an. Ab da lägen die von Hand erfassten Aufgaben
       eines Projekts in zwei Zeilen, ohne dass es jemandem auffiele. */
    return Promise.resolve(A.store.sitzungen(ziel.projekt_id)).then(function (liste) {
      var s = A.sammelSitzung(ziel.projekt_id, liste || [], true);

      var bemerkung = [PE.herkunftText(e), String(e.inhalt || '').trim()]
        .filter(Boolean).join('\n\n');

      var punkt = A.defPunkt({
        typ: 'aufgabe',
        text: String(e.betreff || '').trim() || '(ohne Betreff)',
        phase: 'allgemein',
        beteiligter: ziel.beteiligter || '',
        termin: ziel.termin || '',
        status: 'offen',
        bemerkung: bemerkung,
        erfasst_von: A.meineMail()
      });
      s.punkte.push(punkt);

      return A.store.sitzungSpeichern(s).then(function (r) {
        if (!r || !r.ok) {
          throw new Error(r && r.konflikt
            ? 'Jemand anders hat die Sammelsitzung dieses Projekts inzwischen ' +
              'geändert. Bitte neu laden und noch einmal versuchen.'
            : 'Die Aufgabe liess sich nicht speichern.');
        }

        /* Erst wenn die Aufgabe steht, gilt der Eintrag als zugewiesen.
           Andersherum verschwände er aus dem Posteingang, ohne dass es
           die Aufgabe gäbe. */
        return A.store.posteingangZuweisen(e.id, {
          projekt_id: ziel.projekt_id,
          sitzung_id: s.id,
          aufgabe_id: punkt.id
        }).then(function () {
          M.liste = M.liste.filter(function (x) { return x.id !== e.id; });
          /* Der Sammelreiter kennt die neue Aufgabe noch nicht. */
          if (A.meineAufgabenNeuLaden) A.meineAufgabenNeuLaden();
          return punkt;
        });
      });
    });
  };

  PE.verwerfen = function (e) {
    return A.store.posteingangVerwerfen(e.id).then(function () {
      M.liste = M.liste.filter(function (x) { return x.id !== e.id; });
      A.render();
    }).catch(function (f) {
      A.meldung('warn', 'Nicht weggelegt: ' + fehlerText(f));
    });
  };

  /* ---------------------------------------------------------------
     Die Ansicht
     --------------------------------------------------------------- */

  PE.ansicht = function () {
    var out = el('div', {});

    if (!verfuegbar()) {
      out.appendChild(U.hinweis('info',
        'Der Posteingang liegt in der Firmendatenbank und braucht eine Anmeldung.'));
      return out;
    }

    if (!M.geladen && !M.laeuft) PE.laden();
    if (M.laeuft && !M.geladen) {
      out.appendChild(U.hinweis('info', 'Der Posteingang wird geladen …'));
      return out;
    }
    if (M.fehler) {
      out.appendChild(U.hinweis('warn',
        'Der Posteingang liess sich nicht laden: ' + fehlerText(M.fehler)));
      return out;
    }

    out.appendChild(aufnahmeFeld());

    if (M.entwurf) out.appendChild(entwurfBlock());

    if (!M.liste.length && !M.entwurf) {
      out.appendChild(U.hinweis('info',
        'Der Posteingang ist leer. Mail in Outlook öffnen, alles markieren (Strg+A), ' +
        'kopieren (Strg+C) und oben einfügen — Betreff, Absender und Datum werden ' +
        'daraus gelesen.'));
      return out;
    }

    M.liste.forEach(function (e) { out.appendChild(eintragBlock(e)); });
    return out;
  };

  /* --- Das Einfügefeld ------------------------------------------- */

  function aufnahmeFeld() {
    var feld = el('textarea', {
      class: 'peingabe',
      rows: '3',
      placeholder: 'Mail hier einfügen (Strg+V) — oder Text eintippen und als Aufgabe ablegen'
    });

    feld.addEventListener('paste', function (ev) {
      var text = ev.clipboardData && ev.clipboardData.getData('text/plain');
      if (!text) return;
      ev.preventDefault();
      PE.entwurfAus(text);
      feld.value = '';
      A.render();
    });

    var knopf = el('button', { class: 'primary sm', text: 'Als Entwurf übernehmen',
      onclick: function () {
        if (!feld.value.trim()) {
          A.meldung('warn', 'Erst eine Mail einfügen oder etwas eintippen.');
          return;
        }
        PE.entwurfAus(feld.value);
        feld.value = '';
        A.render();
      } });

    /* Eine .eml-Datei lässt sich lesen; .msg ist ein Binärformat, das
       nur Outlook selbst auspackt. Statt daran zu scheitern, sagt die
       Meldung den Weg, der funktioniert. */
    var ablage = el('div', { class: 'peablage' }, [
      el('span', { text: 'oder eine Mail als Datei hierher ziehen (.eml)' })
    ]);

    function hatDateien(ev) {
      var t = ev.dataTransfer && ev.dataTransfer.types;
      return !!t && Array.prototype.indexOf.call(t, 'Files') >= 0;
    }
    ablage.addEventListener('dragover', function (ev) {
      if (!hatDateien(ev)) return;
      ev.preventDefault();
      ablage.classList.add('drueber');
    });
    ablage.addEventListener('dragleave', function () { ablage.classList.remove('drueber'); });
    ablage.addEventListener('drop', function (ev) {
      if (!hatDateien(ev)) return;
      ev.preventDefault();
      ablage.classList.remove('drueber');
      var datei = ev.dataTransfer.files[0];
      if (!datei) return;
      if (/\.msg$/i.test(datei.name)) {
        A.meldung('warn', 'Eine .msg-Datei kann nur Outlook selbst lesen. ' +
          'Öffnen Sie die Mail, markieren Sie alles mit Strg+A, kopieren Sie mit ' +
          'Strg+C und fügen Sie hier ein.');
        return;
      }
      var leser = new FileReader();
      leser.onload = function () {
        PE.entwurfAus(String(leser.result || ''));
        A.render();
      };
      leser.onerror = function () {
        A.meldung('warn', 'Die Datei liess sich nicht lesen.');
      };
      leser.readAsText(datei);
    });

    return U.panel('Mail aufnehmen',
      'Betreff, Absender und Datum werden aus den Kopfzeilen gelesen', [
      el('div', { class: 'panelbody' }, [feld,
        el('div', { style: 'display:flex;gap:10px;align-items:center;margin-top:8px;flex-wrap:wrap' },
          [knopf, ablage])
      ])
    ]);
  }

  /* --- Der Entwurf, bevor er abgelegt wird ----------------------- */

  function entwurfBlock() {
    var e = M.entwurf;

    var zeilen = [
      feldZeile('Betreff', U.zelleTxt(e, 'betreff',
        { platzhalter: 'wird zum Aufgabentext' })),
      feldZeile('Absender', U.zelleTxt(e, 'absender', { platzhalter: 'max@firma.ch' })),
      feldZeile('Datum', U.zelleTxt(e, 'mail_datum', { platzhalter: 'JJJJ-MM-TT' })),
      feldZeile('Text', U.zelleArea(e, 'inhalt', { platzhalter: 'wird zur Bemerkung' }))
    ];

    var hinweis = e.erkannt
      ? U.hinweis('ok', 'Die Kopfzeilen wurden erkannt. Bitte kurz prüfen, dann ablegen.')
      : U.hinweis('info',
          'In der Einfügung standen keine Mail-Kopfzeilen. Die erste Zeile gilt als ' +
          'Betreff, der Rest als Text — beides lässt sich hier ändern.');

    return U.panel('Entwurf', 'noch nicht abgelegt', [
      el('div', { class: 'panelbody' }, [hinweis]),
      el('div', { class: 'panelbody' }, zeilen),
      el('div', { class: 'panelbody', style: 'display:flex;gap:8px' }, [
        el('button', { class: 'primary', text: 'In den Posteingang legen',
          onclick: function () { PE.entwurfAblegen(); } }),
        el('button', { text: 'verwerfen',
          onclick: function () { M.entwurf = null; A.render(); } })
      ])
    ]);
  }

  function feldZeile(label, feld) {
    return el('div', { class: 'pefeld' }, [
      el('label', { text: label }),
      feld
    ]);
  }

  /* --- Ein Eintrag im Posteingang -------------------------------- */

  function eintragBlock(e) {
    var auf = !!M.offen[e.id];

    var kopf = el('div', { class: 'pekopf' }, [
      el('div', { class: 'petitel', text: e.betreff || '(ohne Betreff)' }),
      el('div', { class: 'pemeta', text: herkunftKurz(e) })
    ]);
    kopf.addEventListener('click', function () {
      M.offen[e.id] = !auf; A.render();
    });

    var koerper = [el('div', { class: 'panelbody' }, [kopf])];

    if (auf) {
      if (String(e.inhalt || '').trim()) {
        koerper.push(el('div', { class: 'panelbody' }, [
          el('div', { class: 'petext', text: e.inhalt })
        ]));
      }
      koerper.push(zuweisenBlock(e));
    }

    var panel = U.panel(null, null, koerper);
    panel.classList.add('peeintrag');
    return panel;
  }

  function herkunftKurz(e) {
    var teile = [];
    if (e.absender_name || e.absender) teile.push(e.absender_name || e.absender);
    if (e.mail_datum) teile.push(A.datum(e.mail_datum));
    if (!teile.length) teile.push('eingefügt am ' + A.datum(String(e.erfasst_am || '').slice(0, 10)));
    return teile.join(' · ');
  }

  /* --- Zuweisen -------------------------------------------------- */

  function zuweisenBlock(e) {
    var projekte = (A.store.alle(false) || []).slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'de');
    });

    /* Eine leere Auswahlliste sieht aus wie ein Fehler. Gibt es noch
       kein Projekt, gehört das gesagt — samt dem Weg dorthin. */
    if (!projekte.length) {
      return el('div', { class: 'panelbody pezuweisen' }, [
        U.hinweis('info',
          'Es gibt noch kein Projekt, dem sich diese Mail zuordnen liesse. ' +
          'Legen Sie links unten eines an — danach steht es hier zur Wahl. ' +
          'Der Eintrag bleibt solange im Posteingang.'),
        el('div', { style: 'margin-top:8px' }, [
          el('button', { class: 'ghost sm', text: 'weglegen',
            title: 'Aus dem Posteingang nehmen, ohne eine Aufgabe daraus zu machen',
            onclick: function () { PE.verwerfen(e); } })
        ])
      ]);
    }

    var ziel = { projekt_id: projekte[0].id, beteiligter: '', termin: '' };

    var pWahl = el('select');
    projekte.forEach(function (p) {
      pWahl.appendChild(el('option', { value: p.id, text: p.name || 'Ohne Namen' }));
    });

    var bWahl = el('select');
    function beteiligteFuellen() {
      U.leeren(bWahl);
      bWahl.appendChild(el('option', { value: '', text: '— niemandem zugewiesen —' }));
      var p = A.store.load(ziel.projekt_id);
      A.beteiligteListe(p).forEach(function (b) {
        bWahl.appendChild(el('option', { value: b.id,
          text: b.name + (b.firma ? ' · ' + b.firma : '') }));
      });
      ziel.beteiligter = bWahl.value;
    }

    pWahl.addEventListener('change', function () {
      ziel.projekt_id = pWahl.value;
      beteiligteFuellen();
    });
    bWahl.addEventListener('change', function () { ziel.beteiligter = bWahl.value; });

    var termin = el('input', { type: 'date' });
    termin.addEventListener('change', function () { ziel.termin = termin.value; });

    if (projekte.length) beteiligteFuellen();

    var knopf = el('button', { class: 'primary sm', text: 'Als Aufgabe anlegen',
      onclick: function () {
        if (!ziel.projekt_id) {
          A.meldung('warn', 'Es gibt noch kein Projekt, dem sich die Mail zuordnen liesse.');
          return;
        }
        knopf.disabled = true;
        PE.zuweisen(e, ziel).then(function () {
          A.meldung('ok', 'Als Aufgabe angelegt.');
          A.render();
        }).catch(function (f) {
          knopf.disabled = false;
          A.meldung('warn', 'Nicht angelegt: ' + fehlerText(f));
        });
      } });

    return el('div', { class: 'panelbody pezuweisen' }, [
      feldZeile('Projekt', pWahl),
      feldZeile('Zuständig', bWahl),
      feldZeile('Termin', termin),
      el('div', { style: 'display:flex;gap:8px;margin-top:8px' }, [
        knopf,
        el('button', { class: 'ghost sm', text: 'weglegen',
          title: 'Aus dem Posteingang nehmen, ohne eine Aufgabe daraus zu machen',
          onclick: function () { PE.verwerfen(e); } })
      ])
    ]);
  }
})(window.APP);
