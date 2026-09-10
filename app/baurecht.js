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

  /* ---------------------------------------------------------------
     Die Seite
     --------------------------------------------------------------- */

  A.views.baurecht = function (p) {
    var out = el('div', {});
    var stand = A.baurechtStand(p);

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

  function fortschritt(p, stand) {
    var anteil = stand.gesamt ? stand.fertig / stand.gesamt : 0;
    var balken = el('div', { class: 'brbalken' }, [
      el('div', { class: 'brbalken-in' + (anteil >= 1 ? ' voll' : ''),
        style: 'width:' + (anteil * 100).toFixed(1) + '%' })
    ]);

    return U.panel('Stand der Prüfung', null, [
      el('div', { class: 'panelbody' }, [
        el('div', { class: 'cols c3' }, [
          U.kachel('geprüft', stand.fertig + ' / ' + stand.gesamt,
                   stand.offen ? stand.offen + ' offen' : 'vollständig',
                   anteil >= 1 ? 'gut' : ''),
          U.kachel('mit Eintrag', String(stand.gefuellt), 'von ' + stand.gesamt + ' Punkten'),
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
    var offen = block.punkte.filter(function (pt) {
      var e = A.baurechtEintrag(p, pt.id);
      return e.status !== 'geprueft' && e.status !== 'entfaellt';
    }).length;

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

    var marke = offen
      ? el('span', { class: 'tag warn', text: offen + ' offen' })
      : el('span', { class: 'tag pos', text: 'vollständig' });

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
        ? U.zelleTxt(eigen, 'label', { platzhalter: 'z. B. Lärmschutznachweis' })
        : el('span', { text: pt.label }),
      pt.hilfe ? el('div', { class: 'hilfe', text: pt.hilfe }) : null,
      eigen ? el('div', { class: 'hilfe noprint', text: 'nur in diesem Projekt' }) : null
    ].filter(Boolean)));

    /* Spalte 2: der Eintrag, dahinter der Wert aus der Rechnung. */
    var wertfeld = U.zelleTxt(e, 'wert', {
      platzhalter: '—',
      onchange: function (v) {
        /* Wer etwas einträgt, hat den Punkt angeschaut. Der Status
           rückt einmal nach; danach bestimmt ihn der Benutzer. */
        if (v && e.status === 'offen') { e.status = 'geprueft'; A.render(); }
      }
    });
    tr.appendChild(el('td', {}, [wertfeld, rechenhinweis(p, pt, e)].filter(Boolean)));

    /* Spalte 3: Bemerkung, in der Vorlage meist der Paragraph. Ohne
       Platzhalter — bei 75 Zeilen wäre ein Beispieltext in jeder davon
       nur Lärm, und die Spaltenüberschrift sagt es bereits. */
    tr.appendChild(el('td', {}, [U.zelleTxt(e, 'bemerkung', {})]));

    /* Spalte 4: Status */
    tr.appendChild(el('td', {}, [(function () {
      var sel = el('select');
      A.BAURECHT_STATUS.forEach(function (st) {
        sel.appendChild(el('option', { value: st.id, text: st.label,
          selected: (e.status || 'offen') === st.id ? '' : null }));
      });
      sel.addEventListener('change', function () {
        e.status = sel.value; A.markDirty(); A.render();
      });
      return sel;
    })()]));

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
    var eigen = zahlAus(e.wert);
    /* Abweichungen erst ab einem halben Prozent melden — sonst schlägt
       jede Rundung an. */
    var weicht = eigen !== null && rw.wert > 0 &&
                 Math.abs(eigen - rw.wert) / rw.wert > 0.005;

    return el('div', { class: 'hilfe' + (weicht ? ' brweicht' : ''),
      text: weicht ? text + ' — weicht ab' : text });
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
