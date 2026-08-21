/* =====================================================================
   Projektrechner · UI-Grundbausteine
   Felderzeugung, Datenherkunft, Plausibilität, abgeleitete Anzeigen
   ===================================================================== */
window.APP = window.APP || {};
(function (A) {
  'use strict';

  var U = {};
  A.ui = U;

  U.STUFEN = { schnell: 1, standard: 2, detail: 3 };
  U.derived = [];           // wird bei jeder Neuberechnung ausgeführt
  U.DEF = null;             // Referenzprojekt für die Herkunftserkennung
  U.LABELS = {};            // Feldpfad -> Beschriftung (für die Annahmenliste)
  U.UNITS = {};             // Feldpfad -> Einheit

  /* ---------------------------------------------------------------
     DOM-Helfer
     --------------------------------------------------------------- */

  U.el = function (tag, attrs, kinder) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    });
    (Array.isArray(kinder) ? kinder : (kinder ? [kinder] : [])).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  };
  var el = U.el;

  U.leeren = function (node) { while (node.firstChild) node.removeChild(node.firstChild); return node; };

  /* ---------------------------------------------------------------
     Detailstufe
     --------------------------------------------------------------- */

  U.sichtbar = function (feldStufe) {
    if (!feldStufe) return true;
    var p = A.state.p;
    return U.STUFEN[feldStufe] <= U.STUFEN[p.stufe || 'standard'];
  };

  /* ---------------------------------------------------------------
     Zahleneingabe: Anzeige mit Tausendertrennung, Eingabe tolerant
     --------------------------------------------------------------- */

  function parseZahl(s) {
    if (typeof s === 'number') return s;
    var t = String(s).replace(/[’'`\s]/g, '').replace(',', '.');
    var n = parseFloat(t);
    return isFinite(n) ? n : 0;
  }
  U.parseZahl = parseZahl;

  /* ---------------------------------------------------------------
     Formeleingabe  —  + − * / ( ) wie in der Tabellenkalkulation

     Bewusst ein eigener Parser statt eval: Formeln werden gespeichert
     und wandern über den Server zu allen Mitarbeitenden. Eine dort
     abgelegte Zeichenkette auszuführen wäre ein Einfallstor in jeden
     Browser der Firma.
     --------------------------------------------------------------- */

  /* Schreibweise vereinheitlichen: führendes «=» wie in Excel ist
     erlaubt, Hochkommata sind Tausendertrennung, das Komma ein
     Dezimaltrennzeichen. Leerzeichen fallen weg — «1 250 000» ist damit
     dieselbe Zahl wie «1'250'000», so wie es die bisherige Zahleneingabe
     schon immer gehandhabt hat. */
  function formelNormal(text) {
    return String(text === null || text === undefined ? '' : text)
      .replace(/^\s*=/, '')
      .replace(/[’'`\s]/g, '')
      .replace(/,/g, '.')
      .replace(/[−–—]/g, '-')     // Gedankenstrich aus kopiertem Text
      .replace(/[×✕]/g, '*')
      .replace(/[÷]/g, '/');
  }

  /* Rekursiver Abstieg:
       ausdruck := term  (('+' | '-') term)*
       term     := faktor (('*' | '/') faktor)*
       faktor   := ('+' | '-') faktor | '(' ausdruck ')' | zahl        */
  function rechnen(s) {
    var i = 0;

    function fehler(text) { throw new Error(text); }

    function ausdruck() {
      var w = term();
      while (i < s.length && (s[i] === '+' || s[i] === '-')) {
        var op = s[i++];
        var r = term();
        w = op === '+' ? w + r : w - r;
      }
      return w;
    }

    function term() {
      var w = faktor();
      while (i < s.length && (s[i] === '*' || s[i] === '/')) {
        var op = s[i++];
        var r = faktor();
        if (op === '*') { w = w * r; }
        else {
          if (r === 0) fehler('Division durch null');
          w = w / r;
        }
      }
      return w;
    }

    function faktor() {
      if (i >= s.length) fehler('Die Formel bricht ab');
      if (s[i] === '+') { i++; return faktor(); }
      if (s[i] === '-') { i++; return -faktor(); }
      if (s[i] === '(') {
        i++;
        var w = ausdruck();
        if (s[i] !== ')') fehler('Es fehlt eine schliessende Klammer');
        i++;
        return w;
      }
      var start = i;
      while (i < s.length && (s[i] >= '0' && s[i] <= '9')) i++;
      if (s[i] === '.') { i++; while (i < s.length && (s[i] >= '0' && s[i] <= '9')) i++; }
      if (i === start) fehler('Unerwartetes Zeichen «' + s[i] + '»');
      var z = parseFloat(s.slice(start, i));
      if (!isFinite(z)) fehler('Zahl nicht lesbar');
      return z;
    }

    var wert = ausdruck();
    if (i < s.length) fehler('Unerwartetes Zeichen «' + s[i] + '»');
    return wert;
  }

  /* Auswertung mit Ergebnisobjekt statt Ausnahme — der Aufrufer
     entscheidet, ob er den letzten guten Wert behält. */
  U.formelWert = function (text) {
    var s = formelNormal(text);
    if (s === '') return { ok: true, wert: 0, formel: '' };
    if (!/^[0-9.+\-*/()]+$/.test(s)) {
      return { ok: false, fehler: 'Erlaubt sind Zahlen und + − * / ( )' };
    }
    var wert;
    try { wert = rechnen(s); }
    catch (e) { return { ok: false, fehler: e.message }; }
    if (!isFinite(wert)) return { ok: false, fehler: 'Ergebnis nicht berechenbar' };
    /* Eine reine Zahl ist keine Formel und wird nicht als solche gemerkt. */
    var istFormel = /[+\-*/()]/.test(s.replace(/^-/, ''));
    return { ok: true, wert: wert, formel: istFormel ? String(text).trim() : '' };
  };

  /* Formeln liegen neben dem Wert — genau wie die Datenherkunft in
     p.meta. Der Rechenkern sieht deshalb weiterhin nur Zahlen. */
  function formelAblage(traeger) {
    if (!traeger._f || typeof traeger._f !== 'object') traeger._f = {};
    return traeger._f;
  }
  U.formelAblage = formelAblage;

  U.formelLesen = function (traeger, schluessel) {
    return (traeger && traeger._f && traeger._f[schluessel]) || '';
  };

  U.formelSchreiben = function (traeger, schluessel, formel) {
    if (formel) formelAblage(traeger)[schluessel] = formel;
    else if (traeger._f) delete traeger._f[schluessel];
  };

  /* Kennzeichnung am Feld, damit eine gerechnete Zahl als solche
     erkennbar bleibt. */
  function formelMarke(knoten, formel) {
    knoten.classList.toggle('hatformel', !!formel);
    if (formel) knoten.title = 'Formel: ' + formel;
    else if ((knoten.title || '').indexOf('Formel: ') === 0) knoten.title = '';
  }

  function anzeige(v, dez, gross) {
    if (v === '' || v === null || v === undefined || isNaN(v)) return '';
    return gross ? A.fmt(v, dez) : String(Math.round(v * 1e6) / 1e6);
  }

  /* ---------------------------------------------------------------
     Datenherkunft (Default / Annahme / belegt)
     --------------------------------------------------------------- */

  U.herkunft = function (p, pfad) {
    var m = p.meta[pfad];
    if (m && m.q) return m;
    var def = U.DEF ? A.get(U.DEF, pfad) : undefined;
    var ist = A.get(p, pfad);
    if (def !== undefined && def !== ist) return { q: 'annahme', note: '', auto: true };
    return { q: 'default', note: '' };
  };

  U.HERKUNFT_LABEL = { default: 'Standardwert', annahme: 'Annahme', belegt: 'belegt / Quelle vorhanden' };

  function badge(p, pfad) {
    var b = el('button', { class: 'q', type: 'button', title: 'Datenherkunft' });
    function mal() {
      var h = U.herkunft(p, pfad);
      b.className = 'q ' + h.q;
      b.title = 'Datenherkunft: ' + U.HERKUNFT_LABEL[h.q] + (h.note ? ' — ' + h.note : '') +
                '\nKlicken zum Ändern';
    }
    mal();
    b.addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      U.herkunftPopover(b, p, pfad, mal);
    });
    U.derived.push(mal);
    return b;
  }

  U.herkunftPopover = function (anker, p, pfad, neuzeichnen) {
    var alt = document.getElementById('pop'); if (alt) alt.remove();
    var h = U.herkunft(p, pfad);
    var box = el('div', { id: 'pop', class: 'panel', style:
      'position:absolute;z-index:200;width:250px;padding:10px;box-shadow:0 10px 30px rgba(16,21,28,.22)' });

    ['default', 'annahme', 'belegt'].forEach(function (q) {
      var r = el('label', { class: 'check' }, [
        el('input', { type: 'radio', name: 'q', checked: h.q === q ? '' : null,
          onchange: function () {
            p.meta[pfad] = { q: q, note: (p.meta[pfad] || {}).note || '' };
            neuzeichnen(); A.markDirty();
          } }),
        el('span', { text: U.HERKUNFT_LABEL[q] })
      ]);
      box.appendChild(r);
    });
    var ta = el('input', { type: 'text', placeholder: 'Quelle / Bemerkung', value: h.note || '',
      style: 'width:100%;margin-top:7px;padding:5px 7px;border:1px solid var(--line2);border-radius:4px',
      oninput: function (e) {
        p.meta[pfad] = { q: (p.meta[pfad] || {}).q || h.q, note: e.target.value };
        A.markDirty();
      } });
    box.appendChild(ta);
    box.appendChild(el('div', { class: 'muted', style: 'font-size:10.5px;margin-top:6px',
      text: 'Erscheint in der Annahmenliste des Berichts.' }));

    document.body.appendChild(box);
    var r = anker.getBoundingClientRect();
    box.style.left = Math.min(window.innerWidth - 262, r.left + window.scrollX) + 'px';
    box.style.top = (r.bottom + window.scrollY + 6) + 'px';

    setTimeout(function () {
      document.addEventListener('mousedown', function zu(e) {
        if (!box.contains(e.target)) { box.remove(); document.removeEventListener('mousedown', zu); }
      });
    }, 0);
  };

  /* ---------------------------------------------------------------
     Feldtypen
     --------------------------------------------------------------- */

  /* opts: unit, dez, gross (Tausendertrennung), min/max (Plausibilitätsband),
           stufe, hilfe, derive (fn -> string), pfadTitel                     */
  U.num = function (p, pfad, label, opts) {
    opts = opts || {};
    U.LABELS[pfad] = label; U.UNITS[pfad] = opts.unit || '';
    if (!U.sichtbar(opts.stufe)) return null;

    var wrap = el('div', { class: 'f' });
    var lab = el('label', {}, [el('span', { text: label })]);
    if (!opts.ohneBadge) lab.appendChild(badge(p, pfad));
    wrap.appendChild(lab);

    var inp = el('input', {
      type: 'text', inputmode: 'decimal',
      value: anzeige(A.get(p, pfad), opts.dez || 0, opts.gross)
    });
    var box = el('div', { class: 'inp' }, [inp]);
    if (opts.unit) box.appendChild(el('span', { class: 'unit', text: opts.unit }));
    wrap.appendChild(box);

    /* Formeln liegen projektweit unter p.formeln, adressiert über den
       Feldpfad — dieselbe Systematik wie die Datenherkunft in p.meta. */
    if (!p.formeln || typeof p.formeln !== 'object') p.formeln = {};
    var formelFehler = '';

    function pruefen() {
      var v = A.get(p, pfad), schlecht = false;
      if (opts.min !== undefined && opts.max !== undefined && opts.max > 0) {
        schlecht = v < opts.min || v > opts.max;
      }
      box.classList.toggle('bad', !!(schlecht || formelFehler));
      box.title = formelFehler ? formelFehler
        : schlecht
          ? 'Ausserhalb der üblichen Bandbreite ' + A.fmt(opts.min, opts.dez || 0) +
            ' – ' + A.fmt(opts.max, opts.dez || 0) + (opts.unit ? ' ' + opts.unit : '')
          : '';
      formelMarke(box, formelFehler ? '' : p.formeln[pfad]);
    }

    inp.addEventListener('input', function () {
      var e = U.formelWert(inp.value);
      /* Unfertige Eingabe wie «2500*» darf den Wert nicht auf null
         setzen — sonst springen bei jedem Tastendruck alle Kennzahlen.
         Der letzte gute Wert bleibt stehen, das Feld wird markiert. */
      if (!e.ok) { formelFehler = e.fehler; pruefen(); return; }
      formelFehler = '';
      if (e.formel) p.formeln[pfad] = e.formel; else delete p.formeln[pfad];
      A.set(p, pfad, e.wert);
      if (opts.onchange) opts.onchange(e.wert);
      pruefen(); A.recompute();
    });
    inp.addEventListener('focus', function () {
      inp.value = p.formeln[pfad] || anzeige(A.get(p, pfad), opts.dez || 0, false);
    });
    inp.addEventListener('blur', function () {
      /* Beim Verlassen zählt das Ergebnis. Eine fehlerhafte Eingabe wird
         verworfen und die letzte gültige Formel wiederhergestellt. */
      formelFehler = '';
      inp.value = anzeige(A.get(p, pfad), opts.dez || 0, opts.gross);
      pruefen();
    });
    pruefen();

    if (opts.hilfe) wrap.appendChild(el('div', { class: 'hilfe', text: opts.hilfe }));
    if (opts.derive) {
      var d = el('div', { class: 'derived' });
      U.derived.push(function () { d.textContent = opts.derive(A.state.r, p); });
      wrap.appendChild(d);
    }
    /* Von aussen gesetzte Werte (z. B. durch Modusumschaltung) nachziehen */
    U.derived.push(function () {
      if (document.activeElement !== inp) inp.value = anzeige(A.get(p, pfad), opts.dez || 0, opts.gross);
    });
    return wrap;
  };

  U.txt = function (p, pfad, label, opts) {
    opts = opts || {};
    U.LABELS[pfad] = label;
    if (!U.sichtbar(opts.stufe)) return null;
    var inp = el('input', { type: 'text', value: A.get(p, pfad) || '', placeholder: opts.platzhalter || '' });
    inp.addEventListener('input', function () { A.set(p, pfad, inp.value); A.markDirty(); if (opts.rerender) A.render(); });
    return el('div', { class: 'f' }, [
      el('label', {}, [el('span', { text: label })]),
      el('div', { class: 'inp' }, [inp])
    ]);
  };

  U.sel = function (p, pfad, optionen, label, opts) {
    opts = opts || {};
    U.LABELS[pfad] = label;
    if (!U.sichtbar(opts.stufe)) return null;
    var s = el('select');
    optionen.forEach(function (o) {
      s.appendChild(el('option', { value: o.id, text: o.label, selected: A.get(p, pfad) === o.id ? '' : null }));
    });
    s.addEventListener('change', function () {
      A.set(p, pfad, s.value);
      if (opts.onchange) opts.onchange(s.value);
      A.recompute();
      if (opts.rerender !== false) A.render();
    });
    var lab = el('label', {}, [el('span', { text: label })]);
    if (!opts.ohneBadge) lab.appendChild(badge(p, pfad));
    var wrap = el('div', { class: 'f' }, [lab, el('div', { class: 'inp' }, [s])]);
    if (opts.hilfe) wrap.appendChild(el('div', { class: 'hilfe', text: opts.hilfe }));
    return wrap;
  };

  U.chk = function (p, pfad, label, opts) {
    opts = opts || {};
    if (!U.sichtbar(opts.stufe)) return null;
    var i = el('input', { type: 'checkbox', checked: A.get(p, pfad) ? '' : null });
    i.addEventListener('change', function () {
      A.set(p, pfad, i.checked); A.recompute();
      if (opts.rerender !== false) A.render();
    });
    return el('label', { class: 'check' }, [i, el('span', { text: label })]);
  };

  /* Segmentierter Umschalter */
  U.seg = function (p, pfad, optionen, label, opts) {
    opts = opts || {};
    if (label) U.LABELS[pfad] = label;
    if (!U.sichtbar(opts.stufe)) return null;
    var box = el('div', { class: 'seg' });
    optionen.forEach(function (o) {
      var b = el('button', { type: 'button', text: o.label, class: A.get(p, pfad) === o.id ? 'on' : '',
        title: o.hint || '' });
      b.addEventListener('click', function () {
        A.set(p, pfad, o.id);
        if (opts.onchange) opts.onchange(o.id);
        A.recompute(); A.render();
      });
      box.appendChild(b);
    });
    if (!label) return box;
    return el('div', { class: 'f' }, [el('label', {}, [el('span', { text: label })]), box]);
  };

  /* Tabellenzelle mit Zahleneingabe */
  U.zelleNum = function (obj, key, opts) {
    opts = opts || {};
    /* leerBei0: 0 wird als leeres Feld dargestellt — hält Tabellen ruhig,
       in denen die meisten Zeilen keinen manuellen Wert tragen. */
    function zeig(v) {
      if (opts.leerBei0 && !v) return '';
      return anzeige(v, opts.dez || 0, opts.gross);
    }
    var inp = el('input', { type: 'text', inputmode: 'decimal',
      placeholder: opts.platzhalter || '', value: zeig(obj[key]) });
    /* In Tabellen hängt die Formel am Zeilenobjekt selbst — die Zeilen
       haben keinen projektweiten Pfad. */
    var formelFehler = '';

    function pruefen() {
      var v = obj[key];
      var schlecht = opts.min !== undefined && opts.max > 0 && (v < opts.min || v > opts.max);
      inp.classList.toggle('bad', !!(schlecht || formelFehler));
      inp.title = formelFehler ? formelFehler
        : schlecht ? 'Übliche Bandbreite: ' + A.fmt(opts.min, opts.dez || 0) + ' – ' +
            A.fmt(opts.max, opts.dez || 0) : '';
      formelMarke(inp, formelFehler ? '' : U.formelLesen(obj, key));
    }
    inp.addEventListener('input', function () {
      var e = U.formelWert(inp.value);
      if (!e.ok) { formelFehler = e.fehler; pruefen(); return; }
      formelFehler = '';
      U.formelSchreiben(obj, key, e.formel);
      obj[key] = e.wert;
      pruefen(); A.recompute();
    });
    inp.addEventListener('focus', function () {
      var f = U.formelLesen(obj, key);
      if (f) { inp.value = f; return; }
      inp.value = (opts.leerBei0 && !obj[key]) ? '' : anzeige(obj[key], opts.dez || 0, false);
    });
    inp.addEventListener('blur', function () {
      formelFehler = '';
      inp.value = zeig(obj[key]);
      pruefen();
    });
    pruefen();
    U.derived.push(function () {
      if (document.activeElement !== inp) { inp.value = zeig(obj[key]); pruefen(); }
    });
    return inp;
  };

  U.zelleSel = function (obj, key, optionen, opts) {
    opts = opts || {};
    var s = el('select');
    optionen.forEach(function (o) {
      s.appendChild(el('option', { value: o.id, text: o.label, selected: obj[key] === o.id ? '' : null }));
    });
    s.addEventListener('change', function () {
      obj[key] = s.value; A.recompute();
      if (opts.rerender) A.render();
    });
    return s;
  };

  U.zelleChk = function (obj, key) {
    var i = el('input', { type: 'checkbox', checked: obj[key] ? '' : null, style: 'width:auto' });
    i.addEventListener('change', function () { obj[key] = i.checked; A.recompute(); A.render(); });
    return i;
  };

  /* ---------------------------------------------------------------
     Bausteine
     --------------------------------------------------------------- */

  U.panel = function (titel, hint, koerper, aktionen) {
    var h = el('h2', {}, [el('span', { text: titel })]);
    if (hint) h.appendChild(el('span', { class: 'hint', text: hint }));
    if (aktionen && aktionen.length) h.appendChild(el('span', { class: 'sp' }, aktionen));
    var body = Array.isArray(koerper) ? koerper : [koerper];
    var p = el('div', { class: 'panel' }, [h]);
    body.filter(Boolean).forEach(function (b) { p.appendChild(b); });
    return p;
  };

  U.body = function (kinder, klasse) {
    return el('div', { class: 'panelbody' }, [
      klasse ? el('div', { class: 'cols ' + klasse }, (kinder || []).filter(Boolean))
             : el('div', {}, (kinder || []).filter(Boolean))
    ]);
  };

  U.kopf = function (titel, text) {
    return el('div', { class: 'seitenkopf' }, [
      el('h1', { text: titel }),
      text ? el('p', { text: text }) : null
    ]);
  };

  /* Abgeleiteter Textwert, der bei jeder Neuberechnung nachgeführt wird */
  U.d = function (fn, klasse) {
    var s = el('span', { class: klasse || 'num' });
    U.derived.push(function () { s.textContent = fn(A.state.r, A.state.p); });
    return s;
  };

  U.dTd = function (fn, klasse) {
    var t = el('td', { class: 'n ' + (klasse || '') });
    U.derived.push(function () {
      var v = fn(A.state.r, A.state.p);
      if (v && typeof v === 'object' && v.nodeType) { U.leeren(t).appendChild(v); }
      else t.textContent = v;
    });
    return t;
  };

  U.tabelle = function (spalten, zeilen, opts) {
    opts = opts || {};
    var thead = el('thead', {}, [el('tr', {}, spalten.map(function (s) {
      return el('th', { class: s.n ? 'n' : '', style: s.w ? 'width:' + s.w : null, text: s.label });
    }))]);
    var tbody = el('tbody', {}, zeilen.filter(Boolean));
    return el('div', { class: 'tw' }, [el('table', { class: opts.class || '' }, [thead, tbody])]);
  };

  U.kachel = function (k, v, s, klasse) {
    return el('div', { class: 'kachel' }, [
      el('div', { class: 'k', text: k }),
      el('div', { class: 'v ' + (klasse || '') , text: v }),
      s ? el('div', { class: 's', text: s }) : null
    ]);
  };

  U.hinweis = function (art, text) {
    var ic = { warn: '!', ziel: '▲', info: 'i', ok: '✓' }[art] || 'i';
    return el('div', { class: 'hinweis ' + art }, [
      el('span', { class: 'ic', text: ic }), el('span', { html: text })
    ]);
  };

  /* ---------------------------------------------------------------
     Modal
     --------------------------------------------------------------- */

  U.modal = function (titel, koerper, knoepfe) {
    var bg = el('div', { class: 'modal-bg' });
    var m = el('div', { class: 'modal' }, [
      el('h3', { text: titel }),
      el('div', { class: 'mb' }, Array.isArray(koerper) ? koerper : [koerper]),
      el('div', { class: 'mf' }, (knoepfe || []).concat([
        el('button', { text: 'Schliessen', onclick: function () { bg.remove(); } })
      ]))
    ]);
    bg.appendChild(m);
    bg.addEventListener('mousedown', function (e) { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
    return bg;
  };

  /* ---------------------------------------------------------------
     Kleine SVG-Grafiken
     --------------------------------------------------------------- */

  U.svg = function (w, h, kinder, opts) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    s.setAttribute('width', '100%');
    s.setAttribute('height', (opts && opts.h) || h);
    s.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    (kinder || []).filter(Boolean).forEach(function (k) { s.appendChild(k); });
    return s;
  };

  U.s = function (tag, attrs, text) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    });
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  };

})(window.APP);
