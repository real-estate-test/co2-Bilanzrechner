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

  /* ---------------------------------------------------------------
     Zeitachse — alle Zeitpunkte in Jahren ab Kaufzeitpunkt t = 0
     --------------------------------------------------------------- */

  E.zeitachse = function (p) {
    var z = p.zeit;
    var t_baueingabe = num(z.dauer_entwicklung);
    var t_bb        = t_baueingabe + num(z.dauer_bewilligung);
    var t_baustart  = t_bb + num(z.dauer_vorbereitung);
    var t_bauende   = t_baustart + Math.max(0.25, num(z.dauer_bau));
    var t_rohbau    = t_baustart + Math.max(0.25, num(z.dauer_bau)) * 0.55;
    var t_vk_start  = Math.max(0, t_bb + num(z.verkaufsstart_rel_bb));
    var t_vk_ende   = t_vk_start + Math.max(0.25, num(z.dauer_verkauf));
    var t_ende      = Math.max(t_bauende + num(z.exit_verzoegerung), t_vk_ende);
    return {
      t_baueingabe: t_baueingabe, t_bb: t_bb, t_baustart: t_baustart,
      t_rohbau: t_rohbau, t_bauende: t_bauende,
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

  function addArr(ziel, quelle) {
    for (var i = 0; i < ziel.length; i++) ziel[i] += (quelle[i] || 0);
    return ziel;
  }

  /* ---------------------------------------------------------------
     1 · Flächen
     --------------------------------------------------------------- */

  E.flaechen = function (p, warn) {
    var res = { teile: {}, total: {
      gf_oi: 0, gf_ug: 0, gf: 0, gv: 0, nwf: 0, pp: 0
    }, nutzung: {} };

    A.NUTZUNGEN.forEach(function (n) { res.nutzung[n.id] = 0; });

    var agf_zul = num(p.grundstueck.flaeche) * num(p.grundstueck.az);
    res.agf_zulaessig = agf_zul;
    var agf_genutzt = 0;

    A.TEILE.forEach(function (T) {
      var t = p.teile[T.id];
      var o = { aktiv: !!t.aktiv, gf_oi: 0, gf_ug: 0, gf: 0, gv: 0, nwf: 0,
                pp: num(t.pp), nutzungen: {} };
      if (t.aktiv) {
        if (t.modus === 'ausnutzung') {
          var agf = agf_zul;
          o.agf = agf;
          o.gf_oi = agf * num(t.faktor_gf);
          o.gf_ug = o.gf_oi * pct(t.ug_quote);
        } else {
          o.gf_oi = num(t.gf_oi);
          o.gf_ug = num(t.gf_ug);
          o.agf = o.gf_oi / Math.max(0.01, num(t.faktor_gf));
        }
        o.gf = o.gf_oi + o.gf_ug;
        o.gv = num(t.gv_manuell) > 0 ? num(t.gv_manuell) : o.gf * num(t.gv_faktor);
        o.nwf = num(t.nwf_manuell) > 0 ? num(t.nwf_manuell) : o.gf_oi * pct(t.hnf_quote);
        agf_genutzt += o.agf || 0;
      }

      /* Nutzungsflächen */
      var summeAnteil = 0;
      A.NUTZUNGEN.forEach(function (n) {
        var cfg = t.nutzungen[n.id];
        summeAnteil += num(cfg.anteil);
      });
      A.NUTZUNGEN.forEach(function (n) {
        var cfg = t.nutzungen[n.id];
        var f = num(cfg.flaeche_manuell) > 0
          ? num(cfg.flaeche_manuell)
          : o.nwf * pct(cfg.anteil);
        o.nutzungen[n.id] = t.aktiv ? f : 0;
      });

      /* Wohnungsspiegel überschreibt Wohnfläche und Preis/m² */
      if (p.spiegel.aktiv && p.spiegel.teil === T.id && p.spiegel.einheiten.length) {
        var sf = 0, sp = 0;
        p.spiegel.einheiten.forEach(function (e) { sf += num(e.flaeche); sp += num(e.preis); });
        if (sf > 0) {
          o.nutzungen.wohnen = sf;
          o.spiegel_preis_m2 = sp / sf;
          o.spiegel_flaeche = sf;
          o.spiegel_erloes = sp;
        }
      }

      if (t.aktiv && Math.abs(summeAnteil - 100) > 0.5 && !(p.spiegel.aktiv && p.spiegel.teil === T.id)) {
        warn.push({ art: 'warn', text: T.label + ': Nutzungsanteile ergeben ' +
          A.fmt(summeAnteil, 1) + ' % statt 100 %.' });
      }

      res.teile[T.id] = o;
      if (t.aktiv) {
        res.total.gf_oi += o.gf_oi; res.total.gf_ug += o.gf_ug; res.total.gf += o.gf;
        res.total.gv += o.gv; res.total.nwf += o.nwf; res.total.pp += o.pp;
        A.NUTZUNGEN.forEach(function (n) { res.nutzung[n.id] += o.nutzungen[n.id]; });
      }
    });

    res.agf_genutzt = agf_genutzt;
    res.umgebung = num(p.grundstueck.flaeche) * pct(p.grundstueck.umgebung_anteil);
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
      case 'gf':         return o.gf || 0;
      case 'gf_oi':      return o.gf_oi || 0;
      case 'gv':         return o.gv || 0;
      case 'nwf':        return o.nwf || 0;
      case 'pp':         return o.pp || 0;
      case 'umgebung':   return F.umgebung || 0;
      case 'gv_bestand': return F.gv_bestand || 0;
      default:           return 1;   // pauschal, pct_*
    }
  }
  E.mengeFor = mengeFor;

  E.baukosten = function (p, F, warn) {
    var res = { bloecke: {}, total: 0, teuerung: 0, basis_ohne_teuerung: 0 };

    ['neubau', 'erweiterung', 'sanierung'].forEach(function (bid) {
      var b = p.bau[bid];
      if (!b.aktiv) return;
      var out = { id: bid, label: A.BLOCK_LABELS[bid], zeilen: [],
                  bkp1: 0, bkp2: 0, bkp3: 0, bkp4: 0, bkp5: 0, bkp9: 0,
                  summe: 0, reserve: 0, total: 0 };

      /* Erste Runde: alles ausser den prozentualen Zeilen */
      A.BKP_KATALOG.forEach(function (kat) {
        var z = b.zeilen[kat.id];
        if (!z || !z.aktiv) return;
        if (z.basis === 'pct_bkp2' || z.basis === 'pct_bkp1_4') return;
        var menge = num(z.menge_manuell) > 0 ? num(z.menge_manuell) : mengeFor(z.basis, bid, F, p);
        var betrag = z.basis === 'pauschal' ? num(z.wert) : menge * num(z.wert);
        out.zeilen.push({ id: kat.id, bkp: kat.bkp, label: kat.label, basis: z.basis,
                          menge: z.basis === 'pauschal' ? null : menge,
                          kennwert: num(z.wert), betrag: betrag });
        var g = kat.bkp.charAt(0);
        if (g === '1') out.bkp1 += betrag;
        else if (g === '2') out.bkp2 += betrag;
        else if (g === '3') out.bkp3 += betrag;
        else if (g === '4') out.bkp4 += betrag;
        else if (g === '5') out.bkp5 += betrag;
        else if (g === '9') out.bkp9 += betrag;
      });

      /* Zweite Runde: Honorare (% von BKP 2), danach BNK (% von BKP 1–4) */
      var hz = b.zeilen.b2_honorare;
      if (hz && hz.aktiv && hz.basis === 'pct_bkp2') {
        var hb = out.bkp2 * pct(hz.wert);
        out.zeilen.push({ id: 'b2_honorare', bkp: '29', label: 'Honorare Planung',
                          basis: 'pct_bkp2', menge: out.bkp2, kennwert: num(hz.wert), betrag: hb });
        out.bkp2 += hb;
      }
      var bz = b.zeilen.b5_bnk;
      if (bz && bz.aktiv && bz.basis === 'pct_bkp1_4') {
        var basis14 = out.bkp1 + out.bkp2 + out.bkp3 + out.bkp4;
        var bb = basis14 * pct(bz.wert);
        out.zeilen.push({ id: 'b5_bnk', bkp: '5', label: 'Baunebenkosten, Bewilligungen, Versicherungen',
                          basis: 'pct_bkp1_4', menge: basis14, kennwert: num(bz.wert), betrag: bb });
        out.bkp5 += bb;
      }

      out.summe = out.bkp1 + out.bkp2 + out.bkp3 + out.bkp4 + out.bkp5 + out.bkp9;
      out.reserve = (out.bkp1 + out.bkp2) * pct(b.reserve);   // Reserve auf BKP 1 + 2
      out.total = out.summe + out.reserve;

      /* Plausibilität: Baukosten je m² GF */
      var gf = mengeFor('gf', bid, F, p);
      out.pro_gf = gf > 0 ? out.total / gf : 0;
      res.bloecke[bid] = out;
      res.basis_ohne_teuerung += out.total;
    });

    /* Teuerung auf die Bauzeitmitte */
    if (p.bau.teuerung_aktiv) {
      var Z = E.zeitachse(p);
      var mitte = (Z.t_baustart + Z.t_bauende) / 2;
      var f = Math.pow(1 + pct(p.bau.teuerung_pct), mitte);
      res.teuerung = res.basis_ohne_teuerung * (f - 1);
    }
    res.total = res.basis_ohne_teuerung + res.teuerung;

    if (res.total <= 0) warn.push({ art: 'info', text: 'Es sind noch keine Baukosten erfasst.' });
    return res;
  };

  /* ---------------------------------------------------------------
     3 · Erwerbskosten
     --------------------------------------------------------------- */

  E.kaufpreis = function (p, F) {
    var e = p.erwerb;
    if (p.erwerbsart === 'baurecht') return num(e.baurecht_einmal);
    switch (e.preis_modus) {
      case 'm2_land': return num(e.preis_m2_land) * num(p.grundstueck.flaeche);
      case 'm2_agf':  return num(e.preis_m2_agf) * (F.agf_zulaessig || 0);
      default:        return num(e.preis_total);
    }
  };

  E.erwerbskosten = function (p, F, anlagekosten_schaetz, gewinn_schaetz) {
    var e = p.erwerb, z = [], kp = E.kaufpreis(p, F);

    z.push({ id: 'kaufpreis', label: p.erwerbsart === 'baurecht'
      ? 'Einmalentschädigung Baurecht' : 'Kaufpreis Liegenschaft',
      basis: '—', betrag: kp });

    function proz(id, label, satz, basis, anteil) {
      var b = basis * pct(satz) * (anteil === undefined ? 1 : pct(anteil));
      z.push({ id: id, label: label, basis: A.fmt(satz, 2) + ' %', betrag: b });
      return b;
    }

    proz('notariat', 'Notariat / Beurkundung', e.notariat, kp);
    proz('grundbuch', 'Grundbuchgebühren', e.grundbuch, kp);
    proz('handaenderung', 'Handänderungssteuer (Anteil Käufer ' +
      A.fmt(e.handaenderung_anteil, 0) + ' %)', e.handaenderung, kp, e.handaenderung_anteil);
    proz('courtage', 'Einkaufskommission / Courtage', e.courtage, kp);

    /* Entwicklungshonorar */
    var basisEnt = e.entwicklung_basis === 'landwert' ? kp
                 : e.entwicklung_basis === 'gewinn' ? Math.max(0, gewinn_schaetz || 0)
                 : (anlagekosten_schaetz || 0);
    var ent = basisEnt * pct(e.entwicklung_pct);
    z.push({ id: 'entwicklung', label: 'Entwicklungshonorar (' +
      ({ anlagekosten: 'auf Anlagekosten', landwert: 'auf Landwert', gewinn: 'auf Gewinn' })[e.entwicklung_basis] + ')',
      basis: A.fmt(e.entwicklung_pct, 2) + ' %', betrag: ent });

    /* Dritthonorare */
    var dritt = e.dritthonorare_basis === 'pauschal'
      ? num(e.dritthonorare_fix)
      : (anlagekosten_schaetz || 0) * pct(e.dritthonorare_pct);
    z.push({ id: 'dritthonorare', label: 'Dritthonorare',
      basis: e.dritthonorare_basis === 'pauschal' ? 'pauschal' : A.fmt(e.dritthonorare_pct, 2) + ' %',
      betrag: dritt });

    z.push({ id: 'dd', label: 'Due Diligence / Altlastenabklärung', basis: 'pauschal', betrag: num(e.dd) });
    z.push({ id: 'geometer', label: 'Vermessung / Geometer', basis: 'pauschal', betrag: num(e.geometer) });
    z.push({ id: 'recht', label: 'Rechtsberatung / Verträge', basis: 'pauschal', betrag: num(e.recht) });

    if (p.grundstueck.mehrwertabgabe_aktiv) {
      var mw = num(p.grundstueck.mehrwert_basis) * pct(p.grundstueck.mehrwertabgabe_pct);
      z.push({ id: 'mehrwert', label: 'Mehrwertabgabe (Planungsmehrwert)',
        basis: A.fmt(p.grundstueck.mehrwertabgabe_pct, 0) + ' %', betrag: mw });
    }

    var total = z.reduce(function (s, x) { return s + x.betrag; }, 0);
    return { zeilen: z, total: total, kaufpreis: kp, nebenkosten: total - kp };
  };

  /* ---------------------------------------------------------------
     4 · Erträge und Verwertung
     --------------------------------------------------------------- */

  E.ertraege = function (p, F) {
    var r = {
      positionen: [],
      sollmiete: 0,           // Jahressollmiete voll ausgebaut (alle Nutzungen)
      sollmiete_halten: 0,    // nur gehaltene Flächen
      stwe_erloes: 0,
      exit_wert: 0,
      halten_wert: 0,
      nwf_stwe: 0, nwf_halten: 0
    };

    A.TEILE.forEach(function (T) {
      var t = p.teile[T.id], fo = F.teile[T.id];
      if (!t.aktiv) return;

      A.NUTZUNGEN.forEach(function (n) {
        var cfg = t.nutzungen[n.id];
        var fl = fo.nutzungen[n.id];
        if (fl <= 0) return;

        var preis = num(cfg.preis);
        if (p.spiegel.aktiv && p.spiegel.teil === T.id && n.id === 'wohnen' && fo.spiegel_preis_m2) {
          preis = fo.spiegel_preis_m2;   // Wohnungsspiegel schlägt Preis/m² durch
        }
        var miete_a = fl * num(cfg.miete);
        var pos = { teil: T.id, teil_label: T.label, nutzung: n.id, nutzung_label: n.label,
                    flaeche: fl, miete_m2: num(cfg.miete), preis_m2: preis,
                    verwertung: cfg.verwertung, sollmiete: miete_a,
                    erloes: 0, wert: 0, art: '' };

        r.sollmiete += miete_a;

        if (cfg.verwertung === 'stwe') {
          pos.erloes = fl * preis;
          pos.art = 'Verkauf';
          r.stwe_erloes += pos.erloes;
          r.nwf_stwe += fl;
        } else if (cfg.verwertung === 'exit') {
          var rend = Math.max(0.5, num(cfg.exit_rendite));
          var basisMiete = miete_a;
          if (p.bewertung.exit_netto) basisMiete = miete_a * (1 - pct(p.betrieb.leerstand)) * 0.82;
          pos.wert = basisMiete / pct(rend);
          pos.art = 'Exit ' + A.fmt(rend, 2) + ' %';
          r.exit_wert += pos.wert;
          r.sollmiete_halten += miete_a;
          r.nwf_halten += fl;
        } else {
          var rh = Math.max(0.5, num(p.bewertung.rendite_halten));
          pos.wert = miete_a / pct(rh);
          pos.art = cfg.verwertung === 'halten_selbst' ? 'Halten selbstgenutzt' : 'Halten vermietet';
          pos.selbst = num(cfg.selbst);
          r.halten_wert += pos.wert;
          r.sollmiete_halten += miete_a;
          r.nwf_halten += fl;
        }
        r.positionen.push(pos);
      });

      /* Parkierung */
      if (fo.pp > 0) {
        var pm = fo.pp * num(t.pp_miete) * 12;
        var ppos = { teil: T.id, teil_label: T.label, nutzung: 'pp', nutzung_label: 'Parkierung',
                     flaeche: fo.pp, miete_m2: num(t.pp_miete), preis_m2: num(t.pp_preis),
                     verwertung: t.pp_verwertung, sollmiete: pm, erloes: 0, wert: 0, einheit: 'PP' };
        r.sollmiete += pm;
        if (t.pp_verwertung === 'stwe') {
          ppos.erloes = fo.pp * num(t.pp_preis); ppos.art = 'Verkauf';
          r.stwe_erloes += ppos.erloes;
        } else if (t.pp_verwertung === 'exit') {
          ppos.wert = pm / pct(Math.max(0.5, num(p.bewertung.rendite_halten)));
          ppos.art = 'Exit'; r.exit_wert += ppos.wert; r.sollmiete_halten += pm;
        } else {
          ppos.wert = pm / pct(Math.max(0.5, num(p.bewertung.rendite_halten)));
          ppos.art = 'Halten'; r.halten_wert += ppos.wert; r.sollmiete_halten += pm;
        }
        r.positionen.push(ppos);
      }
    });

    r.verwertungswert = r.stwe_erloes + r.exit_wert + r.halten_wert;
    return r;
  };

  /* ---------------------------------------------------------------
     5 · Vermarktungskosten
     --------------------------------------------------------------- */

  E.vermarktung = function (p, ERT) {
    var v = p.vermarktung, z = [];
    var verkaufsbasis = ERT.stwe_erloes + ERT.exit_wert;

    z.push({ id: 'verkauf', label: 'Verkaufsprovision STWE',
      basis: A.fmt(v.verkauf_pct, 2) + ' %', betrag: ERT.stwe_erloes * pct(v.verkauf_pct) });
    z.push({ id: 'beurkundung', label: 'Beurkundung Verkauf (Anteil Verkäufer)',
      basis: A.fmt(v.beurkundung_verkauf, 2) + ' %', betrag: ERT.stwe_erloes * pct(v.beurkundung_verkauf) });
    z.push({ id: 'exit_nk', label: 'Verkaufsnebenkosten Exit an Investor',
      basis: A.fmt(v.exit_nebenkosten, 2) + ' %', betrag: ERT.exit_wert * pct(v.exit_nebenkosten) });

    var vermietung = ERT.sollmiete_halten / 12 * num(v.vermietung_monate);
    z.push({ id: 'vermietung', label: 'Erstvermietungsprovision',
      basis: A.fmt(v.vermietung_monate, 2) + ' Monatsmieten', betrag: vermietung });

    var mk = v.marketing_basis === 'pauschal'
      ? num(v.marketing_fix)
      : (verkaufsbasis + ERT.halten_wert) * pct(v.marketing_pct);
    z.push({ id: 'marketing', label: 'Marketing / Werbung',
      basis: v.marketing_basis === 'pauschal' ? 'pauschal' : A.fmt(v.marketing_pct, 2) + ' %', betrag: mk });
    z.push({ id: 'muster', label: 'Musterwohnung / Visualisierung',
      basis: 'pauschal', betrag: num(v.muster) });

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
      else betrag = num(cfg.wert) * ERT.nwf_halten;      // chf_m2
      z.push({ id: id, label: label,
        basis: cfg.basis === 'pct_miete' ? A.fmt(cfg.wert, 2) + ' % Miete'
             : cfg.basis === 'pct_ak' ? A.fmt(cfg.wert, 2) + ' % Baukosten'
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

  E.zeitreihen = function (p, Z, ERW, BAU, ERT, VER, BET) {
    var N = Z.N, kurve = p.zeit.kostenkurve;
    var aus = new Array(N).fill(0), ein = new Array(N).fill(0);
    var det = { erwerb: new Array(N).fill(0), bau: new Array(N).fill(0),
                vermarktung: new Array(N).fill(0), betrieb: new Array(N).fill(0),
                verkauf: new Array(N).fill(0), miete: new Array(N).fill(0),
                exit: new Array(N).fill(0), halten: new Array(N).fill(0) };

    /* Erwerb: Kaufpreis und Kaufnebenkosten bei t = 0,
       Entwicklungs- und Dritthonorare über die Entwicklungsphase. */
    ERW.zeilen.forEach(function (z) {
      if (z.id === 'entwicklung' || z.id === 'dritthonorare') {
        addArr(det.erwerb, spread(z.betrag, 0, Math.max(0.5, Z.t_bauende), N, 'linear'));
      } else if (z.id === 'mehrwert') {
        addArr(det.erwerb, punkt(z.betrag, Z.t_bb, N));
      } else {
        addArr(det.erwerb, punkt(z.betrag, 0, N));
      }
    });

    /* Baurechtszins läuft ab Kauf bis Projektende */
    if (p.erwerbsart === 'baurecht' && num(p.erwerb.baurecht_zins) > 0) {
      addArr(det.erwerb, spread(num(p.erwerb.baurecht_zins) * Z.t_ende, 0, Z.t_ende, N, 'linear'));
    }

    /* Baukosten: Honorare ab Projektstart, Bauleistungen über die Bauzeit */
    Object.keys(BAU.bloecke).forEach(function (bid) {
      var b = BAU.bloecke[bid];
      b.zeilen.forEach(function (z) {
        if (z.id === 'b2_honorare') {
          addArr(det.bau, spread(z.betrag, 0.25, Z.t_bauende, N, 'linear'));
        } else if (z.id === 'b5_bnk') {
          addArr(det.bau, spread(z.betrag, Z.t_baueingabe, Z.t_bauende, N, 'linear'));
        } else if (z.bkp.charAt(0) === '1') {
          addArr(det.bau, spread(z.betrag, Z.t_baustart, Z.t_baustart + (Z.t_bauende - Z.t_baustart) * 0.3, N, 'linear'));
        } else {
          addArr(det.bau, spread(z.betrag, Z.t_baustart, Z.t_bauende, N, kurve));
        }
      });
      addArr(det.bau, spread(b.reserve, Z.t_baustart, Z.t_bauende, N, kurve));
    });
    addArr(det.bau, spread(BAU.teuerung, Z.t_baustart, Z.t_bauende, N, kurve));

    /* Vermarktung: Marketing ab Verkaufsstart, Provisionen mit den Verkäufen */
    VER.zeilen.forEach(function (z) {
      if (z.id === 'vermietung') {
        addArr(det.vermarktung, spread(z.betrag, Z.t_bauende - 0.5, Z.t_bauende + 0.5, N, 'linear'));
      } else if (z.id === 'muster' || z.id === 'marketing') {
        addArr(det.vermarktung, spread(z.betrag, Math.max(0, Z.t_vk_start - 0.5), Z.t_vk_ende, N, 'linear'));
      } else {
        addArr(det.vermarktung, spread(z.betrag, Z.t_vk_start, Z.t_vk_ende, N, 'linear'));
      }
    });

    /* Verkaufserlöse STWE: Vorverkauf bis Baustart, Rest bis Verkaufsende.
       Je Verkauf greift der Zahlungsplan. */
    var vq = Math.min(100, Math.max(0, num(p.finanzierung.vorverkauf_quote))) / 100;
    var plan = (p.vermarktung.zahlungsplan || []).filter(function (r) { return num(r.anteil) > 0; });
    var planSumme = plan.reduce(function (s, r) { return s + num(r.anteil); }, 0) || 100;

    function zahlungsZeit(bezug, tVerkauf) {
      switch (bezug) {
        case 'beurkundung':    return tVerkauf;
        case 'baustart':       return Math.max(tVerkauf, Z.t_baustart);
        case 'rohbau':         return Math.max(tVerkauf, Z.t_rohbau);
        default:               return Math.max(tVerkauf, Z.t_bauende);
      }
    }

    /* Zwei Verkaufstranchen: vor Baustart (Vorverkauf) und danach */
    var tranchen = [
      { anteil: vq,     t0: Z.t_vk_start, t1: Math.max(Z.t_vk_start + 0.1, Z.t_baustart) },
      { anteil: 1 - vq, t0: Math.max(Z.t_vk_start, Z.t_baustart), t1: Z.t_vk_ende }
    ];
    tranchen.forEach(function (tr) {
      if (tr.anteil <= 0) return;
      var betrag = ERT.stwe_erloes * tr.anteil;
      var tMitte = (tr.t0 + tr.t1) / 2;
      plan.forEach(function (r) {
        var teil = betrag * num(r.anteil) / planSumme;
        var tz = zahlungsZeit(r.bezug, tMitte);
        addArr(det.verkauf, spread(teil, tz, tz + 0.5, N, 'linear'));
      });
    });

    /* Exit an Investor und kalkulatorische Realisierung des Halteanteils */
    var tExit = Z.t_bauende + num(p.zeit.exit_verzoegerung);
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
    return { N: N, aus: aus, ein: ein, det: det };
  };

  /* ---------------------------------------------------------------
     8 · Finanzierung — Jahresraster, Mid-Year-Konvention
     --------------------------------------------------------------- */

  E.finanzierung = function (p, Z, TR, gesamtinvestition, fk_limit_vor, haltenWert) {
    var f = p.finanzierung, N = TR.N;
    var ekMax = Math.max(0, gesamtinvestition * pct(f.ek_quote));
    var fkDeckel = Math.max(0, gesamtinvestition * pct(f.ltc_max));

    /* Aufteilung eines Finanzierungssaldos auf Eigen- und Fremdkapital.
       'zuerst'       – Eigenmittel werden vorab eingebracht (Bankpraxis Baukredit)
       'proportional' – jede Periode wird gemäss Eigenkapitalquote aufgeteilt   */
    function teile(saldo) {
      if (saldo <= 0) return { ek: 0, fk: 0 };
      var ek, fk;
      if (f.ek_einsatz === 'zuerst') {
        ek = Math.min(saldo, ekMax);
        fk = saldo - ek;
      } else {
        ek = saldo * pct(f.ek_quote);
        fk = saldo - ek;
      }
      if (fk > fkDeckel) { fk = fkDeckel; ek = saldo - fk; }
      return { ek: ek, fk: fk };
    }

    /* Zinsrabatt aus der Vorverkaufsstaffel */
    var rabattBp = 0;
    (f.staffel || []).slice().sort(function (a, b) { return num(a.ab) - num(b.ab); })
      .forEach(function (s) { if (num(f.vorverkauf_quote) >= num(s.ab)) rabattBp = num(s.bp); });

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

      var tStart = teile(kumStart), tEnde = teile(kumEnde);
      var fkMittel = (tStart.fk + tEnde.fk) / 2;
      var ekMittel = (tStart.ek + tEnde.ek) / 2;

      var satz = satzFor(mitte);
      var zins = fkMittel * satz;
      var bk = Math.max(0, limit - fkMittel) * pct(f.bereitstellung);
      if (f.ek_zins_aktiv) ekZinsKalk += ekMittel * pct(f.ek_zins);

      kum = kumEnde + zins + bk;
      bauzinsen += zins;
      bereitstellung += bk;

      var nach = teile(kum);
      if (nach.fk >= fkDeckel - 1 && kum > 0) deckelVerletzt = true;
      fkPeak = Math.max(fkPeak, nach.fk);
      ekPeak = Math.max(ekPeak, nach.ek);
      kapitalPeak = Math.max(kapitalPeak, Math.max(0, kum));

      jahre.push({
        jahr: j,
        ausgaben: TR.aus[j], einnahmen: TR.ein[j], netto: -bedarf,
        zins: zins, bereitstellung: bk, satz: satz * 100,
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

    /* Fixpunkt: Entwicklungshonorar und Bauzinsen hängen von den
       Anlagekosten ab, die ihrerseits beides enthalten. */
    var anlagekosten = BAU.total + E.kaufpreis(p, F) * 1.05;
    var gewinn = 0, ERW, BET, TR, FIN, bauzinsenAkt = 0, fkLimit = 0;

    for (var it = 0; it < 24; it++) {
      ERW = E.erwerbskosten(p, F, anlagekosten, gewinn);
      BET = E.betrieb(p, ERT, BAU.total);
      var akNeu = ERW.total + BAU.total + (p.finanzierung.bauzinsen_aktivieren ? bauzinsenAkt : 0);
      TR = E.zeitreihen(p, Z, ERW, BAU, ERT, VER, BET);
      var gesamt = akNeu + VER.total;
      FIN = E.finanzierung(p, Z, TR, gesamt, fkLimit, ERT.halten_wert);
      bauzinsenAkt = FIN.bauzinsen + FIN.bereitstellung;
      fkLimit = FIN.fk_peak;

      var erloeseIt = ERT.stwe_erloes + ERT.exit_wert + ERT.halten_wert;
      var mietNettoIt = TR.det.miete.reduce(function (s, x) { return s + x; }, 0);
      gewinn = erloeseIt + mietNettoIt - akNeu - VER.total -
               (p.finanzierung.bauzinsen_aktivieren ? 0 : bauzinsenAkt);

      if (Math.abs(akNeu - anlagekosten) < 0.5) { anlagekosten = akNeu; break; }
      anlagekosten = akNeu;
    }

    var mietertrag_projekt = TR.det.miete.reduce(function (s, x) { return s + x; }, 0);
    var finKosten = FIN.bauzinsen + FIN.bereitstellung;
    var aktiviert = p.finanzierung.bauzinsen_aktivieren;

    var erloese = ERT.stwe_erloes + ERT.exit_wert + ERT.halten_wert;
    var gesamtinvestition = anlagekosten + VER.total;
    var aufwand = gesamtinvestition + (aktiviert ? 0 : finKosten);
    var gewinnVor = erloese + mietertrag_projekt - aufwand;
    var steuern = p.steuern.aktiv ? Math.max(0, gewinnVor) * pct(p.steuern.satz) : 0;
    var gewinnNach = gewinnVor - steuern;
    var gewinnNachEK = gewinnNach - (p.finanzierung.ek_zins_aktiv ? FIN.ek_zins_kalk : 0);

    var ekFlow = FIN.jahre.map(function (j) { return j.ek_flow; });
    if (ekFlow.length) ekFlow[ekFlow.length - 1] -= steuern;
    var irr = E.irr(ekFlow);

    var bruttorendite = anlagekosten > 0 ? ERT.sollmiete / anlagekosten * 100 : 0;
    var nettorendite  = anlagekosten > 0 ? BET.noi_a / anlagekosten * 100 : 0;
    var margeAK = anlagekosten > 0 ? gewinnNach / anlagekosten * 100 : 0;
    var margeErloes = erloese > 0 ? gewinnNach / erloese * 100 : 0;
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

    var anteilHalten = erloese > 0 ? (ERT.halten_wert + ERT.exit_wert) / erloese : 0;
    var BES = E.bestandsrechnung(p, BET, anlagekosten * anteilHalten);

    return {
      zeit: Z, flaechen: F, bau: BAU, erwerb: ERW, ertraege: ERT,
      vermarktung: VER, betrieb: BET, reihen: TR, fin: FIN, bestand: BES,
      warnungen: warn,
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
        sollmiete: ERT.sollmiete,
        noi: BET.noi_a,
        ak_pro_nwf: F.total.nwf > 0 ? anlagekosten / F.total.nwf : 0,
        bau_pro_gf: F.total.gf > 0 ? BAU.total / F.total.gf : 0,
        dauer: Z.t_ende
      }
    };
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
          A.NUTZUNGEN.forEach(function (n) { p.teile[T.id].nutzungen[n.id].preis *= f; });
          p.teile[T.id].pp_preis *= f;
        });
        p.spiegel.einheiten.forEach(function (e) { e.preis *= f; });
      } },
    { id: 'mieten', label: 'Mietzinsen', apply: function (p, f) {
        A.TEILE.forEach(function (T) {
          A.NUTZUNGEN.forEach(function (n) { p.teile[T.id].nutzungen[n.id].miete *= f; });
          p.teile[T.id].pp_miete *= f;
        });
      } },
    { id: 'landpreis', label: 'Landpreis', apply: function (p, f) {
        p.erwerb.preis_total *= f; p.erwerb.preis_m2_land *= f; p.erwerb.preis_m2_agf *= f;
      } },
    { id: 'exitrendite', label: 'Exit-/Bewertungsrendite', apply: function (p, f) {
        p.bewertung.rendite_halten *= f;
        A.TEILE.forEach(function (T) {
          A.NUTZUNGEN.forEach(function (n) { p.teile[T.id].nutzungen[n.id].exit_rendite *= f; });
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
