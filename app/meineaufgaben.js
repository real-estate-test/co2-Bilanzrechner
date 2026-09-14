/* =====================================================================
   Projektrechner · Meine Aufgaben

   Ein Sammelordner über alle Projekte: was mir aufgetragen ist und was
   ich vergeben habe. Abgearbeitet wird hier, ergänzt wird im Projekt —
   eine neue Aufgabe braucht ihren Zusammenhang, eine Rückmeldung nicht.

   Die Zuordnung läuft über die Mailadresse: Der angemeldete Benutzer
   findet sich in der firmenweiten Adressliste, und die Beteiligten der
   Projekte verweisen auf genau diese Adressen. Ohne Anmeldung oder ohne
   passenden Adresseintrag bleibt die Seite leer und sagt, woran es liegt.
   ===================================================================== */
window.APP = window.APP || {};
(function (A) {
  'use strict';

  var U = A.ui, V = A.views, el = U.el;
  var P = A.protokolle;

  /* Zustand des Moduls. Die Sitzungen aller Projekte werden einmal
     geladen und danach im Speicher gehalten — sie ändern sich nur durch
     eigenes Zutun, und jede Änderung führt die Liste selbst nach. */
  var M = {
    geladen: false,
    laeuft: false,
    fehler: '',
    sitzungen: [],
    sicht: 'meine',        // meine | vergeben
    zeigeErledigte: false,
    fragtNach: null        // Aufgabe, zu der ein Rückmeldungsfeld offensteht
  };
  A.meineAufgaben = M;

  /* ---------------------------------------------------------------
     Laden
     --------------------------------------------------------------- */

  function laden() {
    if (M.laeuft) return;
    M.laeuft = true;
    M.fehler = '';
    Promise.resolve(A.store.alleSitzungen())
      .then(function (liste) {
        M.sitzungen = liste || [];
        M.geladen = true;
      })
      .catch(function (f) {
        M.fehler = (f && f.message) ? f.message : String(f);
        M.geladen = true;
      })
      .then(function () {
        M.laeuft = false;
        if (A.state.seite === 'meineaufgaben') A.render();
      });
  }

  /* Nach einer Änderung neu einlesen wäre teuer und würde die Sicht
     springen lassen. Die Liste im Speicher ist bereits nachgeführt. */
  A.meineAufgabenNeuLaden = function () {
    M.geladen = false;
    M.sitzungen = [];
    laden();
  };

  /* ---------------------------------------------------------------
     Sammeln
     --------------------------------------------------------------- */

  function projektVon(id) {
    return A.store.alle(true).find(function (p) { return p.id === id; }) || null;
  }

  /* Alle Aufgaben aller Projekte, entdoppelt wie im Projekt selbst: Wo
     eine Aufgabe aus einem versendeten Protokoll in der Sammelsitzung
     weiterlebt, zählt nur die lebende Fassung. */
  function alleAufgaben() {
    var lebend = {};
    M.sitzungen.forEach(function (s) {
      if (!A.istManuell(s)) return;
      (s.punkte || []).forEach(function (pt) {
        if (pt && pt.aus_sitzung) lebend[pt.id] = true;
      });
    });

    var raus = [];
    M.sitzungen.forEach(function (s) {
      var manuell = A.istManuell(s);
      var p = projektVon(s.projekt_id);
      if (!p) return;            // Projekt archiviert oder nicht sichtbar
      (s.punkte || []).forEach(function (pt) {
        if (pt.typ !== 'aufgabe') return;
        if (!manuell && lebend[pt.id]) return;
        var quelle = pt.aus_sitzung
          ? M.sitzungen.find(function (x) { return x.id === pt.aus_sitzung; })
          : null;
        raus.push({
          punkt: pt, sitzung: s, projekt: p,
          herkunft: quelle ? P.herkunftText(quelle)
            : (manuell ? 'manuell erfasst' : P.herkunftText(s))
        });
      });
    });
    return raus;
  }

  /* Die beiden Sichten. «meine» sind die mir zugewiesenen, «vergeben»
     die, die ich jemand anderem aufgetragen habe — Nachfassen ist eine
     Aufgabe für sich. */
  function meine(liste, adressIds) {
    var proProjekt = {};
    return liste.filter(function (o) {
      var pid = o.projekt.id;
      if (proProjekt[pid] === undefined) {
        proProjekt[pid] = A.meineBeteiligtenIds(o.projekt, adressIds);
      }
      return proProjekt[pid].indexOf(o.punkt.beteiligter) >= 0;
    });
  }

  function vergeben(liste, adressIds) {
    var proProjekt = {};
    return liste.filter(function (o) {
      if (!A.punktVonMir(o.punkt, o.sitzung)) return false;
      /* Was ich mir selbst aufgetragen habe, steht schon unter «meine». */
      var pid = o.projekt.id;
      if (proProjekt[pid] === undefined) {
        proProjekt[pid] = A.meineBeteiligtenIds(o.projekt, adressIds);
      }
      return proProjekt[pid].indexOf(o.punkt.beteiligter) < 0;
    });
  }

  /* ---------------------------------------------------------------
     Schreiben

     Jede Änderung betrifft genau eine Sitzung. Zieht die Aufgabe dabei
     aus einem versendeten Protokoll in die Sammelsitzung um, wird diese
     gespeichert — das Protokoll bleibt unberührt.
     --------------------------------------------------------------- */

  function speichern(o, aendern, zurueck) {
    var f = A.aufgabeZumBearbeiten(o.projekt.id, o.punkt, o.sitzung, M.sitzungen);
    aendern(f.punkt);

    Promise.resolve(A.store.sitzungSpeichern(f.sitzung))
      .catch(function (fe) { return { ok: false, fehler: fe }; })
      .then(function (erg) {
        if (erg && erg.ok) {
          /* Die gespeicherte Fassung trägt die neue Version — ohne sie
             scheitert der nächste Schreibvorgang am Versionsschutz. */
          if (erg.sitzung) ersetzen(erg.sitzung);
          A.render();
          return;
        }
        if (erg && erg.konflikt && erg.fremd) {
          zusammenfuehren(f, erg.fremd, aendern);
          return;
        }
        zurueck(f.punkt);
        umzugZurueck(f);
        A.meldung('warn', 'Die Aufgabe konnte nicht gespeichert werden' +
          (erg && erg.fehler && erg.fehler.message ? ': ' + erg.fehler.message : '.'));
        A.render();
      });
  }

  function ersetzen(s) {
    var i = M.sitzungen.findIndex(function (x) { return x.id === s.id; });
    if (i >= 0) M.sitzungen[i] = s; else M.sitzungen.push(s);
  }

  function umzugZurueck(f) {
    if (!f || !f.umgezogen || !f.sitzung) return;
    var i = (f.sitzung.punkte || []).findIndex(function (x) { return x.id === f.punkt.id; });
    if (i >= 0) f.sitzung.punkte.splice(i, 1);
    if (!f.sitzung.version && !(f.sitzung.punkte || []).length) {
      var j = M.sitzungen.indexOf(f.sitzung);
      if (j >= 0) M.sitzungen.splice(j, 1);
    }
  }

  /* Hat jemand anders dieselbe Sitzung zwischenzeitlich gespeichert,
     ginge die eigene Eingabe mit einem stumpfen «neu laden» verloren.
     Sie betrifft aber nur EINE Aufgabe von vielen in dieser Sitzung —
     also wird die Änderung auf die fremde Fassung übertragen und
     nochmals gespeichert. Nur wenn auch das scheitert, ist Schluss. */
  function zusammenfuehren(f, fremd, aendern) {
    var ziel = (fremd.punkte || []).find(function (x) { return x.id === f.punkt.id; });
    if (!ziel) {
      /* Die Aufgabe gibt es dort nicht mehr — dann gehört die eigene
         Fassung hinzugefügt, nicht verworfen. */
      fremd.punkte = (fremd.punkte || []).concat([f.punkt]);
      ziel = fremd.punkte[fremd.punkte.length - 1];
    } else {
      aendern(ziel);
    }
    ersetzen(fremd);
    Promise.resolve(A.store.sitzungSpeichern(fremd))
      .catch(function (fe) { return { ok: false, fehler: fe }; })
      .then(function (erg) {
        if (erg && erg.ok) {
          if (erg.sitzung) ersetzen(erg.sitzung);
          A.meldung('ok', 'Jemand anders hat dieses Protokoll gleichzeitig bearbeitet — ' +
            'Ihre Eingabe wurde übernommen.');
        } else {
          A.meldung('warn', 'Dieses Protokoll wird gerade von jemand anderem bearbeitet. ' +
            'Bitte den Eintrag gleich noch einmal machen.');
          A.meineAufgabenNeuLaden();
        }
        A.render();
      });
  }

  function statusSetzen(o, wert) {
    var vorher = o.punkt.status;
    var vorherAm = o.punkt.erledigt_am;
    if (wert === 'erledigt' || wert === 'warten') M.fragtNach = o.punkt.id;
    speichern(o, function (pt) {
      pt.status = wert;
      if (wert === 'erledigt') pt.erledigt_am = pt.erledigt_am || A.heute();
      else if (wert !== A.STATUS_UEBERNOMMEN) { pt.erledigt_am = ''; pt.erledigt_in = ''; }
    }, function (pt) {
      pt.status = vorher; pt.erledigt_am = vorherAm;
    });
  }

  function antwortHinzu(o, text) {
    text = String(text || '').trim();
    if (!text) return false;
    var eintrag = A.defAntwort({ text: text, von: A.werBinIch() });
    M.fragtNach = null;
    speichern(o, function (pt) {
      if (!Array.isArray(pt.antworten)) pt.antworten = [];
      pt.antworten.push(eintrag);
    }, function (pt) {
      var i = (pt.antworten || []).findIndex(function (x) { return x.id === eintrag.id; });
      if (i >= 0) pt.antworten.splice(i, 1);
    });
    return true;
  }

  function terminSetzen(o, wert) {
    var vorher = o.punkt.termin;
    speichern(o, function (pt) { pt.termin = wert; },
              function (pt) { pt.termin = vorher; });
  }

  /* ---------------------------------------------------------------
     Darstellung
     --------------------------------------------------------------- */

  function tageBis(datum) {
    if (!datum) return null;
    var t = A.tageZwischen(A.heute(), datum);
    return t === null ? null : t;
  }

  function dringlichkeit(pt) {
    var schub = { hoch: -10, mittel: -4, tief: 3 }[pt.prio] || 0;
    var t = tageBis(pt.termin);
    if (t === null) return 99999 + schub;
    return t + schub;
  }

  function sortieren(liste) {
    return liste.slice().sort(function (a, b) {
      var d = dringlichkeit(a.punkt) - dringlichkeit(b.punkt);
      if (d) return d;
      return String(a.projekt.name || '').localeCompare(String(b.projekt.name || ''));
    });
  }

  function terminMarke(pt) {
    if (!pt.termin) return el('span', { class: 'muted', text: 'ohne Termin' });
    var t = tageBis(pt.termin);
    var klasse = t === null ? '' : (t < 0 ? 'tag neg' : (t <= 7 ? 'tag warn' : 'tag'));
    var text = A.datum(pt.termin) +
      (t === null ? '' : (t < 0 ? ' · ' + (-t) + ' Tage überfällig'
                                : (t === 0 ? ' · heute' : ' · in ' + t + ' Tagen')));
    return el('span', { class: klasse, text: text });
  }

  function zeile(o, sicht) {
    var pt = o.punkt;
    var beteiligte = A.beteiligteListe(o.projekt);
    var b = beteiligte.find(function (x) { return x.id === pt.beteiligter; });

    var kopf = el('td', {}, [
      el('div', {}, [el('span', { text: pt.text || '(ohne Text)' })]),
      el('div', { class: 'muted', style: 'font-size:10.5px' }, [
        el('span', { text: o.projekt.name || 'ohne Namen' }),
        el('span', { text: ' · ' + o.herkunft }),
        sicht === 'vergeben' && b
          ? el('span', { text: ' · zuständig: ' + (b.name || b.kuerzel || '—') }) : null,
        pt.aus_sitzung
          ? el('span', { class: 'tag', style: 'margin-left:6px', text: 'aus Protokoll' }) : null
      ].filter(Boolean))
    ]);

    /* Ein Terminfeld, das nicht bei jedem Tastendruck speichert — sonst
       wäre nach dem ersten Zeichen die halbe Eingabe in der Datenbank. */
    var termin = el('input', { type: 'date', value: pt.termin || '', class: 'nichtdrucken' });
    termin.addEventListener('change', function () { terminSetzen(o, termin.value); });

    var status = el('select');
    A.PUNKT_STATUS.forEach(function (st) {
      status.appendChild(el('option', { value: st.id, text: st.label,
        selected: pt.status === st.id ? '' : null }));
    });
    /* Eine übernommene Aufgabe steht im Nachfolgeprotokoll — der
       Zustand kommt in der Auswahl sonst nicht vor. */
    if (pt.status === A.STATUS_UEBERNOMMEN) {
      status.appendChild(el('option', { value: A.STATUS_UEBERNOMMEN,
        text: 'übernommen', selected: '' }));
    }
    status.addEventListener('change', function () { statusSetzen(o, status.value); });

    var zellen = [
      kopf,
      el('td', { class: 'w1' }, [terminMarke(pt)]),
      el('td', { style: 'width:140px' }, [termin]),
      el('td', { style: 'width:150px' }, [status]),
      el('td', { class: 'w1' }, [
        el('button', { class: 'ghost sm', text: 'öffnen',
          title: 'Das Projekt öffnen und zu den Aufgaben springen',
          onclick: function () { springen(o); } })
      ])
    ];

    var tr = el('tr', { class: A.statusOffen(pt.status) ? '' : 'aufgabezu' }, zellen);

    /* Rückmeldungen stehen unter der Aufgabe, über die ganze Breite —
       sie sind oft länger als eine Zelle. Der eigene Zustand «fragtNach»
       bleibt getrennt von dem der Protokollseite; sonst klappte dort ein
       Feld auf, das hier bedient wurde. */
    var teile = [];
    var liste = P.antwortenListe(pt);
    if (liste) teile.push(liste);
    if (M.fragtNach === pt.id) teile.push(antwortFeld(o));
    else teile.push(el('button', { class: 'ghost sm schreibend noprint antwortplus',
      text: '+ Rückmeldung', title: 'Festhalten, was aus dieser Aufgabe geworden ist',
      onclick: function () { M.fragtNach = pt.id; A.render(); } }));

    var unten = el('tr', {});
    unten.appendChild(el('td', { colspan: 5, style: 'padding-top:0' },
      [el('div', { class: 'antwortblock' }, teile)]));

    return [tr, unten];
  }

  /* Eingabe einer Rückmeldung. Geschrieben wird erst beim Absenden —
     beim Tippen darf nichts neu gezeichnet werden, sonst verliert das
     Feld den Cursor. */
  function antwortFeld(o) {
    var feld = el('textarea', { rows: '1', class: 'zellenarea',
      placeholder: o.punkt.status === 'erledigt' ? 'Was ist das Ergebnis?' : 'Was ist der Stand?',
      style: 'height:30px' });

    function senden() { if (!antwortHinzu(o, feld.value)) abbrechen(); }
    function abbrechen() { M.fragtNach = null; A.render(); }

    feld.addEventListener('input', function () {
      feld.style.height = 'auto';
      feld.style.height = Math.min(120, Math.max(30, feld.scrollHeight + 2)) + 'px';
    });
    feld.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); senden(); }
      if (e.key === 'Escape') { e.preventDefault(); abbrechen(); }
    });
    setTimeout(function () { feld.focus(); }, 0);

    return el('div', { class: 'antwortfeld noprint' }, [
      feld,
      el('div', { class: 'antwortknoepfe' }, [
        el('button', { class: 'primary sm schreibend', text: 'eintragen', onclick: senden }),
        el('button', { class: 'ghost sm', text: 'ohne Vermerk', onclick: abbrechen })
      ])
    ]);
  }

  function springen(o) {
    var p = o.projekt;
    if (A.state.p && A.state.p.id === p.id) {
      A.zeigeSeite('protokolle');
      return;
    }
    A.projektOeffnen(p.id);
    /* Nach dem Öffnen steht die Protokollseite bereit — der Wechsel
       geschieht erst, wenn das Projekt geladen ist. */
    setTimeout(function () { A.zeigeSeite('protokolle'); }, 150);
  }

  function tafel(liste, sicht, leerText) {
    if (!liste.length) return U.hinweis('info', leerText);
    var zeilen = [];
    sortieren(liste).forEach(function (o) {
      zeile(o, sicht).forEach(function (tr) { zeilen.push(tr); });
    });
    return U.tabelle([
      { label: 'Aufgabe' },
      { label: 'Termin', w: '16%' },
      { label: '', w: '13%' },
      { label: 'Status', w: '14%' },
      { label: '', w: '1%' }
    ], zeilen);
  }

  /* ---------------------------------------------------------------
     Die Seite
     --------------------------------------------------------------- */

  V.meineaufgaben = function () {
    var out = el('div', {}, [U.kopf('Meine Aufgaben',
      'Alle Aufgaben über alle Projekte — was Ihnen aufgetragen ist und was Sie vergeben ' +
      'haben. Bearbeitet wird hier, ergänzt im Projekt.')]);

    if (!M.geladen && !M.laeuft) laden();

    if (!A.meineMail()) {
      out.appendChild(U.hinweis('warn',
        'Diese Seite braucht eine Anmeldung: Ihre Aufgaben werden über Ihre Mailadresse ' +
        'gefunden. Im lokalen Modus steht nicht fest, wer Sie sind.'));
      return out;
    }

    var adressIds = A.meineAdressIds();
    if (!adressIds.length) {
      out.appendChild(U.hinweis('warn',
        'Ihre Mailadresse <b>' + A.meineMail() + '</b> steht in keinem Eintrag der ' +
        'Adressliste. Tragen Sie sich dort mit dieser Adresse ein — erst dann lassen sich ' +
        'die Zuständigkeiten aus den Protokollen Ihnen zuordnen.'));
    }

    if (M.laeuft && !M.geladen) {
      out.appendChild(U.hinweis('info', 'Die Aufgaben aller Projekte werden geladen …'));
      return out;
    }
    if (M.fehler) {
      out.appendChild(U.hinweis('warn', 'Die Aufgaben konnten nicht geladen werden: ' + M.fehler));
      return out;
    }

    var alle = alleAufgaben();
    var offenNur = function (liste) {
      return M.zeigeErledigte ? liste : liste.filter(function (o) {
        return A.statusOffen(o.punkt.status) || o.punkt.id === M.fragtNach;
      });
    };
    var meineListe = offenNur(meine(alle, adressIds));
    var vergebenListe = offenNur(vergeben(alle, adressIds));

    /* Umschalter */
    var seg = el('div', { class: 'seg noprint' });
    [{ id: 'meine', label: 'mir zugewiesen (' + meineListe.length + ')' },
     { id: 'vergeben', label: 'von mir vergeben (' + vergebenListe.length + ')' }
    ].forEach(function (a) {
      var b = el('button', { type: 'button', text: a.label,
        class: M.sicht === a.id ? 'on' : '' });
      b.addEventListener('click', function () { M.sicht = a.id; A.render(); });
      seg.appendChild(b);
    });

    var erl = el('input', { type: 'checkbox', checked: M.zeigeErledigte ? '' : null,
      style: 'width:auto' });
    erl.addEventListener('change', function () {
      M.zeigeErledigte = erl.checked; A.render();
    });

    var werkzeuge = el('div', { class: 'panelbody noprint',
      style: 'display:flex;gap:14px;align-items:center;flex-wrap:wrap' }, [
      seg,
      el('label', { style: 'display:flex;gap:6px;align-items:center;font-size:12px' }, [
        erl, el('span', { text: 'erledigte zeigen' })
      ]),
      el('button', { class: 'ghost sm', style: 'margin-left:auto', text: 'neu laden',
        onclick: function () { A.meineAufgabenNeuLaden(); A.render(); } })
    ]);

    var inhalt = M.sicht === 'meine'
      ? tafel(meineListe, 'meine',
          adressIds.length
            ? 'Ihnen ist zurzeit nichts zugewiesen — oder alles ist erledigt.'
            : 'Ohne Eintrag in der Adressliste lässt sich nichts zuordnen.')
      : tafel(vergebenListe, 'vergeben',
          'Sie haben zurzeit nichts offen an andere vergeben. Aufgaben zählen hier, wenn Sie ' +
          'sie erfasst haben oder als Protokollführung im Protokoll stehen.');

    out.appendChild(U.panel(
      M.sicht === 'meine' ? 'Mir zugewiesen' : 'Von mir vergeben',
      M.sicht === 'meine'
        ? 'nach Dringlichkeit — Termin und Priorität zusammen'
        : 'zum Nachfassen, nach Dringlichkeit',
      [werkzeuge, el('div', { class: 'panelbody' }, [inhalt])]));

    out.appendChild(U.panel('Wie diese Liste entsteht', null, [
      el('div', { class: 'panelbody' }, [
        U.hinweis('info',
          '<b>Zuordnung</b> über Ihre Mailadresse: Sie stehen in der Adressliste, und die ' +
          'Beteiligten der Projekte verweisen auf diesen Eintrag.<br>' +
          '<b>Aus versendeten Protokollen</b> stammende Aufgaben sind dort unveränderlich. ' +
          'Sobald Sie eine davon anfassen, lebt sie in der Aufgabenliste des Projekts weiter ' +
          '— das Protokoll bleibt, wie es versendet wurde.<br>' +
          '<b>Neue Aufgaben</b> entstehen im Projekt, nicht hier: Sie brauchen ihren ' +
          'Zusammenhang. Über «öffnen» kommen Sie direkt dorthin.')
      ])
    ]));

    return out;
  };

}(window.APP));
