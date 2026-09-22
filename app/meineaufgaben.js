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
    form: 'liste',         // liste | kanban | person
    zeigeErledigte: false,
    fragtNach: null,       // Aufgabe, zu der ein Rückmeldungsfeld offensteht
    zu: {}                 // aufgeklappte Personengruppen
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

  /* «still» heisst: nicht neu zeichnen. Beim Tippen in ein Textfeld
     würde ein Neuaufbau das Element unter dem Cursor austauschen. */
  function speichern(o, aendern, zurueck, still) {
    var f = A.aufgabeZumBearbeiten(o.projekt.id, o.punkt, o.sitzung, M.sitzungen);
    aendern(f.punkt);

    Promise.resolve(A.store.sitzungSpeichern(f.sitzung))
      .catch(function (fe) { return { ok: false, fehler: fe }; })
      .then(function (erg) {
        if (erg && erg.ok) {
          /* Die gespeicherte Fassung trägt die neue Version — ohne sie
             scheitert der nächste Schreibvorgang am Versionsschutz.
             Der Verweis in «o» muss mitwandern, sonst schreibt der
             nächste Tastendruck in ein verwaistes Objekt. */
          if (erg.sitzung) {
            ersetzen(erg.sitzung);
            o.sitzung = erg.sitzung;
            var neu = (erg.sitzung.punkte || []).find(function (x) { return x.id === o.punkt.id; });
            if (neu) o.punkt = neu;
          }
          if (!still) A.render();
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

  /* Der Wortlaut. Aus einem Protokoll stammende Aufgaben sind dort
     geschrieben worden und bleiben unverändert; eine ohne Protokoll
     erfasste lässt sich hier beschriften — sie hat sonst keinen Ort
     dafür. Gespeichert beim Verlassen des Feldes, nicht beim Tippen. */
  function textFeld(o) {
    var frei = A.istManuell(o.sitzung) && !o.punkt.aus_sitzung;
    if (!frei) return el('div', {}, [el('span', { text: o.punkt.text || '(ohne Text)' })]);

    /* Nur auf «blur» zu speichern reicht nicht: Wer tippt und die Seite
       neu lädt, ohne das Feld zu verlassen, verlöre seinen Text. Also
       zusätzlich ein verzögerter Lauf. Neu gezeichnet wird dabei nicht —
       das Element unter dem Cursor würde ausgetauscht. */
    var timer = null;
    var vorher = o.punkt.text;

    function sichern(v) {
      if (timer) { clearTimeout(timer); timer = null; }
      speichern(o, function (pt) { pt.text = v; },
                function (pt) { pt.text = vorher; }, true);
    }

    var box = U.zelleArea(o.punkt, 'text', {
      platzhalter: 'Was ist zu tun?', min: 30, max: 120,
      eigen: true,
      onchange: function (v) {
        o.punkt.text = v;
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () { timer = null; sichern(v); }, 1200);
      },
      onblur: sichern
    });
    box.feld.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); box.feld.blur(); }
    });
    return box;
  }

  function zeile(o, sicht) {
    var pt = o.punkt;
    var beteiligte = A.beteiligteListe(o.projekt);
    var b = beteiligte.find(function (x) { return x.id === pt.beteiligter; });

    var kopf = el('td', {}, [
      textFeld(o),
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

  /* ---------------------------------------------------------------
     Kanban — dieselben drei Spalten wie im Projekt, nur über alle
     Projekte hinweg. Die Karte nennt deshalb zusätzlich das Projekt.
     --------------------------------------------------------------- */

  function kanban(liste, sicht) {
    var spalten = A.PUNKT_STATUS.map(function (st) {
      return { id: st.id, label: st.label, karten: [] };
    });

    liste.forEach(function (o) {
      var st = o.punkt.status || 'offen';
      /* Übernommene sind abgeschlossen — sie stehen bei den erledigten,
         mit eigenem Vermerk auf der Karte. */
      if (st === A.STATUS_UEBERNOMMEN) st = 'erledigt';
      var sp = spalten.find(function (x) { return x.id === st; }) || spalten[0];
      sp.karten.push(o);
    });
    spalten.forEach(function (sp) { sp.karten = sortieren(sp.karten); });

    var tafel = el('div', { class: 'kanban' });
    spalten.forEach(function (sp) {
      var spalte = el('div', { class: 'kanban-spalte' });
      spalte.appendChild(el('div', { class: 'kanban-kopf' }, [
        el('span', { text: sp.label }),
        el('span', { class: 'zahl', text: String(sp.karten.length) })
      ]));

      var feld = el('div', { class: 'kanban-feld' });
      sp.karten.forEach(function (o) { feld.appendChild(karte(o, spalten, sp, sicht)); });
      if (!sp.karten.length) {
        feld.appendChild(el('div', { class: 'kanban-leer', text: 'nichts hier' }));
      }

      feld.addEventListener('dragover', function (e) {
        e.preventDefault(); feld.classList.add('ueber');
      });
      feld.addEventListener('dragleave', function () { feld.classList.remove('ueber'); });
      feld.addEventListener('drop', function (e) {
        e.preventDefault();
        feld.classList.remove('ueber');
        var id = e.dataTransfer.getData('text/plain');
        var o = liste.find(function (x) { return x.punkt.id === id; });
        if (!o) return;
        var jetzt = o.punkt.status === A.STATUS_UEBERNOMMEN ? 'erledigt' : (o.punkt.status || 'offen');
        if (jetzt === sp.id) return;
        statusSetzen(o, sp.id);
      });

      spalte.appendChild(feld);
      tafel.appendChild(spalte);
    });

    return el('div', {}, [
      tafel,
      el('div', { class: 'hilfe', style: 'margin-top:10px',
        text: 'Karten lassen sich zwischen den Spalten ziehen; die Pfeile auf der Karte tun ' +
              'dasselbe. Überfällige Karten sind rot hinterlegt. Jede Änderung wird sofort ' +
              'gespeichert — dort, wo die Aufgabe steht.' })
    ]);
  }

  function karte(o, spalten, aktuell, sicht) {
    var pt = o.punkt;
    var t = A.thema(pt.thema);
    var pr = A.prioritaet(pt.prio);
    var b = personVon(o);
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

    if (A.istManuell(o.sitzung) && !pt.aus_sitzung) {
      var tf = textFeld(o);
      tf.classList.add('ktext');
      /* Eine ziehbare Karte verschluckt jede Textmarkierung darin. */
      tf.feld.addEventListener('focus', function () { k.draggable = false; });
      tf.feld.addEventListener('blur', function () { k.draggable = true; });
      k.appendChild(tf);
    } else {
      k.appendChild(el('div', { class: 'ktext', text: pt.text || '(ohne Text)' }));
    }

    var marken = el('div', { class: 'kmarken' });
    if (t) marken.appendChild(el('span', { class: 'tag', style: 'border-color:' + t.farbe,
      text: t.label }));
    if (pr.id) marken.appendChild(el('span', { class: 'tag' + (pr.klasse ? ' ' + pr.klasse : ''),
      text: pr.label }));
    if (pt.status === A.STATUS_UEBERNOMMEN) {
      marken.appendChild(el('span', { class: 'tag', text: 'übernommen' }));
    }
    if (marken.childNodes.length) k.appendChild(marken);

    k.appendChild(el('div', { class: 'kfuss' }, [
      /* In der eigenen Sicht ist die Zuständigkeit immer ich — dort
         steht das Projekt an ihrer Stelle. */
      el('span', { text: sicht === 'vergeben'
        ? (b.name || 'ohne Zuständigkeit') : (o.projekt.name || '') }),
      el('span', { class: ueberfaellig ? 'spaet' : '',
        text: pt.termin ? A.datum(pt.termin) : 'ohne Termin' })
    ]));

    var stand = P.antwortenListe(pt, { nurLetzte: true });
    if (stand) k.appendChild(stand);
    if (M.fragtNach === pt.id) k.appendChild(antwortFeld(o));
    else k.appendChild(el('button', { class: 'ghost sm schreibend noprint antwortplus',
      text: '+ Rückmeldung',
      onclick: function () { M.fragtNach = pt.id; A.render(); } }));

    k.appendChild(el('div', { class: 'kherkunft',
      text: (sicht === 'vergeben' ? o.projekt.name + ' · ' : '') + o.herkunft }));

    var ix = spalten.findIndex(function (x) { return x.id === aktuell.id; });
    var knoepfe = el('div', { class: 'kknoepfe noprint' });
    if (ix > 0) knoepfe.appendChild(el('button', { class: 'ghost sm schreibend', text: '‹',
      title: 'nach ' + spalten[ix - 1].label,
      onclick: function () { statusSetzen(o, spalten[ix - 1].id); } }));
    if (ix < spalten.length - 1) knoepfe.appendChild(el('button', { class: 'ghost sm schreibend',
      text: '›', title: 'nach ' + spalten[ix + 1].label,
      onclick: function () { statusSetzen(o, spalten[ix + 1].id); } }));
    knoepfe.appendChild(el('button', { class: 'ghost sm', text: 'öffnen',
      onclick: function () { springen(o); } }));
    k.appendChild(knoepfe);

    return k;
  }

  /* ---------------------------------------------------------------
     Nach Zuständigkeit — für das Telefonat

     Wer mit jemandem spricht, will dessen Aufgaben beisammen haben,
     über alle Projekte hinweg und mit der Nummer gleich daneben.

     Dieselbe Person hat in jedem Projekt eine eigene Beteiligten-Id.
     Zusammengeführt wird deshalb über den Adresseintrag; wer keinen
     hat, über seinen Namen.
     --------------------------------------------------------------- */

  function personVon(o) {
    var b = A.beteiligteListe(o.projekt).find(function (x) {
      return x.id === o.punkt.beteiligter;
    });
    if (!b) return { schluessel: '_ohne', name: '', firma: '', mail: '', telefon: '' };
    return {
      schluessel: b.adresse || ('name:' + String(b.name || '').trim().toLowerCase()) || '_ohne',
      name: b.name || b.kuerzel || '',
      kuerzel: b.kuerzel || '',
      firma: b.firma || '', mail: b.mail || '', telefon: b.telefon || '',
      rolle: b.rolle || ''
    };
  }

  function nachPerson(liste) {
    var gruppen = {}, folge = [];
    liste.forEach(function (o) {
      var pn = personVon(o);
      if (!gruppen[pn.schluessel]) {
        gruppen[pn.schluessel] = { person: pn, aufgaben: [], projekte: {} };
        folge.push(pn.schluessel);
      }
      gruppen[pn.schluessel].aufgaben.push(o);
      gruppen[pn.schluessel].projekte[o.projekt.id] = true;
    });

    /* Wer am meisten offen hat, steht oben — dort lohnt der Anruf. */
    folge.sort(function (a, b) {
      var d = gruppen[b].aufgaben.length - gruppen[a].aufgaben.length;
      if (d) return d;
      return String(gruppen[a].person.name).localeCompare(String(gruppen[b].person.name));
    });

    var out = el('div', {});
    folge.forEach(function (k) {
      var g = gruppen[k], pn = g.person;
      var zu = !!M.zu[k];
      var offen = g.aufgaben.filter(function (o) { return A.statusOffen(o.punkt.status); }).length;
      var spaet = g.aufgaben.filter(function (o) {
        return o.punkt.termin && o.punkt.termin < A.heute() && A.statusOffen(o.punkt.status);
      }).length;
      var projektzahl = Object.keys(g.projekte).length;

      var kopf = el('div', { class: 'personenkopf',
        style: 'cursor:pointer;display:flex;gap:10px;align-items:center;flex-wrap:wrap' });
      kopf.addEventListener('click', function () { M.zu[k] = !zu; A.render(); });
      kopf.appendChild(el('span', { style: 'font-weight:600',
        text: (zu ? '▸ ' : '▾ ') + (pn.name || 'ohne Zuständigkeit') }));
      if (pn.firma) kopf.appendChild(el('span', { class: 'muted', text: pn.firma }));
      if (pn.rolle) kopf.appendChild(el('span', { class: 'tag', text: pn.rolle }));
      kopf.appendChild(el('span', { class: 'tag' + (offen ? '' : ' pos'),
        text: offen + (offen === 1 ? ' offen' : ' offen') }));
      if (spaet) kopf.appendChild(el('span', { class: 'tag neg', text: spaet + ' überfällig' }));
      kopf.appendChild(el('span', { class: 'muted', style: 'font-size:11px',
        text: projektzahl + (projektzahl === 1 ? ' Projekt' : ' Projekte') }));

      /* Die Kontaktangaben gehören in den Kopf — genau dafür ist die
         Ansicht da. Telefon und Mail als Verweis, damit ein Klick
         genügt. */
      var kontakt = el('span', { style: 'margin-left:auto;display:flex;gap:12px' });
      if (pn.telefon) {
        kontakt.appendChild(el('a', { href: 'tel:' + String(pn.telefon).replace(/\s/g, ''),
          style: 'font-weight:600', text: pn.telefon,
          onclick: function (e) { e.stopPropagation(); } }));
      }
      if (pn.mail) {
        kontakt.appendChild(el('a', { href: 'mailto:' + pn.mail, class: 'muted', text: pn.mail,
          onclick: function (e) { e.stopPropagation(); } }));
      }
      if (!pn.telefon && !pn.mail) {
        kontakt.appendChild(el('span', { class: 'muted', style: 'font-size:11px',
          text: 'keine Kontaktangaben in der Adressliste' }));
      }
      kopf.appendChild(kontakt);

      out.appendChild(kopf);
      if (zu) return;

      var zeilen = [];
      sortieren(g.aufgaben).forEach(function (o) {
        zeile(o, 'person').forEach(function (tr) { zeilen.push(tr); });
      });
      out.appendChild(U.tabelle([
        { label: 'Aufgabe' },
        { label: 'Termin', w: '16%' },
        { label: '', w: '13%' },
        { label: 'Status', w: '14%' },
        { label: '', w: '1%' }
      ], zeilen));
    });
    return out;
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

  /* ---------------------------------------------------------------
     In den Kalender

     Eine Aufgabe mit Termin gehört dorthin, wo man ohnehin hinschaut.
     Die Datei entsteht im Browser und wird heruntergeladen; Outlook
     nimmt sie mit einem Doppelklick an.

     Bewusst ein Abzug und keine laufende Verbindung: Eine echte
     Abgleichung müsste zwei Systeme auf demselben Stand halten und
     entscheiden, wer gewinnt, wenn beide etwas geändert haben. Das
     wäre eine eigene Aufgabe — hier geht es darum, die Termine
     überhaupt sichtbar zu machen.
     --------------------------------------------------------------- */

  function kalenderKnopf(liste) {
    var mitTermin = (liste || []).filter(function (o) {
      return o.punkt && o.punkt.termin;
    });

    var knopf = el('button', { class: 'ghost sm',
      text: 'In den Kalender (' + mitTermin.length + ')',
      title: mitTermin.length
        ? 'Die Aufgaben mit Termin als Kalenderdatei sichern — in Outlook mit ' +
          'einem Doppelklick übernehmen'
        : 'Keine Aufgabe in dieser Liste hat einen Termin',
      disabled: mitTermin.length ? null : '' });

    knopf.addEventListener('click', function () {
      var termine = mitTermin.map(function (o) {
        var wer = o.punkt.beteiligter
          ? (A.beteiligter(beteiligterAus(o)) || {}).name : '';
        return {
          id: o.punkt.id,
          datum: o.punkt.termin,
          titel: o.punkt.text || 'Aufgabe',
          beschreibung: [
            'Projekt: ' + (o.projekt ? o.projekt.name : ''),
            wer ? 'Zuständig: ' + wer : '',
            o.herkunft ? 'Herkunft: ' + o.herkunft : '',
            String(o.punkt.bemerkung || '').trim()
          ].filter(Boolean).join('\n')
        };
      });

      var name = M.sicht === 'meine' ? 'Meine Aufgaben' : 'Von mir vergeben';
      A.dateiSichern(
        A.icsBauen(termine, 'Projektrechner · ' + name),
        'aufgaben-' + (M.sicht === 'meine' ? 'meine' : 'vergeben') + '.ics',
        'text/calendar;charset=utf-8');
    });

    return knopf;
  }

  /* Der Beteiligte hinter einer Aufgabe — er steht im Projekt, nicht
     im Punkt; dort liegt nur seine Kennung. */
  function beteiligterAus(o) {
    var p = o.projekt;
    return ((p && p.beteiligte) || []).find(function (b) {
      return b.id === o.punkt.beteiligter;
    }) || null;
  }

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

    /* Umschalter. Der Posteingang steht daneben, weil er zum selben
       Arbeitsgang gehört: Was hereinkommt, wird hier zur Aufgabe. */
    var PE = A.posteingangModul;
    if (PE) PE.laden();
    var imPost = PE ? PE.anzahl() : 0;

    var seg = el('div', { class: 'seg noprint' });
    [{ id: 'meine', label: 'mir zugewiesen (' + meineListe.length + ')' },
     { id: 'vergeben', label: 'von mir vergeben (' + vergebenListe.length + ')' },
     { id: 'posteingang', label: 'Posteingang' + (imPost ? ' (' + imPost + ')' : '') }
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

    /* Der Posteingang bringt seine eigene Darstellung mit — Kanban
       und «nach Zuständigkeit» ergeben dort nichts. */
    if (M.sicht === 'posteingang') {
      out.appendChild(U.panel('Posteingang',
        'Mails, aus denen eine Aufgabe werden soll',
        [el('div', { class: 'panelbody noprint',
            style: 'display:flex;gap:14px;align-items:center;flex-wrap:wrap' }, [
            seg,
            el('button', { class: 'ghost sm', style: 'margin-left:auto', text: 'neu laden',
              onclick: function () { PE.laden(true); A.render(); } })
          ]),
         el('div', { class: 'panelbody' }, [
           PE ? PE.ansicht() : U.hinweis('warn', 'Der Posteingang ist nicht geladen.')
         ])]));
      return out;
    }

    /* Darstellung. «nach Zuständigkeit» ergibt nur bei den vergebenen
       Aufgaben Sinn — bei den eigenen bin immer ich zuständig. */
    var formen = [{ id: 'liste', label: 'Liste' }, { id: 'kanban', label: 'Kanban' }];
    if (M.sicht === 'vergeben') formen.push({ id: 'person', label: 'nach Zuständigkeit' });
    if (M.form === 'person' && M.sicht !== 'vergeben') M.form = 'liste';

    var formSeg = el('div', { class: 'seg noprint' });
    formen.forEach(function (f) {
      var b = el('button', { type: 'button', text: f.label,
        class: M.form === f.id ? 'on' : '' });
      b.addEventListener('click', function () { M.form = f.id; A.render(); });
      formSeg.appendChild(b);
    });

    /* Die Liste steht vor den Werkzeugen: Der Kalenderknopf braucht
       sie, um zu wissen, wie viele Termine er mitnimmt. */
    var liste = M.sicht === 'meine' ? meineListe : vergebenListe;

    var werkzeuge = el('div', { class: 'panelbody noprint',
      style: 'display:flex;gap:14px;align-items:center;flex-wrap:wrap' }, [
      seg,
      formSeg,
      el('label', { style: 'display:flex;gap:6px;align-items:center;font-size:12px' }, [
        erl, el('span', { text: 'erledigte zeigen' })
      ]),
      el('span', { style: 'margin-left:auto;display:flex;gap:8px' }, [
        kalenderKnopf(liste),
        el('button', { class: 'ghost sm', text: 'neu laden',
          onclick: function () { A.meineAufgabenNeuLaden(); A.render(); } })
      ])
    ]);

    var leer = M.sicht === 'meine'
      ? (adressIds.length
          ? 'Ihnen ist zurzeit nichts zugewiesen — oder alles ist erledigt.'
          : 'Ohne Eintrag in der Adressliste lässt sich nichts zuordnen.')
      : 'Sie haben zurzeit nichts offen an andere vergeben. Aufgaben zählen hier, wenn Sie ' +
        'sie erfasst haben oder als Protokollführung im Protokoll stehen.';

    var inhalt;
    if (!liste.length) inhalt = U.hinweis('info', leer);
    else if (M.form === 'kanban') inhalt = kanban(liste, M.sicht);
    else if (M.form === 'person') inhalt = nachPerson(liste);
    else inhalt = tafel(liste, M.sicht, leer);

    var untertitel = M.form === 'person'
      ? 'alle Aufgaben je Person, über alle Projekte — mit Nummer für den Anruf'
      : (M.form === 'kanban'
          ? 'nach Stand, über alle Projekte'
          : (M.sicht === 'meine'
              ? 'nach Dringlichkeit — Termin und Priorität zusammen'
              : 'zum Nachfassen, nach Dringlichkeit'));

    out.appendChild(U.panel(
      M.sicht === 'meine' ? 'Mir zugewiesen' : 'Von mir vergeben',
      untertitel,
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
