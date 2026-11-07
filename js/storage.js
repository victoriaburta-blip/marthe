// Lernstand: Leitner-Boxen, Streak und Export/Import.
// Alles liegt ausschließlich im localStorage dieses Geräts.
(function () {
  'use strict';

  var KEY = 'marthe-progress-v1';
  var CODE_PREFIX = 'MARTHE1:';

  // Box -> alle wie viele Sessions eine Karte wieder drankommt.
  var INTERVAL = { 1: 1, 2: 2, 3: 4 };
  var MAX_BOX = 3;

  function emptyState() {
    return {
      v: 1,
      cards: {},          // { [cardId]: { box: 1..3, last: sessionNr } }
      review: [],         // ids „zum Wiederholen“ (mindestens einmal falsch beantwortet)
      lastOrder: {},      // { [kapitel]: "id,id,…" } Reihenfolge der letzten Session
      sessions: 0,        // Anzahl begonnener Sessions
      streak: 0,
      lastDay: null       // "YYYY-MM-DD" der letzten abgeschlossenen Session
    };
  }

  // Prüft und bereinigt fremde Daten (aus localStorage oder Import-Code).
  function sanitize(raw) {
    var s = emptyState();
    if (!raw || typeof raw !== 'object') return s;
    if (raw.cards && typeof raw.cards === 'object') {
      Object.keys(raw.cards).forEach(function (id) {
        var c = raw.cards[id];
        if (!c || typeof id !== 'string' || id.length > 64) return;
        var box = Math.min(MAX_BOX, Math.max(1, parseInt(c.box, 10) || 1));
        var last = Math.max(0, parseInt(c.last, 10) || 0);
        s.cards[id] = { box: box, last: last };
      });
    }
    if (Array.isArray(raw.review)) {
      s.review = raw.review.filter(function (id, i, arr) {
        return typeof id === 'string' && id.length <= 64 && arr.indexOf(id) === i;
      });
    }
    if (raw.lastOrder && typeof raw.lastOrder === 'object') {
      Object.keys(raw.lastOrder).forEach(function (k) {
        if (k.length <= 64 && typeof raw.lastOrder[k] === 'string') s.lastOrder[k] = raw.lastOrder[k].slice(0, 4000);
      });
    }
    s.sessions = Math.max(0, parseInt(raw.sessions, 10) || 0);
    s.streak = Math.max(0, parseInt(raw.streak, 10) || 0);
    s.lastDay = /^\d{4}-\d{2}-\d{2}$/.test(raw.lastDay) ? raw.lastDay : null;
    return s;
  }

  var memoryFallback = null;

  function load() {
    try {
      var txt = localStorage.getItem(KEY);
      return txt ? sanitize(JSON.parse(txt)) : emptyState();
    } catch (e) {
      return memoryFallback || emptyState();
    }
  }

  function save(state) {
    memoryFallback = state;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* privater Modus o. Ä. */ }
  }

  // ---------- Datum (lokale Zeit) ----------
  function dayString(d) {
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function today() { return dayString(new Date()); }
  function yesterday() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    return dayString(d);
  }

  // Streak, wie er gerade gilt: verfällt, wenn gestern und heute nicht gelernt wurde.
  function currentStreak(state) {
    if (state.lastDay === today() || state.lastDay === yesterday()) return state.streak;
    return 0;
  }

  function learnedToday(state) { return state.lastDay === today(); }

  // ---------- Leitner ----------
  function boxOf(state, id) {
    return state.cards[id] ? state.cards[id].box : 1;
  }

  function stats(state, cards) {
    var counts = { 1: 0, 2: 0, 3: 0 };
    cards.forEach(function (c) { counts[boxOf(state, c.id)]++; });
    return { box1: counts[1], box2: counts[2], box3: counts[3], mastered: counts[3], total: cards.length };
  }

  // Wählt bis zu `n` Karten: zuerst fällige (niedrige Box zuerst, am längsten nicht gesehen),
  // dann – falls nötig – auffüllen mit den übrigen in derselben Reihenfolge.
  function pickCards(state, cards, n) {
    var next = state.sessions + 1;
    var ranked = cards.map(function (c, i) {
      var p = state.cards[c.id];
      var box = p ? p.box : 1;
      var last = p ? p.last : 0;
      var isNew = !p;
      var due = isNew || (next - last) >= INTERVAL[box];
      return { card: c, box: box, last: last, due: due, order: i, rnd: Math.random() };
    });
    ranked.sort(function (a, b) {
      if (a.due !== b.due) return a.due ? -1 : 1;
      if (a.box !== b.box) return a.box - b.box;
      if (a.last !== b.last) return a.last - b.last;
      return a.rnd - b.rnd;
    });
    return ranked.slice(0, n).map(function (r) { return r.card; });
  }

  function startSession(state) {
    state.sessions += 1;
    save(state);
    return state.sessions;
  }

  // knew = true: eine Box hoch; false: zurück in Box 1.
  function rate(state, id, knew, sessionNr) {
    var p = state.cards[id] || { box: 1, last: 0 };
    p.box = knew ? Math.min(MAX_BOX, p.box + 1) : 1;
    p.last = sessionNr;
    state.cards[id] = p;
    save(state);
  }

  // ---------- Reihenfolge der Fragen ----------
  // Mischt die Karten so, dass die Reihenfolge (und die erste Frage) anders ist
  // als in der letzten Session dieses Kapitels.
  function shuffledOrder(state, key, cards) {
    var prev = (state.lastOrder[key] || '').split(',');
    var list = cards.slice();
    for (var tries = 0; tries < 20; tries++) {
      for (var i = list.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = list[i]; list[i] = list[j]; list[j] = t;
      }
      var ids = list.map(function (c) { return c.id; });
      var same = ids.join(',') === prev.join(',');
      var sameStart = list.length > 1 && ids[0] === prev[0];
      if (!same && !sameStart) break;
    }
    state.lastOrder[key] = list.map(function (c) { return c.id; }).join(',');
    save(state);
    return list;
  }

  // ---------- Zum Wiederholen ----------
  function setReview(state, id, on) {
    var i = state.review.indexOf(id);
    if (on && i === -1) state.review.push(id);
    if (!on && i !== -1) state.review.splice(i, 1);
    save(state);
  }

  function reviewCount(state, cards) {
    return cards.filter(function (c) { return state.review.indexOf(c.id) !== -1; }).length;
  }

  // Wird am Ende einer vollständigen Session aufgerufen.
  function completeSession(state) {
    var t = today();
    if (state.lastDay !== t) {
      state.streak = state.lastDay === yesterday() ? state.streak + 1 : 1;
      state.lastDay = t;
    }
    save(state);
    return state.streak;
  }

  // ---------- Export / Import ----------
  function exportCode(state) {
    var json = JSON.stringify(state);
    // UTF-8-sicheres Base64
    var b64 = btoa(String.fromCharCode.apply(null, new TextEncoder().encode(json)));
    return CODE_PREFIX + b64;
  }

  function importCode(code) {
    var clean = String(code || '').replace(/\s+/g, '');
    if (clean.indexOf(CODE_PREFIX) !== 0) throw new Error('prefix');
    var bin = atob(clean.slice(CODE_PREFIX.length));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var raw = JSON.parse(new TextDecoder().decode(bytes));
    if (!raw || raw.v !== 1) throw new Error('version');
    var state = sanitize(raw);
    save(state);
    return state;
  }

  window.Store = {
    load: load,
    save: save,
    stats: stats,
    pickCards: pickCards,
    startSession: startSession,
    rate: rate,
    shuffledOrder: shuffledOrder,
    setReview: setReview,
    reviewCount: reviewCount,
    completeSession: completeSession,
    currentStreak: currentStreak,
    learnedToday: learnedToday,
    exportCode: exportCode,
    importCode: importCode
  };
})();
