/* =====================================================================
   Projektrechner · Baurecht-Check

   Eine Sammlung des für dieses Grundstück geltenden Baurechts. Die
   Fragen stehen im firmenweiten Katalog (Verwaltung), die Antworten
   im Projekt. Der Reiter rechnet nichts — er hält fest, was gilt, mit
   der Rechtsgrundlage daneben.

   Vier Prüfpunkte kennt die Kalkulation ebenfalls. Sie werden hier
   nicht geschrieben, sondern nebeneinandergestellt: Wer im Baurecht
   eine Ausnützungsziffer von 0.6 einträgt und mit 0.9 rechnet, soll
   das sehen, ohne dass ihm jemand still die Marge verändert.
   ===================================================================== */
(function () {
  'use strict';

  var A = window.APP, U = A.ui, el = U.el;
  var B = {};
  A.baurecht = B;

  /* Welche Gruppen eingeklappt sind — nur Ansichtssache, gehört nicht
     zu den Projektdaten. */
  var zu = {};

  /* Statusfilter. Wie der Filter im Portfolio eine Ansichtseinstellung
     und kein Projektinhalt: Er bleibt lokal gemerkt und gilt beim
     nächsten Aufruf wieder. null = alles zeigen. */
  var FILTER_KEY = 'projektrechner.baurechtfilter';

  function filterLesen() {
    try {
      var roh = localStorage.getItem(FILTER_KEY);
      if (!roh) return null;
      var l = JSON.parse(roh);
      return Array.isArray(l) ? l : null;
    } catch (e) { return null; }
  }

  function filterSchreiben(liste) {
    try {
      if (!liste) localStorage.removeItem(FILTER_KEY);
      else localStorage.setItem(FILTER_KEY, JSON.stringify(liste));
    } catch (e) { /* privater Modus: gilt dann nur für diese Sitzung */ }
  }

  function sichtbar(status, gewaehlt) {
    return !gewaehlt || gewaehlt.indexOf(status || 'offen') >= 0;
  }

  /* Der Achtung-Filter. Eigener Schalter statt eines vierten
     Statuschips: Achtung ist kein Status, sondern liegt quer dazu —
     ein markierter Punkt kann offen, geprüft oder nicht relevant
     sein. Beide Filter greifen zusammen. */
  var ACHTUNG_KEY = 'projektrechner.baurechtachtung';

  function nurAchtungLesen() {
    try { return localStorage.getItem(ACHTUNG_KEY) === '1'; }
    catch (e) { return false; }
  }

  function nurAchtungSchreiben(an) {
    try {
      if (an) localStorage.setItem(ACHTUNG_KEY, '1');
      else localStorage.removeItem(ACHTUNG_KEY);
    } catch (e) { /* privater Modus: gilt dann nur für diese Sitzung */ }
  }

  function zeigen(e, gewaehlt, nurAchtung) {
    if (nurAchtung && !e.achtung) return false;
    return sichtbar(e.status, gewaehlt);
  }

  /* Wo der Bearbeitungsstand angezeigt wird. Ein Statuswechsel darf
     die Seite nicht neu zeichnen: Wer gerade tippt, verlöre dabei
     Cursor und Rest der Eingabe. Stattdessen werden genau diese
     Anzeigen nachgeführt, und die Tabelle bleibt stehen. */
  var anzeige = { balken: null, kacheln: null, gruppen: {}, achtungZahl: null };

  function standNachfuehren(p) {
    var stand = A.baurechtStand(p);
    var anteil = stand.gesamt ? stand.fertig / stand.gesamt : 0;

    if (anzeige.achtungZahl) anzeige.achtungZahl.textContent = String(stand.achtung);

    if (anzeige.balken) {
      anzeige.balken.style.width = (anteil * 100).toFixed(1) + '%';
      anzeige.balken.classList.toggle('voll', anteil >= 1);
    }
    if (anzeige.kacheln) {
      anzeige.kacheln.geprueftWert.textContent = stand.fertig + ' / ' + stand.gesamt;
      anzeige.kacheln.geprueftWert.className = 'v ' + (anteil >= 1 ? 'gut' : '');
      anzeige.kacheln.geprueftFuss.textContent =
        stand.offen ? stand.offen + ' offen' : 'vollständig';
      anzeige.kacheln.eintragWert.textContent = String(stand.gefuellt);
    }

    A.baurechtPunkte(p).forEach(function (block) {
      var marke = anzeige.gruppen[block.gruppe.id];
      if (!marke) return;
      var offen = zaehleOffen(p, block);
      marke.textContent = offen ? offen + ' offen' : 'vollständig';
      marke.className = 'tag ' + (offen ? 'warn' : 'pos');
    });
  }

  /* ---------------------------------------------------------------
     Die Seite
     --------------------------------------------------------------- */

  /* Welches Projekt zuletzt gezeichnet wurde. Die Prüfpunkt-Kennungen
     sind in allen Projekten dieselben — ohne diese Merkung stünde in
     einem frisch geöffneten Projekt dieselbe Belegzeile offen wie im
     vorigen, meist eine leere. */
  var zuletzt = null;

  A.views.baurecht = function (p) {
    var out = el('div', {});
    var stand = A.baurechtStand(p);
    var gewaehlt = filterLesen();
    var nurAchtung = nurAchtungLesen();
    anzeige = { balken: null, kacheln: null, gruppen: {}, achtungZahl: null };

    if (zuletzt !== p.id) { belegeOffen = {}; zuletzt = p.id; }

    out.appendChild(U.kopf('Baurecht-Check',
      'Das für dieses Grundstück geltende Baurecht. Die Prüfpunkte werden ' +
      'unter Verwaltung gepflegt und gelten für alle Projekte.'));

    out.appendChild(fortschritt(p, stand, gewaehlt, nurAchtung));

    A.baurechtPunkte(p).forEach(function (block) {
      out.appendChild(gruppenPanel(p, block, gewaehlt, nurAchtung));
    });

    out.appendChild(el('div', { class: 'panel noprint' }, [
      el('div', { class: 'panelbody' }, [
        U.hinweis('info',
          'Die Prüfpunkte stammen aus der Baurecht-Checkliste und sind für alle ' +
          'Projekte gleich — gepflegt werden sie unter <b>Verwaltung</b>. Mit ' +
          '<b>+ Prüfpunkt</b> ergänzen Sie eine Zeile, die nur in diesem Projekt gilt; ' +
          'was firmenweit gelten soll, gehört in die Verwaltung. <b>Nicht relevant</b> ' +
          'ist eine Antwort: Der Punkt wurde geprüft und trifft hier nicht zu. ' +
          'Mit <b>⚠</b> am Zeilenende markieren Sie einen Punkt, bei dem genau ' +
          'hinzuschauen ist — etwa weil die Regel von Kanton zu Kanton anders lautet. ' +
          'Die Zeile wird rot hinterlegt, der Chip <b>⚠ Achtung</b> oben zeigt nur noch ' +
          'diese Punkte. Die Markierung gilt nur in diesem Projekt. ' +
          'Mit <b>📎</b> klappen Sie die Belege auf: Screenshots des Paragraphen oder ' +
          'des Planausschnitts, auf den sich der Eintrag stützt. Ein Bild lässt sich ' +
          'auf die Zeile ziehen, mit <b>Strg+V</b> einfügen oder auswählen; die Zeile ' +
          'darunter hält fest, woher der Ausschnitt stammt. Belege liegen in der ' +
          'Firmenablage, nicht im Projekt — auf dem Ausdruck dieser Seite ' +
          'erscheinen sie nicht. Wer sie mit aufs Papier braucht, nimmt ' +
          '<b>Export / PDF</b> oben: ein eigenes Dokument mit Briefkopf, Belegen ' +
          'und Kästchen zum Abhaken.')
      ])
    ]));

    return out;
  };

  /* ---------------------------------------------------------------
     Bearbeitungsstand
     --------------------------------------------------------------- */

  /* Offen ist, was weder geprüft noch als nicht relevant abgehakt
     ist — an einer Stelle festgelegt, damit Panelmarke und
     Nachführung nicht auseinanderlaufen können. */
  function zaehleOffen(p, block) {
    return block.punkte.filter(function (pt) {
      var st = A.baurechtEintrag(p, pt.id).status;
      return st !== 'geprueft' && st !== 'entfaellt';
    }).length;
  }

  /* Ein Chip je Status, mit der Zahl dahinter. Ausgeschaltete Stati
     verschwinden aus den Tabellen; die Zahlen im Stand darüber zählen
     weiterhin den ganzen Katalog — sonst sähe eine gefilterte Ansicht
     wie ein fertig geprüftes Projekt aus. */
  function filterchips(p, gewaehlt, nurAchtung) {
    var alle = A.BAURECHT_STATUS.map(function (s) { return s.id; });
    var proStatus = {};
    var markiert = 0;
    A.baurechtPunkte(p).forEach(function (block) {
      block.punkte.forEach(function (pt) {
        var e = A.baurechtEintrag(p, pt.id);
        var st = e.status || 'offen';
        proStatus[st] = (proStatus[st] || 0) + 1;
        if (e.achtung) markiert++;
      });
    });

    var chips = el('div', { class: 'chips' });
    A.BAURECHT_STATUS.forEach(function (st) {
      var an = sichtbar(st.id, gewaehlt);
      var anzahl = proStatus[st.id] || 0;
      var c = el('button', { type: 'button', class: 'chip' + (an ? ' on' : ''),
        title: an ? 'ausblenden' : 'wieder einblenden' }, [
        el('span', { text: st.label }),
        el('span', { class: 'zahl', text: String(anzahl) })
      ]);
      c.addEventListener('click', function () {
        var basis = gewaehlt ? gewaehlt.slice() : alle.slice();
        var i = basis.indexOf(st.id);
        if (i >= 0) basis.splice(i, 1); else basis.push(st.id);
        /* Alles gewählt = kein Filter. Eine leere Auswahl bleibt
           bestehen: So lässt sich von «nichts» aus gezielt ein
           einzelner Status einschalten. */
        filterSchreiben(basis.length === alle.length ? null : basis);
        A.render();
      });
      chips.appendChild(c);
    });

    /* Der Achtung-Chip steht abgesetzt hinter den Statuschips — er
       filtert nach etwas anderem und soll nicht wie ein vierter
       Status aussehen. Seine Zahl wird beim Markieren am Ort
       nachgeführt, damit die Tabelle stehen bleibt. */
    var azahl = el('span', { class: 'zahl', text: String(markiert) });
    anzeige.achtungZahl = azahl;
    var ac = el('button', { type: 'button',
      class: 'chip achtungchip' + (nurAchtung ? ' on' : ''),
      title: nurAchtung
        ? 'wieder alle Prüfpunkte zeigen'
        : 'nur die mit Achtung markierten Prüfpunkte zeigen' }, [
      el('span', { text: '⚠ Achtung' }), azahl
    ]);
    ac.addEventListener('click', function () {
      nurAchtungSchreiben(!nurAchtung);
      A.render();
    });
    chips.appendChild(ac);

    if (gewaehlt) {
      chips.appendChild(el('button', { type: 'button', class: 'chip', text: 'alle zeigen',
        onclick: function () { filterSchreiben(null); A.render(); } }));
    }
    return chips;
  }

  function fortschritt(p, stand, gewaehlt, nurAchtung) {
    var anteil = stand.gesamt ? stand.fertig / stand.gesamt : 0;
    var innen = el('div', { class: 'brbalken-in' + (anteil >= 1 ? ' voll' : ''),
      style: 'width:' + (anteil * 100).toFixed(1) + '%' });
    var balken = el('div', { class: 'brbalken' }, [innen]);

    var kGeprueft = U.kachel('geprüft', stand.fertig + ' / ' + stand.gesamt,
                             stand.offen ? stand.offen + ' offen' : 'vollständig',
                             anteil >= 1 ? 'gut' : '');
    var kEintrag = U.kachel('mit Eintrag', String(stand.gefuellt),
                            'von ' + stand.gesamt + ' Punkten');

    /* Für die Nachführung ohne Neuzeichnen gemerkt. */
    anzeige.balken = innen;
    anzeige.kacheln = {
      geprueftWert: kGeprueft.querySelector('.v'),
      geprueftFuss: kGeprueft.querySelector('.s'),
      eintragWert: kEintrag.querySelector('.v')
    };

    /* Gedruckt muss dastehen, dass gefiltert wurde — ein Blatt, dem
       stillschweigend ein Drittel fehlt, ist irreführend. */
    var versteckt = gewaehlt
      ? A.BAURECHT_STATUS.filter(function (s) { return gewaehlt.indexOf(s.id) < 0; })
          .map(function (s) { return s.label; })
      : [];
    if (nurAchtung) versteckt.push('alles ohne Achtung-Markierung');

    var exportKnopf = el('button', { class: 'primary sm noprint brexportknopf',
      text: '⇩ Export / PDF …',
      title: 'Den Baurecht-Check als eigenes Dokument ausgeben — mit Briefkopf, ' +
             'Belegen und Kästchen zum Abhaken',
      onclick: function () { B.exportDialog(p); } });

    return U.panel('Stand der Prüfung', null, [
      el('div', { class: 'panelbody' }, [
        el('div', { class: 'cols c3' }, [
          kGeprueft, kEintrag,
          U.kachel('Prüfpunkte', String(stand.gesamt), 'Katalog und Ergänzungen')
        ]),
        balken
      ]),
      el('div', { class: 'panelbody' }, [
        el('div', { class: 'noprint',
          style: 'display:flex;gap:12px;align-items:center;flex-wrap:wrap' }, [
          el('span', { class: 'muted',
            style: 'font-size:11px;letter-spacing:.06em;text-transform:uppercase',
            text: 'zeigen' }),
          filterchips(p, gewaehlt, nurAchtung)
        ]),
        versteckt.length
          ? el('div', { class: 'hilfe nurdruck', style: 'margin-top:8px',
              text: 'Ausgeblendet: ' + versteckt.join(', ') +
                    ' — diese Aufstellung ist nicht vollständig.' })
          : null
      ].filter(Boolean))
    ], [exportKnopf]);
  }

  /* ---------------------------------------------------------------
     Eine Gruppe
     --------------------------------------------------------------- */

  function gruppenPanel(p, block, gewaehlt, nurAchtung) {
    var g = block.gruppe;
    var offen = zaehleOffen(p, block);

    /* Gefiltert wird beim Aufbau der Seite, nicht während des Tippens:
       Eine Zeile, deren Status gerade nachrückt, soll einem nicht unter
       dem Cursor verschwinden. Sie steht bis zum nächsten Aufbau. */
    var gezeigt = block.punkte.filter(function (pt) {
      return zeigen(A.baurechtEintrag(p, pt.id), gewaehlt, nurAchtung);
    });
    var weg = block.punkte.length - gezeigt.length;

    /* Je Prüfpunkt entstehen zwei Zeilen: die Angaben und darunter die
       aufklappbare Belegzeile. Sie bleiben Geschwister statt
       verschachtelt zu werden, damit die Spalten weiter fluchten. */
    var zeilen = [];
    gezeigt.forEach(function (pt) {
      punktZeile(p, pt).forEach(function (tr) { zeilen.push(tr); });
    });
    if (!zeilen.length) {
      /* Die Überschrift bleibt auch dann stehen, wenn nichts darunter
         steht — sonst liest sich eine fehlende Gruppe wie ein
         verlorener Abschnitt. */
      zeilen.push(el('tr', {}, [el('td', { colspan: 5, class: 'muted',
        text: weg ? 'Alle ' + weg + ' Prüfpunkte dieser Gruppe sind ausgeblendet.'
                  : 'Keine Prüfpunkte in dieser Gruppe.' })]));
    }

    var koerper = el('div', { class: 'panelbody' }, [U.tabelle([
      { label: 'Prüfpunkt', w: '30%' },
      { label: 'Eintrag', w: '30%' },
      { label: 'Bemerkung / Rechtsgrundlage' },
      { label: 'Status', w: '150px' },
      { label: '' }
    ], zeilen, { class: 'brtabelle' })]);

    var fuss = el('div', { class: 'panelbody noprint' }, [
      el('button', { class: 'schreibend', text: '+ Prüfpunkt',
        title: 'Eine Zeile ergänzen, die nur in diesem Projekt gilt',
        onclick: function () {
          if (!p.baurecht.eigene) p.baurecht.eigene = [];
          p.baurecht.eigene.push({ id: A.uid(), gruppe: g.id, label: '' });
          zu[g.id] = false;
          A.markDirty(); A.render();
        } })
    ]);

    /* Eingeklappt bleibt die Überschrift stehen — man soll sehen, dass
       es die Gruppe gibt, auch wenn man sie gerade nicht braucht. */
    var knopf = el('button', { class: 'ghost sm noprint',
      text: zu[g.id] ? 'aufklappen' : 'zuklappen',
      onclick: function () { zu[g.id] = !zu[g.id]; A.render(); } });

    var marke = el('span', { class: 'tag ' + (offen ? 'warn' : 'pos'),
      text: offen ? offen + ' offen' : 'vollständig' });
    anzeige.gruppen[g.id] = marke;

    var untertitel = weg
      ? gezeigt.length + ' von ' + block.punkte.length + ' Prüfpunkten'
      : block.punkte.length + ' Prüfpunkte';

    var panel = U.panel(g.label, untertitel,
      zu[g.id] ? [] : [koerper, fuss], [marke, knopf]);

    /* Die Gruppenfarbe reist als eigene Eigenschaft mit; die Regeln
       im Stylesheet greifen sie ab. So steht die Zuordnung an einer
       Stelle — im Modell — statt fünfmal im CSS. */
    panel.classList.add('brgpanel');
    panel.style.setProperty('--gruppenfarbe', A.baurechtGruppenfarbe(g.id));

    return panel;
  }

  /* ---------------------------------------------------------------
     Eine Zeile
     --------------------------------------------------------------- */

  function punktZeile(p, pt) {
    var e = A.baurechtEintrag(p, pt.id, true);
    var tr = el('tr', {
      class: (e.status === 'entfaellt' ? 'brentfaellt ' : '') +
             (e.achtung ? 'brachtung' : '')
    });

    /* Spalte 1: der Prüfpunkt. Aus dem Katalog ist er fester Text, eine
       projekteigene Zeile lässt sich hier benennen.

       Der Vermerk «Achtung» steht immer in der Zeile, wird aber nur
       gedruckt und nur, wenn die Zeile markiert ist — geschaltet
       allein über die Klasse am <tr>. So muss beim Umschalten nichts
       nachgeführt werden, was auseinanderlaufen könnte. */
    var eigen = pt.eigen
      ? (p.baurecht.eigene || []).find(function (x) { return x.id === pt.id; })
      : null;
    tr.appendChild(el('td', {}, [
      el('span', { class: 'brachtungmarke', text: 'Achtung' }),
      eigen
        ? U.zelleArea(eigen, 'label', { platzhalter: 'z. B. Lärmschutznachweis' })
        : el('span', { text: pt.label }),
      pt.hilfe ? el('div', { class: 'hilfe', text: pt.hilfe }) : null,
      eigen ? el('div', { class: 'hilfe noprint', text: 'nur in diesem Projekt' }) : null
    ].filter(Boolean)));

    /* Das Statusfeld entsteht zuerst: Der Eintrag rückt den Status
       nach und muss es dafür in der Hand haben. */
    var statuswahl = el('select');
    A.BAURECHT_STATUS.forEach(function (st) {
      statuswahl.appendChild(el('option', { value: st.id, text: st.label,
        selected: (e.status || 'offen') === st.id ? '' : null }));
    });
    statuswahl.addEventListener('change', function () {
      e.status = statuswahl.value;
      tr.classList.toggle('brentfaellt', e.status === 'entfaellt');
      A.markDirty(); standNachfuehren(p);
    });

    /* Spalte 2: der Eintrag, dahinter der Wert aus der Rechnung.

       Hier wurde früher beim ersten Zeichen die ganze Seite neu
       gezeichnet, weil der Status nachrückte — der Fokus sprang aus
       dem Feld und der Rest der Eingabe ging verloren. Neu gezeichnet
       wird jetzt gar nicht mehr: Der Status rückt am Ort nach, und
       Zähler, Balken und Gruppenmarke werden einzeln nachgeführt. */
    var hinweis = rechenhinweis(p, pt, e);
    var wertfeld = U.zelleArea(e, 'wert', {
      platzhalter: '—',
      onchange: function (v) {
        if (v && e.status === 'offen') {
          e.status = 'geprueft';
          statuswahl.value = 'geprueft';
        }
        if (hinweis) hinweis.nachfuehren();
        standNachfuehren(p);
      }
    });
    tr.appendChild(el('td', {}, [wertfeld, hinweis].filter(Boolean)));

    /* Spalte 3: Bemerkung, in der Vorlage meist der Paragraph. Ohne
       Platzhalter — bei 75 Zeilen wäre ein Beispieltext in jeder davon
       nur Lärm, und die Spaltenüberschrift sagt es bereits. */
    tr.appendChild(el('td', {}, [U.zelleArea(e, 'bemerkung', {})]));

    /* Spalte 4: Status */
    tr.appendChild(el('td', {}, [statuswahl]));

    /* Spalte 5: der Achtung-Merker, dahinter bei projekteigenen Zeilen
       das Entfernen.

       Markieren zeichnet die Seite nicht neu — dieselbe Regel wie beim
       Status: Wer nebenan gerade tippt, verlöre sonst Cursor und Rest
       der Eingabe. Geändert wird die Klasse an der Zeile, nachgeführt
       wird die Zahl im Chip. Die Zeile bleibt stehen, auch wenn der
       Achtung-Filter läuft und sie eigentlich herausfiele: Was man
       gerade in der Hand hat, soll einem nicht verschwinden. */
    var aknopf = el('button', { class: 'ghost sm noprint schreibend brachtungknopf', text: '⚠' });

    function aknopfStand() {
      aknopf.classList.toggle('an', !!e.achtung);
      aknopf.title = e.achtung
        ? 'Achtung-Markierung aufheben'
        : 'Achtung — hier genau hinschauen (z. B. von Kanton zu Kanton verschieden)';
      aknopf.setAttribute('aria-pressed', e.achtung ? 'true' : 'false');
    }
    aknopfStand();

    aknopf.addEventListener('click', function () {
      e.achtung = !e.achtung;
      tr.classList.toggle('brachtung', !!e.achtung);
      aknopfStand();
      A.markDirty(); standNachfuehren(p);
    });

    /* Die Belegzeile entsteht immer, bleibt aber zugeklappt, bis
       jemand sie öffnet oder ein Bild darauf fallen lässt. */
    var beleg = belegZeile(p, pt, e);

    tr.appendChild(el('td', { class: 'w1' }, [
      beleg.knopf,
      aknopf,
      eigen
        ? el('button', { class: 'ghost sm schreibend', text: '×',
            title: 'Prüfpunkt entfernen',
            onclick: function () {
              /* Die Belege verschwinden mit dem Prüfpunkt — sonst
                 bliebe in der Ablage liegen, worauf niemand mehr
                 zeigt. Schlägt das Löschen fehl, ist das kein Grund,
                 die Zeile zu behalten: Die Abfrage in update-03.sql
                 findet solche Reste. */
              A.baurechtAlleBilder(p).forEach(function (x) {
                if (x.punktId === pt.id) bildLoeschen(x.bild);
              });
              p.baurecht.eigene = p.baurecht.eigene.filter(function (x) {
                return x.id !== pt.id;
              });
              delete p.baurecht.eintraege[pt.id];
              A.markDirty(); A.render();
            } })
        : null
    ].filter(Boolean)));

    /* Ein Bild, das irgendwo auf die Zeile fällt, landet hier — man
       muss nicht erst aufklappen, um etwas abzulegen. */
    ablageZiel(tr, function (dateien) { beleg.aufnehmen(dateien); });

    return [tr, beleg.zeile];
  }

  /* ---------------------------------------------------------------
     Belege

     Der Screenshot des Paragraphen, auf den sich ein Eintrag stützt.
     Die Bilder liegen in der Dateiablage, im Projekt steht nur der
     Verweis: Die Projektdatei geht bei jeder Eingabe vollständig über
     die Leitung, ein Dutzend Screenshots darin wären mehrere Megabyte
     je Tastendruck.
     --------------------------------------------------------------- */

  /* Welche Belegzeilen offen sind — Ansichtssache wie die
     eingeklappten Gruppen, gehört nicht zu den Projektdaten.
     «offen» heisst im Modul schon der Zähler ungeprüfter Punkte,
     darum der längere Name. */
  var belegeOffen = {};

  /* Geladene Bilder, Pfad -> Zusage auf eine Blob-Adresse. Der
     Zwischenspeicher überlebt das Neuzeichnen; ohne ihn lüde jedes
     Aufklappen dieselben Bilder erneut vom Server. */
  var bildCache = {};

  function bildAdresse(pfad) {
    if (bildCache[pfad]) return bildCache[pfad];
    bildCache[pfad] = A.api.dateiHolen(A.BAURECHT_BUCKET, pfad)
      .then(function (blob) { return URL.createObjectURL(blob); })
      .catch(function (f) {
        /* Nicht im Zwischenspeicher lassen: Beim nächsten Aufklappen
           soll es erneut versucht werden — die Leitung kann wieder da
           sein. */
        delete bildCache[pfad];
        throw f;
      });
    return bildCache[pfad];
  }

  function bildVergessen(pfad) {
    var z = bildCache[pfad];
    delete bildCache[pfad];
    if (z) z.then(function (url) { URL.revokeObjectURL(url); }).catch(function () {});
  }

  function bildLoeschen(bild) {
    bildVergessen(bild.pfad);
    return A.api.dateiLoeschen(A.BAURECHT_BUCKET, bild.pfad).catch(function () {});
  }

  /* ---------------------------------------------------------------
     Belege beim Duplizieren mitnehmen

     «Duplizieren» klont das Projekt mitsamt den Verweisen. Ohne das
     hier zeigten danach zwei Projekte auf dieselben Dateien — und wer
     in der Variante einen Beleg entfernt, risse ihn dem Original
     heraus. Deshalb bekommt die Kopie eigene Dateien.

     Klappt das nicht, verliert die Kopie ihre Belege. Das ist die
     richtige Richtung: Ein Duplikat ohne Bilder lässt sich ergänzen,
     ein geteilter Bestand zerstört beim nächsten Löschen das Original.
     --------------------------------------------------------------- */

  B.belegeUebernehmen = function (kopie) {
    var alle = A.baurechtAlleBilder(kopie);
    if (!alle.length) return Promise.resolve({ kopiert: 0, verloren: 0 });

    if (!ablageDa()) {
      alle.forEach(function (x) {
        A.baurechtBildEntfernen(kopie, x.punktId, x.bild.id);
      });
      return Promise.resolve({ kopiert: 0, verloren: alle.length });
    }

    var kopiert = 0, verloren = 0;
    var reihe = Promise.resolve();

    alle.forEach(function (x) {
      reihe = reihe.then(function () {
        var endung = (x.bild.pfad.match(/\.([a-z0-9]+)$/i) || [null, 'png'])[1];
        var neueId = A.uid();
        var neuerPfad = A.baurechtBildPfad(kopie, x.punktId, neueId, endung);

        return A.api.dateiHolen(A.BAURECHT_BUCKET, x.bild.pfad)
          .then(function (blob) {
            return A.api.dateiHochladen(A.BAURECHT_BUCKET, neuerPfad, blob);
          })
          .then(function () {
            /* Erst wenn die neue Datei liegt, zeigt der Verweis
               dorthin — ein Fehlschlag darf nicht auf halbem Weg
               einen Pfad hinterlassen, unter dem nichts steht. */
            x.bild.id = neueId;
            x.bild.pfad = neuerPfad;
            kopiert++;
          })
          .catch(function () {
            A.baurechtBildEntfernen(kopie, x.punktId, x.bild.id);
            verloren++;
          });
      });
    });

    return reihe.then(function () {
      return { kopiert: kopiert, verloren: verloren };
    });
  };

  /* Ob Belege überhaupt möglich sind. Ohne Anmeldung gibt es keine
     Dateiablage — dann sagt die Zeile das, statt einen Ablageplatz
     anzubieten, der nichts annehmen kann. */
  function ablageDa() {
    return A.api.aktiv() && A.api.angemeldet();
  }

  /* Merkt sich, dass der Ablageort in der Datenbank fehlt. Der Server
     antwortet dann mit «Bucket not found» — richtig, aber für den
     Anwender nutzlos: Er kann daran nichts erkennen und nichts tun.
     Nach dem ersten Fehlschlag steht in der Belegzeile, woran es liegt
     und wer es beheben kann, statt einer Ablagefläche, die nichts
     annimmt. */
  var ablageFehlt = false;

  function istBucketFehler(f) {
    var t = String((f && f.message) || '').toLowerCase();
    return t.indexOf('bucket') >= 0 && t.indexOf('not found') >= 0;
  }

  var ABLAGE_FEHLT_TEXT =
    'Der Ablageort «baurecht» fehlt in der Firmendatenbank — deshalb ' +
    'lassen sich keine Belege speichern. Ein Verwalter richtet ihn ein: ' +
    '<b>db/update-03.sql</b> im SQL-Editor von Supabase ausführen, oder im ' +
    'Dashboard unter <b>Storage</b> einen <b>privaten</b> Bucket namens ' +
    '«baurecht» anlegen und das Skript danach laufen lassen. Die bereits ' +
    'erfassten Verweise im Projekt bleiben dabei unangetastet.';

  /* ---------------------------------------------------------------
     Ein Bild aufnehmen

     Screenshots kommen gross und verlustfrei: 2560 Pixel breit, 2 MB.
     Für die Nachvollziehbarkeit zählt der lesbare Wortlaut, nicht die
     Pixelzahl — 1600 Pixel Breite reichen dafür, und PNG hält den Text
     scharf, weil eine Gesetzesseite aus wenigen Farben besteht.

     Fotos und Pläne komprimiert PNG dagegen schlecht. Wird die Datei
     zu gross, weicht sie auf JPEG aus; bei einem Foto sieht man den
     Unterschied nicht, bei Text käme es gar nicht erst so weit.

     Auch der JPEG-Ausweich bekommt eine Obergrenze. Ein detailreicher
     Planausschnitt liegt bei Qualität 0.88 durchaus noch über einem
     Megabyte — und jedes Megabyte hier ist eines, das beim Aufklappen
     über die Leitung muss. Deshalb wird die Qualität so lange gesenkt,
     bis die Datei unter der Grenze liegt.
     --------------------------------------------------------------- */

  var MAXBREITE = 1600;
  var PNG_GRENZE = 700 * 1024;
  var JPG_GRENZE = 900 * 1024;
  var JPG_STUFEN = [0.88, 0.75, 0.6];

  function alsBlob(c, typ, guete) {
    return new Promise(function (fertig) { c.toBlob(fertig, typ, guete); });
  }

  /* Der Reihe nach immer stärker komprimieren, bis es passt. Reicht
     auch die unterste Stufe nicht, wird sie trotzdem genommen: Ein
     grosser Beleg ist besser als keiner, und der Ablageort hat mit
     seinen 5 MB die harte Grenze. */
  function jpegPassend(c, stufe) {
    stufe = stufe || 0;
    return alsBlob(c, 'image/jpeg', JPG_STUFEN[stufe]).then(function (jpg) {
      if (!jpg) throw new Error('Das Bild liess sich nicht umwandeln.');
      if (jpg.size <= JPG_GRENZE || stufe >= JPG_STUFEN.length - 1) return jpg;
      return jpegPassend(c, stufe + 1);
    });
  }

  function bildAufbereiten(datei) {
    return new Promise(function (fertig, fehler) {
      if (!/^image\//.test(datei.type || '')) {
        fehler(new Error('Das ist kein Bild.')); return;
      }
      if (datei.size > 12 * 1024 * 1024) {
        fehler(new Error('Die Datei ist grösser als 12 MB.')); return;
      }

      var leser = new FileReader();
      leser.onerror = function () { fehler(new Error('Die Datei liess sich nicht lesen.')); };
      leser.onload = function () {
        var bild = new Image();
        bild.onerror = function () { fehler(new Error('Das Bildformat wird nicht unterstützt.')); };
        bild.onload = function () {
          var faktor = Math.min(1, MAXBREITE / (bild.width || MAXBREITE));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(bild.width * faktor));
          c.height = Math.max(1, Math.round(bild.height * faktor));
          var ctx = c.getContext('2d');
          /* Weiss unterlegen: Ein Screenshot mit durchsichtigem Rand
             würde sonst als JPEG schwarz umrandet. */
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(bild, 0, 0, c.width, c.height);

          alsBlob(c, 'image/png').then(function (png) {
            if (png && png.size <= PNG_GRENZE) return { blob: png, endung: 'png' };
            return jpegPassend(c).then(function (jpg) {
              return { blob: jpg, endung: 'jpg' };
            });
          }).then(fertig, fehler);
        };
        bild.src = String(leser.result || '');
      };
      leser.readAsDataURL(datei);
    });
  }

  /* Macht einen Bereich zum Ablageziel. Nur für Dateien — ein
     gezogener Text oder eine verschobene Aufgabe lösen nichts aus. */
  function ablageZiel(knoten, aufnehmen) {
    function hatDateien(e) {
      var t = e.dataTransfer && e.dataTransfer.types;
      if (!t) return false;
      return Array.prototype.indexOf.call(t, 'Files') >= 0;
    }
    knoten.addEventListener('dragover', function (e) {
      if (!hatDateien(e) || !A.darfBearbeiten()) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      knoten.classList.add('brdrueber');
    });
    knoten.addEventListener('dragleave', function (e) {
      if (e.target === knoten) knoten.classList.remove('brdrueber');
    });
    knoten.addEventListener('drop', function (e) {
      if (!hatDateien(e) || !A.darfBearbeiten()) return;
      e.preventDefault();
      knoten.classList.remove('brdrueber');
      aufnehmen(Array.prototype.slice.call(e.dataTransfer.files));
    });
  }

  function belegZeile(p, pt, e) {
    var zelle = el('td', { colspan: 5, class: 'brbelegzelle' });
    var zeile = el('tr', { class: 'brbelege noprint' }, [zelle]);
    zeile.hidden = !belegeOffen[pt.id];

    var knopf = el('button', {
      class: 'ghost sm noprint brbelegknopf',
      title: 'Belege zu diesem Prüfpunkt — Screenshot des Paragraphen, Planausschnitt'
    });

    var galerie = el('div', { class: 'brgalerie' });
    var stapel = el('div', { class: 'brstapel' });

    function knopfStand() {
      var n = A.baurechtBilder(p, pt.id).length;
      knopf.textContent = n ? '📎 ' + n : '📎';
      knopf.classList.toggle('an', n > 0);
      knopf.setAttribute('aria-expanded', belegeOffen[pt.id] ? 'true' : 'false');
    }

    function umschalten(auf) {
      belegeOffen[pt.id] = auf === undefined ? !belegeOffen[pt.id] : !!auf;
      zeile.hidden = !belegeOffen[pt.id];
      if (belegeOffen[pt.id]) zeichnen();
      knopfStand();
    }

    knopf.addEventListener('click', function () { umschalten(); });

    /* --- Ein Bild in der Galerie ---------------------------------- */
    function kachel(bild) {
      var rahmen = el('div', { class: 'brbild' });
      var flaeche = el('div', { class: 'brbildflaeche', text: 'wird geladen …' });
      rahmen.appendChild(flaeche);

      bildAdresse(bild.pfad).then(function (url) {
        U.leeren(flaeche);
        var img = el('img', { src: url, alt: bild.titel || 'Beleg' });
        img.addEventListener('click', function () { gross(bild, url); });
        flaeche.appendChild(img);
        flaeche.title = 'anklicken für die grosse Ansicht';
      }).catch(function (f) {
        flaeche.textContent = 'Bild nicht abrufbar';
        flaeche.classList.add('brfehlt');
        flaeche.title = f.message;
        /* Fehlt der Ablageort, ist nicht dieses eine Bild kaputt,
           sondern die Einrichtung unvollständig. Das gehört unter die
           Galerie, nicht als Tooltip an ein Vorschaubild. */
        if (istBucketFehler(f) && !ablageFehlt) { ablageFehlt = true; zeichnen(); }
      });

      /* Die Bildunterschrift trägt, worauf sich der Ausschnitt stützt.
         Gespeichert wird verzögert wie überall sonst: Beim Tippen
         nichts neu zeichnen, sonst springt der Cursor. */
      rahmen.appendChild(U.zelleArea(bild, 'titel', {
        platzhalter: 'z. B. § 12 Abs. 2 BNO, Fassung vom 3.4.2024'
      }));

      rahmen.appendChild(el('button', {
        class: 'ghost sm schreibend brbildweg', text: '× entfernen',
        onclick: function () {
          if (!confirm('Diesen Beleg entfernen?\n\n' +
                       (bild.titel ? '«' + bild.titel + '»\n\n' : '') +
                       'Das Bild wird aus der Ablage gelöscht und lässt sich ' +
                       'nicht zurückholen.')) return;
          /* Erst der Verweis, dann die Datei: Ein Verweis ohne Datei
             wäre ein totes Vorschaubild, eine Datei ohne Verweis nur
             ein Rest, den die Abfrage in update-03.sql findet. */
          A.baurechtBildEntfernen(p, pt.id, bild.id);
          A.markDirty();
          bildLoeschen(bild);
          zeichnen(); knopfStand();
        }
      }));

      return rahmen;
    }

    function gross(bild, url) {
      var img = el('img', { src: url, alt: bild.titel || 'Beleg',
        style: 'width:100%;height:auto;display:block;border-radius:6px' });
      U.modal(bild.titel || 'Beleg zu «' + pt.label + '»', [
        img,
        bild.titel
          ? null
          : el('div', { class: 'hilfe', style: 'margin-top:8px',
              text: 'Ohne Bildunterschrift — in der Zeile darunter lässt sich ' +
                    'festhalten, woher der Ausschnitt stammt.' })
      ].filter(Boolean));
    }

    /* --- Aufnehmen ------------------------------------------------ */
    function aufnehmen(dateien) {
      if (!dateien || !dateien.length) return;
      if (!A.darfBearbeiten()) {
        A.meldung('warn', 'Zum Ergänzen von Belegen fehlt die Berechtigung.');
        return;
      }
      if (!ablageDa()) {
        A.meldung('warn', 'Belege brauchen eine Anmeldung — ohne sie gibt es ' +
                          'keine Dateiablage.');
        return;
      }

      umschalten(true);
      var bilder = dateien.filter(function (d) { return /^image\//.test(d.type || ''); });
      if (!bilder.length) {
        A.meldung('warn', 'Darin war kein Bild.');
        return;
      }

      var laeuft = el('div', { class: 'brlaeuft',
        text: bilder.length > 1 ? bilder.length + ' Bilder werden abgelegt …'
                                : 'Bild wird abgelegt …' });
      stapel.appendChild(laeuft);

      var reihe = Promise.resolve();
      bilder.forEach(function (datei) {
        reihe = reihe.then(function () { return einesAufnehmen(datei); });
      });
      reihe.then(function () {
        laeuft.remove();
        zeichnen(); knopfStand();
      });
    }

    function einesAufnehmen(datei) {
      return bildAufbereiten(datei).then(function (fertig) {
        var id = A.uid();
        var pfad = A.baurechtBildPfad(p, pt.id, id, fertig.endung);
        return A.api.dateiHochladen(A.BAURECHT_BUCKET, pfad, fertig.blob)
          .then(function () {
            /* Erst wenn die Datei liegt, kommt der Verweis ins
               Projekt — sonst zeigte er ins Leere, falls das
               Hochladen scheitert. */
            /* Die Bildunterschrift bleibt leer. Der Dateiname taugt
               nicht als Vorbelegung — ein Screenshot heisst
               «Bildschirmfoto 2026-09-21 um 14.32.11», aus der
               Zwischenablage «image.png». Beides müsste man erst
               wegräumen, bevor die Fundstelle hineinkann; der
               Platzhalter im leeren Feld sagt besser, was dorthin
               gehört. */
            A.baurechtBildAnlegen(p, pt.id, { id: id, pfad: pfad, titel: '' });
            A.markDirty();
          });
      }).catch(function (f) {
        if (istBucketFehler(f)) {
          /* Kein Bedienfehler, sondern eine fehlende Einrichtung. Die
             Ablagefläche weicht dem Hinweis, damit nicht jeder weitere
             Versuch dieselbe Meldung erzeugt. */
          ablageFehlt = true;
          A.meldung('warn', 'Der Ablageort «baurecht» fehlt in der Datenbank — ' +
            'ein Verwalter muss ihn einrichten (db/update-03.sql).');
          zeichnen();
          return;
        }
        A.meldung('warn', 'Beleg nicht abgelegt: ' + f.message);
      });
    }

    /* --- Die Zeile zeichnen --------------------------------------- */
    function zeichnen() {
      U.leeren(zelle);
      var liste = A.baurechtBilder(p, pt.id);

      U.leeren(galerie);
      liste.forEach(function (b) { galerie.appendChild(kachel(b)); });
      zelle.appendChild(galerie);

      U.leeren(stapel);
      zelle.appendChild(stapel);

      if (!ablageDa()) {
        stapel.appendChild(U.hinweis('info',
          'Belege liegen in der Firmenablage und brauchen eine Anmeldung. ' +
          'Im lokalen Modus lassen sich vorhandene Belege weder anzeigen ' +
          'noch ergänzen — die Verweise im Projekt bleiben unangetastet.'));
        return;
      }

      if (ablageFehlt) {
        stapel.appendChild(U.hinweis('warn', ABLAGE_FEHLT_TEXT));
        return;
      }

      if (!A.darfBearbeiten()) {
        if (!liste.length) {
          stapel.appendChild(el('div', { class: 'hilfe',
            text: 'Keine Belege zu diesem Prüfpunkt.' }));
        }
        return;
      }

      /* Ablagefläche: Ziehen, Einfügen oder Auswählen. Sie ist
         fokussierbar, weil Strg+V sonst nirgends ankäme — ein
         Einfügen geht an das Element, das gerade den Fokus hat. */
      var wahl = el('input', { type: 'file', accept: 'image/*', multiple: '',
        style: 'display:none' });
      wahl.addEventListener('change', function () {
        aufnehmen(Array.prototype.slice.call(wahl.files));
        wahl.value = '';
      });

      var flaeche = el('div', { class: 'brablage', tabindex: '0' }, [
        el('span', { class: 'brablagetext',
          text: 'Screenshot hierher ziehen · anklicken und mit Strg+V einfügen · ' }),
        el('button', { class: 'ghost sm', text: 'Datei wählen',
          onclick: function (ev) { ev.stopPropagation(); wahl.click(); } }),
        wahl
      ]);

      flaeche.addEventListener('click', function () { flaeche.focus(); });
      flaeche.addEventListener('paste', function (ev) {
        var teile = (ev.clipboardData && ev.clipboardData.items) || [];
        var dateien = [];
        Array.prototype.forEach.call(teile, function (t) {
          if (t.kind === 'file') {
            var d = t.getAsFile();
            if (d) dateien.push(d);
          }
        });
        if (!dateien.length) return;
        ev.preventDefault();
        aufnehmen(dateien);
      });

      ablageZiel(flaeche, aufnehmen);
      stapel.appendChild(flaeche);
    }

    ablageZiel(zeile, aufnehmen);
    knopfStand();
    if (belegeOffen[pt.id]) zeichnen();

    return { zeile: zeile, knopf: knopf, aufnehmen: aufnehmen };
  }

  /* Was die Kalkulation zu diesem Punkt sagt. Nur eine Anzeige — und
     ein Hinweis, wenn beides nicht zusammenpasst. */
  function rechenhinweis(p, pt, e) {
    if (!pt.rechen) return null;
    var rw = A.baurechtRechenwert(p, A.state.r, pt.rechen);
    if (!rw) return null;

    var text = 'gerechnet: ' + A.fmt(rw.wert, rw.dez) + (rw.einheit ? ' ' + rw.einheit : '');
    var box = el('div', { class: 'hilfe' });

    /* Beim Tippen mitziehen, ohne die Zeile neu zu bauen. */
    box.nachfuehren = function () {
      var eigen = zahlAus(e.wert);
      /* Abweichungen erst ab einem halben Prozent melden — sonst
         schlägt jede Rundung an. */
      var weicht = eigen !== null && rw.wert > 0 &&
                   Math.abs(eigen - rw.wert) / rw.wert > 0.005;
      box.textContent = weicht ? text + ' — weicht ab' : text;
      box.className = 'hilfe' + (weicht ? ' brweicht' : '');
    };
    box.nachfuehren();
    return box;
  }

  /* Aus «0.6», «0.60 gemäss §6» oder «2257 m²» die Zahl herausziehen.
     Steht keine am Anfang, gibt es nichts zu vergleichen. */
  function zahlAus(s) {
    var m = String(s == null ? '' : s).trim()
      .replace(/'/g, '').match(/^-?\d+(?:[.,]\d+)?/);
    if (!m) return null;
    var n = parseFloat(m[0].replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  /* ===================================================================
     Export als PDF

     Der Reiter selbst lässt sich drucken, aber das Blatt ist eine
     Übersicht: keine Belege, keine Kästchen, und der ganze Katalog.
     Hier entsteht etwas anderes — ein Dokument, das allein steht und
     aus dem Haus geht: mit Briefkopf, den Eckdaten des Grundstücks,
     den Belegen unter ihrem Prüfpunkt und einem Kästchen je Zeile.

     Ohne Fremdbibliothek: Gedruckt wird der Browser-Druckdialog, in
     dem «Als PDF sichern» steht. Das ergibt ein durchsuchbares PDF mit
     echtem Text — ein selbstgebauter PDF-Erzeuger lieferte Bilder von
     Buchstaben und wöge ein Vielfaches.
     =================================================================== */

  /* Umfang und Auswahl stehen im Modell — sie bestimmen die Aussage
     des Dokuments und werden dort geprüft. */
  var UMFANG = A.BAURECHT_UMFANG;
  var exportPunkte = A.baurechtExportPunkte;

  /* ---------------------------------------------------------------
     Belege vorladen

     Ein <img>, dessen Bild noch unterwegs ist, druckt als leerer
     Kasten. Der Druckdialog wartet nicht. Also erst alles holen und
     dekodieren lassen, dann drucken.
     --------------------------------------------------------------- */

  function belegeVorladen(p, bloecke, melden) {
    var offen = [];
    bloecke.forEach(function (block) {
      block.punkte.forEach(function (pt) {
        A.baurechtBilder(p, pt.id).forEach(function (bild) {
          offen.push(bild);
        });
      });
    });

    if (!offen.length || !ablageDa()) return Promise.resolve({});

    var fertig = 0;
    var karte = {};
    melden(0, offen.length);

    return Promise.all(offen.map(function (bild) {
      return bildAdresse(bild.pfad).then(function (url) {
        /* Erst wenn das Bild entschlüsselt ist, hat es Masse und
           druckt. Browser ohne decode() fallen auf onload zurück. */
        var img = new Image();
        img.src = url;
        var da = img.decode ? img.decode() : new Promise(function (ok, weg) {
          img.onload = ok; img.onerror = weg;
        });
        return da.then(function () { karte[bild.pfad] = url; });
      }).catch(function () {
        /* Ein Beleg, der sich nicht holen lässt, hält das Dokument
           nicht auf — an seiner Stelle steht ein Vermerk. */
      }).then(function () {
        melden(++fertig, offen.length);
      });
    })).then(function () { return karte; });
  }

  /* ---------------------------------------------------------------
     Das Blatt
     --------------------------------------------------------------- */

  function kasten(status) {
    var k = el('span', { class: 'brxkasten' });
    if (status === 'geprueft') { k.classList.add('an'); k.textContent = '✓'; }
    else if (status === 'entfaellt') { k.classList.add('aus'); k.textContent = '–'; }
    return k;
  }

  function eckdaten(p) {
    /* Parzelle und Zone stehen bereits im Baurecht-Check — sie hier
       noch einmal abzufragen wäre doppelte Pflege. */
    function ausPunkt(id) {
      return String(A.baurechtEintrag(p, id).wert || '').trim();
    }
    var kt = A.KANTONE[p.kanton];
    return [
      ['Projekt', p.name || 'Projekt'],
      ['Ort', [p.ort, kt && kt.label].filter(Boolean).join(', ')],
      ['Parzelle', ausPunkt('gst_parzellennummer')],
      ['Zone', ausPunkt('gst_zone')]
    ].filter(function (z) { return z[1]; });
  }

  /* Das heutige Datum als ISO-Tag. Nicht über toISOString(): Das
     rechnet in UTC und schriebe abends nach 22 Uhr Schweizer Zeit
     bereits den Vortag aufs Blatt. */
  function heuteIso() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function verfasser() {
    var pr = A.api.profil, b = A.api.benutzer && A.api.benutzer();
    return (pr && pr.name) || (b && b.email) || '';
  }

  function exportBaum(p, umfang, bloecke, bildkarte) {
    var bk = A.absender(p);
    var logo = A.logoFuer(p);
    var u = UMFANG.find(function (x) { return x.id === umfang; }) || UMFANG[0];

    var out = el('div', { id: 'brexport' });

    /* --- Briefkopf ------------------------------------------------ */
    out.appendChild(el('div', { class: 'brxkopf' }, [
      logo && logo.bild
        ? el('img', { src: logo.bild, alt: logo.label, class: 'brxlogo' })
        : el('div', { class: 'brxfirma', text: bk.firma || '' }),
      el('div', { class: 'brxabsender' }, [
        el('div', { class: 'brxfirma2', text: logo && logo.bild ? (bk.firma || '') : '' }),
        el('div', { text: bk.adresse || '' })
      ])
    ]));

    /* --- Titel und Eckdaten --------------------------------------- */
    out.appendChild(el('h1', { class: 'brxtitel', text: 'Baurecht-Check' }));

    var eck = el('div', { class: 'brxeck' });
    eckdaten(p).forEach(function (z) {
      eck.appendChild(el('div', { class: 'brxeckfeld' }, [
        el('span', { class: 'brxecklabel', text: z[0] }),
        el('span', { class: 'brxeckwert', text: z[1] })
      ]));
    });
    out.appendChild(eck);

    var wer = verfasser();
    out.appendChild(el('div', { class: 'brxstand',
      text: [A.datum(heuteIso()),
             wer ? 'erstellt von ' + wer : '',
             u.id === 'alle' ? null : 'Auszug: ' + u.label]
        .filter(Boolean).join(' · ') }));

    /* Ein Auszug muss sich als Auszug zu erkennen geben. Ein Blatt,
       dem stillschweigend die Hälfte fehlt, ist irreführend — jemand
       könnte es für den vollständigen Stand halten. */
    if (u.id !== 'alle') {
      out.appendChild(el('div', { class: 'brxauszug',
        text: 'Diese Aufstellung ist nicht vollständig: Sie zeigt ' + u.label +
              ' (' + u.hilfe + ').' }));
    }

    /* --- Die Gruppen ---------------------------------------------- */
    bloecke.forEach(function (block) {
      /* Dieselbe Farbe wie im Reiter — wer beides nebeneinander hat,
         findet sich zurecht. Die Linie unter der Überschrift bleibt,
         damit die Gliederung auch auf einem Schwarzweissdruck steht. */
      var gh = el('h2', { class: 'brxgruppe', text: block.gruppe.label });
      gh.style.setProperty('--gruppenfarbe',
        A.baurechtGruppenfarbe(block.gruppe.id));
      out.appendChild(gh);

      var tab = el('table', { class: 'brxtab' });
      var kopf = el('thead', {}, [el('tr', {}, [
        el('th', { class: 'brxk', text: '' }),
        el('th', { style: 'width:26%', text: 'Prüfpunkt' }),
        el('th', { style: 'width:26%', text: 'Eintrag' }),
        el('th', { text: 'Bemerkung / Rechtsgrundlage' }),
        el('th', { style: 'width:15%', text: 'Status' })
      ])]);
      tab.appendChild(kopf);

      var koerper = el('tbody', {});
      block.punkte.forEach(function (pt) {
        var e = A.baurechtEintrag(p, pt.id);
        var bilder = A.baurechtBilder(p, pt.id);

        var tr = el('tr', {
          class: 'brxzeile' + (e.achtung ? ' brxachtung' : '') +
                 (e.status === 'entfaellt' ? ' brxentfaellt' : '')
        });

        tr.appendChild(el('td', { class: 'brxk' }, [kasten(e.status)]));

        tr.appendChild(el('td', {}, [
          e.achtung ? el('span', { class: 'brxachtungmarke', text: 'Achtung' }) : null,
          el('div', { class: 'brxname', text: pt.label }),
          pt.hilfe ? el('div', { class: 'brxhilfe', text: pt.hilfe }) : null
        ].filter(Boolean)));

        /* Der gerechnete Wert steht klein unter dem Eintrag — und ein
           Vermerk, wenn Baurecht und Kalkulation auseinanderlaufen.
           Genau dafür gibt es die Gegenüberstellung. */
        var rw = pt.rechen ? A.baurechtRechenwert(p, A.state.r, pt.rechen) : null;
        var gerechnet = null;
        if (rw) {
          var eigen = zahlAus(e.wert);
          var weicht = eigen !== null && rw.wert > 0 &&
                       Math.abs(eigen - rw.wert) / rw.wert > 0.005;
          gerechnet = el('div', { class: 'brxgerechnet' + (weicht ? ' brxweicht' : ''),
            text: 'gerechnet: ' + A.fmt(rw.wert, rw.dez) +
                  (rw.einheit ? ' ' + rw.einheit : '') +
                  (weicht ? ' — weicht ab' : '') });
        }

        tr.appendChild(el('td', {}, [
          el('div', { class: 'brxwert', text: String(e.wert || '').trim() || '—' }),
          gerechnet
        ].filter(Boolean)));

        tr.appendChild(el('td', {}, [
          el('div', { class: 'brxbem', text: String(e.bemerkung || '').trim() })
        ]));

        tr.appendChild(el('td', {}, [
          el('span', { text: A.baurechtStatusLabel(e.status) })
        ]));

        koerper.appendChild(tr);

        /* Die Belege stehen unter ihrem Prüfpunkt, nicht hinten im
           Anhang: Beim Lesen soll der Paragraph neben der Antwort
           stehen. */
        if (bilder.length) {
          var btr = el('tr', { class: 'brxbelegzeile' +
            (e.achtung ? ' brxachtung' : '') });
          var bz = el('td', { colspan: 5, class: 'brxbelegzelle' });
          bilder.forEach(function (bild) {
            var url = bildkarte[bild.pfad];
            bz.appendChild(el('figure', { class: 'brxbeleg' }, [
              url
                ? el('img', { src: url, alt: bild.titel || 'Beleg' })
                : el('div', { class: 'brxbelegfehlt',
                    text: 'Beleg nicht abrufbar' }),
              el('figcaption', {
                text: String(bild.titel || '').trim() || 'ohne Bildunterschrift' })
            ]));
          });
          btr.appendChild(bz);
          koerper.appendChild(btr);
        }
      });

      tab.appendChild(koerper);
      out.appendChild(tab);
    });

    if (!bloecke.length) {
      out.appendChild(el('div', { class: 'brxleer',
        text: 'Zu diesem Umfang gibt es keine Prüfpunkte.' }));
    }

    /* Die Fusszeile des Briefkopfs bleibt draussen. Sie heisst in der
       Verwaltung «Fusszeile auf dem Protokoll» und lautet meist
       sinngemäss «Einwände innert zehn Tagen, danach gilt es als
       genehmigt» — auf einem Baurechtsblatt wäre das nicht nur
       unpassend, sondern eine Aussage, die niemand gemacht hat.

       Stattdessen steht hier, woher das Blatt kommt und worauf es
       sich stützt: Ein Empfänger soll den Stand einordnen können. */
    out.appendChild(el('div', { class: 'brxfuss',
      text: 'Baurecht-Check aus dem Projektrechner' +
            (bk.firma ? ', ' + bk.firma : '') +
            '. Die Angaben geben den Stand vom ' + A.datum(heuteIso()) +
            ' wieder und ersetzen keine Rechtsauskunft.' }));

    return out;
  }

  /* ---------------------------------------------------------------
     Drucken

     Der Baum wird an den Körper gehängt und alles andere für den
     Druck ausgeblendet. Ein eigenes Fenster wäre die Alternative,
     scheitert aber an den Belegen: Deren Adressen gelten nur in
     diesem Dokument.
     --------------------------------------------------------------- */

  var amDrucken = null;

  function aufraeumen() {
    if (!amDrucken) return;
    document.body.classList.remove('baurechtexport');
    if (amDrucken.parentNode) amDrucken.parentNode.removeChild(amDrucken);
    amDrucken = null;
  }

  window.addEventListener('afterprint', aufraeumen);

  function drucken(baum) {
    aufraeumen();
    amDrucken = baum;
    document.body.appendChild(baum);
    document.body.classList.add('baurechtexport');
    window.print();

    /* Aufgeräumt wird über «afterprint», nicht über einen kurzen
       Zeitgeber: In Chrome hält window.print() den Faden an, in
       anderen Browsern nicht — dort risse ein Zeitgeber von ein, zwei
       Sekunden das Dokument weg, während der Druckdialog noch offen
       ist, und es käme ein leeres Blatt heraus.

       Bleibt der Baum doch einmal liegen, schadet das nichts: Am
       Bildschirm ist er unsichtbar, und der nächste Export räumt ihn
       ohnehin weg. Die lange Frist ist nur gegen Browser gerichtet,
       die «afterprint» gar nicht kennen. */
    setTimeout(aufraeumen, 60000);
  }

  /* ---------------------------------------------------------------
     Der Dialog
     --------------------------------------------------------------- */

  function exportDialog(p) {
    var umfang = 'alle';

    var zahl = el('div', { class: 'hilfe', style: 'margin-top:10px' });
    var fortschritt = el('div', { class: 'hilfe', style: 'margin-top:6px' });

    function zaehlen() {
      var bloecke = exportPunkte(p, umfang);
      var punkte = 0, bilder = 0;
      bloecke.forEach(function (b) {
        punkte += b.punkte.length;
        b.punkte.forEach(function (pt) {
          bilder += A.baurechtBilder(p, pt.id).length;
        });
      });
      zahl.textContent = punkte + ' Prüfpunkt' + (punkte === 1 ? '' : 'e') +
        ' in ' + bloecke.length + ' Gruppe' + (bloecke.length === 1 ? '' : 'n') +
        (bilder ? ', ' + bilder + ' Beleg' + (bilder === 1 ? '' : 'e') : ', keine Belege');
      return { bloecke: bloecke, punkte: punkte, bilder: bilder };
    }

    var wahl = el('div', { class: 'chips', style: 'margin-top:4px' });
    UMFANG.forEach(function (u) {
      var c = el('button', { type: 'button',
        class: 'chip' + (u.id === umfang ? ' on' : ''), title: u.hilfe,
        text: u.label });
      c.addEventListener('click', function () {
        umfang = u.id;
        Array.prototype.forEach.call(wahl.children, function (x) {
          x.classList.toggle('on', x === c);
        });
        zaehlen();
      });
      wahl.appendChild(c);
    });

    var knopf = el('button', { class: 'primary', text: 'Drucken / als PDF sichern' });

    knopf.addEventListener('click', function () {
      var stand = zaehlen();
      if (!stand.punkte) {
        A.meldung('warn', 'Zu diesem Umfang gibt es keine Prüfpunkte.');
        return;
      }
      knopf.disabled = true;

      belegeVorladen(p, stand.bloecke, function (fertig, gesamt) {
        fortschritt.textContent = gesamt
          ? 'Belege werden geladen … ' + fertig + ' von ' + gesamt
          : '';
      }).then(function (karte) {
        fortschritt.textContent = '';
        knopf.disabled = false;
        bg.remove();
        drucken(exportBaum(p, umfang, stand.bloecke, karte));
      });
    });

    var bg = U.modal('Baurecht-Check exportieren', [
      el('div', { class: 'hilfe', style: 'margin-bottom:4px', text: 'Umfang' }),
      wahl,
      zahl,
      fortschritt,
      U.hinweis('info',
        'Im Druckdialog <b>«Als PDF sichern»</b> wählen. Belege stehen unter ' +
        'ihrem Prüfpunkt; Hintergrundgrafiken braucht das Blatt nicht. ' +
        'Der Reiter selbst lässt sich weiterhin als kompakte Übersicht ohne ' +
        'Belege drucken.')
    ], [knopf]);

    zaehlen();
    return bg;
  }

  B.exportDialog = exportDialog;
})();
