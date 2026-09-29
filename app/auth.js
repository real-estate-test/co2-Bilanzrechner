/* =====================================================================
   Projektrechner · Anmeldung
   ===================================================================== */
window.APP = window.APP || {};
(function (A) {
  'use strict';

  var U = A.ui, API = A.api, el = U.el;
  var AU = {};
  A.auth = AU;

  /* ---------------------------------------------------------------
     Einstiegspunkt: löst auf, sobald gearbeitet werden darf.
     Im lokalen Modus sofort.
     --------------------------------------------------------------- */
  AU.start = function () {
    if (!API.aktiv()) return Promise.resolve({ modus: 'lokal' });

    if (API.angemeldet()) {
      return API.profilLaden()
        .then(function () { return { modus: 'server' }; })
        .catch(function (f) {
          console.warn('Sitzung nicht mehr gültig:', f.message);
          return API.abmelden().then(maske);
        });
    }
    return maske();
  };

  /* ---------------------------------------------------------------
     Anmeldemaske
     --------------------------------------------------------------- */

  function maske(vorbelegung) {
    return new Promise(function (fertig) {
      var ansicht = 'anmelden';    // anmelden | registrieren | vergessen
      var bg = el('div', { class: 'anmelde-bg' });
      var karte = el('div', { class: 'anmelde' });
      bg.appendChild(karte);
      document.body.appendChild(bg);

      function meldung(art, text) {
        var m = karte.querySelector('.anmelde-meldung');
        if (m) m.remove();
        if (!text) return;
        var e = U.hinweis(art, text);
        e.className += ' anmelde-meldung';
        karte.insertBefore(e, karte.querySelector('.anmelde-felder'));
      }

      function zeichnen() {
        U.leeren(karte);

        karte.appendChild(el('div', { class: 'anmelde-kopf' }, [
          el('div', { class: 'anmelde-marke', text: 'Projektrechner' }),
          el('h1', { text: ansicht === 'registrieren' ? 'Konto anlegen'
                        : ansicht === 'vergessen' ? 'Passwort zurücksetzen'
                        : 'Anmelden' }),
          el('p', { text: ansicht === 'vergessen'
            ? 'Wir senden einen Link an Ihre Firmenadresse.'
            : 'Immobilienentwicklung · interne Projektbewertung' })
        ]));

        var felder = el('div', { class: 'anmelde-felder' });
        karte.appendChild(felder);

        var name = null;
        if (ansicht === 'registrieren') {
          name = el('input', { type: 'text', placeholder: 'Vor- und Nachname', autocomplete: 'name' });
          felder.appendChild(feld('Name', name));
        }

        var email = el('input', { type: 'email', placeholder: 'name@firma.ch',
          autocomplete: 'username', value: (vorbelegung && vorbelegung.email) || '' });
        felder.appendChild(feld('E-Mail', email));

        var pw = null;
        if (ansicht !== 'vergessen') {
          pw = el('input', { type: 'password', placeholder: '••••••••••••',
            autocomplete: ansicht === 'registrieren' ? 'new-password' : 'current-password' });
          felder.appendChild(feld('Passwort', pw));
          if (ansicht === 'registrieren') {
            felder.appendChild(el('div', { class: 'hilfe',
              text: 'Mindestens 12 Zeichen. Ein regelmässiger Wechsel wird bewusst nicht verlangt.' }));
          }
        }

        var knopf = el('button', { class: 'primary', style: 'width:100%;margin-top:6px;padding:9px',
          text: ansicht === 'registrieren' ? 'Konto anlegen'
              : ansicht === 'vergessen' ? 'Link senden' : 'Anmelden' });
        felder.appendChild(knopf);

        var wechsel = el('div', { class: 'anmelde-fuss' });
        if (ansicht === 'anmelden') {
          wechsel.appendChild(link('Passwort vergessen', function () { ansicht = 'vergessen'; zeichnen(); }));
          wechsel.appendChild(el('span', { text: ' · ' }));
          wechsel.appendChild(link('Konto anlegen', function () { ansicht = 'registrieren'; zeichnen(); }));
        } else {
          wechsel.appendChild(link('Zurück zur Anmeldung', function () { ansicht = 'anmelden'; zeichnen(); }));
        }
        karte.appendChild(wechsel);

        karte.appendChild(el('div', { class: 'anmelde-fuss muted', style: 'margin-top:14px' }, [
          el('span', { text: 'Ohne Anmeldung ' }),
          link('lokal weiterarbeiten', function () {
            bg.remove();
            fertig({ modus: 'lokal', freiwillig: true });
          }),
          el('span', { text: ' — Daten bleiben dann nur in diesem Browser.' })
        ]));

        function absenden() {
          knopf.disabled = true;
          var fertigMachen = function () { knopf.disabled = false; };

          if (ansicht === 'vergessen') {
            API.passwortVergessen(email.value.trim())
              .then(function () { meldung('ok', 'Falls ein Konto besteht, ist der Link unterwegs.'); })
              .catch(function (f) { meldung('warn', f.message); })
              .then(fertigMachen);
            return;
          }

          if (!email.value.trim() || !pw.value) {
            meldung('warn', 'Bitte E-Mail und Passwort eingeben.'); fertigMachen(); return;
          }
          if (ansicht === 'registrieren' && pw.value.length < 12) {
            meldung('warn', 'Das Passwort muss mindestens 12 Zeichen haben.'); fertigMachen(); return;
          }

          var p = ansicht === 'registrieren'
            ? API.registrieren(email.value.trim(), pw.value, name ? name.value.trim() : '')
            : API.anmelden(email.value.trim(), pw.value);

          p.then(function (r) {
            if (r && r.bestaetigung) {
              ansicht = 'anmelden'; zeichnen();
              meldung('ok', 'Konto angelegt. Bitte bestätigen Sie zuerst die E-Mail.');
              return;
            }
            bg.remove();
            fertig({ modus: 'server' });
          }).catch(function (f) {
            meldung('warn', uebersetzen(f.message));
            fertigMachen();
          });
        }

        knopf.addEventListener('click', absenden);
        [email, pw, name].forEach(function (i) {
          if (!i) return;
          i.addEventListener('keydown', function (e) { if (e.key === 'Enter') absenden(); });
        });
        (name || email).focus();
      }

      function feld(beschriftung, eingabe) {
        return el('div', { class: 'f' }, [
          el('label', {}, [el('span', { text: beschriftung })]),
          el('div', { class: 'inp' }, [eingabe])
        ]);
      }

      function link(text, aktion) {
        return el('button', { class: 'ghost', style: 'padding:0;color:var(--accent)', text: text,
          onclick: aktion });
      }

      zeichnen();
    });
  }

  /* Serverantworten in verständliches Deutsch übersetzen. */
  function uebersetzen(text) {
    var t = String(text || '');
    if (/Invalid login credentials/i.test(t)) return 'E-Mail oder Passwort stimmt nicht.';
    if (/Email not confirmed/i.test(t)) return 'Bitte bestätigen Sie zuerst die E-Mail.';
    if (/User already registered/i.test(t)) return 'Für diese E-Mail besteht bereits ein Konto.';
    if (/Password should be at least/i.test(t)) return 'Das Passwort ist zu kurz.';
    if (/Registrierung ist geschlossen/i.test(t)) {
      return 'Die Registrierung ist geschlossen. Ein Verwalter muss Ihre E-Mail-Domäne freigeben.';
    }
    if (/keine Registrierung zugelassen/i.test(t)) return t;
    if (/rate limit|too many requests/i.test(t)) return 'Zu viele Versuche. Bitte kurz warten.';
    return t;
  }
  AU.uebersetzen = uebersetzen;

  /* ---------------------------------------------------------------
     Erneute Passwortabfrage vor heiklen Schritten
     --------------------------------------------------------------- */
  AU.passwortBestaetigen = function (zweck) {
    return new Promise(function (fertig) {
      if (!API.aktiv()) { fertig(true); return; }
      var pw = el('input', { type: 'password', placeholder: 'Ihr Passwort',
        autocomplete: 'current-password', style: 'width:100%;padding:7px 9px;' +
        'border:1px solid var(--line2);border-radius:5px' });
      var hinweis = el('div', { style: 'margin-bottom:10px' }, [
        el('div', { text: zweck }),
        el('div', { class: 'muted', style: 'font-size:11.5px;margin-top:4px',
          text: 'Zur Sicherheit noch einmal das Passwort — das verhindert Fehlgriffe ' +
                'und Zugriffe am unbeaufsichtigten Bildschirm.' })
      ]);
      var meldung = el('div', { class: 'muted', style: 'font-size:11.5px;margin-top:7px' });

      var ok = el('button', { class: 'primary', text: 'Bestätigen' });
      var bg = U.modal('Bestätigung erforderlich', [hinweis, pw, meldung], [ok]);

      function pruefen() {
        ok.disabled = true;
        meldung.textContent = 'wird geprüft …';
        API.passwortPruefen(pw.value).then(function (gut) {
          if (gut) { bg.remove(); fertig(true); }
          else { meldung.textContent = 'Passwort stimmt nicht.'; ok.disabled = false; }
        });
      }
      ok.addEventListener('click', pruefen);
      pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') pruefen(); });
      bg.addEventListener('mousedown', function (e) { if (e.target === bg) fertig(false); });
      setTimeout(function () { pw.focus(); }, 30);
    });
  };

  /* ---------------------------------------------------------------
     Anzeige in der Seitenleiste
     --------------------------------------------------------------- */
  AU.leiste = function () {
    if (!API.aktiv()) {
      return el('div', { class: 'konto' }, [
        el('div', { class: 'konto-name', text: 'Lokaler Modus' }),
        el('div', { class: 'konto-rolle', text: 'Daten nur in diesem Browser' })
      ]);
    }
    var b = API.benutzer(), p = API.profil;
    var ROLLE = { betrachter: 'Betrachter', bearbeiter: 'Bearbeiter', verwalter: 'Verwalter' };
    return el('div', { class: 'konto' }, [
      el('div', { class: 'konto-name', text: (p && p.name) || (b && b.email) || '—' }),
      el('div', { class: 'konto-rolle' }, [
        el('span', { text: ROLLE[API.rolle()] || 'ohne Rolle' }),
        el('button', { class: 'ghost sm', style: 'float:right;padding:0;color:inherit',
          text: 'abmelden', onclick: function () {
            API.abmelden().then(function () { location.reload(); });
          } })
      ])
    ]);
  };

})(window.APP);
