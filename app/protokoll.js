/* =====================================================================
   Projektrechner · Sitzungsprotokolle

   Ein Protokoll wird hier geschrieben und nicht in Word. Jeder Punkt
   ist Aufgabe, Entscheid oder Info und hängt an einer SIA-Phase und an
   einem Beteiligten — daraus entsteht die Gliederung (2.1.3) und
   später der Terminplan.

   Die Protokolle liegen in einer eigenen Tabelle, nicht im Projekt.
   Deshalb wird auf dieser Seite ausdrücklich gespeichert; die übrigen
   Seiten sichern automatisch.
   ===================================================================== */
window.APP = window.APP || {};
(function (A) {
  'use strict';

  var U = A.ui, V = A.views, el = U.el;
  var P = {};
  A.protokolle = P;

  /* Stand dieser Seite. Bewusst ausserhalb von A.state: die Protokolle
     gehören nicht zum Projekt und überleben einen Seitenwechsel. */
  var S = {
    projekt: null,      // Id des geladenen Projekts
    liste: [],          // alle Sitzungen des Projekts
    offen: null,        // gerade bearbeitete Sitzung
    geladen: false,
    laedt: false,
    fehler: null,
    schmutzig: false    // ungespeicherte Änderungen
  };

  P.stand = S;

  function schmutzig() { S.schmutzig = true; kopfNachfuehren(); }

  /* ---------------------------------------------------------------
     Laden und Speichern
     --------------------------------------------------------------- */

  P.laden = function (projektId, erzwingen) {
    if (S.laedt) return Promise.resolve();
    if (S.geladen && S.projekt === projektId && !erzwingen) return Promise.resolve();
    /* Nach einem Fehlschlag nicht von selbst wieder versuchen — sonst
       dreht sich Laden → Zeichnen → Laden im Kreis. */
    if (S.fehler && S.projekt === projektId && !erzwingen) return Promise.resolve();
    S.laedt = true; S.fehler = null; S.tabelleFehlt = false; S.fehlerStatus = 0;
    return Promise.resolve(A.store.sitzungen(projektId))
      .then(function (liste) {
        S.liste = liste || [];
        S.projekt = projektId;
        S.geladen = true;
        S.laedt = false;
        if (S.offen) {
          /* Nach dem Neuladen dieselbe Sitzung wieder öffnen */
          var w = S.liste.find(function (x) { return x.id === S.offen.id; });
          S.offen = w || null;
        }
        A.render();
      })
      .catch(function (f) {
        S.laedt = false; S.projekt = projektId;
        S.fehler = f.message || String(f);
        /* Fehlt die Tabelle, ist das kein Ausfall, sondern ein noch
           nicht eingespielter Nachtrag — das muss die Meldung sagen. */
        S.fehlerStatus = f.status || 0;
        S.tabelleFehlt = f.status === 404 ||
          (f.daten && f.daten.code === 'PGRST205') ||
          /could not find the table|does not exist|relation .* does not exist/i
            .test(String(f.message || ''));
        A.render();
      });
  };

  /* Ein abgelehnter Schreibvorgang muss sichtbar werden. Ohne diesen
     Fang endete ein Serverfehler in einer unbehandelten Zusage — der
     Knopf tat dann scheinbar gar nichts. */
  P.speichern = function (s) {
    return Promise.resolve(A.store.sitzungSpeichern(s)).catch(function (f) {
      A.meldung('warn', 'Das Protokoll konnte nicht gespeichert werden: ' +
        (f && f.message ? f.message : String(f)) + rechteHinweis(f));
      return { ok: false, fehler: f };
    }).then(function (erg) {
      if (!erg || erg.ok === false) {
        if (erg && erg.konflikt) {
          A.meldung('warn', 'Dieses Protokoll wurde zwischenzeitlich von jemand anderem ' +
            'gespeichert. Bitte neu laden — Ihre Eingaben gehen dabei verloren.');
        } else if (!erg || !erg.fehler) {
          A.meldung('warn', 'Speichern nicht möglich — fehlen Ihnen die Rechte?' +
            rechteHinweis(null));
        }
        return false;
      }
      if (erg.sitzung) {
        var i = S.liste.findIndex(function (x) { return x.id === erg.sitzung.id; });
        if (i >= 0) S.liste[i] = erg.sitzung; else S.liste.push(erg.sitzung);
        if (S.offen && S.offen.id === erg.sitzung.id) S.offen = erg.sitzung;
      }
      S.schmutzig = false;
      return true;
    });
  };

  /* Die häufigste Ursache abgelehnter Schreibvorgänge auf einer frisch
     angelegten Tabelle: Die Rechteregeln fehlen. Dann darf niemand
     etwas — auch der Verwalter nicht. */
  function rechteHinweis(f) {
    var text = f && f.message ? String(f.message) : '';
    if (/row-level security|permission denied|violates row/i.test(text) || !f) {
      return ' — fehlen der Tabelle «sitzungen» die Rechteregeln? ' +
             'Dann db/update-02.sql noch einmal im SQL-Editor ausführen; ' +
             'die Kontrollzeile am Ende muss «sitzungen | true | 4» zeigen.';
    }
    return '';
  }

  /* ---------------------------------------------------------------
     Seite
     --------------------------------------------------------------- */

  V.protokolle = function (p) {
    var out = el('div', {}, [U.kopf('Protokolle',
      'Sitzungsprotokolle dieses Projekts. Aufgaben mit Termin gehen in den Terminplan über.')]);

    if (!p.beteiligte || !p.beteiligte.length) {
      out.appendChild(U.hinweis('info',
        'Für ein Protokoll braucht es Beteiligte. Legen Sie sie auf der Seite ' +
        '<b>Adressliste</b> an — sie sind Teilnehmer, Zuständige und Empfänger.'));
    }

    if (S.projekt !== p.id) {
      S.offen = null; S.geladen = false; S.liste = [];
      S.fehler = null; S.tabelleFehlt = false;
    }

    /* Der Fehlerfall zuerst: Sonst stünde hier für immer «wird
       geladen», weil der Ladeversuch nach einem Fehlschlag bewusst
       nicht wiederholt wird. */
    if (S.fehler) {
      out.appendChild(P.fehlerhinweis());
      return out;
    }
    if (!S.geladen && !S.laedt) {
      P.laden(p.id);
      out.appendChild(el('div', { class: 'panelbody muted', text: 'Protokolle werden geladen …' }));
      return out;
    }
    if (S.laedt) {
      out.appendChild(el('div', { class: 'panelbody muted', text: 'Protokolle werden geladen …' }));
      return out;
    }

    out.appendChild(S.offen ? editor(p, S.offen) : uebersicht(p));
    return out;
  };

  /* Ein Hinweis, der sagt, was zu tun ist — und ein Knopf, der es
     nach dem Einspielen sofort nachprüft, ohne Neuladen der Seite.
     Wird auch vom Terminplan verwendet. */
  P.fehlerhinweis = function () {
    var box = el('div', {});
    if (S.tabelleFehlt) {
      box.appendChild(U.hinweis('warn',
        'Die Tabelle <code>sitzungen</code> fehlt in der Datenbank. Sie kam mit den ' +
        'Protokollen dazu und wird einmalig nachgetragen: Im Supabase-SQL-Editor den ' +
        'Inhalt von <code>db/update-02.sql</code> ausführen — das Skript ist wiederholbar ' +
        'und ändert an bestehenden Daten nichts. Danach hier auf ' +
        '<b>Erneut versuchen</b> klicken.'));
    } else {
      box.appendChild(U.hinweis('warn',
        'Die Protokolle konnten nicht geladen werden: ' + A.escape(S.fehler || '')));
    }
    box.appendChild(el('div', { class: 'panelbody noprint' }, [
      el('button', { class: 'primary', text: 'Erneut versuchen', onclick: function () {
        var id = A.state.p.id;
        S.fehler = null; S.tabelleFehlt = false;
        P.laden(id, true);
        A.render();
      } })
    ]));
    return box;
  };

  /* ---------------------------------------------------------------
     Übersicht aller Protokolle
     --------------------------------------------------------------- */

  function uebersicht(p) {
    var box = el('div', {});
    var reihen = A.reihenListe();

    var zeilen = S.liste.slice().sort(function (a, b) {
      return String(b.datum || '').localeCompare(String(a.datum || ''));
    }).map(function (s) {
      var r = A.reihe(s.reihe);
      var offen = zaehleOffen(s);
      return el('tr', {}, [
        el('td', { style: 'width:110px' }, [
          el('a', { href: '#', text: (r ? r.kuerzel || r.label : s.reihe) + ' ' + s.nummer,
            onclick: function (e) { e.preventDefault(); oeffnen(s); } })
        ]),
        el('td', { text: r ? r.label : s.reihe }),
        el('td', { class: 'n', style: 'width:100px', text: A.datum(s.datum) }),
        el('td', { class: 'muted', text: s.ort || '—' }),
        el('td', { class: 'n', style: 'width:80px', text: String((s.punkte || []).length) }),
        el('td', { class: 'n', style: 'width:110px' }, [
          offen ? el('span', { class: 'tag warn', text: offen + ' offen' })
                : el('span', { class: 'muted', text: '—' })
        ]),
        el('td', { style: 'width:110px' }, [
          el('span', { class: 'tag' + (s.status === 'versendet' ? ' pos' : ''),
            text: s.status === 'versendet' ? 'versendet' : 'Entwurf' })
        ]),
        el('td', { class: 'w1' }, [
          el('button', { class: 'ghost sm schreibend', text: '×', title: 'Protokoll löschen',
            onclick: function () { loeschen(s); } })
        ])
      ]);
    });

    if (!zeilen.length) {
      zeilen.push(el('tr', {}, [el('td', { colspan: 8, class: 'muted',
        text: 'Noch kein Protokoll erfasst.' })]));
    }

    var koerper = [el('div', { class: 'panelbody' }, [U.tabelle([
      { label: 'Nr.' }, { label: 'Reihe' }, { label: 'Datum', n: true },
      { label: 'Ort' }, { label: 'Punkte', n: true }, { label: 'Pendenzen', n: true },
      { label: 'Status' }, { label: '' }
    ], zeilen)])];

    /* Neues Protokoll: Reihe wählen, Nummer läuft je Reihe weiter */
    var wahl = el('select', { style: 'max-width:220px' });
    reihen.forEach(function (r) {
      wahl.appendChild(el('option', { value: r.id, text: r.label }));
    });

    koerper.push(el('div', { class: 'panelbody',
      style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, [
      wahl,
      el('button', { class: 'primary schreibend', text: '+ Protokoll anlegen', onclick: function () {
        var s = A.defSitzung(A.state.p.id, wahl.value);
        s.nummer = A.naechsteSitzungsnummer(S.liste, wahl.value);
        s.verfasser = A.state.p.bearbeiter || '';
        /* Alle Beteiligten sind zunächst dabei — austragen ist
           schneller als zwölf Haken setzen. */
        s.teilnehmer = A.beteiligteListe(A.state.p).map(function (b) { return b.id; });
        s.verteiler = A.beteiligteListe(A.state.p)
          .filter(function (b) { return b.verteiler; }).map(function (b) { return b.id; });
        /* Die Standardtraktanden der Reihe plus die des Projekts. Sie
           sind danach ganz normale Punkte. */
        s.punkte = A.standardpunkte(A.state.p, wahl.value);
        S.liste.push(s);
        /* Sofort sichern: sonst wäre die Nummer vergeben, das Protokoll
           aber nach einem Seitenwechsel verschwunden. Scheitert das
           Schreiben, verschwindet der Eintrag wieder — sonst stünde ein
           Protokoll in der Liste, das es nirgends gibt. */
        P.speichern(s).then(function (ok) {
          if (!ok) {
            S.liste = S.liste.filter(function (x) { return x.id !== s.id; });
            A.render();
            return;
          }
          var gesichert = S.liste.find(function (x) { return x.id === s.id; }) || s;
          oeffnen(gesichert);
        });
      } }),
      el('span', { class: 'muted', style: 'font-size:11.5px',
        text: 'Die Reihen werden unter Verwaltung gepflegt.' })
    ]));

    var nOffen = gesamtOffen();
    box.appendChild(U.panel('Protokolle', S.liste.length
      ? S.liste.length + (S.liste.length === 1 ? ' Protokoll' : ' Protokolle') + ' · ' +
        nOffen + (nOffen === 1 ? ' offene Aufgabe' : ' offene Aufgaben')
      : 'noch keines erfasst', koerper));

    /* Alle offenen Aufgaben des Projekts, quer über die Reihen */
    box.appendChild(pendenzenPanel(p));
    box.appendChild(standardpunktePanel(p));
    return box;
  }

  /* Was in diesem Projekt in jeder Sitzung vorkommt — zusätzlich zu
     den firmenweiten Traktanden der Reihe. */
  function standardpunktePanel(p) {
    if (!Array.isArray(p.standardpunkte)) p.standardpunkte = [];
    var reihen = A.reihenListe();

    var zeilen = p.standardpunkte.map(function (t, i) {
      return el('tr', {}, [
        el('td', {}, [U.zelleTxt(t, 'text', { platzhalter: 'z. B. Stand Baugesuch Kanton' })]),
        el('td', { style: 'width:120px' }, [
          U.zelleSel(t, 'typ', A.PUNKT_TYPEN.map(function (x) {
            return { id: x.id, label: x.label }; }))]),
        el('td', { style: 'width:180px' }, [
          U.zelleSel(t, 'phase', A.SIA_PHASEN.map(function (ph) {
            return { id: ph.id, label: ph.sia ? ph.sia + ' · ' + ph.label : ph.label }; }))]),
        el('td', { style: 'width:160px' }, [
          U.zelleSel(t, 'thema', [{ id: '', label: '— ohne Thema —' }].concat(
            A.themenListe().map(function (x) {
              return { id: x.id, label: x.label }; })))]),
        el('td', { style: 'width:170px' }, [
          U.zelleSel(t, 'reihe', [{ id: '', label: 'alle Reihen' }].concat(
            reihen.map(function (r) { return { id: r.id, label: r.label }; })))]),
        el('td', { class: 'w1' }, [el('button', { class: 'ghost sm schreibend', text: '×',
          onclick: function () {
            p.standardpunkte.splice(i, 1); A.markDirty(); A.render();
          } })])
      ]);
    });
    if (!zeilen.length) {
      zeilen.push(el('tr', {}, [el('td', { colspan: 6, class: 'muted',
        text: 'Keine projekteigenen Standardpunkte.' })]));
    }

    var firmenweit = A.traktandenLesen();
    var anzahl = reihen.reduce(function (n, r) {
      return n + ((firmenweit[r.id] || []).length);
    }, 0);

    return U.panel('Standardpunkte dieses Projekts',
      'kommen in jedem neuen Protokoll dazu · firmenweit sind ' + anzahl + ' Punkte gepflegt', [
      el('div', { class: 'panelbody' }, [U.tabelle([
        { label: 'Traktandum' }, { label: 'Typ' }, { label: 'Phase' },
        { label: 'Thema' }, { label: 'gilt für' }, { label: '' }
      ], zeilen)]),
      el('div', { class: 'panelbody noprint' }, [
        el('button', { class: 'schreibend', text: '+ Standardpunkt', onclick: function () {
          p.standardpunkte.push({ id: A.uid(), text: '', typ: 'info',
            phase: 'allgemein', thema: '', prio: '', reihe: '' });
          A.markDirty(); A.render();
        } }),
        U.hinweis('info', 'Beim Anlegen eines Protokolls werden zuerst die firmenweiten ' +
          'Traktanden der gewählten Reihe eingesetzt (Verwaltung), danach diese hier. ' +
          'Anschliessend sind es gewöhnliche Punkte — was in einer Sitzung nicht vorkommt, ' +
          'wird dort gelöscht.')
      ])
    ]);
  }

  function oeffnen(s) { S.offen = s; S.schmutzig = false; A.render(); window.scrollTo(0, 0); }

  function loeschen(s) {
    var neu = !s.version;
    if (!neu && !window.confirm('Protokoll ' + s.nummer + ' wirklich löschen? ' +
        'Die Aufgaben darin verschwinden auch aus dem Terminplan.')) return;
    S.liste = S.liste.filter(function (x) { return x.id !== s.id; });
    if (S.offen && S.offen.id === s.id) S.offen = null;
    if (neu) { A.render(); return; }
    Promise.resolve(A.store.sitzungLoeschen(s.id))
      .then(function () { A.meldung('ok', 'Protokoll gelöscht.'); A.render(); })
      .catch(function (f) { A.meldung('warn', f.message); });
  }

  function zaehleOffen(s) {
    return (s.punkte || []).filter(function (pt) {
      return pt.typ === 'aufgabe' && pt.status === 'offen';
    }).length;
  }

  function gesamtOffen() {
    return S.liste.reduce(function (n, s) { return n + zaehleOffen(s); }, 0);
  }

  /* Alle offenen Aufgaben — die Pendenzenliste des Projekts */
  P.offenePunkte = function (ausser) {
    var raus = [];
    S.liste.forEach(function (s) {
      if (ausser && s.id === ausser.id) return;
      (s.punkte || []).forEach(function (pt) {
        if (pt.typ === 'aufgabe' && pt.status === 'offen') {
          raus.push({ sitzung: s, punkt: pt });
        }
      });
    });
    raus.sort(function (a, b) {
      var x = a.punkt.termin || '9999', y = b.punkt.termin || '9999';
      return x.localeCompare(y);
    });
    return raus;
  };

  function pendenzenPanel(p) {
    var offen = P.offenePunkte(null);
    var zeilen = offen.map(function (o) {
      var b = A.beteiligteListe(p).find(function (x) { return x.id === o.punkt.beteiligter; });
      var r = A.reihe(o.sitzung.reihe);
      var t = A.thema(o.punkt.thema);
      var pr = A.prioritaet(o.punkt.prio);
      return el('tr', {}, [
        el('td', { class: 'muted', style: 'width:120px',
          text: (r ? r.kuerzel || r.label : '') + ' ' + o.sitzung.nummer + ' · ' +
                A.datum(o.sitzung.datum) }),
        el('td', { style: 'width:150px' }, t ? [
          el('span', { class: 'themenpunkt', style: 'background:' + t.farbe }),
          el('span', { text: ' ' + t.label })
        ] : [el('span', { class: 'muted', text: '—' })]),
        el('td', { text: o.punkt.text || '—' }),
        el('td', { style: 'width:74px' }, pr.id
          ? [el('span', { class: 'tag' + (pr.klasse ? ' ' + pr.klasse : ''), text: pr.label })]
          : [el('span', { class: 'muted', text: '—' })]),
        el('td', { style: 'width:150px', text: b ? (b.name || b.kuerzel) : 'ohne Zuständigkeit' }),
        terminZelle(o.punkt.termin)
      ]);
    });
    if (!zeilen.length) {
      zeilen.push(el('tr', {}, [el('td', { colspan: 6, class: 'muted',
        text: 'Keine offenen Aufgaben.' })]));
    }
    return U.panel('Offene Aufgaben', 'aus allen Protokollen dieses Projekts', [
      el('div', { class: 'panelbody' }, [U.tabelle([
        { label: 'Herkunft' }, { label: 'Thema' }, { label: 'Aufgabe' },
        { label: 'Prio' }, { label: 'Zuständig' }, { label: 'Termin', n: true }
      ], zeilen)])
    ]);
  }

  /* Termin mit Ampel: überfällig ist rot, in den nächsten 14 Tagen gelb */
  function terminZelle(termin) {
    if (!termin) return el('td', { class: 'n muted', style: 'width:110px', text: 'ohne Termin' });
    var heute = A.heute();
    var klasse = '';
    if (termin < heute) klasse = 'neg';
    else if (tageBis(termin) <= 14) klasse = 'warn';
    return el('td', { class: 'n', style: 'width:110px' }, [
      el('span', { class: klasse ? 'tag ' + klasse : '', text: A.datum(termin) })
    ]);
  }

  function tageBis(datum) {
    var d = Date.parse(datum), h = Date.parse(A.heute());
    if (!isFinite(d) || !isFinite(h)) return 9999;
    return Math.round((d - h) / 86400000);
  }

  /* ---------------------------------------------------------------
     Editor für ein Protokoll
     --------------------------------------------------------------- */

  var kopfBox = null;

  function kopfNachfuehren() {
    if (!kopfBox || !S.offen) return;
    U.leeren(kopfBox);
    kopfBox.appendChild(el('span', { class: 'tag' + (S.schmutzig ? ' warn' : ' pos'),
      text: S.schmutzig ? 'nicht gespeichert' : 'gespeichert' }));
  }

  function editor(p, s) {
    var box = el('div', {});
    var r = A.reihe(s.reihe);
    var versendet = s.status === 'versendet';
    var beteiligte = A.beteiligteListe(p);

    /* --- Kopfzeile mit Aktionen ---------------------------------- */
    kopfBox = el('span', {});
    kopfNachfuehren();

    box.appendChild(el('div', { class: 'seitenkopf noprint',
      style: 'display:flex;align-items:baseline;gap:12px;flex-wrap:wrap' }, [
      el('button', { class: 'ghost sm', text: '‹ alle Protokolle', onclick: function () {
        if (S.schmutzig && !window.confirm('Es gibt ungespeicherte Änderungen. Trotzdem zurück?')) return;
        S.offen = null; A.render();
      } }),
      el('h1', { style: 'margin:0;font-size:19px',
        text: (r ? r.label : s.reihe) + ' Nr. ' + s.nummer }),
      kopfBox,
      versendet ? el('span', { class: 'tag pos',
        text: 'versendet am ' + A.datum(s.versendet_am) }) : null,
      el('span', { class: 'sp', style: 'margin-left:auto;display:flex;gap:8px;flex-wrap:wrap' }, [
        el('button', { class: 'primary schreibend', text: 'Speichern', onclick: function () {
          P.speichern(s).then(function (ok) {
            if (ok) { A.meldung('ok', 'Protokoll gespeichert.'); A.render(); }
          });
        } }),
        el('button', { text: 'Drucken / als PDF sichern', onclick: function () {
          if (S.schmutzig) {
            A.meldung('warn', 'Bitte zuerst speichern — sonst steht der alte Stand auf dem Papier.');
            return;
          }
          window.print();
        } }),
        el('button', { class: 'schreibend', text: versendet ? 'Erneut versenden' : 'Versenden …',
          onclick: function () { versandDialog(p, s); } })
      ])
    ]));

    /* Kopf für das Papier: Logo, Absender, Sitzung. Die Bildschirmzeile
       darüber trägt die Knöpfe und wird nicht gedruckt — ohne diesen
       Block stünde das Protokoll ohne Titel auf dem Blatt. */
    box.appendChild(druckkopf(p, s, r, versendet));

    if (versendet) {
      box.appendChild(U.hinweis('info', 'Dieses Protokoll ist <b>versendet</b>. Änderungen daran ' +
        'sind nur noch Verwaltern möglich — Korrekturen gehören in das nächste Protokoll.'));
    }

    /* --- Steckbrief ---------------------------------------------- */
    var kopfKoerper = U.body([
      feldSel(s, 'reihe', A.reihenListe().map(function (x) {
        return { id: x.id, label: x.label };
      }), 'Sitzungsreihe'),
      feldNum(s, 'nummer', 'Nummer'),
      feldDatum(s, 'datum', 'Datum'),
      feldTxt(s, 'ort', 'Ort', 'z. B. Baubüro Aarau'),
      feldTxt(s, 'zeit_von', 'von', '09:00'),
      feldTxt(s, 'zeit_bis', 'bis', '11:00'),
      feldTxt(s, 'verfasser', 'Protokollführung', 'Name')
    ], 'c4');

    var kopfPanel = U.panel('Sitzung', A.state.p.name || '', [kopfKoerper]);
    kopfPanel.classList.add('sitzungskopf');
    box.appendChild(kopfPanel);

    /* --- Teilnehmer ---------------------------------------------- */
    box.appendChild(teilnehmerPanel(p, s, beteiligte));

    /* --- Pendenzen aus früheren Sitzungen ------------------------ */
    var pend = P.offenePunkte(s).filter(function (o) { return o.sitzung.reihe === s.reihe; });
    if (pend.length) box.appendChild(pendenzenBlock(p, s, pend));

    /* --- Traktanden ---------------------------------------------- */
    box.appendChild(punktePanel(p, s, beteiligte));

    var fuss = druckfuss(p);
    if (fuss) box.appendChild(fuss);

    return box;
  }

  /* Der Briefkopf des gedruckten Protokolls. Logo links, Absender
     rechts, darunter Projekt und Sitzung — die Form, die man von einem
     Bausitzungsprotokoll erwartet. */
  function druckkopf(p, s, r, versendet) {
    var bk = A.absender(p);
    var logo = A.logoFuer(p);

    var kopfzeile = el('div', {
      style: 'display:flex;align-items:flex-start;gap:18px;' +
             'border-bottom:1.5px solid #232c39;padding-bottom:7px;margin-bottom:9px' }, [
      logo && logo.bild
        ? el('img', { src: logo.bild, alt: logo.label,
            style: 'max-height:42px;max-width:210px;object-fit:contain' })
        : el('div', { style: 'font-size:15px;font-weight:700', text: bk.firma || '' }),
      el('div', { style: 'margin-left:auto;text-align:right;font-size:10px;color:#3c4553;' +
                         'line-height:1.5' }, [
        el('div', { style: 'font-weight:640', text: logo && logo.bild ? bk.firma : '' }),
        el('div', { text: bk.adresse || '' })
      ])
    ]);

    var titel = el('div', {}, [
      el('div', { style: 'font-size:15px;font-weight:680',
        text: (r ? r.label : s.reihe) + ' Nr. ' + s.nummer }),
      el('div', { style: 'font-size:13px;margin-top:1px', text: p.name || 'Projekt' }),
      el('div', { style: 'font-size:11px;color:#6b7484;margin-top:3px',
        text: [A.datum(s.datum),
               s.zeit_von ? s.zeit_von + (s.zeit_bis ? '–' + s.zeit_bis : '') + ' Uhr' : '',
               s.ort, p.ort && p.ort !== s.ort ? 'Projekt ' + p.ort : '',
               s.verfasser ? 'Protokoll: ' + s.verfasser : '',
               versendet ? 'versendet am ' + A.datum(s.versendet_am) : 'Entwurf']
          .filter(Boolean).join(' · ') })
    ]);

    return el('div', { class: 'nurdruck protokollkopf' }, [kopfzeile, titel]);
  }

  function druckfuss(p) {
    var bk = A.absender(p);
    if (!bk.fusszeile) return null;
    return el('div', { class: 'nurdruck',
      style: 'margin-top:12px;padding-top:6px;border-top:1px solid #cfd6df;' +
             'font-size:10px;color:#6b7484', text: bk.fusszeile });
  }

  /* Teilnehmer, Entschuldigte und Verteiler — drei Haken je Person */
  function teilnehmerPanel(p, s, beteiligte) {
    var zeilen = beteiligte.map(function (b) {
      return el('tr', {}, [
        el('td', { style: 'width:70px', text: b.kuerzel || '—' }),
        el('td', { text: b.name || '—' }),
        el('td', { class: 'muted', text: b.firma || '' }),
        el('td', { class: 'muted', style: 'width:170px', text: b.rolle || '' }),
        hakenZelle(s, 'teilnehmer', b.id),
        hakenZelle(s, 'entschuldigt', b.id),
        hakenZelle(s, 'verteiler', b.id),
        el('td', { class: 'muted', style: 'width:190px', text: b.mail || 'ohne Mailadresse' })
      ]);
    });
    if (!zeilen.length) {
      zeilen.push(el('tr', {}, [el('td', { colspan: 8, class: 'muted',
        text: 'Keine Beteiligten — bitte zuerst die Adressliste füllen.' })]));
    }
    return U.panel('Teilnehmer', 'anwesend, entschuldigt und wer das Protokoll bekommt', [
      el('div', { class: 'panelbody' }, [U.tabelle([
        { label: 'Kürzel' }, { label: 'Name' }, { label: 'Firma' }, { label: 'Rolle' },
        { label: 'anwesend' }, { label: 'entschuldigt' }, { label: 'Verteiler' },
        { label: 'E-Mail' }
      ], zeilen)])
    ]);
  }

  function hakenZelle(s, feld, id) {
    var c = el('input', { type: 'checkbox', style: 'width:auto',
      checked: (s[feld] || []).indexOf(id) >= 0 ? '' : null });
    c.addEventListener('change', function () {
      if (!Array.isArray(s[feld])) s[feld] = [];
      var i = s[feld].indexOf(id);
      if (c.checked && i < 0) s[feld].push(id);
      if (!c.checked && i >= 0) s[feld].splice(i, 1);
      /* Anwesend und entschuldigt schliessen einander aus */
      if (c.checked && feld === 'teilnehmer') strichAus(s, 'entschuldigt', id);
      if (c.checked && feld === 'entschuldigt') strichAus(s, 'teilnehmer', id);
      schmutzig(); A.render();
    });
    return el('td', { style: 'width:96px' }, [c]);
  }

  function strichAus(s, feld, id) {
    var i = (s[feld] || []).indexOf(id);
    if (i >= 0) s[feld].splice(i, 1);
  }

  /* Offene Aufgaben früherer Sitzungen derselben Reihe. Sie werden
     nicht kopiert, sondern an ihrem Ursprungsort geändert — sonst
     stünde dieselbe Aufgabe in fünf Protokollen und niemand wüsste,
     welche Fassung gilt. */
  function pendenzenBlock(p, s, pend) {
    var zeilen = pend.map(function (o) {
      var pt = o.punkt;
      var b = A.beteiligteListe(p).find(function (x) { return x.id === pt.beteiligter; });
      var r = A.reihe(o.sitzung.reihe);
      return el('tr', {}, [
        el('td', { class: 'muted', style: 'width:120px',
          text: (r ? r.kuerzel || r.label : '') + ' ' + o.sitzung.nummer }),
        el('td', { text: pt.text || '—' }),
        el('td', { style: 'width:150px', text: b ? (b.name || b.kuerzel) : 'ohne Zuständigkeit' }),
        el('td', { style: 'width:140px' }, [datumFeld(pt, 'termin', function () {
          fremdSpeichern(o.sitzung);
        })]),
        el('td', { style: 'width:150px' }, [(function () {
          var sel = el('select');
          A.PUNKT_STATUS.forEach(function (st) {
            sel.appendChild(el('option', { value: st.id, text: st.label,
              selected: pt.status === st.id ? '' : null }));
          });
          sel.addEventListener('change', function () {
            pt.status = sel.value;
            if (sel.value === 'erledigt') {
              pt.erledigt_am = s.datum || A.heute();
              pt.erledigt_in = s.id;
            } else { pt.erledigt_am = ''; pt.erledigt_in = ''; }
            fremdSpeichern(o.sitzung);
          });
          return sel;
        })()]),
        el('td', { class: 'w1' }, [el('button', { class: 'ghost sm schreibend',
          text: 'übernehmen', title: 'Als neuen Punkt in dieses Protokoll holen',
          onclick: function () {
            s.punkte.push(A.defPunkt({ phase: pt.phase, beteiligter: pt.beteiligter,
              typ: 'aufgabe', text: pt.text, termin: pt.termin,
              bemerkung: 'übernommen aus ' + (A.reihe(o.sitzung.reihe) || {}).label +
                         ' Nr. ' + o.sitzung.nummer }));
            pt.status = 'verschoben';
            fremdSpeichern(o.sitzung);
            schmutzig(); A.render();
          } })])
      ]);
    });

    return U.panel('Pendenzen', 'offene Aufgaben aus früheren Sitzungen dieser Reihe', [
      el('div', { class: 'panelbody' }, [U.tabelle([
        { label: 'aus' }, { label: 'Aufgabe' }, { label: 'Zuständig' },
        { label: 'Termin' }, { label: 'Status' }, { label: '' }
      ], zeilen)]),
      el('div', { class: 'panelbody noprint' }, [
        U.hinweis('info', 'Änderungen an einer Pendenz wirken auf das <b>Ursprungsprotokoll</b> ' +
          'und werden sofort gespeichert. Mit <b>übernehmen</b> wandert die Aufgabe als neuer ' +
          'Punkt in dieses Protokoll; die alte gilt dann als verschoben.')
      ])
    ]);
  }

  /* Eine fremde Sitzung sofort sichern — die Änderung gehört ihr. */
  function fremdSpeichern(sitzung) {
    Promise.resolve(A.store.sitzungSpeichern(sitzung)).then(function (erg) {
      if (!erg || erg.ok === false) {
        A.meldung('warn', 'Die Pendenz konnte nicht gespeichert werden.');
      } else {
        if (erg.sitzung) {
          var i = S.liste.findIndex(function (x) { return x.id === erg.sitzung.id; });
          if (i >= 0) S.liste[i] = erg.sitzung;
        }
        A.meldung('ok', 'Pendenz nachgeführt.');
      }
      A.render();
    });
  }

  /* --- Traktanden: die eigentliche Protokollarbeit ---------------- */
  function punktePanel(p, s, beteiligte) {
    var gruppen = A.gliederung(p, s);
    var koerper = [];

    if (!gruppen.length) {
      koerper.push(el('div', { class: 'panelbody muted',
        text: 'Noch kein Punkt erfasst.' }));
    }

    /* Eine Tabelle je Phase; die Zuständigkeit steht als Gruppenzeile
       darin. Ein Tabellenkopf je Planer wäre unruhig und würde das
       Protokoll auf dem Papier zerreissen. */
    gruppen.forEach(function (g) {
      var zeilen = [];
      /* Eine einzige Gruppe ohne Zuständigkeit braucht keine
         Zwischenzeile — sie sagt nichts und zerreisst die Tabelle. */
      var nurOhne = g.planer.length === 1 && !g.planer[0].id;
      g.planer.forEach(function (pl) {
        if (!nurOhne) {
          zeilen.push(el('tr', { class: 'sum' }, [
            el('td', { class: 'n muted', text: pl.nr }),
            el('td', { colspan: 9, text: pl.label })
          ]));
        }
        pl.punkte.forEach(function (pt) { zeilen.push(punktZeile(p, s, pt, beteiligte)); });
      });

      koerper.push(el('div', { class: 'panelbody' }, [
        el('div', { style: 'font-weight:640;color:var(--kopf);margin-bottom:5px',
          text: g.nr + '  ' + A.phaseLabel(g.phase.id) }),
        U.tabelle([
          { label: 'Nr.', w: '62px' }, { label: 'Typ', w: '104px' },
          { label: 'Punkt' }, { label: 'Thema', w: '140px' },
          { label: 'Prio', w: '86px' }, { label: 'Zuständig', w: '150px' },
          { label: 'Termin', w: '128px' }, { label: 'Status', w: '112px' },
          { label: 'Phase', w: '150px', klasse: 'noprint' }, { label: '', klasse: 'noprint' }
        ], zeilen)
      ]));
    });

    /* Neuer Punkt: Phase und Zuständigkeit werden vom letzten Punkt
       übernommen — beim Protokollieren bleibt man meist im Thema. */
    koerper.push(el('div', { class: 'panelbody noprint' }, [
      el('button', { class: 'schreibend', text: '+ Punkt', onclick: function () {
        var letzt = s.punkte[s.punkte.length - 1];
        s.punkte.push(A.defPunkt({
          phase: letzt ? letzt.phase : 'allgemein',
          beteiligter: letzt ? letzt.beteiligter : (beteiligte[0] ? beteiligte[0].id : ''),
          typ: 'info'
        }));
        schmutzig(); A.render();
      } })
    ]));

    return U.panel('Traktanden', 'Phase → Zuständigkeit → Punkte · die Nummern ergeben sich daraus',
      koerper);
  }

  function punktZeile(p, s, pt, beteiligte) {
    var tr = el('tr', {});
    tr.appendChild(el('td', { class: 'n muted', text: pt._nr || '' }));

    tr.appendChild(el('td', {}, [(function () {
      var sel = el('select');
      A.PUNKT_TYPEN.forEach(function (t) {
        sel.appendChild(el('option', { value: t.id, text: t.label,
          selected: pt.typ === t.id ? '' : null }));
      });
      sel.addEventListener('change', function () {
        pt.typ = sel.value;
        /* Ohne Termin ist eine Aufgabe im Plan nicht darstellbar */
        if (pt.typ === 'aufgabe' && !pt.termin) pt.termin = '';
        schmutzig(); A.render();
      });
      return sel;
    })()]));

    tr.appendChild(el('td', {}, [(function () {
      /* Das globale Textfeld ist 150 px hoch — in einer Protokollzeile
         wäre das eine Wand. Hier wächst es beim Tippen mit. */
      var ta = el('textarea', { rows: '1',
        style: 'width:100%;min-width:220px;min-height:0;height:38px;padding:5px 7px;' +
               'border:1px solid var(--line);border-radius:4px;font-family:inherit;' +
               'font-size:12.5px;resize:vertical;overflow:hidden' },
        [pt.text || '']);
      function mitwachsen() {
        ta.style.height = 'auto';
        ta.style.height = Math.max(38, ta.scrollHeight + 2) + 'px';
      }
      setTimeout(mitwachsen, 0);
      ta.addEventListener('input', function () { pt.text = ta.value; mitwachsen(); schmutzig(); });
      return ta;
    })()]));

    /* Thema — die Ordnung quer zu den Phasen. Der farbige Punkt macht
       eine lange Liste auf einen Blick lesbar. */
    tr.appendChild(el('td', {}, [(function () {
      var themen = A.themenListe();
      var sel = el('select', { class: 'nichtdrucken' });
      sel.appendChild(el('option', { value: '', text: '— ohne —' }));
      themen.forEach(function (t) {
        sel.appendChild(el('option', { value: t.id, text: t.label,
          selected: pt.thema === t.id ? '' : null }));
      });
      sel.addEventListener('change', function () {
        pt.thema = sel.value; schmutzig(); A.render();
      });
      var t = A.thema(pt.thema);
      var marke = el('span', { class: 'themenpunkt', style: t
        ? 'background:' + t.farbe : 'background:transparent;border:1px solid var(--line2)' });
      var text = el('span', { class: 'nurdruck', text: t ? t.label : '—' });
      return el('span', { style: 'display:flex;align-items:center;gap:5px' },
        [marke, sel, text]);
    })()]));

    tr.appendChild(el('td', {}, [(function () {
      var sel = el('select', { class: 'nichtdrucken' });
      A.PRIORITAETEN.forEach(function (x) {
        sel.appendChild(el('option', { value: x.id, text: x.label,
          selected: (pt.prio || '') === x.id ? '' : null }));
      });
      sel.addEventListener('change', function () {
        pt.prio = sel.value; schmutzig(); A.render();
      });
      var pr = A.prioritaet(pt.prio);
      var text = el('span', { class: 'nurdruck' + (pr.klasse ? ' tag ' + pr.klasse : ''),
        text: pr.id ? pr.label : '—' });
      return el('span', {}, [sel, text]);
    })()]));

    tr.appendChild(el('td', {}, [(function () {
      var sel = el('select', { class: 'nichtdrucken' });
      sel.appendChild(el('option', { value: '', text: '— ohne —' }));
      beteiligte.forEach(function (b) {
        sel.appendChild(el('option', { value: b.id,
          text: [b.kuerzel, b.name].filter(Boolean).join(' · '),
          selected: pt.beteiligter === b.id ? '' : null }));
      });
      sel.addEventListener('change', function () {
        pt.beteiligter = sel.value; schmutzig(); A.render();
      });
      /* Auf Papier steht der Name, nicht der Auswahltext «— ohne —». */
      var wer = beteiligte.find(function (b) { return b.id === pt.beteiligter; });
      var text = el('span', { class: 'nurdruck',
        text: wer ? (wer.name || wer.kuerzel) : '—' });
      return el('span', {}, [sel, text]);
    })()]));

    tr.appendChild(el('td', {}, [
      pt.typ === 'info'
        ? el('span', { class: 'muted', text: '—' })
        : datumFeld(pt, 'termin', function () { schmutzig(); A.render(); })
    ]));

    tr.appendChild(el('td', {}, [
      pt.typ === 'aufgabe'
        ? (function () {
            var sel = el('select');
            A.PUNKT_STATUS.forEach(function (st) {
              sel.appendChild(el('option', { value: st.id, text: st.label,
                selected: pt.status === st.id ? '' : null }));
            });
            sel.addEventListener('change', function () {
              pt.status = sel.value;
              if (sel.value === 'erledigt') {
                pt.erledigt_am = s.datum || A.heute();
                pt.erledigt_in = s.id;
              } else { pt.erledigt_am = ''; pt.erledigt_in = ''; }
              schmutzig(); A.render();
            });
            return sel;
          })()
        : el('span', { class: 'muted', text: '—' })
    ]));

    /* Die Phase steht schon als Überschrift über der Tabelle — auf dem
       Papier wäre die Spalte eine Wiederholung. */
    tr.appendChild(el('td', { class: 'noprint' }, [(function () {
      var sel = el('select');
      A.SIA_PHASEN.forEach(function (ph) {
        sel.appendChild(el('option', { value: ph.id,
          text: ph.sia ? ph.sia + ' · ' + ph.label : ph.label,
          selected: pt.phase === ph.id ? '' : null }));
      });
      sel.addEventListener('change', function () { pt.phase = sel.value; schmutzig(); A.render(); });
      return sel;
    })()]));

    tr.appendChild(el('td', { class: 'w1 noprint' }, [el('button', { class: 'ghost sm schreibend',
      text: '×', title: 'Punkt entfernen', onclick: function () {
        s.punkte = s.punkte.filter(function (x) { return x.id !== pt.id; });
        schmutzig(); A.render();
      } })]));
    return tr;
  }

  /* ---------------------------------------------------------------
     Versand

     Aus dem Browser lässt sich keine Mail mit Anhang verschicken. Der
     Weg ist deshalb zweistufig: Protokoll drucken oder als PDF sichern,
     dann die vorbereitete Mail öffnen und die Datei anhängen.
     --------------------------------------------------------------- */

  var VERSANDWEGE = [
    { id: 'verteiler', label: 'Verteiler' },
    { id: 'sitzung',   label: 'Anwesende und Entschuldigte' },
    { id: 'alle',      label: 'alle Beteiligten' }
  ];

  function kreisIds(s, weg) {
    if (weg === 'alle') return null;                       // null = jeder
    if (weg === 'sitzung') {
      return (s.teilnehmer || []).concat(s.entschuldigt || []);
    }
    return s.verteiler || [];
  }

  function versandDialog(p, s) {
    var beteiligte = A.beteiligteListe(p);
    var weg = 'verteiler';
    var empfaenger = [], ohneMail = [];

    function kreisSetzen() {
      var ids = kreisIds(s, weg);
      var drin = beteiligte.filter(function (b) {
        return ids === null || ids.indexOf(b.id) >= 0;
      });
      empfaenger = drin.filter(function (b) { return b.mail; });
      ohneMail = drin.filter(function (b) { return !b.mail; });
    }
    kreisSetzen();

    var r = A.reihe(s.reihe);
    var betreff = [p.name || 'Projekt', '·', (r ? r.label : 'Sitzung'), 'Nr.', s.nummer,
      'vom', A.datum(s.datum)].join(' ');

    var text = [
      'Guten Tag',
      '',
      'Im Anhang das Protokoll der ' + (r ? r.label : 'Sitzung') + ' Nr. ' + s.nummer +
        ' vom ' + A.datum(s.datum) + (s.ort ? ' in ' + s.ort : '') + '.',
      '',
      aufgabenText(p, s),
      'Einwände bitte innert zehn Tagen; danach gilt das Protokoll als genehmigt.',
      '',
      'Freundliche Grüsse',
      s.verfasser || (p.bearbeiter || '')
    ].filter(function (z) { return z !== null; }).join('\n');

    var empfBox = el('div', { style: 'margin:4px 0 10px' });
    var warnBox = el('div', {});

    function empfZeichnen() {
      U.leeren(empfBox).appendChild(document.createTextNode(empfaenger.length
        ? empfaenger.map(function (b) { return b.name || b.mail; }).join(', ')
        : 'niemand in diesem Kreis hat eine Mailadresse'));
      U.leeren(warnBox);
      if (ohneMail.length) {
        warnBox.appendChild(U.hinweis('warn', '<b>' + ohneMail.length + '</b> Personen haben ' +
          'keine Mailadresse: ' +
          A.escape(ohneMail.map(function (b) { return b.name || b.kuerzel; }).join(', ')) +
          ' — sie erhalten nichts.'));
      }
    }

    var wegWahl = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px' });
    VERSANDWEGE.forEach(function (w) {
      var b = el('button', { class: w.id === weg ? 'primary' : '', text: w.label });
      b.addEventListener('click', function () {
        weg = w.id; kreisSetzen(); empfZeichnen();
        wegWahl.querySelectorAll('button').forEach(function (x) { x.className = ''; });
        b.className = 'primary';
      });
      wegWahl.appendChild(b);
    });
    empfZeichnen();

    var koerper = el('div', {}, [
      el('div', { class: 'panelbody' }, [
        el('div', { class: 'k', style: 'font-size:11px;color:var(--muted);margin-bottom:4px',
          text: 'Empfängerkreis' }),
        wegWahl,
        el('div', { class: 'k', style: 'font-size:11px;color:var(--muted)', text: 'Empfänger' }),
        empfBox,
        warnBox,
        el('div', { class: 'k', style: 'font-size:11px;color:var(--muted)', text: 'Betreff' }),
        el('div', { style: 'margin:4px 0 10px', text: betreff }),
        el('div', { class: 'k', style: 'font-size:11px;color:var(--muted)', text: 'Nachricht' }),
        el('textarea', { rows: '10', id: 'versandtext',
          style: 'width:100%;padding:8px 10px;border:1px solid var(--line2);border-radius:5px;' +
                 'font-family:inherit;font-size:12.5px' }, [text])
      ]),
      el('div', { class: 'panelbody' }, [
        U.hinweis('info', 'So läuft der Versand: <b>1.</b> Protokoll drucken oder als PDF ' +
          'sichern. <b>2.</b> Mail öffnen — Empfänger, Betreff und Text sind vorbereitet. ' +
          '<b>3.</b> Das PDF anhängen und senden. Ein Versand direkt aus der Anwendung ' +
          'braucht einen Maildienst; das rüsten wir nach, sobald er feststeht.')
      ])
    ]);

    var modal = U.modal('Protokoll versenden', koerper, [
      el('button', { text: 'Protokoll drucken / als PDF sichern', onclick: function () {
        window.print();
      } }),
      el('button', { class: 'primary', text: 'Mail öffnen', onclick: function () {
        if (!empfaenger.length) {
          A.meldung('warn', 'Niemand in diesem Empfängerkreis hat eine Mailadresse.');
          return;
        }
        var ta = document.getElementById('versandtext');
        var koerpertext = ta ? ta.value : text;
        window.location.href = 'mailto:' +
          encodeURIComponent(empfaenger.map(function (b) { return b.mail; }).join(',')) +
          '?subject=' + encodeURIComponent(betreff) +
          '&body=' + encodeURIComponent(koerpertext);

        if (s.status !== 'versendet') {
          s.status = 'versendet';
          s.versendet_am = new Date().toISOString();
          P.speichern(s).then(function () { A.render(); });
        }
        if (modal) modal.remove();
      } })
    ]);
  }

  /* Die Aufgaben aus dem Protokoll als Klartext für die Mail — wer nur
     die Nachricht liest, sieht wenigstens seine Termine. */
  function aufgabenText(p, s) {
    var beteiligte = A.beteiligteListe(p);
    var gruppen = A.gliederung(p, s);
    var zeilen = [];
    gruppen.forEach(function (g) {
      g.planer.forEach(function (pl) {
        pl.punkte.forEach(function (pt) {
          if (pt.typ !== 'aufgabe' || pt.status !== 'offen') return;
          var b = beteiligte.find(function (x) { return x.id === pt.beteiligter; });
          zeilen.push('  ' + pt._nr + '  ' + (pt.text || '') +
            '  [' + (b ? (b.kuerzel || b.name) : 'offen') + ', ' +
            (pt.termin ? 'bis ' + A.datum(pt.termin) : 'ohne Termin') + ']');
        });
      });
    });
    if (!zeilen.length) return 'Es sind keine offenen Aufgaben festgehalten.\n';
    return 'Offene Aufgaben:\n' + zeilen.join('\n') + '\n';
  }

  /* ---------------------------------------------------------------
     Kleine Felder — die Sitzung ist kein Projekt, deshalb greifen die
     Helfer aus ui.js (die auf Feldpfade und A.recompute setzen) hier
     nicht.
     --------------------------------------------------------------- */

  function rahmen(label, inhalt, hilfe) {
    return el('div', { class: 'f' }, [
      el('label', {}, [el('span', { text: label })]),
      el('div', { class: 'inp' }, [inhalt]),
      hilfe ? el('div', { class: 'hilfe', text: hilfe }) : null
    ]);
  }

  function feldTxt(obj, key, label, platzhalter) {
    var i = el('input', { type: 'text', value: obj[key] || '', placeholder: platzhalter || '' });
    i.addEventListener('input', function () { obj[key] = i.value; schmutzig(); });
    return rahmen(label, i);
  }

  function feldNum(obj, key, label) {
    var i = el('input', { type: 'text', inputmode: 'numeric', value: obj[key] || '' });
    i.addEventListener('input', function () {
      obj[key] = parseInt(i.value, 10) || 0; schmutzig();
    });
    return rahmen(label, i);
  }

  function feldDatum(obj, key, label) {
    var i = el('input', { type: 'date', value: obj[key] || '', class: 'nichtdrucken' });
    var t = el('span', { class: 'nurdruck', text: obj[key] ? A.datum(obj[key]) : '—' });
    i.addEventListener('change', function () { obj[key] = i.value; schmutzig(); A.render(); });
    return rahmen(label, el('span', {}, [i, t]));
  }

  function feldSel(obj, key, optionen, label) {
    var s = el('select');
    optionen.forEach(function (o) {
      s.appendChild(el('option', { value: o.id, text: o.label,
        selected: obj[key] === o.id ? '' : null }));
    });
    s.addEventListener('change', function () { obj[key] = s.value; schmutzig(); A.render(); });
    return rahmen(label, s);
  }

  /* Datumsfeld mit Druckfassung: Das Kalenderfeld zeigt je nach
     Browsersprache 05/12/2026; auf einem Protokoll, das versendet wird,
     muss 12.05.2026 stehen. */
  function datumFeld(obj, key, nach) {
    var i = el('input', { type: 'date', value: obj[key] || '', style: 'width:100%',
      class: 'nichtdrucken' });
    var t = el('span', { class: 'nurdruck', text: obj[key] ? A.datum(obj[key]) : '—' });
    i.addEventListener('change', function () {
      obj[key] = i.value;
      t.textContent = i.value ? A.datum(i.value) : '—';
      if (nach) nach();
    });
    return el('span', {}, [i, t]);
  }

})(window.APP);
