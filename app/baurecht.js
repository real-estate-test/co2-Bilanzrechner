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

  /* Wo der Bearbeitungsstand angezeigt wird. Ein Statuswechsel darf
     die Seite nicht neu zeichnen: Wer gerade tippt, verlöre dabei
     Cursor und Rest der Eingabe. Stattdessen werden genau diese
     Anzeigen nachgeführt, und die Tabelle bleibt stehen. */
  var anzeige = { balken: null, kacheln: null, gruppen: {} };

  function standNachfuehren(p) {
    var stand = A.baurechtStand(p);
    var anteil = stand.gesamt ? stand.fertig / stand.gesamt : 0;

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

  A.views.baurecht = function (p) {
    var out = el('div', {});
    var stand = A.baurechtStand(p);
    anzeige = { balken: null, kacheln: null, gruppen: {} };

    out.appendChild(U.kopf('Baurecht-Check',
      'Das für dieses Grundstück geltende Baurecht. Die Prüfpunkte werden ' +
      'unter Verwaltung gepflegt und gelten für alle Projekte.'));

    out.appendChild(fortschritt(p, stand));

    A.baurechtPunkte(p).forEach(function (block) {
      out.appendChild(gruppenPanel(p, block));
    });

    out.appendChild(el('div', { class: 'panel noprint' }, [
      el('div', { class: 'panelbody' }, [
        U.hinweis('info',
          'Die Prüfpunkte stammen aus der Baurecht-Checkliste und sind für alle ' +
          'Projekte gleich — gepflegt werden sie unter <b>Verwaltung</b>. Mit ' +
          '<b>+ Prüfpunkt</b> ergänzen Sie eine Zeile, die nur in diesem Projekt gilt; ' +
          'was firmenweit gelten soll, gehört in die Verwaltung. <b>Nicht relevant</b> ' +
          'ist eine Antwort: Der Punkt wurde geprüft und trifft hier nicht zu.')
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

  function fortschritt(p, stand) {
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

    return U.panel('Stand der Prüfung', null, [
      el('div', { class: 'panelbody' }, [
        el('div', { class: 'cols c3' }, [
          kGeprueft, kEintrag,
          U.kachel('Prüfpunkte', String(stand.gesamt), 'Katalog und Ergänzungen')
        ]),
        balken
      ])
    ]);
  }

  /* ---------------------------------------------------------------
     Eine Gruppe
     --------------------------------------------------------------- */

  function gruppenPanel(p, block) {
    var g = block.gruppe;
    var offen = zaehleOffen(p, block);

    var zeilen = block.punkte.map(function (pt) { return punktZeile(p, pt); });
    if (!zeilen.length) {
      zeilen.push(el('tr', {}, [el('td', { colspan: 5, class: 'muted',
        text: 'Keine Prüfpunkte in dieser Gruppe.' })]));
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

    return U.panel(g.label, block.punkte.length + ' Prüfpunkte',
      zu[g.id] ? [] : [koerper, fuss], [marke, knopf]);
  }

  /* ---------------------------------------------------------------
     Eine Zeile
     --------------------------------------------------------------- */

  function punktZeile(p, pt) {
    var e = A.baurechtEintrag(p, pt.id, true);
    var tr = el('tr', { class: e.status === 'entfaellt' ? 'brentfaellt' : '' });

    /* Spalte 1: der Prüfpunkt. Aus dem Katalog ist er fester Text, eine
       projekteigene Zeile lässt sich hier benennen. */
    var eigen = pt.eigen
      ? (p.baurecht.eigene || []).find(function (x) { return x.id === pt.id; })
      : null;
    tr.appendChild(el('td', {}, [
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

    /* Spalte 5: projekteigene Zeilen lassen sich wieder entfernen. */
    tr.appendChild(el('td', { class: 'w1' }, [
      eigen
        ? el('button', { class: 'ghost sm schreibend', text: '×',
            title: 'Prüfpunkt entfernen',
            onclick: function () {
              p.baurecht.eigene = p.baurecht.eigene.filter(function (x) {
                return x.id !== pt.id;
              });
              delete p.baurecht.eintraege[pt.id];
              A.markDirty(); A.render();
            } })
        : el('span', { class: 'muted', text: '' })
    ]));

    return tr;
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
})();
