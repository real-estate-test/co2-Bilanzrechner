/* =====================================================================
   Projektrechner · Verwaltung und Protokoll
   ===================================================================== */
window.APP = window.APP || {};
(function (A) {
  'use strict';

  var U = A.ui, V = A.views, API = A.api, el = U.el;
  function fmt(n, d) { return A.fmt(n, d); }

  var ROLLEN = [
    { id: 'betrachter', label: 'Betrachter — nur lesen' },
    { id: 'bearbeiter', label: 'Bearbeiter — anlegen und ändern' },
    { id: 'verwalter',  label: 'Verwalter — zusätzlich löschen und verwalten' }
  ];
  var ROLLE_KURZ = { betrachter: 'Betrachter', bearbeiter: 'Bearbeiter', verwalter: 'Verwalter' };

  /* ===================================================================
     Seite: Verwaltung
     =================================================================== */

  V.verwaltung = function (p) {
    var out = el('div', {}, [U.kopf('Verwaltung',
      'Konten, Rollen und firmenweite Vorgaben. Diese Seite sehen nur Verwalter.')]);

    if (!API.aktiv()) {
      out.appendChild(U.hinweis('info',
        'Die Anwendung läuft im <b>lokalen Modus</b> — es gibt keine Konten und keine Rollen. ' +
        'Tragen Sie in <code>app/config.js</code> die Verbindung zur Firmendatenbank ein, ' +
        'um mehrere Personen arbeiten zu lassen.'));
      return out;
    }
    if (!API.istVerwalter()) {
      out.appendChild(U.hinweis('warn', 'Diese Seite ist Verwaltern vorbehalten.'));
      return out;
    }

    /* --- Konten ---------------------------------------------------- */
    var kontenBody = el('div', { class: 'panelbody' }, [el('div', { class: 'muted', text: 'wird geladen …' })]);

    function kontenLaden() {
      A.store.benutzerliste().then(function (liste) {
        var ich = API.benutzer();
        var zeilen = liste.map(function (b) {
          var selbst = ich && b.id === ich.id;
          var tr = el('tr', { style: b.aktiv ? '' : 'opacity:.5' });
          tr.appendChild(el('td', {}, [
            el('span', { text: b.name || '—' }),
            el('div', { class: 'muted', style: 'font-size:10.5px', text: b.email })
          ]));
          tr.appendChild(el('td', { style: 'width:240px' }, [(function () {
            if (selbst) {
              return el('span', { class: 'tag', text: ROLLE_KURZ[b.rolle] + ' (Sie selbst)' });
            }
            var s = el('select');
            ROLLEN.forEach(function (r) {
              s.appendChild(el('option', { value: r.id, text: r.label,
                selected: b.rolle === r.id ? '' : null }));
            });
            s.addEventListener('change', function () {
              A.store.rolleSetzen(b.id, s.value)
                .then(function () { A.meldung('ok', b.email + ' ist jetzt ' + ROLLE_KURZ[s.value] + '.'); })
                .catch(function (f) { A.meldung('warn', f.message); kontenLaden(); });
            });
            return s;
          })()]));
          tr.appendChild(el('td', { class: 'muted', text: (b.erstellt_am || '').slice(0, 10) }));
          tr.appendChild(el('td', { class: 'w1' }, [
            selbst ? el('span', { class: 'muted', text: '—' })
              : el('button', { class: 'ghost sm', text: b.aktiv ? 'sperren' : 'entsperren',
                  onclick: function () {
                    A.store.kontoSperren(b.id, !b.aktiv)
                      .then(kontenLaden)
                      .catch(function (f) { A.meldung('warn', f.message); });
                  } })
          ]));
          return tr;
        });
        U.leeren(kontenBody).appendChild(U.tabelle([
          { label: 'Person' }, { label: 'Rolle' }, { label: 'seit' }, { label: '' }
        ], zeilen));
      }).catch(function (f) {
        U.leeren(kontenBody).appendChild(U.hinweis('warn', 'Konten nicht ladbar: ' + f.message));
      });
    }
    kontenLaden();

    out.appendChild(U.panel('Konten & Rollen',
      'ein gesperrtes Konto kann sich nicht mehr anmelden', [kontenBody]));

    /* --- Registrierung freigeben ----------------------------------- */
    var domBody = el('div', { class: 'panelbody' }, [el('div', { class: 'muted', text: 'wird geladen …' })]);

    A.store.einstellung('erlaubte_domains').then(function (wert) {
      var liste = Array.isArray(wert) ? wert : [];
      U.leeren(domBody);

      var eingabe = el('input', { type: 'text', placeholder: 'firma.ch',
        style: 'padding:6px 9px;border:1px solid var(--line2);border-radius:5px;min-width:220px' });

      function malen() {
        var chips = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px' });
        if (!liste.length) {
          chips.appendChild(el('span', { class: 'tag warn',
            text: 'keine Domäne freigegeben — niemand kann sich registrieren' }));
        }
        liste.forEach(function (d, i) {
          chips.appendChild(el('span', { class: 'tag pos' }, [
            el('span', { text: d + '  ' }),
            el('button', { class: 'ghost sm', style: 'padding:0 2px', text: '×',
              onclick: function () { liste.splice(i, 1); speichern(); } })
          ]));
        });
        var box = domBody.querySelector('.chips');
        if (box) domBody.replaceChild(chips, box);
        else domBody.insertBefore(chips, domBody.firstChild);
        chips.className = 'chips';
      }

      function speichern() {
        A.store.einstellungSetzen('erlaubte_domains', liste)
          .then(function () { malen(); A.meldung('ok', 'Freigabe gespeichert.'); })
          .catch(function (f) { A.meldung('warn', f.message); });
      }

      domBody.appendChild(el('div', { style: 'display:flex;gap:8px;align-items:center' }, [
        eingabe,
        el('button', { text: '+ Domäne freigeben', onclick: function () {
          var d = eingabe.value.trim().toLowerCase().replace(/^@/, '');
          if (!d || liste.indexOf(d) >= 0) return;
          liste.push(d); eingabe.value = ''; speichern();
        } })
      ]));
      domBody.appendChild(el('div', { class: 'hilfe', style: 'margin-top:8px',
        text: 'Nur Personen mit einer E-Mail aus diesen Domänen können ein Konto anlegen. ' +
              'Neue Konten starten immer als Betrachter und müssen hier hochgestuft werden.' }));
      malen();
    }).catch(function (f) {
      U.leeren(domBody).appendChild(U.hinweis('warn', f.message));
    });

    out.appendChild(U.panel('Registrierung', 'wer darf sich überhaupt ein Konto anlegen', [domBody]));

    /* --- Firmenweite Zielwerte ------------------------------------- */
    var zielBody = el('div', { class: 'panelbody' }, [el('div', { class: 'muted', text: 'wird geladen …' })]);

    A.store.einstellung('ziele').then(function (z) {
      var ziele = z || { marge: 15, bruttorendite: 4 };
      U.leeren(zielBody);
      var marge = el('input', { type: 'text', value: A.fmt(ziele.marge, 1),
        style: 'width:90px;padding:6px 9px;border:1px solid var(--line2);border-radius:5px;text-align:right' });
      var brw = el('input', { type: 'text', value: A.fmt(ziele.bruttorendite, 2),
        style: 'width:90px;padding:6px 9px;border:1px solid var(--line2);border-radius:5px;text-align:right' });

      zielBody.appendChild(el('div', { style: 'display:flex;gap:20px;flex-wrap:wrap;align-items:flex-end' }, [
        el('div', {}, [el('div', { class: 'k', style: 'font-size:11px;color:var(--muted);margin-bottom:4px',
          text: 'Zielmarge auf Anlagekosten' }), el('div', {}, [marge, el('span', { text: ' %' })])]),
        el('div', {}, [el('div', { class: 'k', style: 'font-size:11px;color:var(--muted);margin-bottom:4px',
          text: 'Ziel-Bruttorendite' }), el('div', {}, [brw, el('span', { text: ' %' })])]),
        el('button', { class: 'primary', text: 'Zielwerte speichern', onclick: function () {
          A.store.einstellungSetzen('ziele', {
            marge: U.parseZahl(marge.value), bruttorendite: U.parseZahl(brw.value)
          }).then(function () {
            A.ziele = { marge: U.parseZahl(marge.value), bruttorendite: U.parseZahl(brw.value) };
            A.state.p.ziele = A.clone(A.ziele);
            A.recompute();
            A.meldung('ok', 'Zielwerte gelten ab sofort für alle Projekte.');
          }).catch(function (f) { A.meldung('warn', f.message); });
        } })
      ]));
      zielBody.appendChild(el('div', { class: 'hilfe', style: 'margin-top:10px',
        text: 'Diese Werte gelten firmenweit und lassen sich im einzelnen Projekt nicht überschreiben — ' +
              'nur so bedeutet «unter Ziel» im Portfolio überall dasselbe. Bereits freigegebene ' +
              'Stichtage behalten die damals geltenden Werte.' }));
    }).catch(function (f) {
      U.leeren(zielBody).appendChild(U.hinweis('warn', f.message));
    });

    out.appendChild(U.panel('Firmenweite Zielwerte', 'Grundlage der Ampeln im Portfolio', [zielBody]));

    /* --- Zahlungsmodalitäten --------------------------------------- */
    var zpBody = el('div', { class: 'panelbody' });

    function zpZeichnen(plan) {
      U.leeren(zpBody);
      var arbeit = A.clone(plan);

      function neuZeichnen() { zpZeichnen(arbeit); }

      var zeilen = arbeit.map(function (r, i) {
        var bez = el('input', { type: 'text', value: r.label || '',
          style: 'width:100%;padding:5px 8px;border:1px solid var(--line2);border-radius:5px' });
        bez.addEventListener('input', function () { r.label = bez.value; });
        var faellig = el('select', { style: 'width:100%;padding:5px 8px;border:1px solid var(--line2);border-radius:5px' });
        Object.keys(A.ZAHLUNG_BEZUG).forEach(function (k) {
          faellig.appendChild(el('option', { value: k, text: A.ZAHLUNG_BEZUG[k],
            selected: r.bezug === k ? '' : null }));
        });
        faellig.addEventListener('change', function () { r.bezug = faellig.value; });
        var anteil = el('input', { type: 'text', value: A.fmt(r.anteil, 1),
          style: 'width:80px;padding:5px 8px;border:1px solid var(--line2);border-radius:5px;text-align:right' });
        anteil.addEventListener('input', function () {
          r.anteil = U.parseZahl(anteil.value); summeZeigen();
        });
        return el('tr', {}, [
          el('td', {}, [bez]),
          el('td', { style: 'width:190px' }, [faellig]),
          el('td', { style: 'width:100px' }, [anteil]),
          el('td', { class: 'w1' }, [el('button', { class: 'ghost sm', text: '×',
            onclick: function () { arbeit.splice(i, 1); neuZeichnen(); } })])
        ]);
      });

      var summeZelle = el('td', { class: 'n' });
      var summeTag = el('td', {});
      function summeZeigen() {
        var s2 = arbeit.reduce(function (a, r) { return a + U.parseZahl(r.anteil); }, 0);
        summeZelle.textContent = A.fmt(s2, 1) + ' %';
        var ab = Math.abs(s2 - 100) > 0.1;
        summeZelle.style.color = ab ? 'var(--warn)' : '';
        U.leeren(summeTag);
        if (ab) summeTag.appendChild(el('span', { class: 'tag warn', text: 'nicht 100 %' }));
      }
      zeilen.push(el('tr', { class: 'total' }, [
        el('td', { text: 'Summe' }), el('td', {}), summeZelle, summeTag
      ]));
      summeZeigen();

      zpBody.appendChild(U.tabelle([
        { label: 'Rate' }, { label: 'fällig' }, { label: 'Anteil %', n: true }, { label: '' }
      ], zeilen));

      /* Wie viele Projekte hängen an der Vorgabe? Eine Änderung wirkt auf
         sie unmittelbar — das gehört vor den Speichern-Knopf. */
      var mit = 0, eigen = 0;
      try {
        A.store.alle(true).forEach(function (q) {
          if (q.vermarktung && q.vermarktung.zahlungsplan_eigen) eigen++; else mit++;
        });
      } catch (e) { /* Projektliste nicht verfügbar */ }

      zpBody.appendChild(el('div', { style: 'margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, [
        el('button', { text: '+ Rate', onclick: function () {
          arbeit.push({ label: 'Rate', anteil: 0, bezug: 'fertigstellung' }); neuZeichnen();
        } }),
        el('button', { class: 'primary', text: 'Vorgabe speichern', onclick: function () {
          var rein = arbeit.filter(function (r) { return String(r.label || '').trim(); })
            .map(function (r) {
              return { label: String(r.label).trim(), anteil: U.parseZahl(r.anteil),
                       bezug: A.ZAHLUNG_BEZUG[r.bezug] ? r.bezug : 'fertigstellung' };
            });
          A.zahlungsplan = rein;
          var fertig = function () {
            /* Mitlaufende Projekte sofort nachziehen, damit die Vorgabe
               nicht erst beim nächsten Öffnen greift. */
            if (A.state.p) { A.vorgabenAnwenden(A.state.p); A.recompute(); }
            A.meldung('ok', 'Zahlungsmodalitäten gespeichert — sie gelten für alle Projekte ' +
              'ohne eigenen Plan.');
            A.render();
          };
          if (A.store.modus === 'server') {
            A.store.einstellungSetzen('zahlungsplan', rein).then(fertig)
              .catch(function (f) { A.meldung('warn', f.message); });
          } else { fertig(); }
        } }),
        el('span', { class: 'muted', style: 'font-size:11.5px',
          text: mit + ' Projekt(e) folgen der Vorgabe · ' + eigen + ' mit eigenem Plan' })
      ]));

      /* Fristen und Schätzwerte — sie bestimmen die Termine, die sich
         nicht aus dem Bauzeitmodell ergeben. */
      var frVorgabe = A.zahlungsfristen || A.defaultProject().vermarktung.fristen;
      var frFelder = {};
      var frZeile = el('div', { style: 'display:flex;gap:18px;flex-wrap:wrap;align-items:flex-end;margin-top:16px' });
      [['tagebuch_tage', 'Beurkundung → Tagebucheintrag', 'Tage'],
       ['nach_tagebuch_tage', 'Tagebucheintrag → Zahlung', 'Tage'],
       ['decke_ug_pct', 'Decke UG fertig', '% der Bauzeit'],
       ['unterlagsboden_pct', 'Unterlagsboden fertig', '% der Bauzeit']
      ].forEach(function (f) {
        var inp = el('input', { type: 'text', value: A.fmt(frVorgabe[f[0]], 0),
          style: 'width:70px;padding:6px 9px;border:1px solid var(--line2);border-radius:5px;text-align:right' });
        frFelder[f[0]] = inp;
        frZeile.appendChild(el('div', {}, [
          el('div', { class: 'k', style: 'font-size:11px;color:var(--muted);margin-bottom:4px', text: f[1] }),
          el('div', {}, [inp, el('span', { text: ' ' + f[2] })])
        ]));
      });
      frZeile.appendChild(el('button', { class: 'primary', text: 'Fristen speichern', onclick: function () {
        var neu = {};
        Object.keys(frFelder).forEach(function (k) { neu[k] = U.parseZahl(frFelder[k].value); });
        A.zahlungsfristen = neu;
        var fertig = function () {
          if (A.state.p) { A.vorgabenAnwenden(A.state.p); A.recompute(); }
          A.meldung('ok', 'Fristen gespeichert — sie gelten für alle Projekte ohne eigene Fristen.');
        };
        if (A.store.modus === 'server') {
          A.store.einstellungSetzen('zahlungsfristen', neu).then(fertig)
            .catch(function (f) { A.meldung('warn', f.message); });
        } else { fertig(); }
      } }));

      zpBody.appendChild(el('div', { class: 'k',
        style: 'font-size:11px;color:var(--kopf);margin-top:18px;text-transform:uppercase;letter-spacing:.07em',
        text: 'Fristen und Schätzwerte' }));
      zpBody.appendChild(frZeile);
      zpBody.appendChild(el('div', { class: 'hilfe', style: 'margin-top:8px',
        text: 'Der Tagebucheintrag folgt der Beurkundung; die Rate «3 Tage nach Tagebucheintrag» ' +
              'ergibt sich daraus je Einheit. Decke UG und Unterlagsboden haben keinen Modelltermin — ' +
              'bis im Projekt ein Datum erfasst ist, gelten diese Anteile der Bauzeit.' }));

      zpBody.appendChild(el('div', { class: 'hilfe', style: 'margin-top:10px',
        text: 'Anders als die Zielwerte sind diese Modalitäten im Projekt übersteuerbar: ' +
              'Auf der Seite «Vermarktung & Verkauf» lässt sich je Projekt ein eigener Plan ' +
              'führen. Projekte ohne eigenen Plan übernehmen jede Änderung hier — auch ' +
              'rückwirkend, was Cashflow und Bauzinsen verschiebt. Bereits freigegebene ' +
              'Stichtage behalten den damals geltenden Plan.' }));
    }

    if (A.store.modus === 'server') {
      zpBody.appendChild(el('div', { class: 'muted', text: 'wird geladen …' }));
      A.store.einstellung('zahlungsplan').then(function (plan) {
        if (Array.isArray(plan) && plan.length) A.zahlungsplan = plan;
        zpZeichnen(A.zahlungsplan || A.defaultProject().vermarktung.zahlungsplan);
      }).catch(function () {
        zpZeichnen(A.zahlungsplan || A.defaultProject().vermarktung.zahlungsplan);
      });
    } else {
      zpZeichnen(A.zahlungsplan || A.defaultProject().vermarktung.zahlungsplan);
    }

    out.appendChild(U.panel('Zahlungsmodalitäten Stockwerkeigentum',
      'Vorgabe für alle Projekte ohne eigenen Plan', [zpBody]));

    /* --- Immobiliengefässe ----------------------------------------- */
    var firmenBody = el('div', { class: 'panelbody' });

    function firmenZeichnen(liste) {
      U.leeren(firmenBody);
      var feld = el('textarea', { rows: String(Math.max(4, liste.length + 1)),
        style: 'width:100%;max-width:460px;padding:8px 10px;border:1px solid var(--line2);' +
               'border-radius:5px;font-family:inherit;font-size:13px' });
      feld.value = liste.join('\n');

      firmenBody.appendChild(el('div', { class: 'k',
        style: 'font-size:11px;color:var(--muted);margin-bottom:4px',
        text: 'eine Firma je Zeile' }));
      firmenBody.appendChild(feld);
      firmenBody.appendChild(el('div', { style: 'margin-top:10px' }, [
        el('button', { class: 'primary', text: 'Liste speichern', onclick: function () {
          var neu = A.firmenSetzen(feld.value.split('\n'));
          var fertig = function () {
            A.meldung('ok', 'Die Liste steht ab sofort in jedem Projekt zur Auswahl.');
            A.render();
          };
          if (A.store.modus === 'server') {
            A.store.einstellungSetzen('firmen', neu).then(fertig)
              .catch(function (f) { A.meldung('warn', f.message); });
          } else { fertig(); }
        } })
      ]));
      firmenBody.appendChild(el('div', { class: 'hilfe', style: 'margin-top:10px',
        text: 'Ein Projekt wird unter «Projekt» einer Firma zugeordnet. Im Portfolio ' +
              'lässt sich danach filtern; die Gesamtsicht über alle Gefässe bleibt bestehen. ' +
              'Eine Firma, die an einem Projekt hängt, bleibt dort wählbar, auch wenn sie hier ' +
              'entfernt wird — die Zuordnung geht also nie verloren.' }));
    }

    if (A.store.modus === 'server') {
      firmenBody.appendChild(el('div', { class: 'muted', text: 'wird geladen …' }));
      A.store.einstellung('firmen').then(function (liste) {
        if (Array.isArray(liste)) A.firmen = liste;
        firmenZeichnen(A.firmenListe());
      }).catch(function () { firmenZeichnen(A.firmenListe()); });
    } else {
      firmenZeichnen(A.firmenListe());
    }

    out.appendChild(U.panel('Immobiliengefässe', 'Firmen, denen Projekte zugeordnet werden', [firmenBody]));

    /* --- Adressbuch -------------------------------------------------- */
    var adrBody = el('div', { class: 'panelbody' });
    var adrFuss = el('div', { class: 'panelbody' });

    function adressenZeichnen(liste) {
      U.leeren(adrBody);
      var rollen = U.datalist('dl-rollen-verwaltung', A.PROJEKTROLLEN);

      var zeilen = liste.map(function (a, i) {
        return el('tr', {}, [
          el('td', { style: 'width:74px' }, [U.zelleTxt(a, 'kuerzel', { platzhalter: 'AB' })]),
          el('td', {}, [U.zelleTxt(a, 'name', { platzhalter: 'Vorname Name' })]),
          el('td', {}, [U.zelleTxt(a, 'firma', { platzhalter: 'Firma' })]),
          el('td', { style: 'width:170px' }, [U.zelleTxt(a, 'rolle',
            { liste: rollen, platzhalter: 'übliche Rolle' })]),
          el('td', {}, [U.zelleTxt(a, 'mail', { typ: 'email', platzhalter: 'name@firma.ch' })]),
          el('td', { style: 'width:140px' }, [U.zelleTxt(a, 'telefon', { platzhalter: '+41 …' })]),
          el('td', { class: 'w1' }, [el('button', { class: 'ghost sm', text: '×',
            title: 'Eintrag entfernen', onclick: function () {
              liste.splice(i, 1); adressenZeichnen(liste);
            } })])
        ]);
      });
      if (!zeilen.length) {
        zeilen.push(el('tr', {}, [el('td', { colspan: 7, class: 'muted',
          text: 'Noch keine Adresse erfasst.' })]));
      }

      adrBody.appendChild(U.tabelle([
        { label: 'Kürzel' }, { label: 'Name' }, { label: 'Firma' },
        { label: 'übliche Rolle' }, { label: 'E-Mail' }, { label: 'Telefon' }, { label: '' }
      ], zeilen));

      U.leeren(adrFuss);
      adrFuss.appendChild(el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, [
        el('button', { text: '+ Person', onclick: function () {
          liste.push({ id: A.uid(), kuerzel: '', name: '', firma: '', rolle: '', mail: '', telefon: '' });
          adressenZeichnen(liste);
        } }),
        el('button', { class: 'primary', text: 'Adressbuch speichern', onclick: function () {
          var neu = A.adressenSetzen(liste);
          var fertig = function () {
            A.meldung('ok', neu.length + ' Adressen gespeichert — sie stehen in jedem Projekt ' +
              'zur Auswahl.');
            A.render();
          };
          if (A.store.modus === 'server') {
            A.store.einstellungSetzen('adressen', neu).then(fertig)
              .catch(function (f) { A.meldung('warn', f.message); });
          } else { fertig(); }
        } })
      ]));
      adrFuss.appendChild(el('div', { class: 'hilfe', style: 'margin-top:10px',
        text: 'Im Projekt wird unter «Adressliste» ausgewählt, wer beteiligt ist; die Rolle ' +
              'wird dort projektbezogen gesetzt. Wird eine Person hier entfernt, bleibt sie in ' +
              'den Projekten stehen, in denen sie hängt — mit Name und Firma aus dem Projekt.' }));
    }

    if (A.store.modus === 'server') {
      adrBody.appendChild(el('div', { class: 'muted', text: 'wird geladen …' }));
      A.store.einstellung('adressen').then(function (liste) {
        if (Array.isArray(liste)) A.adressen = liste;
        adressenZeichnen(A.adressenListe());
      }).catch(function () { adressenZeichnen(A.adressenListe()); });
    } else {
      adressenZeichnen(A.adressenListe());
    }

    out.appendChild(U.panel('Adressbuch', 'Personen, die an Projekten mitwirken',
      [adrBody, adrFuss]));

    /* --- Kennwerte-Hinweis ----------------------------------------- */
    out.appendChild(U.panel('Kennwerte', 'Baukosten, Zinssätze und Sätze', [
      el('div', { class: 'panelbody' }, [
        U.hinweis('info',
          'Kennwerte sind <b>projektbezogen frei</b> — Baukosten und Zinssätze hängen von der ' +
          'baulichen Situation und der Finanzierungsstruktur ab und werden deshalb nicht ' +
          'firmenweit erzwungen. Die hinterlegten Werte dienen als <b>Startwerte für neue ' +
          'Projekte</b>; bestehende Projekte bleiben davon unberührt. Wo ein Projekt abweicht, ' +
          'zeigt es der Herkunftspunkt am Feld und die Annahmenliste im Bericht.')
      ])
    ]));

    return out;
  };

  /* ===================================================================
     Seite: Änderungsverlauf

     Nicht zu verwechseln mit den Sitzungsprotokollen: hier steht, wer
     wann welche Zahl geändert hat.
     =================================================================== */

  V.verlauf = function (p) {
    var out = el('div', {}, [U.kopf('Änderungsverlauf',
      'Lückenlose Aufzeichnung aller Änderungen. Einträge lassen sich nachträglich von niemandem ' +
      'ändern oder entfernen — auch nicht von Verwaltern.')]);

    if (!API.aktiv()) {
      out.appendChild(U.hinweis('info',
        'Im lokalen Modus wird nicht protokolliert — es gibt keine Konten, denen sich eine ' +
        'Änderung zuordnen liesse.'));
      return out;
    }

    var nurDieses = { wert: false };
    var body = el('div', { class: 'panelbody' }, [el('div', { class: 'muted', text: 'wird geladen …' })]);

    function laden() {
      A.store.protokoll(nurDieses.wert ? A.state.p.id : null, 300).then(function (liste) {
        if (!liste || !liste.length) {
          U.leeren(body).appendChild(el('div', { class: 'muted', text: 'Noch keine Einträge.' }));
          return;
        }
        var zeilen = liste.map(function (e) {
          var d = e.details || {};
          var delta = null;
          if (d.kpi_alt && d.kpi_neu && d.kpi_alt.gewinn !== undefined) {
            var v = d.kpi_neu.gewinn - d.kpi_alt.gewinn;
            if (Math.abs(v) >= 1) {
              delta = el('span', { style: 'color:' + (v >= 0 ? 'var(--pos)' : 'var(--neg)'),
                text: (v >= 0 ? '+' : '') + fmt(v) });
            }
          }
          return el('tr', {}, [
            el('td', { class: 'muted', style: 'white-space:nowrap',
              text: (e.zeit || '').slice(0, 16).replace('T', ' ') }),
            el('td', { text: e.benutzer_email || '—' }),
            el('td', {}, [el('span', { class: 'tag' + (/gelöscht/.test(e.aktion) ? ' neg' : ''),
              text: e.aktion })]),
            el('td', { text: e.projekt_name || e.projekt_id || '—' }),
            el('td', { class: 'muted', text: (d.bereiche && d.bereiche.length)
              ? d.bereiche.join(', ') : '' }),
            el('td', { class: 'n' }, delta ? [delta] : [el('span', { class: 'muted', text: '—' })])
          ]);
        });
        U.leeren(body).appendChild(U.tabelle([
          { label: 'Zeitpunkt' }, { label: 'Person' }, { label: 'Aktion' },
          { label: 'Projekt' }, { label: 'geänderte Bereiche' }, { label: 'Δ Gewinn', n: true }
        ], zeilen));
      }).catch(function (f) {
        U.leeren(body).appendChild(U.hinweis('warn', f.message));
      });
    }
    laden();

    var umschalter = el('div', { class: 'seg' });
    [['Alle Projekte', false], ['Nur dieses Projekt', true]].forEach(function (o, i) {
      var b = el('button', { type: 'button', text: o[0], class: i === 0 ? 'on' : '' });
      b.addEventListener('click', function () {
        nurDieses.wert = o[1];
        umschalter.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        laden();
      });
      umschalter.appendChild(b);
    });

    out.appendChild(U.panel('Änderungen', null, [body], [umschalter]));
    return out;
  };

  /* ===================================================================
     Kommentare — als Feld auf der Projektseite eingehängt
     =================================================================== */

  A.kommentarPanel = function (p) {
    if (!API.aktiv()) return null;

    var liste = el('div', { class: 'panelbody' }, [el('div', { class: 'muted', text: 'wird geladen …' })]);

    function laden() {
      A.store.kommentare(p.id).then(function (k) {
        U.leeren(liste);
        if (!k || !k.length) {
          liste.appendChild(el('div', { class: 'muted', text: 'Noch keine Anmerkungen.' }));
          return;
        }
        var ich = API.benutzer();
        k.forEach(function (e) {
          var wer = e.profil ? (e.profil.name || e.profil.email) : '—';
          liste.appendChild(el('div', { style: 'padding:9px 0;border-bottom:1px solid var(--line)' }, [
            el('div', { style: 'display:flex;gap:8px;align-items:baseline' }, [
              el('b', { style: 'font-size:12.5px', text: wer }),
              el('span', { class: 'muted', style: 'font-size:11px',
                text: (e.erstellt_am || '').slice(0, 16).replace('T', ' ') }),
              (ich && e.verfasser === ich.id) || API.istVerwalter()
                ? el('button', { class: 'ghost sm', style: 'margin-left:auto', text: '×',
                    onclick: function () { A.store.kommentarLoeschen(e.id).then(laden); } })
                : null
            ]),
            el('div', { style: 'white-space:pre-wrap;margin-top:3px', text: e.text })
          ]));
        });
      }).catch(function (f) {
        U.leeren(liste).appendChild(U.hinweis('warn', f.message));
      });
    }
    laden();

    var eingabe = el('textarea', { placeholder: 'Anmerkung für das Team …',
      style: 'min-height:64px;font-family:var(--sans);font-size:13px' });
    var senden = el('button', { class: 'primary', text: 'Anmerkung hinzufügen',
      onclick: function () {
        var t = eingabe.value.trim();
        if (!t) return;
        senden.disabled = true;
        A.store.kommentieren(p.id, t).then(function () {
          eingabe.value = ''; senden.disabled = false; laden();
        }).catch(function (f) { A.meldung('warn', f.message); senden.disabled = false; });
      } });

    return U.panel('Anmerkungen', 'sichtbar für alle im Team', [
      liste,
      el('div', { class: 'panelbody' }, [eingabe, el('div', { style: 'margin-top:7px' }, [senden])])
    ]);
  };

})(window.APP);
