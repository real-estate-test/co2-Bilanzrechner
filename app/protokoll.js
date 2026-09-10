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

    /* Die Sammelsitzung der manuellen Aufgaben ist kein Protokoll und
       gehört nicht in diese Liste — ihre Aufgaben stehen unten. */
    var zeilen = S.liste.filter(function (s) { return !A.istManuell(s); })
      .sort(function (a, b) {
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

    /* Offene Aufgaben der Reihe wandern beim Anlegen mit — genau das,
       was die Pendenzenübernahme von Hand tut. Abschaltbar, weil eine
       Sitzung auch einmal bei null anfangen soll. */
    var mitnehmen = el('input', { type: 'checkbox', checked: '', style: 'width:auto' });

    function offeneDerReihe(reiheId) {
      var raus = [];
      S.liste.forEach(function (si) {
        if (A.istManuell(si) || si.reihe !== reiheId) return;
        (si.punkte || []).forEach(function (pt) {
          if (pt.typ === 'aufgabe' && A.statusOffen(pt.status)) {
            raus.push({ sitzung: si, punkt: pt });
          }
        });
      });
      return raus;
    }

    var zahl = el('span', { class: 'muted', style: 'font-size:11.5px' });
    function zahlNachfuehren() {
      var n = offeneDerReihe(wahl.value).length;
      zahl.textContent = n
        ? n + (n === 1 ? ' offene Aufgabe wandert mit' : ' offene Aufgaben wandern mit')
        : 'keine offenen Aufgaben in dieser Reihe';
    }
    wahl.addEventListener('change', zahlNachfuehren);
    zahlNachfuehren();

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

        /* Danach die Pendenzen: Sie stehen unter ihrem Thema hinter den
           formalen Traktanden. Der Ursprungspunkt gilt als übernommen
           und lebt hier weiter — dieselbe Aufgabe steht nie in zwei
           Fassungen in zwei Protokollen. */
        var uebernommen = mitnehmen.checked ? offeneDerReihe(wahl.value) : [];
        var quellen = [];
        uebernommen.forEach(function (o) {
          /* Für den Fall des Scheiterns merken, wie der Punkt stand. */
          o.vorher = { status: o.punkt.status,
                       erledigt_am: o.punkt.erledigt_am, erledigt_in: o.punkt.erledigt_in };
          umziehen(s, o.sitzung, o.punkt);
          if (quellen.indexOf(o.sitzung) < 0) quellen.push(o.sitzung);
        });

        S.liste.push(s);
        /* Sofort sichern: sonst wäre die Nummer vergeben, das Protokoll
           aber nach einem Seitenwechsel verschwunden. Scheitert das
           Schreiben, verschwindet der Eintrag wieder — sonst stünde ein
           Protokoll in der Liste, das es nirgends gibt. */
        P.speichern(s).then(function (ok) {
          if (!ok) {
            /* Die Ursprungspunkte wurden noch nicht geschrieben — sie
               stehen im Speicher auf «übernommen» und müssen zurück. */
            uebernommen.forEach(function (o) {
              o.punkt.status = o.vorher.status;
              o.punkt.erledigt_am = o.vorher.erledigt_am;
              o.punkt.erledigt_in = o.vorher.erledigt_in;
            });
            S.liste = S.liste.filter(function (x) { return x.id !== s.id; });
            A.render();
            return;
          }
          /* Erst wenn das neue Protokoll steht, werden die Quellen
             nachgeführt — sonst gälten Aufgaben als übernommen, ohne
             dass es einen Nachfolger gibt. */
          return Promise.all(quellen.map(function (q) { return P.speichern(q); }))
            .then(function () {
              if (uebernommen.length) {
                A.meldung('ok', uebernommen.length +
                  (uebernommen.length === 1 ? ' offene Aufgabe übernommen.'
                                            : ' offene Aufgaben übernommen.'));
              }
              var gesichert = S.liste.find(function (x) { return x.id === s.id; }) || s;
              oeffnen(gesichert);
            });
        });
      } }),
      el('label', { style: 'display:flex;gap:6px;align-items:center;font-size:12px' }, [
        mitnehmen, el('span', { text: 'offene Aufgaben übernehmen' })
      ]),
      zahl,
      el('span', { class: 'muted', style: 'font-size:11.5px;margin-left:auto',
        text: 'Die Reihen werden unter Verwaltung gepflegt.' })
    ]));

    /* Gezählt werden echte Protokolle — die Sammelsitzung der manuell
       erfassten Aufgaben ist keines. */
    var anzahl = S.liste.filter(function (x) { return !A.istManuell(x); }).length;
    box.appendChild(U.panel('Protokolle', anzahl
      ? anzahl + (anzahl === 1 ? ' Protokoll' : ' Protokolle')
      : 'noch keines erfasst', koerper));

    /* Alle Aufgaben des Projekts, quer über die Reihen */
    box.appendChild(aufgabenPanel(p));
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
      return n + (((firmenweit[r.id] || {}).punkte || []).length);
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
      return pt.typ === 'aufgabe' && A.statusOffen(pt.status);
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
        if (pt.typ === 'aufgabe' && A.statusOffen(pt.status)) {
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

  /* Alle Punkte des Projekts, mit ihrer Herkunft und der Sitzung, in
     der sie stehen — die gemeinsame Grundlage von Liste, Kanban und
     Themenbild. Der Verweis auf die Sitzung ist nötig, weil ein
     geänderter Punkt dort gespeichert wird, wo er lebt. */
  P.allePunkte = function (nurTyp) {
    var raus = [];
    S.liste.forEach(function (s) {
      var manuell = A.istManuell(s);
      var r = A.reihe(s.reihe);
      (s.punkte || []).forEach(function (pt) {
        if (nurTyp && pt.typ !== nurTyp) return;
        raus.push({
          punkt: pt, sitzung: s, manuell: manuell,
          herkunft: manuell ? 'manuell erfasst'
            : (r ? (r.kuerzel || r.label) : s.reihe) + ' ' + s.nummer +
              ' · ' + A.datum(s.datum)
        });
      });
    });
    return raus;
  };

  /* Die Sammelsitzung dieses Projekts, bei Bedarf angelegt. */
  function manuelleSitzung(p, anlegen) {
    var vorhanden = S.liste.find(A.istManuell);
    if (vorhanden || !anlegen) return vorhanden || null;
    var s = A.defSitzung(p.id, A.MANUELL_REIHE);
    s.nummer = 1;
    s.datum = A.heute();
    S.liste.push(s);
    return s;
  }

  P.manuelleSitzung = manuelleSitzung;

  /* Welche der drei Ansichten gerade gilt. Bewusst ausserhalb des
     Projekts: Das ist eine Vorliebe des Betrachters, keine Eigenschaft
     des Projekts. */
  S.ansicht = 'liste';

  function aufgabenPanel(p) {
    var umschalter = el('div', { class: 'seg noprint', style: 'display:flex;gap:0' });
    [{ id: 'liste', label: 'Liste' },
     { id: 'kanban', label: 'Kanban' },
     { id: 'themen', label: 'Themenbild' }].forEach(function (a) {
      var b = el('button', { class: S.ansicht === a.id ? 'primary' : '', text: a.label });
      b.addEventListener('click', function () { S.ansicht = a.id; A.render(); });
      umschalter.appendChild(b);
    });

    var aufgaben = P.allePunkte('aufgabe');
    var offeneZahl = aufgaben.filter(function (o) {
      return A.statusOffen(o.punkt.status);
    }).length;

    var inhalt;
    if (S.ansicht === 'kanban') inhalt = kanban(p, aufgaben);
    else if (S.ansicht === 'themen') inhalt = themenbild(p);
    else inhalt = pendenzenListe(p);

    return U.panel('Aufgaben',
      offeneZahl + (offeneZahl === 1 ? ' offene Aufgabe' : ' offene Aufgaben') +
      ' · aus Protokollen und manuell erfasst', [
      el('div', { class: 'panelbody noprint',
        style: 'display:flex;gap:14px;align-items:center;flex-wrap:wrap' }, [
        umschalter,
        el('button', { class: 'schreibend', style: 'margin-left:auto',
          text: '+ Aufgabe ohne Protokoll', onclick: function () { neueAufgabe(p); } })
      ]),
      inhalt
    ]);
  }

  /* Eine Aufgabe, die nicht aus einer Sitzung kommt. Sie landet in der
     Sammelsitzung des Projekts und verhält sich sonst wie jede andere. */
  function neueAufgabe(p) {
    var s = manuelleSitzung(p, true);
    var beteiligte = A.beteiligteListe(p);
    s.punkte.push(A.defPunkt({
      typ: 'aufgabe', text: '', phase: 'allgemein',
      beteiligter: beteiligte.length ? beteiligte[0].id : '',
      termin: '', status: 'offen'
    }));
    P.speichern(s).then(function (ok) {
      if (ok) { S.ansicht = S.ansicht === 'themen' ? 'liste' : S.ansicht; A.render(); }
    });
  }

  function pendenzenListe(p) {
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
        terminZelle(o.punkt.termin),
        el('td', { style: 'width:180px' }, [statuswahl(o.punkt, o.sitzung)])
      ]);
    });
    if (!zeilen.length) {
      zeilen.push(el('tr', {}, [el('td', { colspan: 7, class: 'muted',
        text: 'Keine offenen Aufgaben.' })]));
    }
    return el('div', { class: 'panelbody' }, [U.tabelle([
      { label: 'Herkunft' }, { label: 'Thema' }, { label: 'Aufgabe' },
      { label: 'Prio' }, { label: 'Zuständig' }, { label: 'Termin', n: true },
      { label: 'Status' }
    ], zeilen)]);
  }

  /* ---------------------------------------------------------------
     Kanban — drei Spalten, eine je Zustand

     Die Karten lassen sich zwischen den Spalten ziehen; auf Geräten
     ohne Maus schieben zwei Knöpfe die Karte eine Spalte weiter.
     Farbe kommt vom Thema, damit man Zusammengehöriges sieht, ohne
     zu lesen.
     --------------------------------------------------------------- */

  function kanban(p, aufgaben) {
    var beteiligte = A.beteiligteListe(p);
    var spalten = A.PUNKT_STATUS.map(function (st) {
      return { id: st.id, label: st.label, karten: [] };
    });

    aufgaben.forEach(function (o) {
      var st = o.punkt.status || 'offen';
      /* Übernommene Aufgaben sind abgeschlossen — sie stehen bei den
         erledigten, mit eigenem Vermerk auf der Karte. */
      if (st === A.STATUS_UEBERNOMMEN) st = 'erledigt';
      var sp = spalten.find(function (x) { return x.id === st; }) || spalten[0];
      sp.karten.push(o);
    });

    /* Innerhalb der Spalte: überfällige zuerst, dann nach Termin */
    spalten.forEach(function (sp) {
      sp.karten.sort(function (a, b) {
        return String(a.punkt.termin || '9999').localeCompare(String(b.punkt.termin || '9999'));
      });
    });

    var tafel = el('div', { class: 'kanban' });

    spalten.forEach(function (sp) {
      var spalte = el('div', { class: 'kanban-spalte' });
      spalte.appendChild(el('div', { class: 'kanban-kopf' }, [
        el('span', { text: sp.label }),
        el('span', { class: 'zahl', text: String(sp.karten.length) })
      ]));

      var feld = el('div', { class: 'kanban-feld' });
      sp.karten.forEach(function (o) { feld.appendChild(karte(p, o, beteiligte, spalten, sp)); });
      if (!sp.karten.length) {
        feld.appendChild(el('div', { class: 'kanban-leer', text: 'nichts hier' }));
      }

      /* Ablagefläche: Die ganze Spalte nimmt eine gezogene Karte auf. */
      feld.addEventListener('dragover', function (e) {
        e.preventDefault();
        feld.classList.add('ueber');
      });
      feld.addEventListener('dragleave', function () { feld.classList.remove('ueber'); });
      feld.addEventListener('drop', function (e) {
        e.preventDefault();
        feld.classList.remove('ueber');
        var id = e.dataTransfer.getData('text/plain');
        var o = aufgaben.find(function (x) { return x.punkt.id === id; });
        if (!o) return;
        var jetzt = o.punkt.status === A.STATUS_UEBERNOMMEN ? 'erledigt' : (o.punkt.status || 'offen');
        if (jetzt === sp.id) return;
        statusSetzen(o.punkt, o.sitzung, sp.id);
      });

      spalte.appendChild(feld);
      tafel.appendChild(spalte);
    });

    return el('div', { class: 'panelbody' }, [
      tafel,
      el('div', { class: 'hilfe', style: 'margin-top:10px',
        text: 'Karten lassen sich zwischen den Spalten ziehen; die Pfeile auf der Karte tun ' +
              'dasselbe. Der Farbstreifen links zeigt das Thema, die Marken darunter Thema ' +
              'und Priorität im Klartext. Überfällige Karten sind rot hinterlegt. Eine ' +
              'Änderung wird sofort gespeichert — dort, wo die Aufgabe steht.' })
    ]);
  }

  function karte(p, o, beteiligte, spalten, aktuell) {
    var pt = o.punkt;
    var t = A.thema(pt.thema);
    var pr = A.prioritaet(pt.prio);
    var b = beteiligte.find(function (x) { return x.id === pt.beteiligter; });
    var ueberfaellig = pt.termin && pt.termin < A.heute() && A.statusOffen(pt.status);

    var k = el('div', { class: 'kanban-karte' + (ueberfaellig ? ' spaet' : ''),
      draggable: 'true' });
    k.style.borderLeftColor = t ? t.farbe : 'var(--line2)';

    k.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', pt.id);
      e.dataTransfer.effectAllowed = 'move';
      k.classList.add('zieht');
    });
    k.addEventListener('dragend', function () { k.classList.remove('zieht'); });

    k.appendChild(el('div', { class: 'ktext', text: pt.text || '(ohne Text)' }));

    var marken = el('div', { class: 'kmarken' });
    if (t) {
      marken.appendChild(el('span', { class: 'tag', style: 'border-color:' + t.farbe,
        text: t.label }));
    }
    if (pr.id) {
      marken.appendChild(el('span', { class: 'tag' + (pr.klasse ? ' ' + pr.klasse : ''),
        text: pr.label }));
    }
    if (pt.status === A.STATUS_UEBERNOMMEN) {
      marken.appendChild(el('span', { class: 'tag', text: 'übernommen' }));
    }
    if (marken.childNodes.length) k.appendChild(marken);

    k.appendChild(el('div', { class: 'kfuss' }, [
      el('span', { text: b ? (b.kuerzel || b.name) : 'ohne Zuständigkeit' }),
      el('span', { class: pt.termin && ueberfaellig ? 'spaet' : '',
        text: pt.termin ? A.datum(pt.termin) : 'ohne Termin' })
    ]));

    k.appendChild(el('div', { class: 'kherkunft', text: o.herkunft }));

    /* Rückfallebene ohne Maus: eine Spalte zurück oder weiter */
    var ix = spalten.findIndex(function (x) { return x.id === aktuell.id; });
    var knoepfe = el('div', { class: 'kknoepfe noprint' });
    if (ix > 0) {
      knoepfe.appendChild(el('button', { class: 'ghost sm schreibend', text: '‹',
        title: 'nach ' + spalten[ix - 1].label,
        onclick: function () { statusSetzen(pt, o.sitzung, spalten[ix - 1].id); } }));
    }
    if (ix < spalten.length - 1) {
      knoepfe.appendChild(el('button', { class: 'ghost sm schreibend', text: '›',
        title: 'nach ' + spalten[ix + 1].label,
        onclick: function () { statusSetzen(pt, o.sitzung, spalten[ix + 1].id); } }));
    }
    if (knoepfe.childNodes.length) k.appendChild(knoepfe);

    return k;
  }

  /* Statuswahl, die den Punkt dort speichert, wo er lebt — in seinem
     Protokoll oder in der Sammelsitzung. */
  function statuswahl(pt, sitzung) {
    var sel = el('select', { class: 'schreibend' });
    A.PUNKT_STATUS.forEach(function (st) {
      sel.appendChild(el('option', { value: st.id, text: st.label,
        selected: (pt.status || 'offen') === st.id ? '' : null }));
    });
    if (pt.status === A.STATUS_UEBERNOMMEN) {
      sel.appendChild(el('option', { value: A.STATUS_UEBERNOMMEN,
        text: 'übernommen', selected: '' }));
    }
    sel.addEventListener('change', function () {
      statusSetzen(pt, sitzung, sel.value);
    });
    return sel;
  }

  function statusSetzen(pt, sitzung, wert) {
    pt.status = wert;
    if (wert === 'erledigt') {
      pt.erledigt_am = pt.erledigt_am || A.heute();
    } else if (wert !== A.STATUS_UEBERNOMMEN) {
      pt.erledigt_am = ''; pt.erledigt_in = '';
    }
    P.speichern(sitzung).then(function (ok) {
      if (ok) A.render();
    });
  }

  /* ---------------------------------------------------------------
     Themenbild — alle Punkte nach Themen, radial

     In der Mitte das Projekt, ringsum die Themen, an jedem Thema seine
     Aufgaben, Entscheide und Infos. Anders als Kanban und Liste zeigt
     dieses Bild alle drei Arten: Es beantwortet nicht «was ist zu
     tun», sondern «was wissen wir über dieses Thema».
     --------------------------------------------------------------- */

  /* Welche Themen aufgeklappt sind — überlebt das Neuzeichnen */
  var offeneThemen = {};

  function themenbild(p) {
    var alle = P.allePunkte(null).filter(function (o) {
      /* Übernommene stehen im Nachfolgeprotokoll — sonst stünde
         derselbe Punkt zweimal im Bild. */
      return o.punkt.status !== A.STATUS_UEBERNOMMEN;
    });

    if (!alle.length) {
      return el('div', { class: 'panelbody muted',
        text: 'Noch kein Punkt erfasst — weder aus einem Protokoll noch von Hand.' });
    }

    /* Nach Thema gruppieren, Punkte ohne Thema in einer eigenen Gruppe */
    var themen = A.themenListe();
    var gruppen = [];
    themen.forEach(function (t) {
      var drin = alle.filter(function (o) { return o.punkt.thema === t.id; });
      if (drin.length) gruppen.push({ thema: t, punkte: drin });
    });
    var ohne = alle.filter(function (o) {
      return !themen.some(function (t) { return t.id === o.punkt.thema; });
    });
    if (ohne.length) {
      gruppen.push({ thema: { id: '', label: 'ohne Thema', farbe: '#aab2bd' }, punkte: ohne });
    }

    var W = 1120, MITTE = { x: W / 2, y: 0 };
    var RADIUS = 210;          // Abstand der Themenknoten zur Mitte
    var ZEILE = 17;            // Höhe einer Punktzeile
    var s = U.s;

    /* Höhe: Die Themen stehen auf einem Kreis; je Thema kommt die
       Liste seiner Punkte dazu. Die Höhe folgt dem längsten Ast. */
    var n = gruppen.length;
    var proSeite = Math.ceil(n / 2);
    var maxPunkte = 0;
    gruppen.forEach(function (g) {
      var z = offeneThemen[g.thema.id] ? g.punkte.length : Math.min(g.punkte.length, 5);
      if (z > maxPunkte) maxPunkte = z;
    });
    var H = Math.max(420, 130 + proSeite * (70 + Math.min(maxPunkte, 8) * ZEILE));
    MITTE.y = H / 2;

    var kinder = [];

    /* Die Äste zuerst, damit die Knoten darüber liegen */
    var stellen = gruppen.map(function (g, i) {
      /* Halbkreis links, Halbkreis rechts — so bleibt in der Mitte
         Platz für den Projektnamen und die Beschriftungen laufen nicht
         ineinander. */
      var rechts = i % 2 === 0;
      var reihe = Math.floor(i / 2);
      var schritt = proSeite > 1 ? (H - 150) / (proSeite - 1) : 0;
      var y = proSeite > 1 ? 75 + reihe * schritt : H / 2;
      var x = rechts ? MITTE.x + RADIUS : MITTE.x - RADIUS;
      return { g: g, x: x, y: y, rechts: rechts };
    });

    stellen.forEach(function (st) {
      var t = st.g.thema;
      var xm = (MITTE.x + st.x) / 2;
      kinder.push(s('path', {
        d: 'M ' + MITTE.x + ' ' + MITTE.y +
           ' C ' + xm + ' ' + MITTE.y + ', ' + xm + ' ' + st.y + ', ' + st.x + ' ' + st.y,
        fill: 'none', stroke: t.farbe, 'stroke-width': 2, opacity: 0.55
      }));
    });

    /* Projekt in der Mitte */
    kinder.push(s('circle', { cx: MITTE.x, cy: MITTE.y, r: 58, fill: '#232c39' }));
    /* Der Name wird auf zwei Zeilen gebrochen — er passt sonst nicht in
       den Kreis und läuft über den Rand hinaus. */
    var namensZeilen = umbrechen(p.name || 'Projekt', 14, 2);
    namensZeilen.forEach(function (zeile, i) {
      kinder.push(s('text', { x: MITTE.x,
        y: MITTE.y - (namensZeilen.length === 2 ? 8 : 1) + i * 13,
        'text-anchor': 'middle', 'font-size': 11.5, fill: '#fff', 'font-weight': '640' },
        zeile));
    });
    kinder.push(s('text', { x: MITTE.x, y: MITTE.y + (namensZeilen.length === 2 ? 22 : 15),
      'text-anchor': 'middle', 'font-size': 10, fill: '#aab6c6' },
      alle.length + ' Punkte'));

    /* Themen und ihre Punkte */
    stellen.forEach(function (st) {
      var t = st.g.thema;
      var punkte = st.g.punkte.slice().sort(function (a, b) {
        return String(a.punkt.typ).localeCompare(String(b.punkt.typ)) ||
               String(a.punkt.text).localeCompare(String(b.punkt.text), 'de');
      });
      var offen = !!offeneThemen[t.id];
      var zeigen = offen ? punkte : punkte.slice(0, 5);
      var anker = st.rechts ? 'start' : 'end';
      var tx = st.rechts ? st.x + 16 : st.x - 16;

      kinder.push(s('circle', { cx: st.x, cy: st.y, r: 9,
        fill: t.farbe, stroke: '#fff', 'stroke-width': 2 }));
      kinder.push(s('text', { x: tx, y: st.y + 1, 'text-anchor': anker,
        'font-size': 12.5, 'font-weight': '640', fill: '#232c39' },
        kuerzen(t.label, 24)));
      kinder.push(s('text', { x: tx, y: st.y + 15, 'text-anchor': anker,
        'font-size': 10, fill: '#6b7484' },
        zaehlung(punkte)));

      zeigen.forEach(function (o, j) {
        var y = st.y + 32 + j * ZEILE;
        var pt = o.punkt;
        var farbe = pt.typ === 'entscheid' ? '#0d7a45'
          : pt.typ === 'info' ? '#6b7484'
          : (pt.status === 'erledigt' ? '#0d7a45'
             : (pt.termin && pt.termin < A.heute() ? '#c02e26' : '#1f5fd0'));

        /* Kleines Zeichen je Art: Raute für Entscheid, Punkt für Info,
           Quadrat für Aufgabe. */
        var zx = st.rechts ? st.x + 8 : st.x - 8;
        if (pt.typ === 'entscheid') {
          kinder.push(s('polygon', {
            points: [zx, y - 8, zx + 4, y - 4, zx, y, zx - 4, y - 4].join(' '),
            fill: farbe }));
        } else if (pt.typ === 'info') {
          kinder.push(s('circle', { cx: zx, cy: y - 4, r: 3, fill: farbe }));
        } else {
          kinder.push(s('rect', { x: zx - 3.5, y: y - 7.5, width: 7, height: 7,
            rx: 1.5, fill: farbe,
            opacity: pt.status === 'erledigt' ? 0.45 : 1 }));
        }

        var text = s('text', { x: st.rechts ? zx + 9 : zx - 9, y: y,
          'text-anchor': anker, 'font-size': 11,
          fill: pt.status === 'erledigt' ? '#9aa3ae' : '#3c4553',
          'text-decoration': pt.status === 'erledigt' ? 'line-through' : 'none' },
          kuerzen(pt.text || '(ohne Text)', 34));
        text.appendChild(s('title', {}, [
          pt.text || '(ohne Text)',
          A.PUNKT_TYPEN.find(function (x) { return x.id === pt.typ; }).label,
          pt.termin ? 'Termin ' + A.datum(pt.termin) : '',
          'aus ' + o.herkunft
        ].filter(Boolean).join('\n')));
        kinder.push(text);
      });

      /* Mehr als fünf: aufklappbar */
      if (punkte.length > 5) {
        var y2 = st.y + 32 + zeigen.length * ZEILE;
        var mehr = s('text', { x: st.rechts ? st.x + 17 : st.x - 17, y: y2,
          'text-anchor': anker, 'font-size': 10.5, fill: '#1f5fd0',
          style: 'cursor:pointer', class: 'mehrknopf' },
          offen ? '− weniger' : '+ ' + (punkte.length - 5) + ' weitere');
        mehr.addEventListener('click', function () {
          offeneThemen[t.id] = !offeneThemen[t.id];
          A.render();
        });
        kinder.push(mehr);
      }
    });

    return el('div', { class: 'panelbody' }, [
      U.svg(W, H, kinder, { h: H }),
      el('div', { class: 'legende' }, [
        el('span', {}, [el('i', { style: 'background:#1f5fd0;border-radius:2px' }),
          el('span', { text: 'Aufgabe' })]),
        el('span', {}, [el('i', { style: 'background:#0d7a45;transform:rotate(45deg)' }),
          el('span', { text: 'Entscheid' })]),
        el('span', {}, [el('i', { style: 'background:#6b7484;border-radius:50%' }),
          el('span', { text: 'Info' })]),
        el('span', {}, [el('i', { style: 'background:#c02e26;border-radius:2px' }),
          el('span', { text: 'überfällig' })])
      ]),
      el('div', { class: 'hilfe', style: 'margin-top:8px',
        text: 'Alles, was in den Protokollen und von Hand erfasst wurde, nach Themen ' +
              'geordnet. Erledigte Aufgaben sind durchgestrichen; übernommene stehen bei ' +
              'ihrem Nachfolger. Mit dem Zeiger über einem Eintrag steht der volle Text.' })
    ]);
  }

  function zaehlung(punkte) {
    var a = punkte.filter(function (o) { return o.punkt.typ === 'aufgabe'; }).length;
    var e = punkte.filter(function (o) { return o.punkt.typ === 'entscheid'; }).length;
    var i = punkte.filter(function (o) { return o.punkt.typ === 'info'; }).length;
    return [a ? a + ' Aufgaben' : '', e ? e + ' Entscheide' : '', i ? i + ' Infos' : '']
      .filter(Boolean).join(' · ');
  }

  /* Text auf höchstens «zeilen» Zeilen umbrechen, an Wortgrenzen. */
  function umbrechen(text, breite, zeilen) {
    var worte = String(text || '').split(/\s+/).filter(Boolean);
    var raus = [], aktuell = '';
    worte.forEach(function (w) {
      var probe = aktuell ? aktuell + ' ' + w : w;
      if (probe.length <= breite || !aktuell) { aktuell = probe; return; }
      raus.push(aktuell); aktuell = w;
    });
    if (aktuell) raus.push(aktuell);
    if (raus.length > zeilen) {
      raus = raus.slice(0, zeilen);
      raus[zeilen - 1] = kuerzen(raus[zeilen - 1] + '…', breite + 1);
    }
    return raus.map(function (z) { return kuerzen(z, breite + 2); });
  }

  /* Eine Farbe über Weiss aufhellen. rgba statt color-mix, weil das
     in jedem Browser funktioniert und der Wert aus der Verwaltung als
     Hex kommt. */
  function tönung(hex, anteil) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6) return 'transparent';
    var r = parseInt(h.slice(0, 2), 16),
        g = parseInt(h.slice(2, 4), 16),
        b = parseInt(h.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return 'transparent';
    return 'rgba(' + r + ',' + g + ',' + b + ',' + anteil + ')';
  }

  function kuerzen(text, n) {
    text = String(text || '');
    return text.length > n ? text.slice(0, n - 1) + '…' : text;
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

  /* Eine offene Aufgabe zieht in ein neues Protokoll um: Sie entsteht
     dort als neuer Punkt mit demselben Thema, derselben Zuständigkeit
     und demselben Termin, und der alte Punkt gilt als übernommen. So
     steht dieselbe Aufgabe nie in zwei Fassungen in zwei Protokollen.
     Beide Wege — der Knopf in den Pendenzen und die Übernahme beim
     Anlegen — gehen durch diese Funktion. */
  function umziehen(ziel, quelle, pt) {
    var r = A.reihe(quelle.reihe);
    var herkunft = 'übernommen aus ' + (r ? (r.kuerzel || r.label) : quelle.reihe) +
                   ' ' + quelle.nummer + ' vom ' + A.datum(quelle.datum);
    var neu = A.defPunkt({
      thema: pt.thema, phase: pt.phase, beteiligter: pt.beteiligter,
      typ: 'aufgabe', text: pt.text, termin: pt.termin, prio: pt.prio,
      status: pt.status === 'warten' ? 'warten' : 'offen',
      bemerkung: pt.bemerkung ? pt.bemerkung + ' · ' + herkunft : herkunft
    });
    ziel.punkte.push(neu);
    /* Der alte Punkt lebt im neuen Protokoll weiter — das ist kein
       Warten auf Rückmeldung, sondern ein Umzug. */
    pt.status = A.STATUS_UEBERNOMMEN;
    pt.erledigt_am = ziel.datum || A.heute();
    pt.erledigt_in = ziel.id;
    return neu;
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
            umziehen(s, o.sitzung, pt);
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

    /* Eine Tabelle je Thema. Die Überschrift trägt die feste Nummer aus
       der Verwaltung; leere Traktanden bleiben stehen, damit auf dem
       Papier niemand einen fehlenden Abschnitt vermutet. */
    gruppen.forEach(function (g) {
      var zeilen = g.punkte.map(function (pt) {
        return punktZeile(p, s, pt, beteiligte);
      });

      /* Die Überschriftenzeile trägt die Themenfarbe: kräftig als
         Balken links, sehr hell als Grund. So gliedert sich das
         Protokoll auch beim Überfliegen, ohne bunt zu werden. */
      var farbe = g.thema.farbe || '#aab2bd';
      var kopf = el('div', { class: 'traktandenkopf',
        style: 'border-left-color:' + farbe + ';background:' + tönung(farbe, 0.1) }, [
        el('span', { class: 'themenpunkt', style: 'background:' + farbe }),
        el('span', { class: 'tnr', text: g.nr }),
        el('span', { class: 'tlabel', text: g.thema.label }),
        g.ausserhalb
          ? el('span', { class: 'tag warn noprint',
              title: 'Dieses Thema ist für diese Sitzungsart nicht vorgesehen',
              text: 'nicht in dieser Sitzungsart' })
          : null,
        /* Der Punkt wird direkt unter seinem Traktandum angelegt — mit
           dem Thema, unter dem der Knopf steht. */
        el('button', { class: 'ghost sm schreibend noprint',
          style: 'margin-left:auto;background:#fff',
          text: '+ Punkt', title: 'Punkt zu «' + g.thema.label + '»',
          onclick: function () {
            var letzt = g.punkte[g.punkte.length - 1];
            s.punkte.push(A.defPunkt({
              thema: g.thema.id,
              phase: letzt ? letzt.phase : 'allgemein',
              beteiligter: letzt ? letzt.beteiligter
                : (beteiligte[0] ? beteiligte[0].id : ''),
              typ: 'info'
            }));
            schmutzig(); A.render();
          } })
      ]);

      /* Ein leeres Traktandum behält seine Überschrift, aber keine
         Tabelle — ein Kopf ohne Zeilen ist nur Lärm. */
      koerper.push(el('div', { class: 'panelbody' }, [
        kopf,
        zeilen.length
          ? U.tabelle([
              { label: 'Nr.', w: '62px' }, { label: 'Typ', w: '104px' },
              { label: 'Punkt' }, { label: 'Thema', w: '140px', klasse: 'noprint' },
              { label: 'Prio', w: '86px' }, { label: 'Zuständig', w: '150px' },
              { label: 'Termin', w: '128px' }, { label: 'Status', w: '112px' },
              { label: 'Phase', w: '150px', klasse: 'noprint' },
              { label: '', klasse: 'noprint' }
            ], zeilen)
          : el('div', { class: 'muted', style: 'font-size:11.5px;padding:2px 0 4px',
              text: 'keine Punkte zu diesem Traktandum' })
      ]));
    });

    if (!gruppen.length) {
      koerper.push(el('div', { class: 'panelbody muted',
        text: 'Für diese Sitzungsart ist kein Thema als Traktandum vorgesehen — ' +
              'unter Verwaltung wählen.' }));
    }

    return U.panel('Traktanden',
      'Themen als Überschrift · Nummern aus der Verwaltung', koerper);
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
        A.mailOeffnen({
          an: empfaenger.map(function (b) { return b.mail; }),
          betreff: betreff,
          text: koerpertext
        });

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
      g.punkte.forEach(function (pt) {
        if (pt.typ !== 'aufgabe' || !A.statusOffen(pt.status)) return;
        var b = beteiligte.find(function (x) { return x.id === pt.beteiligter; });
        zeilen.push('  ' + pt._nr + '  ' + (pt.text || '') +
          '  [' + (b ? (b.kuerzel || b.name) : 'offen') + ', ' +
          (pt.termin ? 'bis ' + A.datum(pt.termin) : 'ohne Termin') + ']');
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
