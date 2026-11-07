(function () {
  'use strict';

  var MAX_ATTEMPTS = 2;           // nach dem zweiten Fehler wird die Lösung gezeigt

  // Themen der Startseite. Ein Thema freischalten: `ready: true` setzen
  // und die Karten-Datei in /cards anlegen.
  var TOPICS = {
    analysis:   { name: 'Analysis',   files: ['cards/analysis.json'],   ready: false },
    geometrie:  { name: 'Geometrie',  files: ['cards/geometrie.json'],  ready: true },
    stochastik: { name: 'Stochastik', files: ['cards/stochastik.json'], ready: false },
    gemischt:   {
      name: 'Gemischt',
      files: ['cards/analysis.json', 'cards/geometrie.json', 'cards/stochastik.json'],
      ready: false
    }
  };

  var $ = function (id) { return document.getElementById(id); };
  var state = Store.load();
  var deckCache = {};               // Datei -> { cards, chapters }
  var deck = { key: null, name: '', cards: [], chapters: [] };
  var chapterCards = [];            // Fragen des gewählten Kapitels
  var chapterKey = '';              // z. B. "geometrie:vektoren"
  var session = null;
  var lastWrong = [];               // falsch beantwortete Karten der letzten Runde
  var wipBack = null;               // wohin „Zurück“ auf dem Baustellen-Screen führt

  var ALL_CHAPTERS = 'alle';

  // ---------- Screens ----------
  var screens = ['start', 'topic', 'wip', 'session', 'done', 'transfer'];
  function show(name) {
    screens.forEach(function (s) { $('screen-' + s).hidden = s !== name; });
    window.scrollTo(0, 0);
  }

  // ---------- Formeln ----------
  // Text mit $…$ (inline) und $$…$$ (abgesetzt) in ein Element schreiben.
  // Alles außerhalb der Formeln wird als reiner Text eingefügt (kein HTML).
  function renderMath(el, text) {
    el.textContent = '';
    if (!text) return;
    var re = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
    var pos = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > pos) el.appendChild(document.createTextNode(text.slice(pos, m.index)));
      var display = m[1] !== undefined;
      var span = document.createElement(display ? 'div' : 'span');
      try {
        katex.render(display ? m[1] : m[2], span, { displayMode: display, throwOnError: false });
      } catch (e) {
        span.textContent = m[0];
      }
      el.appendChild(span);
      pos = re.lastIndex;
      // Zeilenumbruch direkt nach einer abgesetzten Formel nicht zusätzlich anzeigen
      if (display && text[pos] === '\n') pos++;
    }
    if (pos < text.length) el.appendChild(document.createTextNode(text.slice(pos)));
  }

  // ---------- Karten laden ----------
  // Gültig ist eine Karte mit id, Frage, genau 4 Antworten und dem Index der richtigen.
  function isValidCard(c) {
    return c && c.id && c.question &&
      Array.isArray(c.options) && c.options.length === 4 &&
      Number.isInteger(c.correct) && c.correct >= 0 && c.correct < 4;
  }

  function loadFile(file) {
    if (deckCache[file]) return Promise.resolve(deckCache[file]);
    return fetch(file)
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(function (data) {
        var entry = {
          cards: (data.cards || []).filter(isValidCard),
          chapters: (data.chapters || []).filter(function (c) { return c && c.id && c.name; })
        };
        deckCache[file] = entry;
        return entry;
      })
      .catch(function () { return { cards: [], chapters: [] }; });   // fehlende Datei = keine Karten
  }

  function loadTopic(key) {
    return Promise.all(TOPICS[key].files.map(loadFile)).then(function (entries) {
      deck = { key: key, name: TOPICS[key].name, cards: [], chapters: [] };
      entries.forEach(function (e) {
        deck.cards = deck.cards.concat(e.cards);
        deck.chapters = deck.chapters.concat(e.chapters);
      });
    });
  }

  function cardsOfChapter(id) {
    if (id === ALL_CHAPTERS) return deck.cards;
    // "chapter" ist eine id oder eine Liste von ids (Frage in mehreren Kapiteln)
    return deck.cards.filter(function (c) {
      return Array.isArray(c.chapter) ? c.chapter.indexOf(id) !== -1 : c.chapter === id;
    });
  }

  function showWip(title, text, backLabel, back) {
    $('wip-title').textContent = title;
    $('wip-text').textContent = text;
    $('wip-back').textContent = backLabel;
    wipBack = back;
    show('wip');
  }

  // ---------- Startseite ----------
  function renderStart() {
    $('start-streak').textContent = '🔥 ' + Store.currentStreak(state);
    var geo = deckCache['cards/geometrie.json'];
    $('tile-geometrie-sub').textContent = geo
      ? geo.cards.length + (geo.cards.length === 1 ? ' Frage' : ' Fragen')
      : '';
  }

  function goStart() {
    renderStart();
    show('start');
  }

  function openTopic(key) {
    var topic = TOPICS[key];
    if (!topic.ready) {
      showWip(topic.name, 'Diese Seite wird noch bearbeitet. Schau bald wieder vorbei!',
        'Zurück zur Startseite', goStart);
      return;
    }
    loadTopic(key).then(function () {
      renderTopic();
      show('topic');
    });
  }

  // ---------- Themenübersicht: Kapitel ----------
  function renderTopic() {
    var streak = Store.currentStreak(state);
    $('topic-title').textContent = deck.name;
    $('streak-value').textContent = streak;
    $('streak-label').textContent = streak === 1 ? 'Tag in Folge' : 'Tage in Folge';
    $('today-note').hidden = !Store.learnedToday(state);

    var list = $('chapters');
    list.textContent = '';
    var entries = deck.chapters.map(function (c) { return { id: c.id, name: c.name, all: false }; });
    entries.push({ id: ALL_CHAPTERS, name: 'Alle Kapitel', all: true });

    entries.forEach(function (ch) {
      var cards = cardsOfChapter(ch.id);
      var review = Store.reviewCount(state, cards);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chapter' + (ch.all ? ' chapter-all' : '') + (cards.length ? '' : ' chapter-empty');

      var name = document.createElement('span');
      name.className = 'chapter-name';
      name.textContent = ch.name;
      var sub = document.createElement('span');
      sub.className = 'chapter-sub';
      sub.textContent = cards.length
        ? cards.length + (cards.length === 1 ? ' Frage' : ' Fragen') +
          (review ? ' · ' + review + ' zum Wiederholen' : '')
        : 'noch keine Fragen';
      var text = document.createElement('span');
      text.className = 'chapter-text';
      text.appendChild(name);
      text.appendChild(sub);
      var arrow = document.createElement('span');
      arrow.className = 'chapter-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '›';

      btn.appendChild(text);
      btn.appendChild(arrow);
      btn.addEventListener('click', function () { openChapter(ch); });
      list.appendChild(btn);
    });
  }

  function openChapter(ch) {
    var cards = cardsOfChapter(ch.id);
    if (!cards.length) {
      showWip(ch.name, 'Für dieses Kapitel gibt es noch keine Fragen. Schau bald wieder vorbei!',
        'Zurück zu ' + deck.name, goTopic);
      return;
    }
    chapterCards = cards;
    chapterKey = deck.key + ':' + ch.id;
    startNewSession();
  }

  function goTopic() {
    renderTopic();
    show('topic');
  }

  // ---------- Session ----------
  // isReview = true: Wiederholungsrunde mit den zuvor falsch beantworteten Fragen.
  function startSession(cards, isReview) {
    if (!cards.length) return;
    session = {
      nr: isReview && session ? session.nr : (isReview ? state.sessions : Store.startSession(state)),
      isReview: !!isReview,
      cards: cards.slice(),
      index: 0,
      firstTry: 0,         // beim ersten Versuch richtig
      wrong: [],           // mindestens einmal falsch beantwortet
      attempts: 0,
      locked: false
    };
    show('session');
    showCard();
  }

  function startNewSession() {
    // Alle Fragen des Kapitels, jedes Mal in einer anderen Reihenfolge
    startSession(Store.shuffledOrder(state, chapterKey, chapterCards), false);
  }

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  }

  function showCard() {
    var card = session.cards[session.index];
    session.attempts = 0;
    session.locked = false;

    var el = $('card');
    // Animation neu starten
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';

    $('card-label').textContent = session.isReview ? 'Wiederholung' : 'Frage';
    el.classList.toggle('repeat', session.isReview);
    renderMath($('card-question'), card.question);
    var img = $('card-image');
    if (card.image) {
      img.src = card.image;
      img.alt = card.imageAlt || '';
      img.hidden = false;
    } else {
      img.removeAttribute('src');
      img.hidden = true;
    }
    renderMath($('card-hint'), card.hint || '');
    $('hint-btn').hidden = !card.hint;
    $('card-hint').hidden = true;

    // Antworten in zufälliger Reihenfolge
    var box = $('options');
    box.textContent = '';
    var order = shuffle([0, 1, 2, 3]);
    order.forEach(function (optIndex, pos) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option';
      btn.dataset.correct = optIndex === card.correct ? '1' : '0';
      var letter = document.createElement('span');
      letter.className = 'option-letter';
      letter.textContent = 'ABCD'[pos];
      var text = document.createElement('span');
      text.className = 'option-text';
      renderMath(text, card.options[optIndex]);
      btn.appendChild(letter);
      btn.appendChild(text);
      btn.addEventListener('click', function () { choose(btn); });
      box.appendChild(btn);
    });

    $('feedback').hidden = true;
    $('feedback').className = 'feedback';
    $('next-btn').hidden = true;

    var total = session.cards.length;
    $('session-count').textContent = session.index + '/' + total;
    $('session-fill').style.width = (session.index / total) * 100 + '%';
  }

  function setFeedback(kind, title, text) {
    var fb = $('feedback');
    fb.hidden = false;
    fb.className = 'feedback feedback-' + kind;
    $('feedback-title').textContent = title;
    renderMath($('feedback-text'), text || '');
    $('feedback-text').hidden = !text;
  }

  function choose(btn) {
    if (session.locked || btn.disabled) return;
    var card = session.cards[session.index];

    if (btn.dataset.correct === '1') {
      btn.classList.add('correct');
      var first = session.attempts === 0;
      finishCard(card, first);
      setFeedback('ok', first ? 'Richtig! 🎉' : 'Richtig – beim zweiten Versuch! 👍', card.explanation);
      return;
    }

    session.attempts++;
    btn.classList.add('wrong');
    btn.disabled = true;

    if (session.attempts < MAX_ATTEMPTS) {
      setFeedback('try', 'Leider falsch – du hast noch einen Versuch.', '');
    } else {
      var right = $('options').querySelector('[data-correct="1"]');
      right.classList.add('correct', 'revealed');
      finishCard(card, false);
      setFeedback('fail', 'Nicht ganz. Die richtige Antwort ist markiert.', card.explanation);
    }
  }

  // Ergebnis einer Karte speichern und Antworten sperren.
  function finishCard(card, firstTry) {
    session.locked = true;
    Array.prototype.forEach.call($('options').children, function (b) { b.disabled = true; });

    if (firstTry) {
      session.firstTry++;
      if (!session.isReview) Store.rate(state, card.id, true, session.nr);
    } else {
      session.wrong.push(card);
      Store.rate(state, card.id, false, session.nr);
    }
    Store.setReview(state, card.id, !firstTry);
    $('next-btn').hidden = false;
  }

  function nextCard() {
    session.index++;
    if (session.index < session.cards.length) showCard();
    else finishSession();
  }

  // ---------- Ende ----------
  var MESSAGES = {
    perfect: [
      'Perfekt! Du hast alles auf Anhieb gewusst. 🚀',
      'Fehlerfrei – so sieht Abi-Vorbereitung aus!',
      'Wow, volle Punktzahl! Weiter so.'
    ],
    good: [
      'Stark! Die paar Fehler wiederholst du gleich noch.',
      'Sehr gut – du bist auf dem richtigen Weg.',
      'Klasse Runde! Morgen wird es noch besser.'
    ],
    ok: [
      'Gut gemacht! Jede Wiederholung bringt dich weiter.',
      'Dranbleiben lohnt sich – du hast heute gelernt.',
      'Schritt für Schritt – das wird!'
    ]
  };

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function finishSession() {
    var total = session.cards.length;
    var streak = session.isReview ? Store.currentStreak(state) : Store.completeSession(state);
    var ratio = total ? session.firstTry / total : 0;
    var tier = ratio === 1 ? 'perfect' : ratio >= 0.6 ? 'good' : 'ok';

    $('done-emoji').textContent = tier === 'perfect' ? '🏆' : tier === 'good' ? '🎉' : '💪';
    $('done-title').textContent = session.isReview
      ? (tier === 'perfect' ? 'Jetzt sitzt es!' : 'Wiederholung geschafft')
      : (tier === 'perfect' ? 'Perfekt!' : 'Geschafft!');
    $('done-message').textContent = session.isReview && tier === 'perfect'
      ? 'Alle Wiederholungsfragen hast du diesmal richtig beantwortet. 💪'
      : pick(MESSAGES[tier]);
    $('score-value').textContent = session.firstTry + '/' + total;
    $('done-streak').textContent = '🔥 ' + streak + (streak === 1 ? ' Tag' : ' Tage') + ' in Folge';

    // Liste „Zum Wiederholen“
    lastWrong = session.wrong.slice();
    var hasWrong = lastWrong.length > 0;
    var list = $('review-list');
    list.textContent = '';
    lastWrong.forEach(function (card) {
      var li = document.createElement('li');
      renderMath(li, card.question);
      list.appendChild(li);
    });
    $('review-list-count').textContent = lastWrong.length;
    $('review').hidden = !hasWrong;
    $('review-btn').hidden = !hasWrong;
    $('home-btn').className = 'btn btn-big ' + (hasWrong ? 'btn-secondary' : 'btn-primary');
    $('home-btn').textContent = hasWrong ? 'Session beenden' : 'Fertig';
    $('again-session-btn').hidden = hasWrong;

    show('done');
  }

  function quitSession() {
    session = null;
    goTopic();
  }

  // ---------- Export / Import ----------
  function openTransfer() {
    $('export-code').value = Store.exportCode(state);
    $('import-code').value = '';
    setStatus('', '');
    show('transfer');
  }

  function setStatus(text, kind) {
    var el = $('transfer-status');
    el.textContent = text;
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function copyCode() {
    var box = $('export-code');
    var done = function () { setStatus('✓ Code kopiert', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(box.value).then(done, function () { fallbackCopy(box, done); });
    } else {
      fallbackCopy(box, done);
    }
  }

  function fallbackCopy(box, done) {
    box.focus();
    box.select();
    try {
      if (document.execCommand('copy')) return done();
    } catch (e) { /* ignorieren */ }
    setStatus('Bitte den markierten Code manuell kopieren.', '');
  }

  function doImport() {
    var code = $('import-code').value.trim();
    if (!code) { setStatus('⚠ Bitte zuerst einen Code einfügen.', 'err'); return; }
    if (!window.confirm('Deinen aktuellen Lernstand durch den importierten ersetzen?')) return;
    try {
      state = Store.importCode(code);
      $('export-code').value = Store.exportCode(state);
      $('import-code').value = '';
      setStatus('✓ Import erfolgreich. Dein Lernstand wurde übernommen.', 'ok');
    } catch (e) {
      setStatus('⚠ Dieser Code ist ungültig. Bitte prüfe, ob er vollständig kopiert wurde.', 'err');
    }
  }

  // ---------- Start ----------
  function bind() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-topic]'), function (btn) {
      btn.addEventListener('click', function () { openTopic(btn.getAttribute('data-topic')); });
    });
    $('wip-back').addEventListener('click', function () { (wipBack || goStart)(); });
    $('topic-back').addEventListener('click', goStart);
    $('hint-btn').addEventListener('click', function () {
      $('card-hint').hidden = false;
      $('hint-btn').hidden = true;
    });
    $('next-btn').addEventListener('click', nextCard);
    $('quit-btn').addEventListener('click', quitSession);
    $('review-btn').addEventListener('click', function () { startSession(shuffle(lastWrong.slice()), true); });
    $('home-btn').addEventListener('click', function () { session = null; goTopic(); });
    $('again-session-btn').addEventListener('click', startNewSession);
    $('transfer-btn').addEventListener('click', openTransfer);
    $('transfer-back').addEventListener('click', goStart);
    $('copy-btn').addEventListener('click', copyCode);
    $('import-btn').addEventListener('click', doImport);

    // Streak aktualisieren, wenn die App nach Mitternacht wieder geöffnet wird
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      if (!$('screen-start').hidden) renderStart();
      if (!$('screen-topic').hidden) renderTopic();
    });
  }

  bind();
  renderStart();
  // Geometrie vorladen, damit die Kachel den Fortschritt zeigt
  loadFile('cards/geometrie.json').then(renderStart);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline nicht verfügbar */ });
    });
  }
})();
