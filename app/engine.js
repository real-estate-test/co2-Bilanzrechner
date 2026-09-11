/* =====================================================================
   Projektrechner · Rechenkern
   Reine Funktionen, kein DOM-Zugriff. compute(projekt) -> resultat
   ===================================================================== */
window.APP = window.APP || {};
(function (A) {
  'use strict';

  var E = {};
  A.engine = E;

  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function pct(v) { return num(v) / 100; }

  /* Ist-Wert einer Kostenzeile. Ist einer erfasst, ersetzt er den
     gerechneten Soll-Betrag — und alles, was darauf aufbaut. Ein leeres
     Feld bedeutet «noch offen» und lässt die Schätzung stehen. */
  function ist(p, key) {
    if (!p.ist || p.ist_uebernehmen === false) return null;
    var v = p.ist[key];
    if (v === undefined || v === null || v === '') return null;
    var n = parseFloat(v);
    return isFinite(n) ? n : null;
  }
  E.ist = ist;

  /* ---------------------------------------------------------------
     Zeitachse — alle Zeitpunkte in Jahren ab Kaufzeitpunkt t = 0
     --------------------------------------------------------------- */

  E.zeitachse = function (p) {
    /* Eingabe erfolgt in Monaten, gerechnet wird in Jahren. */
    var z = p.zeit, M = function (k) { return num(z[k]) / 12; };
    var bauzeit     = Math.max(1 / 12, M('dauer_bau'));
    var t_baueingabe = M('dauer_entwicklung');
    var t_bb        = t_baueingabe + M('dauer_bewilligung');
    var t_baustart  = t_bb + M('dauer_vorbereitung');
    var t_bauende   = t_baustart + bauzeit;
    var t_rohbau    = t_baustart + bauzeit * 0.55;
    var t_vk_start  = Math.max(0, t_bb + M('verkaufsstart_rel_bb'));
    var t_vk_ende   = t_vk_start + Math.max(1 / 12, M('dauer_verkauf'));
    var t_ende      = Math.max(t_bauende + M('exit_verzoegerung'), t_vk_ende);
    /* Stichtag der Zahlungen als Zeitpunkt auf derselben Achse. Er trennt
       geflossene von noch offenen Beträgen. Ohne gültige Daten bleibt er
       bei null — dann verhält sich alles wie ohne Zahlungsstand. */
    var t_stichtag = 0;
    if (p.startdatum && p.stichtag) {
      var d0 = Date.parse(p.startdatum), d1 = Date.parse(p.stichtag);
      if (isFinite(d0) && isFinite(d1)) {
        t_stichtag = Math.max(0, Math.min(t_ende, (d1 - d0) / 31557600000));
      }
    }
    return {
      t_baueingabe: t_baueingabe, t_bb: t_bb, t_baustart: t_baustart,
      t_rohbau: t_rohbau, t_bauende: t_bauende, t_stichtag: t_stichtag,
      t_vk_start: t_vk_start, t_vk_ende: t_vk_ende, t_ende: t_ende,
      N: Math.max(2, Math.ceil(t_ende + 0.001))
    };
  };

  /* Verteilt einen Betrag über [t0, t1) auf das Jahresraster. */
  function spread(total, t0, t1, N, kurve) {
    var out = new Array(N).fill(0);
    if (!total) return out;
    if (t1 <= t0 + 1e-9) {
      var j = Math.min(N - 1, Math.max(0, Math.floor(t0)));
      out[j] += total;
      return out;
    }
    var F = (kurve === 's')
      ? function (x) { return x * x * (3 - 2 * x); }   // Smoothstep = S-Kurve
      : function (x) { return x; };
    for (var i = 0; i < N; i++) {
      var a = Math.min(Math.max((i - t0) / (t1 - t0), 0), 1);
      var b = Math.min(Math.max((i + 1 - t0) / (t1 - t0), 0), 1);
      out[i] = total * (F(b) - F(a));
    }
    return out;
  }
  E.spread = spread;

  function punkt(total, t, N) { return spread(total, t, t, N, 'linear'); }

  /* Die vier Projektphasen mit ihrem Anteil am Kapitalbedarf. Die erfassten
     Prozentwerte werden auf 100 % normiert, damit eine unvollständige
     Eingabe keine Kosten verschluckt oder erfindet. Phasen der Dauer null
     fallen weg und ihr Anteil verteilt sich auf die übrigen. */
  E.PHASEN = [
    { id: 'entwicklung',  label: 'Entwicklung',      von: 't0',           bis: 't_baueingabe' },
    { id: 'bewilligung',  label: 'Bewilligung',      von: 't_baueingabe', bis: 't_bb' },
    { id: 'vorbereitung', label: 'Vorbereitung',     von: 't_bb',         bis: 't_baustart' },
    { id: 'bau',          label: 'Bau',              von: 't_baustart',   bis: 't_bauende' }
  ];

  E.phasenverteilung = function (p, Z, N) {
    var v = p.zeit.verteilung || {};
    var liste = E.PHASEN.map(function (ph) {
      var von = ph.von === 't0' ? 0 : Z[ph.von];
      return { id: ph.id, label: ph.label, von: von, bis: Z[ph.bis],
               pct: Math.max(0, num(v[ph.id])), dauer: Z[ph.bis] - von };
    });
    var summe = liste.reduce(function (s, ph) {
      return s + (ph.dauer > 1e-9 ? ph.pct : 0);
    }, 0);
    liste.forEach(function (ph) {
      ph.anteil = (summe > 0 && ph.dauer > 1e-9) ? ph.pct / summe : 0;
    });
    /* Ohne jede Eingabe fällt alles in die Bauphase — sonst stünde das
       Projekt ohne Kapitalbedarf da. */
    if (summe <= 0) {
      var bau = liste[liste.length - 1];
      bau.anteil = 1;
      if (bau.dauer <= 1e-9) bau.bis = bau.von;
    }
    return liste;
  };

  function addArr(ziel, quelle) {
    for (var i = 0; i < ziel.length; i++) ziel[i] += (quelle[i] || 0);
    return ziel;
  }

  /* ---------------------------------------------------------------
     1 · Flächen
     --------------------------------------------------------------- */

  E.flaechen = function (p, warn) {
    var g = p.grundstueck;
    var res = { teile: {}, total: {
      gf_oi: 0, gf_ug: 0, f_aeh: 0, gf: 0, gv: 0, gv_oi: 0, gv_ug: 0, gv_aeh: 0,
      nwf: 0, pp: 0, grundflaeche: 0, attika: 0
    }, gruppen: { oi_stwe: 0, oi_miete: 0, oi_gewerbe: 0 } };

    /* Anrechenbare Geschossfläche: über die Ausnützungsziffer samt
       allfälligem Bonus, oder direkt erfasst. */
    var agf_zul = g.az_modus === 'agf'
      ? num(g.agf_direkt)
      : num(g.flaeche) * (num(g.az) * (1 + pct(g.az_bonus)));
    res.agf_zulaessig = agf_zul;

    /* Geschosse sind VOLLGESCHOSSE ohne Attika. */
    var geschosse = Math.max(1, num(g.geschosse) || 1);
    res.geschosse = geschosse;
    res.attika_anrechenbar = !!g.attika_anrechenbar;

    var agf_genutzt = 0;

    A.TEILE.forEach(function (T) {
      var t = p.teile[T.id];
      var o = { aktiv: !!t.aktiv, gf_oi: 0, gf_ug: 0, f_aeh: 0, gf: 0, attika: 0,
                gv_oi: 0, gv_ug: 0, gv_aeh: 0, gv: 0, nwf: 0,
                pp: num(t.pp), grundflaeche: 0, nutzungen: {}, zeilen: [],
                gruppen: { oi_stwe: 0, oi_miete: 0, oi_gewerbe: 0 } };

      if (t.aktiv) {
        if (t.modus === 'ausnutzung') {
          o.agf = agf_zul;
          o.gf_oi = o.agf * num(t.faktor_gf);
        } else {
          o.gf_oi = num(t.gf_oi);
          o.agf = o.gf_oi / Math.max(0.01, num(t.faktor_gf));
        }

        /* Gebäudegrundfläche = anrechenbare Geschossfläche je Vollgeschoss.
           Bewusst OHNE Attika — der Fussabdruck bemisst sich am Vollgeschoss. */
        o.grundflaeche = o.agf / geschosse;
        /* Ist die Attika nicht anrechenbar, kommt ihre Fläche zusätzlich
           zur aGF hinzu; andernfalls steckt sie bereits darin. */
        o.attika = g.attika_anrechenbar ? 0 : o.grundflaeche * pct(g.attika_pct);
        o.gf_oi += o.attika;
        o.gf_ug  = o.grundflaeche * pct(t.ug_quote);
        o.f_aeh  = o.pp * num(t.flaeche_pro_pp);
        o.gf     = o.gf_oi + o.gf_ug;
        o.nwf    = num(t.nwf_manuell) > 0 ? num(t.nwf_manuell) : o.gf_oi * pct(t.hnf_quote);

        /* Kubaturen: Vollgeschosse zur Regelhöhe, die Attika separat. */
        var hoehe_oi = geschosse * num(t.h_regel) + (o.attika > 0 ? num(t.h_dach) : 0);
        o.hoehe_oi = hoehe_oi;
        if (t.kubatur_modus === 'volumen') {
          o.gv_oi  = num(t.v_oi);
          o.gv_ug  = num(t.v_ug);
          o.gv_aeh = num(t.v_aeh);
          o.h_oi_ist  = o.grundflaeche > 0 ? o.gv_oi / o.grundflaeche : 0;
          o.h_ug_ist  = o.gf_ug > 0 ? o.gv_ug / o.gf_ug : 0;
          o.h_aeh_ist = o.f_aeh > 0 ? o.gv_aeh / o.f_aeh : 0;
        } else {
          o.gv_oi  = o.grundflaeche * geschosse * num(t.h_regel) + o.attika * num(t.h_dach);
          o.gv_ug  = o.gf_ug * num(t.h_ug);
          o.gv_aeh = o.f_aeh * num(t.h_aeh);
          o.h_oi_ist = hoehe_oi; o.h_ug_ist = num(t.h_ug); o.h_aeh_ist = num(t.h_aeh);
        }
        o.gv = o.gv_oi + o.gv_ug + o.gv_aeh;
        /* Durchschnittliche Geschosshöhe oberirdisch = Volumen je m²
           Geschossfläche. h_oi_ist ist demgegenüber die Gesamthöhe des
           Gebäudes über alle Geschosse. */
        o.h_oi_mittel = o.gf_oi > 0 ? o.gv_oi / o.gf_oi : 0;
        agf_genutzt += o.agf || 0;
      }

      /* Nutzungszeilen */
      var summeFlaeche = 0, summePP = 0;
      (t.nutzungen || []).forEach(function (n) {
        if (n.art === 'parkplatz') summePP += num(n.anteil);
        else summeFlaeche += num(n.anteil);
      });

      (t.nutzungen || []).forEach(function (n) {
        var menge;
        if (n.art === 'parkplatz') {
          menge = num(n.flaeche_manuell) > 0 ? num(n.flaeche_manuell) : o.pp * pct(n.anteil);
        } else {
          menge = num(n.flaeche_manuell) > 0 ? num(n.flaeche_manuell) : o.nwf * pct(n.anteil);
        }
        if (!t.aktiv) menge = 0;
        o.nutzungen[n.id] = menge;
        o.zeilen.push({ id: n.id, menge: menge });
        /* Geschossfläche je Kostengruppe — Grundlage der BKP 20–29 */
        if (t.aktiv && n.art !== 'parkplatz') {
          var gr = n.kostengruppe || A.kostengruppeFuer(n.art, n.verwertung);
          o.gruppen[gr] = (o.gruppen[gr] || 0) + o.gf_oi * pct(n.anteil);
        }
      });

      /* Wohnungsspiegel speist die Nutzungszeilen: Jede Einheit ist einer
         Zeile zugeordnet und erbt von dort Art und Verwertung. Solange kein
         Spiegel vorliegt, gilt der Durchschnittspreis der Zeile. */
      o.spiegel = {};
      if (p.spiegel.aktiv && p.spiegel.teil === T.id && p.spiegel.einheiten.length) {
        var sf = 0, sp = 0;
        p.spiegel.einheiten.forEach(function (e) {
          var zid = e.zeile;
          if (!zid || o.nutzungen[zid] === undefined) return;
          /* Eine Zeile kann mehrere gleichwertige Wohnungen abbilden.
             Fläche und Preis gelten je Einheit. */
          var anz = Math.max(1, Math.round(num(e.anzahl) || 1));
          if (!o.spiegel[zid]) o.spiegel[zid] = { flaeche: 0, erloes: 0, anzahl: 0 };
          o.spiegel[zid].flaeche += num(e.flaeche) * anz;
          o.spiegel[zid].erloes  += num(e.preis) * anz;
          o.spiegel[zid].anzahl  += anz;
          sf += num(e.flaeche) * anz; sp += num(e.preis) * anz;
        });
        Object.keys(o.spiegel).forEach(function (zid) {
          var g = o.spiegel[zid];
          g.preis_m2 = g.flaeche > 0 ? g.erloes / g.flaeche : 0;
          o.nutzungen[zid] = g.flaeche;
        });
        o.spiegel_flaeche = sf;
        o.spiegel_erloes = sp;
        o.spiegel_preis_m2 = sf > 0 ? sp / sf : 0;
      }

      if (t.aktiv && Math.abs(summeFlaeche - 100) > 0.5) {
        warn.push({ art: 'warn', text: T.label + ': Flächenanteile ergeben ' +
          A.fmt(summeFlaeche, 1) + ' % statt 100 %.' });
      }
      if (t.aktiv && o.pp > 0 && Math.abs(summePP - 100) > 0.5) {
        warn.push({ art: 'warn', text: T.label + ': die Parkplätze sind zu ' +
          A.fmt(summePP, 1) + ' % verteilt statt zu 100 %.' });
      }

      /* Kubatur je Kostengruppe — Mengenbasis der BKP 20–29, wenn diese
         über CHF/m³ gerechnet werden. Die oberirdische Kubatur verteilt
         sich im Verhältnis der Geschossflächen auf die Gruppen. */
      o.gruppen_gv = {};
      Object.keys(o.gruppen).forEach(function (k) {
        o.gruppen_gv[k] = o.gf_oi > 0 ? o.gv_oi * (o.gruppen[k] / o.gf_oi) : 0;
      });

      res.teile[T.id] = o;
      if (t.aktiv) {
        ['gf_oi', 'gf_ug', 'f_aeh', 'gf', 'gv', 'gv_oi', 'gv_ug', 'gv_aeh', 'nwf', 'pp', 'grundflaeche', 'attika']
          .forEach(function (k) { res.total[k] += o[k]; });
        Object.keys(o.gruppen).forEach(function (k) { res.gruppen[k] += o.gruppen[k]; });
      }
    });

    res.agf_genutzt = agf_genutzt;

    /* Umgebungsfläche = Grundstück abzüglich der überbauten Fläche */
    res.umgebung = num(p.grundstueck.umgebung_manuell) > 0
      ? num(p.grundstueck.umgebung_manuell)
      : Math.max(0, num(g.flaeche) - res.total.grundflaeche);

    res.gv_bestand = num(p.bestand_extra.gv) > 0
      ? num(p.bestand_extra.gv)
      : (res.teile.bestand.gv || 0);

    if (agf_zul > 0 && agf_genutzt > agf_zul * 1.02) {
      warn.push({ art: 'warn', text: 'Die genutzte Geschossfläche liegt ' +
        A.fmt((agf_genutzt / agf_zul - 1) * 100, 1) + ' % über der zulässigen Ausnutzung.' });
    }
    return res;
  };

  /* ---------------------------------------------------------------
     2 · Baukosten je Block
     --------------------------------------------------------------- */

  function mengeFor(basis, block, F, p) {
    var t = { neubau: 'neubau', erweiterung: 'erweiterung', sanierung: 'bestand' }[block];
    var o = F.teile[t] || {};
    switch (basis) {
      case 'gf':            return o.gf || 0;
      case 'gf_oi':         return o.gf_oi || 0;
      case 'gf_oi_stwe':    return (o.gruppen && o.gruppen.oi_stwe) || 0;
      case 'gf_oi_miete':   return (o.gruppen && o.gruppen.oi_miete) || 0;
      case 'gf_oi_gewerbe': return (o.gruppen && o.gruppen.oi_gewerbe) || 0;
      case 'gv':            return o.gv || 0;
      case 'gv_oi':         return o.gv_oi || 0;
      case 'gv_oi_stwe':    return (o.gruppen_gv && o.gruppen_gv.oi_stwe) || 0;
      case 'gv_oi_miete':   return (o.gruppen_gv && o.gruppen_gv.oi_miete) || 0;
      case 'gv_oi_gewerbe': return (o.gruppen_gv && o.gruppen_gv.oi_gewerbe) || 0;
      case 'gv_ug':         return o.gv_ug || 0;
      case 'gv_aeh':        return o.gv_aeh || 0;
      case 'f_ug':          return o.gf_ug || 0;
      case 'f_aeh':         return o.f_aeh || 0;
      case 'nwf':           return o.nwf || 0;
      case 'pp':            return o.pp || 0;
      case 'umgebung':      return F.umgebung || 0;
      case 'gsf':           return num(p.grundstueck.flaeche) || 0;
      case 'gv_bestand':    return F.gv_bestand || 0;
      default:              return 1;   // pauschal, pct_*
    }
  }
  E.mengeFor = mengeFor;

  var PROZENTBASEN = ['pct_bkp2', 'pct_bkp1_2', 'pct_bkp1_4', 'pct_bkp1_5'];

  /* Zeilen mit fester Rechenreihenfolge — sie bauen aufeinander auf und
     werden deshalb nicht in der ersten Runde erfasst. */
  var GEORDNET = ['b1_vorbereitung', 'b2_reserve', 'b5_dritt', 'b5_bnk', 'b5_pm'];

  E.baukosten = function (p, F, warn) {
    var res = { bloecke: {}, total: 0, teuerung: 0, basis_ohne_teuerung: 0,
                pm_basis: 0, pm_honorar: 0, ohne_pm: 0 };

    ['neubau', 'erweiterung', 'sanierung'].forEach(function (bid) {
      var b = p.bau[bid];
      if (!b.aktiv) return;
      var out = { id: bid, label: A.BLOCK_LABELS[bid], zeilen: [],
                  bkp1: 0, bkp2: 0, bkp3: 0, bkp4: 0, bkp5: 0, bkp9: 0,
                  summe: 0, reserve: 0, pm_honorar: 0, total: 0 };

      var katalog = A.BKP_KATALOG.concat(b.eigene || []);

      function gruppieren(bkp, betrag) {
        var g = String(bkp).charAt(0);
        if (g === '1') out.bkp1 += betrag;
        else if (g === '2') out.bkp2 += betrag;
        else if (g === '3') out.bkp3 += betrag;
        else if (g === '4') out.bkp4 += betrag;
        else if (g === '5') out.bkp5 += betrag;
        else if (g === '9') out.bkp9 += betrag;
      }

      function erfassen(kat, z, betrag, menge) {
        /* Ein erfasster Ist-Wert ersetzt den gerechneten Betrag. Weil die
           Gruppensummen daraus entstehen, ziehen Reserve, Baunebenkosten
           und Projektmanagement-Honorar automatisch nach. */
        var iv = ist(p, 'bau.' + bid + '.' + kat.id);
        var wirksam = iv !== null ? iv : betrag;
        out.zeilen.push({ id: kat.id, bkp: kat.bkp, label: kat.label, basis: z.basis,
                          menge: z.basis === 'pauschal' ? null : menge,
                          kennwert: num(z.wert), betrag: wirksam,
                          soll: betrag, ist: iv !== null });
        gruppieren(kat.bkp, wirksam);
        return wirksam;
      }

      /* Erste Runde: alle mengenbezogenen Zeilen ausser jenen, deren
         Reihenfolge feststeht (siehe unten) */
      katalog.forEach(function (kat) {
        if (GEORDNET.indexOf(kat.id) >= 0) return;
        var z = b.zeilen[kat.id];
        if (!z || !z.aktiv) return;
        if (PROZENTBASEN.indexOf(z.basis) >= 0) return;
        var menge = num(z.menge_manuell) > 0 ? num(z.menge_manuell) : mengeFor(z.basis, bid, F, p);
        var betrag = z.basis === 'pauschal' ? num(z.wert) : menge * num(z.wert);
        erfassen(kat, z, betrag, menge);
      });

      /* Zweite Runde in fester Reihenfolge, weil die Bezugsgrössen
         aufeinander aufbauen:
           BKP 1 Vorbereitung -> auf BKP 20–29 vor Reserve
           202 Reserve        -> auf BKP 20–29 vor Reserve zuzüglich der
                                 Vorbereitungsarbeiten. Deren Prozentwert
                                 wirkt damit ein zweites Mal — das ist so
                                 gewollt und mit dem Anwender abgestimmt.
           BKP 558.1 Dritth.  -> auf BKP 1–4 (inkl. Reserve)
           BKP 5  BNK         -> auf BKP 20–29 inkl. Reserve
           BKP 599 PM         -> auf BKP 1–5 ohne sich selbst              */
      var bkp2_roh = out.bkp2, vorbereitung = 0;
      var reihenfolge = [
        { id: 'b1_vorbereitung', basis: function () { return bkp2_roh; } },
        { id: 'b2_reserve', basis: function () { return bkp2_roh + vorbereitung; } },
        { id: 'b5_dritt',   basis: function () { return out.bkp1 + out.bkp2 + out.bkp3 + out.bkp4; } },
        { id: 'b5_bnk',     basis: function () { return out.bkp2; } },
        { id: 'b5_pm',      basis: function () { return out.bkp1 + out.bkp2 + out.bkp3 + out.bkp4 + out.bkp5; } }
      ];
      reihenfolge.forEach(function (r) {
        var z = b.zeilen[r.id];
        if (!z || !z.aktiv) return;
        var kat = katalog.find(function (k) { return k.id === r.id; });
        if (!kat) return;
        var wirksam;
        if (PROZENTBASEN.indexOf(z.basis) >= 0) {
          var basis = r.basis();
          wirksam = erfassen(kat, z, basis * pct(z.wert), basis);
        } else {
          /* Auch pauschal oder mengenbezogen erfassbar — dann in dieser
             Runde, damit die Reihenfolge der Bezugsgrössen erhalten bleibt. */
          var menge = num(z.menge_manuell) > 0 ? num(z.menge_manuell) : mengeFor(z.basis, bid, F, p);
          wirksam = erfassen(kat, z, z.basis === 'pauschal' ? num(z.wert) : menge * num(z.wert), menge);
        }
        if (r.id === 'b1_vorbereitung') vorbereitung = wirksam;
        if (r.id === 'b2_reserve') out.reserve = wirksam;
        /* Nur das Projektmanagement-Honorar bleibt aus der Bezugsgrösse des
           Entwicklungshonorars draussen. Die Dritthonorare zählen mit. */
        if (r.id === 'b5_pm') out.pm_honorar += wirksam;
      });

      /* Übrige prozentuale Zeilen — etwa frei ergänzte */
      katalog.forEach(function (kat) {
        if (reihenfolge.some(function (r) { return r.id === kat.id; })) return;
        var z = b.zeilen[kat.id];
        if (!z || !z.aktiv || PROZENTBASEN.indexOf(z.basis) < 0) return;
        var basis = z.basis === 'pct_bkp2' ? out.bkp2
                  : z.basis === 'pct_bkp1_2' ? (out.bkp1 + out.bkp2)
                  : z.basis === 'pct_bkp1_5' ? (out.bkp1 + out.bkp2 + out.bkp3 + out.bkp4 + out.bkp5)
                  : (out.bkp1 + out.bkp2 + out.bkp3 + out.bkp4);
        erfassen(kat, z, basis * pct(z.wert), basis);
      });

      /* Die Zeilen entstehen in Rechenreihenfolge — erst die Mengenzeilen,
         dann die prozentualen. Für die Ausgabe zählt aber die Reihenfolge
         des Katalogs, sonst stünde etwa BKP 1 Vorbereitungsarbeiten hinter
         BKP 9 statt bei den übrigen BKP-1-Zeilen. */
      var reihung = {};
      katalog.forEach(function (kat, i) { reihung[kat.id] = i; });
      out.zeilen.sort(function (a, b2) {
        var ia = reihung[a.id], ib = reihung[b2.id];
        return (ia === undefined ? 999 : ia) - (ib === undefined ? 999 : ib);
      });

      out.summe = out.bkp1 + out.bkp2 + out.bkp3 + out.bkp4 + out.bkp5 + out.bkp9;

      /* Altprojekte: pauschale Reserve auf BKP 1 + 2, falls noch gesetzt */
      var altReserve = (out.bkp1 + out.bkp2) * pct(b.reserve);
      out.reserve_pauschal = altReserve;
      out.total = out.summe + altReserve;

      /* Kennwerte des Blocks. Die Kubatur umfasst die gebauten Volumen —
         oberirdisch, Untergeschoss und Einstellhalle. */
      var gf = mengeFor('gf', bid, F, p);
      var teilO = F.teile[{ neubau: 'neubau', erweiterung: 'erweiterung', sanierung: 'bestand' }[bid]] || {};
      out.gv_rel = (teilO.gv_oi || 0) + (teilO.gv_ug || 0) + (teilO.gv_aeh || 0);
      out.nwf = teilO.nwf || 0;
      out.pro_gf = gf > 0 ? out.total / gf : 0;
      out.pro_nwf = out.nwf > 0 ? out.total / out.nwf : 0;
      out.pro_gv = out.gv_rel > 0 ? out.total / out.gv_rel : 0;
      res.bloecke[bid] = out;
      res.basis_ohne_teuerung += out.total;
      res.pm_basis += out.pm_honorar;
    });

    var tf = 1;
    if (p.bau.teuerung_aktiv) {
      var Z = E.zeitachse(p);
      var mitte = (Z.t_baustart + Z.t_bauende) / 2;
      tf = Math.pow(1 + pct(p.bau.teuerung_pct), mitte);
      res.teuerung = res.basis_ohne_teuerung * (tf - 1);
    }
    res.total = res.basis_ohne_teuerung + res.teuerung;

    /* Baukosten ohne das Projektmanagement-Honorar — Bezugsgrösse des
       Entwicklungshonorars. Die Dritthonorare BKP 558.1 zählen mit. */
    res.pm_honorar = res.pm_basis * tf;
    res.ohne_pm = res.total - res.pm_honorar;

    if (res.total <= 0) warn.push({ art: 'info', text: 'Es sind noch keine Baukosten erfasst.' });
    return res;
  };

  /* ---------------------------------------------------------------
     3 · Erwerbskosten
     --------------------------------------------------------------- */

  /* Gerechneter Kaufpreis ohne Ist-Übersteuerung — Bezugsgrösse für den
     Soll-Ist-Vergleich. Ohne ihn stünde im Tracking der Ist-Wert auch in
     der Soll-Spalte und die Abweichung wäre immer null. */
  E.kaufpreisSoll = function (p, F) {
    var e = p.erwerb;
    if (p.erwerbsart === 'baurecht') return num(e.baurecht_einmal);
    switch (e.preis_modus) {
      case 'm2_land': return num(e.preis_m2_land) * num(p.grundstueck.flaeche);
      case 'm2_agf':  return num(e.preis_m2_agf) * (F.agf_zulaessig || 0);
      default:        return num(e.preis_total);
    }
  };

  E.kaufpreis = function (p, F) {
    var iv = ist(p, 'erwerb.kaufpreis');
    return iv !== null ? iv : E.kaufpreisSoll(p, F);
  };

  E.erwerbskosten = function (p, F, anlagekosten_schaetz, gewinn_schaetz, bau_ohne_pm) {
    var e = p.erwerb, z = [], kp = E.kaufpreis(p, F);

    z.push({ id: 'kaufpreis', label: p.erwerbsart === 'baurecht'
      ? 'Einmalentschädigung Baurecht' : 'Kaufpreis Liegenschaft',
      basis: '—', betrag: kp, soll: E.kaufpreisSoll(p, F),
      ist: ist(p, 'erwerb.kaufpreis') !== null });

    function proz(id, label, satz, basis, anteil) {
      var b = basis * pct(satz) * (anteil === undefined ? 1 : pct(anteil));
      var iv = ist(p, 'erwerb.' + id);
      z.push({ id: id, label: label, basis: A.fmt(satz, 2) + ' %',
               betrag: iv !== null ? iv : b, soll: b, ist: iv !== null });
      return iv !== null ? iv : b;
    }

    proz('notariat', 'Notariat / Beurkundung', e.notariat, kp);
    proz('grundbuch', 'Grundbuchgebühren', e.grundbuch, kp);
    proz('handaenderung', 'Handänderungssteuer (Anteil Käufer ' +
      A.fmt(e.handaenderung_anteil, 0) + ' %)', e.handaenderung, kp, e.handaenderung_anteil);
    proz('courtage', 'Einkaufskommission / Courtage', e.courtage, kp);

    function fest(id, label, basisText, wert) {
      var iv = ist(p, 'erwerb.' + id);
      z.push({ id: id, label: label, basis: basisText,
               betrag: iv !== null ? iv : wert, soll: wert, ist: iv !== null });
    }
    fest('dd', 'Due Diligence / Altlastenabklärung', 'pauschal', num(e.dd));
    fest('geometer', 'Vermessung / Geometer', 'pauschal', num(e.geometer));
    fest('recht', 'Rechtsberatung / Verträge', 'pauschal', num(e.recht));

    if (p.grundstueck.mehrwertabgabe_aktiv) {
      var mw = num(p.grundstueck.mehrwert_basis) * pct(p.grundstueck.mehrwertabgabe_pct);
      var mwIst = ist(p, 'erwerb.mehrwert');
      z.push({ id: 'mehrwert', label: 'Mehrwertabgabe (Planungsmehrwert)',
        basis: A.fmt(p.grundstueck.mehrwertabgabe_pct, 0) + ' %',
        betrag: mwIst !== null ? mwIst : mw, soll: mw, ist: mwIst !== null });
    }

    /* Entwicklungshonorar zuletzt, weil sich die Vorgabe «erwerb_bau» auf
       die Summe aller übrigen Erwerbskosten stützt. Das Honorar selbst
       bleibt aussen vor — es bemisst sich nicht an sich selbst; ebenso
       wenig am Projektmanagement-Honorar BKP 599. Die Dritthonorare
       BKP 558.1 zählen dagegen mit. */
    var erwerbOhneHonorar = z.reduce(function (s, x) { return s + x.betrag; }, 0);
    var basisText = { erwerb_bau: 'auf Erwerbs- und Baukosten', anlagekosten: 'auf Anlagekosten',
                      landwert: 'auf Landwert', gewinn: 'auf Gewinn' };
    var basisEnt = e.entwicklung_basis === 'landwert' ? kp
                 : e.entwicklung_basis === 'gewinn' ? Math.max(0, gewinn_schaetz || 0)
                 : e.entwicklung_basis === 'anlagekosten' ? (anlagekosten_schaetz || 0)
                 : erwerbOhneHonorar + (bau_ohne_pm || 0);
    var ent = basisEnt * pct(e.entwicklung_pct);
    var entIst = ist(p, 'erwerb.entwicklung');
    z.push({ id: 'entwicklung',
      label: 'Entwicklungshonorar (' + (basisText[e.entwicklung_basis] || basisText.erwerb_bau) + ')',
      basis: A.fmt(e.entwicklung_pct, 2) + ' %',
      betrag: entIst !== null ? entIst : ent, soll: ent, ist: entIst !== null,
      bezugsgroesse: basisEnt });

    var total = z.reduce(function (s, x) { return s + x.betrag; }, 0);
    return { zeilen: z, total: total, kaufpreis: kp, nebenkosten: total - kp,
             entwicklung_basis_betrag: basisEnt };
  };

  /* ---------------------------------------------------------------
     4 · Erträge und Verwertung
     --------------------------------------------------------------- */

  E.ertraege = function (p, F) {
    var r = {
      positionen: [],
      sollmiete: 0,           // NUR Miet- und Exit-Flächen — verkaufte STWE
                              // erzeugt keinen Mietertrag (siehe Rückmeldung 6/9)
      sollmiete_halten: 0,
      stwe_erloes: 0,
      exit_wert: 0,
      halten_wert: 0,
      nwf_stwe: 0, nwf_halten: 0,
      /* Getrennt nach Verwertung — Grundlage der anteiligen
         Investition je Block. nwf_halten bleibt die Summe aus Miete
         und Exit, weil die Renditekennzahlen darauf aufbauen. */
      nwf_miete: 0, nwf_exit: 0
    };

    A.TEILE.forEach(function (T) {
      var t = p.teile[T.id], fo = F.teile[T.id];
      if (!t.aktiv) return;

      (t.nutzungen || []).forEach(function (n) {
        var menge = fo.nutzungen[n.id] || 0;
        if (menge <= 0) return;

        var istPP = n.art === 'parkplatz';
        var preis = num(n.preis);
        var sp = fo.spiegel && fo.spiegel[n.id];
        if (sp && sp.preis_m2 > 0) preis = sp.preis_m2;   // Spiegel schlägt durch

        /* Parkplätze werden je Monat erfasst, Flächen je Jahr und m². */
        var miete_a = istPP ? menge * num(n.miete) * 12 : menge * num(n.miete);

        var pos = {
          teil: T.id, teil_label: T.label,
          nutzung: n.id, nutzung_label: n.bezeichnung, art: n.art,
          einheit: istPP ? 'Stk.' : 'm²',
          flaeche: menge, miete_m2: num(n.miete), preis_m2: preis,
          verwertung: n.verwertung, sollmiete: 0,
          erloes: 0, wert: 0, kategorie: ''
        };

        if (n.verwertung === 'stwe') {
          pos.erloes = menge * preis;
          pos.kategorie = 'stwe';
          pos.art_label = 'Verkauf STWE';
          r.stwe_erloes += pos.erloes;
          if (!istPP) r.nwf_stwe += menge;
        } else if (n.verwertung === 'exit') {
          /* Leer oder 0 = Vorgabe aus den Bewertungsannahmen */
          var rend = Math.max(0.5, num(n.exit_rendite) > 0
            ? num(n.exit_rendite) : num(p.bewertung.exit_rendite));
          var basisMiete = miete_a;
          if (p.bewertung.exit_netto) basisMiete = miete_a * (1 - pct(p.betrieb.leerstand)) * 0.82;
          pos.wert = basisMiete / pct(rend);
          pos.sollmiete = miete_a;
          pos.kategorie = 'exit';
          pos.eigener_satz = num(n.exit_rendite) > 0;
          pos.art_label = 'Exit an Investor ' + A.fmt(rend, 2) + ' %' +
            (pos.eigener_satz ? '' : ' (Vorgabe)');
          r.exit_wert += pos.wert;
          r.sollmiete += miete_a;
          r.sollmiete_halten += miete_a;
          if (!istPP) { r.nwf_halten += menge; r.nwf_exit += menge; }
        } else {
          var rh = Math.max(0.5, num(p.bewertung.rendite_halten));
          pos.wert = miete_a / pct(rh);
          pos.sollmiete = miete_a;
          pos.kategorie = 'miete';
          pos.art_label = n.verwertung === 'halten_selbst' ? 'Halten selbstgenutzt' : 'Halten vermietet';
          pos.selbst = num(n.selbst);
          r.halten_wert += pos.wert;
          r.sollmiete += miete_a;
          r.sollmiete_halten += miete_a;
          if (!istPP) { r.nwf_halten += menge; r.nwf_miete += menge; }
        }
        r.positionen.push(pos);
      });
    });

    r.verwertungswert = r.stwe_erloes + r.exit_wert + r.halten_wert;
    r.nwf_total = r.nwf_stwe + r.nwf_halten;
    /* Anteil der Ertragsflächen — Grundlage der anteiligen Anlagekosten
       für die Bruttorendite (Rückmeldung D2, Variante a). */
    r.anteil_ertrag = r.nwf_total > 0 ? r.nwf_halten / r.nwf_total : 0;
    /* Anteile je Verwertung. Sie ergeben zusammen eins und verteilen
       die Gesamtinvestition auf die drei Blöcke. Parkplätze zählen
       nicht mit — sie haben keine Nutzfläche und würden den Schlüssel
       verzerren. */
    r.anteil_stwe  = r.nwf_total > 0 ? r.nwf_stwe  / r.nwf_total : 0;
    r.anteil_miete = r.nwf_total > 0 ? r.nwf_miete / r.nwf_total : 0;
    r.anteil_exit  = r.nwf_total > 0 ? r.nwf_exit  / r.nwf_total : 0;
    return r;
  };

  /* ---------------------------------------------------------------
     5 · Vermarktungskosten
     --------------------------------------------------------------- */

  E.vermarktung = function (p, ERT) {
    var v = p.vermarktung, z = [];
    var verkaufsbasis = ERT.stwe_erloes + ERT.exit_wert;

    function zeile(id, label, basisText, wert) {
      var iv = ist(p, 'vermarktung.' + id);
      z.push({ id: id, label: label, basis: basisText,
               betrag: iv !== null ? iv : wert, soll: wert, ist: iv !== null });
    }

    zeile('verkauf', 'Verkaufsprovision STWE', A.fmt(v.verkauf_pct, 2) + ' %',
      ERT.stwe_erloes * pct(v.verkauf_pct));
    zeile('beurkundung', 'Beurkundung Verkauf (Anteil Verkäufer)',
      A.fmt(v.beurkundung_verkauf, 2) + ' %', ERT.stwe_erloes * pct(v.beurkundung_verkauf));
    zeile('exit_nk', 'Verkaufsnebenkosten Exit an Investor',
      A.fmt(v.exit_nebenkosten, 2) + ' %', ERT.exit_wert * pct(v.exit_nebenkosten));
    zeile('vermietung', 'Erstvermietungsprovision',
      A.fmt(v.vermietung_monate, 2) + ' Monatsmieten',
      ERT.sollmiete_halten / 12 * num(v.vermietung_monate));
    zeile('marketing', 'Marketing / Werbung',
      v.marketing_basis === 'pauschal' ? 'pauschal' : A.fmt(v.marketing_pct, 2) + ' %',
      v.marketing_basis === 'pauschal' ? num(v.marketing_fix)
        : (verkaufsbasis + ERT.halten_wert) * pct(v.marketing_pct));
    zeile('muster', 'Musterwohnung / Visualisierung', 'pauschal', num(v.muster));

    var total = z.reduce(function (s, x) { return s + x.betrag; }, 0);
    return { zeilen: z, total: total };
  };

  /* ---------------------------------------------------------------
     6 · Betriebsaufwand (Jahreswerte für vermietete Flächen)
     --------------------------------------------------------------- */

  E.betrieb = function (p, ERT, baukosten) {
    var b = p.betrieb, z = [];
    var miete = ERT.sollmiete_halten;

    /* Ohne gehaltene Flächen gibt es keinen Betrieb — sonst würden die
       flächen- und kostenbezogenen Positionen einen Aufwand ohne Ertrag erzeugen. */
    if (miete <= 0 && ERT.nwf_halten <= 0) {
      return { zeilen: [], total_a: 0, leerstand_a: 0, noi_a: 0, sollmiete_a: 0 };
    }

    function zeile(id, label, cfg) {
      var betrag;
      if (cfg.basis === 'pct_miete') betrag = miete * pct(cfg.wert);
      else if (cfg.basis === 'pct_ak') betrag = baukosten * pct(cfg.wert);
      else if (cfg.basis === 'pauschal') betrag = num(cfg.wert);   // CHF je Jahr
      else betrag = num(cfg.wert) * ERT.nwf_halten;      // chf_m2
      z.push({ id: id, label: label,
        basis: cfg.basis === 'pct_miete' ? A.fmt(cfg.wert, 2) + ' % Miete'
             : cfg.basis === 'pct_ak' ? A.fmt(cfg.wert, 2) + ' % Baukosten'
             : cfg.basis === 'pauschal' ? 'pauschal je Jahr'
             : A.fmt(cfg.wert, 0) + ' CHF/m²',
        betrag: betrag });
      return betrag;
    }

    zeile('verwaltung', 'Verwaltung', b.verwaltung);
    zeile('unterhalt', 'Unterhalt / Instandsetzung', b.unterhalt);
    zeile('versicher', 'Versicherungen / Abgaben', b.versicher);
    zeile('nk_nicht_um', 'Nicht umlagefähige Nebenkosten', b.nk_nicht_um);
    zeile('erneuerung', 'Erneuerungsfonds / Rückstellungen', b.erneuerung);

    var total = z.reduce(function (s, x) { return s + x.betrag; }, 0);
    var leerstand = miete * pct(b.leerstand);
    return { zeilen: z, total_a: total, leerstand_a: leerstand,
             noi_a: miete - leerstand - total, sollmiete_a: miete };
  };

  /* ---------------------------------------------------------------
     7 · Zeitreihen — Ausgaben und Einnahmen je Jahr
     --------------------------------------------------------------- */

  /* -----------------------------------------------------------------
     Verkaufsstand aus der Verkaufsübersicht — eingefroren am Projekt.
     Die Übersicht liefert nur den Status; als Erlös zählt ausschliesslich,
     was der Anwender je Einheit erfasst hat (p.verkauf.preise).
     ----------------------------------------------------------------- */
  /* Wirksamer Erlös einer Einheit: was von Hand erfasst wurde, sonst der
     Preis aus der Quelle. In der eigenen Liste ist beides dasselbe Feld. */
  E.verkaufErloes = function (v, u) {
    var erfasst = num((v.preise || {})[u.id]);
    return erfasst > 0 ? erfasst : num(u.preis);
  };

  /* Ein erfasstes Datum als Zeitpunkt auf der Projektachse. Ohne
     gültiges Datum null — der Aufrufer entscheidet dann selbst. */
  E.zeitpunkt = function (p, Z, datum) {
    if (!p.startdatum || !datum) return null;
    var d0 = Date.parse(p.startdatum), d1 = Date.parse(datum);
    if (!isFinite(d0) || !isFinite(d1)) return null;
    return Math.max(0, Math.min(Z.t_ende, (d1 - d0) / 31557600000));
  };

  /* Fristen des Projektes, mit den Vorgabewerten als Rückfall. */
  E.fristen = function (p) {
    var f = (p.vermarktung && p.vermarktung.fristen) || {};
    function w(k, vorgabe) { return f[k] === undefined || f[k] === null ? vorgabe : num(f[k]); }
    return {
      tagebuch_tage: w('tagebuch_tage', 10),
      nach_tagebuch_tage: w('nach_tagebuch_tage', 3),
      decke_ug_pct: w('decke_ug_pct', 20),
      unterlagsboden_pct: w('unterlagsboden_pct', 75)
    };
  };

  E.verkaufInfo = function (p) {
    var v = p.verkauf;
    if (!v) return null;
    /* Fehlt der Modus (Altbestand oder Import), ihn aus dem Inhalt
       ableiten — sonst bliebe ein zugeordnetes Projekt still wirkungslos. */
    if (!v.modus) {
      if (v.projekt_id && v.stand) v.modus = 'uebersicht';
      else if (Array.isArray(v.manuell) && v.manuell.length) v.modus = 'manuell';
      else return null;
    }
    var quelle = v.modus === 'manuell'
      ? (Array.isArray(v.manuell) ? v.manuell : [])
      : (v.projekt_id && v.stand && Array.isArray(v.stand.einheiten) ? v.stand.einheiten : null);
    if (!quelle) return null;
    var o = { modus: v.modus,
              datum: v.modus === 'manuell' ? 'eigene Liste' : (v.stand ? v.stand.datum : ''),
              name: v.modus === 'manuell' ? '' : (v.stand ? v.stand.name : ''),
              verkauft_n: 0, verkauft_chf: 0, ohne_erloes: 0,
              reserviert_n: 0, frei_n: 0, einheiten: quelle };
    quelle.forEach(function (u) {
      if (u.status === 'sold') {
        o.verkauft_n += 1;
        var pr = E.verkaufErloes(v, u);
        if (pr > 0) o.verkauft_chf += pr; else o.ohne_erloes += 1;
      } else if (u.status === 'reserved') {
        /* Reservationen werden ausgewiesen, aber nicht gerechnet —
           eine Reservation ist keine Beurkundung. */
        o.reserviert_n += 1;
      } else if (u.status === 'available') {
        o.frei_n += 1;
      }
    });
    return o;
  };

  E.zeitreihen = function (p, Z, ERW, BAU, ERT, VER, BET) {
    var N = Z.N, kurve = p.zeit.kostenkurve;
    var aus = new Array(N).fill(0), ein = new Array(N).fill(0), phasen = [];
    var tS = Z.t_stichtag || 0;
    var bezahltMap = p.bezahlt || {};

    /* Bewusst ohne Obergrenze: Nachträge und Unvorhergesehenes führen
       regelmässig dazu, dass für eine Position mehr bezahlt wird als
       veranschlagt. Der Mehrbetrag ist echtes Geld und gehört in den
       Kapitalbedarf. */
    function bezahltFuer(key) {
      var v = num(bezahltMap[key]);
      return v > 0 ? v : 0;
    }

    /* Verteilung einer Kostenzeile über die Zeitachse. Ist ein Teil bereits
       bezahlt, liegt dieser Teil als tatsächlicher Abfluss zwischen
       Projektstart und Stichtag; der offene Rest folgt der geplanten
       Verteilung, beginnt aber frühestens am Stichtag. Zeilen ohne
       erfasste Zahlung bleiben unangetastet. */
    function verteile(ziel, key, betrag, von, bis, kurveZ) {
      var bez = bezahltFuer(key);
      if (bez <= 0) {
        addArr(ziel, spread(betrag, von, bis, N, kurveZ));
        return;
      }
      if (tS > 0) addArr(ziel, spread(bez, 0, tS, N, 'linear'));
      else addArr(ziel, punkt(bez, 0, N));
      /* Ist bereits mehr bezahlt als die Position kostet, bleibt für die
         Zukunft nichts übrig. Eine negative Restzahlung wäre eine
         Rückerstattung, die es nicht gibt. */
      var rest = betrag - bez;
      if (rest > 0.005) {
        addArr(ziel, spread(rest, Math.max(von, tS), Math.max(bis, tS), N, kurveZ));
      }
    }
    var det = { erwerb: new Array(N).fill(0), bau: new Array(N).fill(0),
                vermarktung: new Array(N).fill(0), betrieb: new Array(N).fill(0),
                verkauf: new Array(N).fill(0), miete: new Array(N).fill(0),
                exit: new Array(N).fill(0), halten: new Array(N).fill(0) };

    /* Erwerb: Kaufpreis und Kaufnebenkosten bei t = 0,
       das Entwicklungshonorar über die Entwicklungsphase. */
    ERW.zeilen.forEach(function (z) {
      var key = 'erwerb.' + z.id;
      if (z.id === 'entwicklung') {
        verteile(det.erwerb, key, z.betrag, 0, Math.max(0.5, Z.t_bauende), 'linear');
      } else if (z.id === 'mehrwert') {
        verteile(det.erwerb, key, z.betrag, Z.t_bb, Z.t_bb, 'linear');
      } else {
        verteile(det.erwerb, key, z.betrag, 0, 0, 'linear');
      }
    });

    /* Baurechtszins läuft ab Kauf bis Projektende */
    if (p.erwerbsart === 'baurecht' && num(p.erwerb.baurecht_zins) > 0) {
      addArr(det.erwerb, spread(num(p.erwerb.baurecht_zins) * Z.t_ende, 0, Z.t_ende, N, 'linear'));
    }

    /* Baukosten. Im Modus «phasen» wird der Gesamtbetrag nach den erfassten
       Prozentwerten auf die vier Projektphasen gelegt und innerhalb der
       Phase linear verteilt — der Kapitalbedarf folgt dann der Vorgabe des
       Anwenders statt einer Kurve. Sonst gilt die bisherige Verteilung je
       Zeilenart. */
    if (p.zeit.verteilung_modus === 'phasen') {
      phasen = E.phasenverteilung(p, Z, N);
      /* Bereits Bezahltes wird vorweg genommen, der Rest auf die Phasen
         verteilt — sonst stünde es doppelt im Kapitalbedarf. */
      var bezahltBau = 0;
      Object.keys(BAU.bloecke).forEach(function (bid) {
        BAU.bloecke[bid].zeilen.forEach(function (z) {
          bezahltBau += bezahltFuer('bau.' + bid + '.' + z.id);
        });
      });
      if (bezahltBau > 0) {
        if (tS > 0) addArr(det.bau, spread(bezahltBau, 0, tS, N, 'linear'));
        else addArr(det.bau, punkt(bezahltBau, 0, N));
      }
      var offenBau = Math.max(0, BAU.total - bezahltBau);
      phasen.forEach(function (ph) {
        addArr(det.bau, spread(offenBau * ph.anteil,
          Math.max(ph.von, tS), Math.max(ph.bis, tS), N, 'linear'));
      });
    } else {
      Object.keys(BAU.bloecke).forEach(function (bid) {
        var b = BAU.bloecke[bid];
        b.zeilen.forEach(function (z) {
          var key = 'bau.' + bid + '.' + z.id;
          if (z.id === 'b2_honorare') {
            verteile(det.bau, key, z.betrag, 0.25, Z.t_bauende, 'linear');
          } else if (z.id === 'b5_bnk') {
            verteile(det.bau, key, z.betrag, Z.t_baueingabe, Z.t_bauende, 'linear');
          } else if (z.bkp.charAt(0) === '1') {
            verteile(det.bau, key, z.betrag, Z.t_baustart,
              Z.t_baustart + (Z.t_bauende - Z.t_baustart) * 0.3, 'linear');
          } else {
            verteile(det.bau, key, z.betrag, Z.t_baustart, Z.t_bauende, kurve);
          }
        });
        /* Nur die pauschale Altreserve — die Zeile BKP 202 steckt bereits
           in b.zeilen und wäre sonst ein zweites Mal im Kapitalbedarf. */
        addArr(det.bau, spread(b.reserve_pauschal || 0, Z.t_baustart, Z.t_bauende, N, kurve));
      });
      addArr(det.bau, spread(BAU.teuerung, Z.t_baustart, Z.t_bauende, N, kurve));
    }

    /* Vermarktung: Marketing ab Verkaufsstart, Provisionen mit den Verkäufen */
    VER.zeilen.forEach(function (z) {
      var key = 'vermarktung.' + z.id;
      if (z.id === 'vermietung') {
        verteile(det.vermarktung, key, z.betrag, Z.t_bauende - 0.5, Z.t_bauende + 0.5, 'linear');
      } else if (z.id === 'muster' || z.id === 'marketing') {
        verteile(det.vermarktung, key, z.betrag, Math.max(0, Z.t_vk_start - 0.5), Z.t_vk_ende, 'linear');
      } else {
        verteile(det.vermarktung, key, z.betrag, Z.t_vk_start, Z.t_vk_ende, 'linear');
      }
    });

    /* Verkaufserlöse STWE: Vorverkauf bis Baustart, Rest bis Verkaufsende.
       Je Verkauf greift der Zahlungsplan. */
    var vq = Math.min(100, Math.max(0, num(p.finanzierung.vorverkauf_quote))) / 100;
    var plan = (p.vermarktung.zahlungsplan || []).filter(function (r) { return num(r.anteil) > 0; });
    var planSumme = plan.reduce(function (s, r) { return s + num(r.anteil); }, 0) || 100;

    var FR = E.fristen(p);
    var bauzeit = Math.max(1 / 12, Z.t_bauende - Z.t_baustart);

    /* Termin einer Rate. null bedeutet: es fliesst nichts — das gilt für
       «bei Übergabe» ohne erfasstes Übergabedatum der Einheit.
         Vertragstermine kommen aus den Daten der Einheit,
         Bautermine aus dem Modell,
         die beiden von Hand freigegebenen aus einer Schätzung über die
         Bauzeit, bis ein Datum erfasst ist. */
    function zahlungsZeit(bezug, ctx) {
      var tK = ctx.tBeurk;
      switch (bezug) {
        case 'beurkundung':
          return tK;
        case 'tagebuch':
          return tK === null ? null
            : tK + (FR.tagebuch_tage + FR.nach_tagebuch_tage) / 365.25;
        case 'baustart':
          return Math.max(tK === null ? 0 : tK, Z.t_baustart);
        case 'decke_ug':
          return Math.max(tK === null ? 0 : tK, Z.t_baustart + bauzeit * pct(FR.decke_ug_pct));
        case 'rohbau':
          return Math.max(tK === null ? 0 : tK, Z.t_rohbau);
        case 'unterlagsboden':
          return Math.max(tK === null ? 0 : tK, Z.t_baustart + bauzeit * pct(FR.unterlagsboden_pct));
        case 'uebergabe':
          /* Verkaufte Einheit ohne Übergabedatum: kein Geldfluss. Für den
             noch nicht verkauften Rest gilt die Fertigstellung. */
          return ctx.verkauft ? ctx.tUeb : Math.max(tK === null ? 0 : tK, Z.t_bauende);
        default:
          return Math.max(tK === null ? 0 : tK, Z.t_bauende);
      }
    }

    /* Verkaufserlöse. Ohne Verkaufsstand wie bisher: Vorverkaufsannahme
       bis Baustart, Rest danach.

       Mit Verkaufsstand zählen die Fakten. Jede verkaufte Einheit bringt
       ihren Erlös nach dem Zahlungsplan ein, gerechnet ab ihren eigenen
       Vertragsdaten. Je Rate gilt:
         Zahlungsdatum im Plan erfasst → dieser Zeitpunkt
         Vertragstermin der Einheit    → dieser Zeitpunkt
         freigegebener Bautermin       → Termin laut Modell, auch rückwirkend
         offener Bautermin             → Termin laut Modell, frühestens aber
                                         am Stichtag
       «bei Übergabe» ohne erfasstes Datum bringt bei einer verkauften
       Einheit gar nichts ein — die Übergabe hat nachweislich nicht
       stattgefunden. Der Betrag bleibt im Erlös, fehlt aber im
       Zahlungsstrom; das verteuert die Finanzierung und wird gemeldet. */
    var vkInfo = E.verkaufInfo(p);
    var vkDaten = (p.verkauf && p.verkauf.daten) || {};
    var vkUeb = (p.verkauf && p.verkauf.uebergaben) || {};
    var ohneUebergabe = 0, ohneUebergabeN = 0;

    function ratenZeit(r, ctx) {
      var erfasst = E.zeitpunkt(p, Z, r.datum);
      if (erfasst !== null) return erfasst;
      var t = zahlungsZeit(r.bezug, ctx);
      if (t === null) return null;
      /* Vertragstermine sind Fakten und werden nicht auf den Stichtag
         geschoben; Bautermine schon, solange sie nicht freigegeben sind. */
      if (A.ZAHLUNG_ART[r.bezug] === 'einheit') return t;
      return r.frei ? t : Math.max(t, tS);
    }

    function planVerteilen(betrag, ctx, mitFreigabe) {
      if (betrag <= 0) return;
      plan.forEach(function (r) {
        var teil = betrag * num(r.anteil) / planSumme;
        var tz = mitFreigabe ? ratenZeit(r, ctx) : zahlungsZeit(r.bezug, ctx);
        if (tz === null) {
          ohneUebergabe += teil; ohneUebergabeN += 1;
          return;
        }
        addArr(det.verkauf, spread(teil, tz, tz + 0.5, N, 'linear'));
      });
    }

    if (vkInfo && ERT.stwe_erloes > 0 && vkInfo.verkauft_chf > 0) {
      /* Der verkaufte Anteil, gedeckelt auf den kalkulierten Erlös —
         mehr als kalkuliert lässt sich nicht verteilen. */
      var faktor = Math.min(1, ERT.stwe_erloes / vkInfo.verkauft_chf);
      var verkauftTotal = 0;
      (vkInfo.einheiten || []).forEach(function (u) {
        if (u.status !== 'sold') return;
        var erloes = E.verkaufErloes(p.verkauf, u) * faktor;
        if (erloes <= 0) return;
        verkauftTotal += erloes;
        /* Ohne erfasstes Beurkundungsdatum gilt der Stichtag — bis dahin
           ist die Einheit nachweislich verkauft. */
        var tB = E.zeitpunkt(p, Z, vkDaten[u.id]);
        planVerteilen(erloes, {
          tBeurk: tB === null ? tS : tB,
          tUeb: E.zeitpunkt(p, Z, vkUeb[u.id]),
          verkauft: true
        }, true);
      });
      /* Der noch nicht verkaufte Rest folgt der geplanten Vermarktung,
         frühestens ab Stichtag. */
      var rest = Math.max(0, ERT.stwe_erloes - verkauftTotal);
      planVerteilen(rest, {
        tBeurk: (Math.max(Z.t_vk_start, tS) + Math.max(Z.t_vk_ende, tS + 0.1)) / 2,
        tUeb: null, verkauft: false
      }, false);
    } else {
      var tranchen = [
        { anteil: vq,     t0: Z.t_vk_start, t1: Math.max(Z.t_vk_start + 0.1, Z.t_baustart) },
        { anteil: 1 - vq, t0: Math.max(Z.t_vk_start, Z.t_baustart), t1: Z.t_vk_ende }
      ];
      tranchen.forEach(function (tr) {
        if (tr.anteil <= 0) return;
        planVerteilen(ERT.stwe_erloes * tr.anteil,
          { tBeurk: (tr.t0 + tr.t1) / 2, tUeb: null, verkauft: false }, false);
      });
    }

    /* Exit an Investor und kalkulatorische Realisierung des Halteanteils */
    var tExit = Z.t_bauende + num(p.zeit.exit_verzoegerung) / 12;
    addArr(det.exit, punkt(ERT.exit_wert, tExit, N));
    addArr(det.halten, punkt(ERT.halten_wert, Math.min(tExit, Z.t_ende), N));

    /* Mieterträge: Zwischennutzung + Erstvermietung nach Fertigstellung */
    if (p.szenario !== 'neubau' && p.bestand_extra.zwischennutzung && num(p.bestand_extra.zn_miete) > 0) {
      var znEnde = p.bestand_extra.strategie === 'erhalten' ? Z.t_ende : Z.t_baustart;
      var znNetto = num(p.bestand_extra.zn_miete) * (1 - pct(p.bestand_extra.zn_kosten_pct));
      addArr(det.miete, spread(znNetto * znEnde, 0, znEnde, N, 'linear'));
    }
    var mietStart = Z.t_bauende + Math.max(0, num(p.betrieb.erstvermietung)) / 2;
    var mietDauer = Math.max(0, Z.t_ende - mietStart);
    if (mietDauer > 0 && BET.noi_a > 0) {
      addArr(det.miete, spread(BET.noi_a * mietDauer, mietStart, Z.t_ende, N, 'linear'));
    }

    /* det.halten ist kalkulatorisch (Marktwert des Halteanteils) und fliesst
       bewusst NICHT in den Finanzierungs-Cashflow — sonst würden Bauzinsen
       durch einen Zufluss gekürzt, den es real nicht gibt. Die Realisierung
       erfolgt als Schlussabrechnung in E.finanzierung(). */
    for (var i = 0; i < N; i++) {
      aus[i] = det.erwerb[i] + det.bau[i] + det.vermarktung[i] + det.betrieb[i];
      ein[i] = det.verkauf[i] + det.miete[i] + det.exit[i];
    }
    return { N: N, aus: aus, ein: ein, det: det, phasen: phasen,
             ohne_uebergabe: ohneUebergabe, ohne_uebergabe_n: ohneUebergabeN };
  };

  /* ---------------------------------------------------------------
     8 · Finanzierung — Jahresraster, Mid-Year-Konvention
     --------------------------------------------------------------- */

  /* Eigenkapitalquote der Phase. Vor der Baubewilligung finanzieren Banken
     zurückhaltender — deshalb sind beide Quoten getrennt erfassbar. */
  E.ekQuote = function (p, Z, zeitpunkt) {
    var f = p.finanzierung;
    var vor = f.ek_quote_vor_bb !== undefined && f.ek_quote_vor_bb !== null
      ? num(f.ek_quote_vor_bb) : num(f.ek_quote);
    var nach = f.ek_quote_nach_bb !== undefined && f.ek_quote_nach_bb !== null
      ? num(f.ek_quote_nach_bb) : num(f.ek_quote);
    return zeitpunkt < Z.t_bb ? vor : nach;
  };

  E.finanzierung = function (p, Z, TR, gesamtinvestition, fk_limit_vor, haltenWert, vorverkaufIst) {
    var f = p.finanzierung, N = TR.N;
    /* Das verpflichtete Eigenkapital bemisst sich an der Quote nach
       Baubewilligung — das ist der Stand, mit dem das Projekt gebaut wird. */
    var ekMax = Math.max(0, gesamtinvestition * pct(E.ekQuote(p, Z, Z.t_bb)));
    var fkDeckel = Math.max(0, gesamtinvestition * pct(f.ltc_max));

    /* Aufteilung eines Finanzierungssaldos auf Eigen- und Fremdkapital.
       'zuerst'       – Eigenmittel werden vorab eingebracht (Bankpraxis Baukredit)
       'proportional' – jede Periode wird gemäss Eigenkapitalquote aufgeteilt   */
    function teile(saldo, zeitpunkt) {
      if (saldo <= 0) return { ek: 0, fk: 0 };
      var quote = pct(E.ekQuote(p, Z, zeitpunkt === undefined ? Z.t_ende : zeitpunkt));
      var ek, fk;
      if (f.ek_einsatz === 'zuerst') {
        ek = Math.min(saldo, ekMax);
        fk = saldo - ek;
      } else {
        ek = saldo * quote;
        fk = saldo - ek;
      }
      if (fk > fkDeckel) { fk = fkDeckel; ek = saldo - fk; }
      return { ek: ek, fk: fk };
    }

    /* Zinsrabatt aus der Vorverkaufsstaffel. Liegt ein echter
       Verkaufsstand vor, ersetzt dessen Quote die Planannahme. */
    var quoteWirksam = (vorverkaufIst === null || vorverkaufIst === undefined)
      ? num(f.vorverkauf_quote) : vorverkaufIst;
    var rabattBp = 0;
    (f.staffel || []).slice().sort(function (a, b) { return num(a.ab) - num(b.ab); })
      .forEach(function (s) { if (quoteWirksam >= num(s.ab)) rabattBp = num(s.bp); });

    function satzFor(mitte) {
      if (mitte < Z.t_bb) return pct(f.zins_vor_bb);
      var s = pct(f.zins_nach_bb);
      if (mitte >= Z.t_baustart) s -= rabattBp / 10000;
      return Math.max(0, s);
    }

    var jahre = [], kum = 0, fkPrev = 0, ekPrev = 0;
    var bauzinsen = 0, bereitstellung = 0, fkPeak = 0, kapitalPeak = 0;
    var ekZinsKalk = 0, ekPeak = 0, deckelVerletzt = false;
    var limit = fk_limit_vor || 0;

    for (var j = 0; j < N; j++) {
      var mitte = j + 0.5;
      var bedarf = TR.aus[j] - TR.ein[j];
      var kumStart = kum;
      var kumEnde = kum + bedarf;

      var tStart = teile(kumStart, j), tEnde = teile(kumEnde, j + 1);
      var fkMittel = (tStart.fk + tEnde.fk) / 2;
      var ekMittel = (tStart.ek + tEnde.ek) / 2;

      var satz = satzFor(mitte);
      var zins = fkMittel * satz;
      var bk = Math.max(0, limit - fkMittel) * pct(f.bereitstellung);
      /* Der kalkulatorische Eigenkapitalzins ist für die Tochterfirma ein
         echter Aufwand — der Mutterkonzern stellt die Mittel verzinst zur
         Verfügung. Er läuft deshalb wie der Fremdkapitalzins in den
         Kapitalbedarf und damit in die Folgeperioden. */
      var ekZins = f.ek_zins_aktiv ? ekMittel * pct(f.ek_zins) : 0;
      ekZinsKalk += ekZins;

      kum = kumEnde + zins + bk + ekZins;
      bauzinsen += zins;
      bereitstellung += bk;

      var nach = teile(kum, j + 1);
      if (nach.fk >= fkDeckel - 1 && kum > 0) deckelVerletzt = true;
      fkPeak = Math.max(fkPeak, nach.fk);
      ekPeak = Math.max(ekPeak, nach.ek);
      kapitalPeak = Math.max(kapitalPeak, Math.max(0, kum));

      jahre.push({
        jahr: j,
        ausgaben: TR.aus[j], einnahmen: TR.ein[j], netto: -bedarf,
        zins: zins, bereitstellung: bk, ek_zins: ekZins, satz: satz * 100,
        ek_quote: E.ekQuote(p, Z, mitte),
        saldo: kum, fk: nach.fk, ek: nach.ek,
        ek_flow: -(nach.ek - ekPrev),
        fk_flow: nach.fk - fkPrev,
        phase: mitte < Z.t_bb ? 'vor Baubewilligung'
             : mitte < Z.t_baustart ? 'Vorbereitung'
             : mitte < Z.t_bauende ? 'Bau' : 'Vermarktung / Exit'
      });
      fkPrev = nach.fk; ekPrev = nach.ek;
    }

    /* Schlussabrechnung: der gehaltene Anteil wird zum Marktwert eingesetzt,
       das Fremdkapital getilgt, der Rest fliesst als Eigenkapital zurück. */
    var kumFinal = kum - (haltenWert || 0);
    var ueberschuss = Math.max(0, -kumFinal);
    var restFK = Math.max(0, kumFinal) > 0 ? teile(Math.max(0, kumFinal)).fk : 0;
    var restEK = Math.max(0, kumFinal) > 0 ? teile(Math.max(0, kumFinal)).ek : 0;
    if (jahre.length) {
      var last = jahre[jahre.length - 1];
      last.ek_flow += -(restEK - ekPrev) + ueberschuss;
      last.realisierung = haltenWert || 0;
      last.rest_fk = restFK;
    }

    return {
      jahre: jahre, bauzinsen: bauzinsen, bereitstellung: bereitstellung,
      ek_zins_kalk: ekZinsKalk, fk_peak: fkPeak, kapital_peak: kapitalPeak,
      ek_max: ekMax, ek_eingesetzt: ekPeak, fk_deckel: fkDeckel,
      deckel_verletzt: deckelVerletzt, rabatt_bp: rabattBp,
      vorverkauf_wirksam: quoteWirksam,
      ueberschuss: ueberschuss, endsaldo: kumFinal, rest_fk: restFK
    };
  };

  /* IRR über Bisektion */
  E.irr = function (cf) {
    function npv(r) {
      var s = 0;
      for (var i = 0; i < cf.length; i++) s += cf[i] / Math.pow(1 + r, i + 0.5);
      return s;
    }
    var hasNeg = cf.some(function (x) { return x < -1e-6; });
    var hasPos = cf.some(function (x) { return x > 1e-6; });
    if (!hasNeg || !hasPos) return null;
    var lo = -0.95, hi = 5, fLo = npv(lo), fHi = npv(hi);
    if (fLo * fHi > 0) return null;
    for (var k = 0; k < 200; k++) {
      var mid = (lo + hi) / 2, fm = npv(mid);
      if (fLo * fm <= 0) { hi = mid; fHi = fm; } else { lo = mid; fLo = fm; }
    }
    return (lo + hi) / 2 * 100;
  };

  /* ---------------------------------------------------------------
     9 · Bestandsrechnung (DCF für den gehaltenen Anteil)
     --------------------------------------------------------------- */

  E.bestandsrechnung = function (p, BET, anteilAK) {
    var b = p.bestandsrechnung, n = Math.max(1, Math.round(num(b.haltedauer)));
    var reihen = [], barwert = 0;
    var miete = BET.sollmiete_a, wachstum = pct(b.wachstum_miete), disk = pct(b.diskontsatz);
    var kostenQuote = BET.sollmiete_a > 0 ? (BET.total_a + BET.leerstand_a) / BET.sollmiete_a : 0;

    for (var j = 1; j <= n; j++) {
      var m = miete * Math.pow(1 + wachstum, j - 1);
      var noi = m * (1 - kostenQuote);
      var bw = noi / Math.pow(1 + disk, j);
      barwert += bw;
      reihen.push({ jahr: j, sollmiete: m, noi: noi, barwert: bw });
    }
    var noiTerminal = miete * Math.pow(1 + wachstum, n) * (1 - kostenQuote);
    var terminal = noiTerminal / pct(Math.max(0.5, num(b.exit_cap)));
    var terminalBW = terminal / Math.pow(1 + disk, n);
    var ertragswert = barwert + terminalBW;

    var hypothek = ertragswert * pct(b.hypothek_ltv);
    return {
      reihen: reihen, barwert_cf: barwert, terminal: terminal, terminal_bw: terminalBW,
      ertragswert: ertragswert, hypothek: hypothek,
      hypothek_zins_a: hypothek * pct(b.hypothek_zins),
      cashflow_nach_zins_a: BET.noi_a - hypothek * pct(b.hypothek_zins),
      eigenkapital: ertragswert - hypothek,
      anteil_ak: anteilAK,
      wertueberschuss: ertragswert - anteilAK
    };
  };

  /* ---------------------------------------------------------------
     Hauptfunktion
     --------------------------------------------------------------- */

  E.compute = function (p) {
    var warn = [];
    var Z = E.zeitachse(p);
    var F = E.flaechen(p, warn);
    var BAU = E.baukosten(p, F, warn);
    var ERT = E.ertraege(p, F);
    var VER = E.vermarktung(p, ERT);

    /* Verkaufsstand: die echte Quote ersetzt die Vorverkaufsannahme in
       Erlösverteilung und Zinsstaffel. */
    var VKI = E.verkaufInfo(p);
    var vorverkaufIst = (VKI && ERT.stwe_erloes > 0)
      ? Math.min(100, VKI.verkauft_chf / ERT.stwe_erloes * 100) : null;

    /* Fixpunkt: Entwicklungshonorar und Bauzinsen hängen von den
       Anlagekosten ab, die ihrerseits beides enthalten. */
    var anlagekosten = BAU.total + E.kaufpreis(p, F) * 1.05;
    var gewinn = 0, ERW, BET, TR, FIN, bauzinsenAkt = 0, fkLimit = 0;

    for (var it = 0; it < 24; it++) {
      ERW = E.erwerbskosten(p, F, anlagekosten, gewinn, BAU.ohne_pm);
      BET = E.betrieb(p, ERT, BAU.total);
      var akNeu = ERW.total + BAU.total + (p.finanzierung.bauzinsen_aktivieren ? bauzinsenAkt : 0);
      TR = E.zeitreihen(p, Z, ERW, BAU, ERT, VER, BET);
      var gesamt = akNeu + VER.total;
      FIN = E.finanzierung(p, Z, TR, gesamt, fkLimit, ERT.halten_wert, vorverkaufIst);
      /* Der kalkulatorische Eigenkapitalzins zählt zu den Finanzierungs-
         kosten wie der Fremdkapitalzins — siehe Kommentar in E.finanzierung. */
      bauzinsenAkt = FIN.bauzinsen + FIN.bereitstellung + FIN.ek_zins_kalk;
      fkLimit = FIN.fk_peak;

      var erloeseIt = ERT.stwe_erloes + ERT.exit_wert + ERT.halten_wert;
      var mietNettoIt = TR.det.miete.reduce(function (s, x) { return s + x; }, 0);
      gewinn = erloeseIt + mietNettoIt - akNeu - VER.total -
               (p.finanzierung.bauzinsen_aktivieren ? 0 : bauzinsenAkt);

      if (Math.abs(akNeu - anlagekosten) < 0.5) { anlagekosten = akNeu; break; }
      anlagekosten = akNeu;
    }

    var mietertrag_projekt = TR.det.miete.reduce(function (s, x) { return s + x; }, 0);
    var finIst = ist(p, 'finanzierung.bauzinsen');
    var finKosten = finIst !== null
      ? finIst : (FIN.bauzinsen + FIN.bereitstellung + FIN.ek_zins_kalk);
    var aktiviert = p.finanzierung.bauzinsen_aktivieren;

    var erloese = ERT.stwe_erloes + ERT.exit_wert + ERT.halten_wert;
    var gesamtinvestition = anlagekosten + VER.total;
    var aufwand = gesamtinvestition + (aktiviert ? 0 : finKosten);
    var gewinnVor = erloese + mietertrag_projekt - aufwand;
    var steuern = p.steuern.aktiv ? Math.max(0, gewinnVor) * pct(p.steuern.satz) : 0;
    var gewinnNach = gewinnVor - steuern;
    /* Der Eigenkapitalzins steckt bereits in finKosten und damit im Gewinn.
       Das frühere Feld bleibt erhalten, zeigt aber nun denselben Wert. */
    var gewinnNachEK = gewinnNach;

    var ekFlow = FIN.jahre.map(function (j) { return j.ek_flow; });
    if (ekFlow.length) ekFlow[ekFlow.length - 1] -= steuern;
    var irr = E.irr(ekFlow);

    /* Bruttorendite auf die ANTEILIGEN Anlagekosten der Ertragsflächen.
       Auf die gesamten Anlagekosten bezogen wäre sie bei Mischprojekten
       verzerrt, weil verkaufte Flächen keinen Mietertrag liefern. */
    var ak_ertrag = anlagekosten * ERT.anteil_ertrag;
    var bruttorendite = ak_ertrag > 0 ? ERT.sollmiete / ak_ertrag * 100 : 0;
    var nettorendite  = ak_ertrag > 0 ? BET.noi_a / ak_ertrag * 100 : 0;
    var margeAK = anlagekosten > 0 ? gewinnNach / anlagekosten * 100 : 0;
    var margeErloes = erloese > 0 ? gewinnNach / erloese * 100 : 0;

    /* --- Aufteilung nach Verwertung -------------------------------
       Die Gesamtinvestition (Anlagekosten inklusive Vermarktung) wird
       über den Nutzflächenanteil auf die drei Verwertungsarten
       verteilt. Jedem Block steht sein eigener Erlös gegenüber; die
       Marge darauf misst, was der Block für sich genommen trägt.

       Der Flächenschlüssel behandelt jeden Quadratmeter gleich. Wo
       Gewerbe im Erdgeschoss deutlich anders kostet als Wohnen
       darüber, bildet er das nicht ab — für die Beurteilung eines
       Mischprojekts ist er trotzdem aussagekräftiger als eine
       Gesamtmarge über alles. */
    var gi_stwe  = gesamtinvestition * ERT.anteil_stwe;
    var gi_miete = gesamtinvestition * ERT.anteil_miete;
    var gi_exit  = gesamtinvestition * ERT.anteil_exit;

    var ebtStwe = gi_stwe > 0 ? (ERT.stwe_erloes - gi_stwe) / gi_stwe * 100 : 0;
    var ebtExit = gi_exit > 0 ? (ERT.exit_wert - gi_exit) / gi_exit * 100 : 0;

    /* Der Mietanteil wird gerechnet, als bliebe er im Bestand. Ein
       Verkauf an einen Investor ist aber jederzeit eine Möglichkeit,
       und die Frage «zu welchen Konditionen wäre das möglich?» stellt
       sich vor jedem Entscheid. Deshalb dieselbe Rechnung wie beim
       Exit, angewandt auf den Ertragswert der gehaltenen Flächen. */
    var gewinnMieteVerkauf = ERT.halten_wert - gi_miete;
    var ebtMieteVerkauf = gi_miete > 0 ? gewinnMieteVerkauf / gi_miete * 100 : 0;
    /* ROE auf das verpflichtete Eigenkapital (Quote × Gesamtinvestition).
       Die effektiv gebundene Spitze wird separat ausgewiesen — sie liegt bei
       hohem Vorverkauf deutlich tiefer und würde die Kennzahl schönen. */
    var ekEingesetzt = FIN.ek_eingesetzt;
    var roe = FIN.ek_max > 0 ? gewinnNach / FIN.ek_max * 100 : 0;
    var ltcIst = gesamtinvestition > 0 ? FIN.fk_peak / gesamtinvestition * 100 : 0;

    if (FIN.deckel_verletzt) {
      warn.push({ art: 'warn', text: 'Der Fremdkapitalbedarf stösst an den Deckel von ' +
        A.fmt(p.finanzierung.ltc_max, 0) + ' % der Gesamtinvestition — der Mehrbedarf wurde ' +
        'den Eigenmitteln zugewiesen.' });
    }
    if (margeAK < num(p.ziele.marge)) {
      warn.push({ art: 'ziel', text: 'Die Marge liegt bei ' + A.fmt(margeAK, 1) +
        ' % und damit unter dem Ziel von ' + A.fmt(p.ziele.marge, 1) + ' %.' });
    }
    if (ERT.sollmiete_halten > 0 && bruttorendite < num(p.ziele.bruttorendite)) {
      warn.push({ art: 'ziel', text: 'Die Bruttorendite auf den Anlagekosten liegt bei ' +
        A.fmt(bruttorendite, 2) + ' % (Ziel ' + A.fmt(p.ziele.bruttorendite, 2) + ' %).' });
    }

    /* Zahlungsstand: nur über Zeilen, die es auch gibt — verwaiste
       Schlüssel aus gelöschten Zeilen dürfen die Summe nicht aufblähen. */
    var bezahltTotal = 0, vertragTotal = 0, wirksamTotal = 0;
    var ueberzahlt = 0, ueberzahltZeilen = [];
    (function () {
      var bez = p.bezahlt || {}, vtr = p.vertrag || {};
      function nimm(key, betrag, label) {
        wirksamTotal += betrag;
        var b = num(bez[key]);
        bezahltTotal += b;
        /* Mehr bezahlt als kalkuliert — meist ein Nachtrag, der im
           Ist-Wert noch fehlt. */
        if (b > betrag + 0.5) { ueberzahlt += b - betrag; ueberzahltZeilen.push(label); }
        if (vtr[key]) vertragTotal += betrag;
      }
      ERW.zeilen.forEach(function (z) { nimm('erwerb.' + z.id, z.betrag, z.label); });
      Object.keys(BAU.bloecke).forEach(function (bid) {
        BAU.bloecke[bid].zeilen.forEach(function (z) {
          nimm('bau.' + bid + '.' + z.id, z.betrag, 'BKP ' + z.bkp + ' · ' + z.label);
        });
      });
      VER.zeilen.forEach(function (z) { nimm('vermarktung.' + z.id, z.betrag, z.label); });
      nimm('finanzierung.bauzinsen', finKosten, 'Bauzinsen');
    })();

    /* Verkaufte Einheiten ohne Übergabedatum: ihr Anteil an der
       Übergaberate fliesst nicht. Nach Bauende ist das überfällig. */
    if (TR.ohne_uebergabe > 0.5) {
      var ueberfaellig = Z.t_bauende <= Z.t_stichtag;
      warn.push({ art: ueberfaellig ? 'warn' : 'info',
        text: (ueberfaellig
          ? '<b>Die Bauzeit ist abgelaufen</b>, aber bei ' + TR.ohne_uebergabe_n +
            ' verkauften Einheit(en) fehlt das Übergabedatum. '
          : 'Bei ' + TR.ohne_uebergabe_n + ' verkauften Einheit(en) fehlt das Übergabedatum. ') +
          '<b>' + A.fmt(TR.ohne_uebergabe) + ' CHF</b> fliessen deshalb nicht in den ' +
          'Zahlungsstrom — der Erlös bleibt bestehen, die Finanzierungskosten steigen. ' +
          'Die Daten stehen im Verkaufsstand neben «Beurkundet am».' });
    }

    if (VKI && VKI.ohne_erloes > 0) {
      warn.push({ art: 'warn', text: 'In der Verkaufsübersicht sind <b>' + VKI.ohne_erloes +
        ' verkaufte Einheit(en) ohne erfassten Erlös</b> — sie zählen mit 0 CHF in Quote und ' +
        'Erlösverteilung. Auf der Seite «Vermarktung & Verkauf» die Erlöse erfassen oder die ' +
        'Vorschläge übernehmen.' });
    }

    if (ueberzahlt > 0.5) {
      warn.push({ art: 'warn', text: 'Bei ' + ueberzahltZeilen.length + ' Position(en) ist mehr ' +
        'bezahlt als kalkuliert — zusammen <b>' + A.fmt(ueberzahlt) + ' CHF</b> (' +
        ueberzahltZeilen.slice(0, 3).join(', ') +
        (ueberzahltZeilen.length > 3 ? ' u. a.' : '') + '). Der Mehrbetrag steckt im ' +
        'Kapitalbedarf und damit in den Finanzierungskosten, nicht aber im Gewinn. ' +
        'Tragen Sie den Nachtrag in der Spalte <b>Ist</b> nach, damit Marge und Rendite ihn zeigen.' });
    }

    /* Wie viele Positionen rechnen mit einem Ist-Wert statt mit der Schätzung? */
    var istAnzahl = 0, istZeilen = [];
    ERW.zeilen.forEach(function (z) { if (z.ist) { istAnzahl++; istZeilen.push(z.label); } });
    Object.keys(BAU.bloecke).forEach(function (bid) {
      BAU.bloecke[bid].zeilen.forEach(function (z) {
        if (z.ist) { istAnzahl++; istZeilen.push(BAU.bloecke[bid].label + ' · ' + z.label); }
      });
    });
    VER.zeilen.forEach(function (z) { if (z.ist) { istAnzahl++; istZeilen.push(z.label); } });
    if (finIst !== null) { istAnzahl++; istZeilen.push('Bauzinsen'); }
    if (istAnzahl > 0) {
      warn.push({ art: 'info', text: '<b>' + istAnzahl + ' Position(en)</b> rechnen mit erfassten ' +
        'Ist-Werten statt mit der Schätzung. Nachgelagerte Grössen wie Reserve, Baunebenkosten und ' +
        'Marge ziehen automatisch nach.' });
    }

    var anteilHalten = erloese > 0 ? (ERT.halten_wert + ERT.exit_wert) / erloese : 0;
    var BES = E.bestandsrechnung(p, BET, anlagekosten * anteilHalten);

    return {
      zeit: Z, flaechen: F, bau: BAU, erwerb: ERW, ertraege: ERT,
      vermarktung: VER, betrieb: BET, reihen: TR, fin: FIN, bestand: BES,
      warnungen: warn,
      ist_anzahl: istAnzahl,
      ist_zeilen: istZeilen,
      verkauf: VKI ? {
        modus: VKI.modus, datum: VKI.datum, name: VKI.name,
        verkauft_n: VKI.verkauft_n, verkauft_chf: VKI.verkauft_chf,
        ohne_erloes: VKI.ohne_erloes, reserviert_n: VKI.reserviert_n,
        frei_n: VKI.frei_n, quote: vorverkaufIst, einheiten: VKI.einheiten,
        ohne_uebergabe: TR.ohne_uebergabe, ohne_uebergabe_n: TR.ohne_uebergabe_n
      } : null,
      zahlungsstand: {
        bezahlt: bezahltTotal, offen: Math.max(0, wirksamTotal - bezahltTotal),
        vertraglich: vertragTotal, kosten: wirksamTotal,
        ueberzahlt: ueberzahlt, ueberzahlt_zeilen: ueberzahltZeilen
      },
      kpi: {
        anlagekosten: anlagekosten,
        gesamtinvestition: gesamtinvestition,
        baukosten: BAU.total,
        erwerbskosten: ERW.total,
        vermarktung: VER.total,
        finanzierungskosten: finKosten,
        erloese: erloese,
        mietertrag_projekt: mietertrag_projekt,
        gewinn_vor: gewinnVor,
        steuern: steuern,
        gewinn: gewinnNach,
        gewinn_nach_ek: gewinnNachEK,
        marge_ak: margeAK,
        marge_erloes: margeErloes,
        roe: roe,
        irr: irr,
        ek_max: FIN.ek_max,
        ek_eingesetzt: ekEingesetzt,
        fk_peak: FIN.fk_peak,
        kapital_peak: FIN.kapital_peak,
        ltc_ist: ltcIst,
        bruttorendite: bruttorendite,
        nettorendite: nettorendite,
        ak_ertrag: ak_ertrag,
        anteil_ertrag: ERT.anteil_ertrag,
        stwe_erloes: ERT.stwe_erloes,
        exit_wert: ERT.exit_wert,
        halten_wert: ERT.halten_wert,
        sollmiete: ERT.sollmiete,
        noi: BET.noi_a,
        ak_pro_nwf: F.total.nwf > 0 ? anlagekosten / F.total.nwf : 0,
        bau_pro_gf: F.total.gf > 0 ? BAU.total / F.total.gf : 0,
        dauer: Z.t_ende,
        dauer_plan: E.planDauer(p),

        /* Gesamtinvestition und Ergebnis je Verwertungsart */
        gi_stwe: gi_stwe,
        gi_miete: gi_miete,
        gi_exit: gi_exit,
        anteil_stwe: ERT.anteil_stwe,
        anteil_miete: ERT.anteil_miete,
        anteil_exit: ERT.anteil_exit,
        ebt_stwe: ebtStwe,
        ebt_exit: ebtExit,
        gewinn_miete_verkauf: gewinnMieteVerkauf,
        ebt_miete_verkauf: ebtMieteVerkauf
      }
    };
  };

  /* Projektdauer aus dem Terminplan: vom Kaufdatum bis zum spätesten
     Ende aller Vorgänge. Reine Anzeige — gerechnet wird weiterhin mit
     den Monatsdauern, damit ein verschobener Termin die Marge nicht
     still verändert. Ohne Terminplan oder Startdatum: null. */
  E.planDauer = function (p) {
    if (!p || !p.startdatum || !A.terminplanRechnen) return null;
    var ber = A.terminplanRechnen(p).byId;
    var spaetestes = null;
    Object.keys(ber).forEach(function (id) {
      var e = ber[id].ende;
      if (e && (!spaetestes || e > spaetestes)) spaetestes = e;
    });
    if (!spaetestes) return null;
    var tage = A.tageZwischen(p.startdatum, spaetestes);
    return tage === null ? null : Math.max(0, tage / 365.25);
  };

  /* ---------------------------------------------------------------
     Sensitivität und Rückwärtsrechnung
     --------------------------------------------------------------- */

  E.SENS_PARAM = [
    { id: 'baukosten', label: 'Baukosten', apply: function (p, f) {
        ['neubau', 'erweiterung', 'sanierung'].forEach(function (b) {
          Object.keys(p.bau[b].zeilen).forEach(function (k) { p.bau[b].zeilen[k].wert *= f; });
        });
      } },
    { id: 'preise', label: 'Verkaufspreise', apply: function (p, f) {
        A.TEILE.forEach(function (T) {
          (p.teile[T.id].nutzungen || []).forEach(function (n) { n.preis *= f; });
        });
        p.spiegel.einheiten.forEach(function (e) { e.preis *= f; });
      } },
    { id: 'mieten', label: 'Mietzinsen', apply: function (p, f) {
        A.TEILE.forEach(function (T) {
          (p.teile[T.id].nutzungen || []).forEach(function (n) { n.miete *= f; });
        });
      } },
    { id: 'landpreis', label: 'Landpreis', apply: function (p, f) {
        p.erwerb.preis_total *= f; p.erwerb.preis_m2_land *= f; p.erwerb.preis_m2_agf *= f;
      } },
    { id: 'exitrendite', label: 'Exit-/Bewertungsrendite', apply: function (p, f) {
        p.bewertung.rendite_halten *= f;
        A.TEILE.forEach(function (T) {
          (p.teile[T.id].nutzungen || []).forEach(function (n) { n.exit_rendite *= f; });
        });
      } },
    { id: 'bauzeit', label: 'Bauzeit', apply: function (p, f) {
        p.zeit.dauer_bau *= f;
      } },
    { id: 'zins', label: 'Zinssätze', apply: function (p, f) {
        p.finanzierung.zins_vor_bb *= f; p.finanzierung.zins_nach_bb *= f;
      } }
  ];

  E.sensitivitaet = function (p, delta) {
    delta = delta === undefined ? 10 : delta;
    var basis = E.compute(p).kpi;
    return E.SENS_PARAM.map(function (sp) {
      var lo = A.clone(p), hi = A.clone(p);
      sp.apply(lo, 1 - delta / 100);
      sp.apply(hi, 1 + delta / 100);
      var rl = E.compute(lo).kpi, rh = E.compute(hi).kpi;
      return {
        id: sp.id, label: sp.label,
        minus: rl.gewinn, plus: rh.gewinn, basis: basis.gewinn,
        minus_marge: rl.marge_ak, plus_marge: rh.marge_ak,
        spanne: Math.abs(rh.gewinn - rl.gewinn)
      };
    }).sort(function (a, b) { return b.spanne - a.spanne; });
  };

  /* Residualer Landwert: welcher Kaufpreis trägt die Zielmarge gerade noch? */
  E.residualwert = function (p, zielMarge) {
    var ziel = zielMarge === undefined ? num(p.ziele.marge) : zielMarge;
    var lo = 0, hi = Math.max(1e6, E.compute(p).kpi.erloese);
    function margeBei(preis) {
      var q = A.clone(p);
      q.erwerbsart = 'kauf';
      q.erwerb.preis_modus = 'total';
      q.erwerb.preis_total = preis;
      /* Ein erfasster Ist-Kaufpreis würde jede Variation überschreiben und
         die Rückwärtsrechnung sinnlos machen. */
      if (q.ist) delete q.ist['erwerb.kaufpreis'];
      return E.compute(q).kpi.marge_ak;
    }
    if (margeBei(lo) < ziel) return { preis: 0, erreichbar: false, marge_bei_null: margeBei(lo) };
    for (var i = 0; i < 60; i++) {
      var mid = (lo + hi) / 2;
      if (margeBei(mid) >= ziel) lo = mid; else hi = mid;
    }
    var F = E.flaechen(p, []);
    return {
      preis: lo, erreichbar: true,
      pro_m2_land: num(p.grundstueck.flaeche) > 0 ? lo / num(p.grundstueck.flaeche) : 0,
      pro_m2_agf: F.agf_zulaessig > 0 ? lo / F.agf_zulaessig : 0,
      ziel: ziel
    };
  };

})(window.APP);
