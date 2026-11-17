/* ==========================================================
   咪了个喵 · 界面交互
   ========================================================== */
(function () {
  'use strict';

  var C = window.MLM_CONFIG;
  var E = window.MLM_ENGINE;
  var I = window.MLM_IDIOMS;

  function $(s, r) { return (r || document).querySelector(s); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  var el = {
    app: $('#app'),
    board: $('#board'),
    wrap: $('#boardWrap'),
    slots: $('#slots'),
    fx: $('#fx'),
    modals: $('#modals'),
    toast: $('#toast'),
    lvText: $('#lvText'),
    lvDiff: $('#lvDiff'),
    badgeOut: $('#badgeOut'),
    badgeUndo: $('#badgeUndo'),
    badgeShuffle: $('#badgeShuffle'),
    toolOut: $('#toolOut'),
    toolUndo: $('#toolUndo'),
    toolShuffle: $('#toolShuffle')
  };

  var S = {
    level: 1,
    game: null,
    unit: 40,
    types: [],
    imgSrc: {},
    sound: true,
    vibrate: true,
    busy: false
  };

  /* ---------------- 存档 ---------------- */
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k, d) {
    try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; }
  }

  /* 断点续玩：整局存进 localStorage，关掉浏览器再打开能接着玩。
     改动了存档格式 / 摆牌规则时，把 SAVE_V 加一，旧存档自动作废。 */
  var SAVE_KEY = 'mlm.save';
  var SAVE_V = 1;

  function readSave() {
    var raw = load(SAVE_KEY, '');
    if (!raw) return null;
    try {
      var d = JSON.parse(raw);
      if (!d || d.v !== SAVE_V) return null;
      if (!d.cards || !d.cards.length || d.cards.length > 2000) return null;
      if (!d.cfg || !d.bounds || !d.tools) return null;
      if (d.status !== 'playing') return null;   // 死局/通关不留档，重开这一局
      if (!(d.level >= 1)) return null;
      var p = d.cards[0];                        // 粗查一下格式，坏了就重开
      if (!p || p.length !== 5 || typeof p[0] !== 'number' || typeof p[1] !== 'number') return null;
      if (typeof d.bounds.w !== 'number' || !(d.bounds.w > 0)) return null;
      return d;
    } catch (e) { return null; }
  }

  var saveTimer = 0;

  function writeSave() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
    var g = S.game;
    if (!g) return;
    if (g.status !== 'playing') { store(SAVE_KEY, ''); return; }
    try {
      var d = g.save();
      d.v = SAVE_V;
      store(SAVE_KEY, JSON.stringify(d));
    } catch (e) {}
  }

  /* 点一下存一次太浪费，攒 350ms 写一次；离开页面前会强制写 */
  function saveGame() {
    if (saveTimer) return;
    saveTimer = setTimeout(writeSave, 350);
  }

  /* ---------------- 音效（纯代码合成，不用音频文件） ---------------- */
  var AU = {
    ctx: null,
    on: true,
    ensure: function () {
      if (this.ctx) return this.ctx;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { this.ctx = new AC(); } catch (e) { this.ctx = null; }
      return this.ctx;
    },
    tone: function (f1, f2, dur, type, vol, delay) {
      if (!this.on) return;
      var ctx = this.ensure();
      if (!ctx) return;
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      var t = ctx.currentTime + (delay || 0);
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = type || 'triangle';
      o.frequency.setValueAtTime(f1, t);
      if (f2 && f2 !== f1) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.07, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + dur + 0.03);
    }
  };

  function sfx(name) {
    if (!S.sound) return;
    switch (name) {
      case 'tap': AU.tone(620, 900, 0.09, 'triangle', 0.06); break;
      case 'nope': AU.tone(240, 170, 0.13, 'square', 0.04); break;
      case 'match':
        AU.tone(760, 1180, 0.11, 'triangle', 0.07, 0);
        AU.tone(1180, 1560, 0.13, 'triangle', 0.055, 0.09);
        break;
      case 'tool': AU.tone(420, 720, 0.14, 'sine', 0.07); break;
      case 'win':
        AU.tone(523, 523, 0.12, 'triangle', 0.07, 0);
        AU.tone(659, 659, 0.12, 'triangle', 0.07, 0.12);
        AU.tone(784, 784, 0.14, 'triangle', 0.07, 0.24);
        AU.tone(1046, 1046, 0.22, 'triangle', 0.075, 0.38);
        break;
      case 'lose':
        AU.tone(320, 160, 0.3, 'sawtooth', 0.05, 0);
        AU.tone(200, 110, 0.4, 'sawtooth', 0.045, 0.18);
        break;
      case 'right':
        AU.tone(880, 1320, 0.14, 'sine', 0.06);
        break;
      case 'wrong':
        AU.tone(300, 200, 0.22, 'square', 0.05);
        break;
    }
  }

  function vibrate(p) {
    if (!S.vibrate) return;
    if (navigator.vibrate) { try { navigator.vibrate(p); } catch (e) {} }
  }

  function toast(msg, ms) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.toast.classList.remove('show'); }, ms || 1300);
  }

  /* ---------------- 卡面 ---------------- */
  function cardInner(type) {
    var src = S.imgSrc[type];
    if (src) return '<img src="' + src + '" alt="" draggable="false">';
    var cat = C.CATS[type] || { name: '?', color: '#EEE' };
    return '<span class="fb" style="background:' + cat.color + '">' + cat.name + '</span>';
  }

  function probe(i) {
    var base = C.IMAGE_DIR + pad2(i + 1);
    var exts = C.IMAGE_EXTS;
    return new Promise(function (resolve) {
      var k = 0;
      function next() {
        if (k >= exts.length) { resolve(false); return; }
        var url = base + '.' + exts[k++];
        var img = new Image();
        img.onload = function () { S.imgSrc[i] = url; resolve(true); };
        img.onerror = next;
        img.src = url;
      }
      next();
    });
  }

  function probeAll() {
    var tasks = [];
    for (var i = 0; i < C.MAX_TYPES; i++) tasks.push(probe(i));
    return Promise.all(tasks).then(function (flags) {
      var loaded = [];
      for (var j = 0; j < flags.length; j++) if (flags[j]) loaded.push(j);
      S.types = (loaded.length >= 3) ? loaded : (function () {
        var all = [];
        for (var k = 0; k < C.MAX_TYPES; k++) all.push(k);
        return all;
      })();
    });
  }

  /* ---------------- 渲染 ---------------- */
  var cardNodes = Object.create(null);

  function renderHUD() {
    el.lvText.textContent = '第 ' + S.level + ' 局';
    el.lvDiff.textContent = S.game ? S.game.cfg.diff : '';
  }

  function placeCard(node, c) {
    var unit = S.unit || 0;
    node.style.left = (c.x * unit) + 'px';
    node.style.top = (c.y * unit) + 'px';
    node.style.width = Math.max(14, unit - 0.6) + 'px';
    node.style.height = Math.max(16, unit * C.CARD_ASPECT - 0.6) + 'px';
    node.style.fontSize = Math.max(9, Math.round(unit * 0.40)) + 'px';
  }

  /* 只加减变化的牌，不整块重建——地狱局 250 多张牌，重建一次要 260ms */
  function renderBoard() {
    var g = S.game;
    if (!g) return;
    var seen = Object.create(null);
    var i, c, e;
    for (i = 0; i < g.cards.length; i++) {
      c = g.cards[i];
      if (c.state !== 'board') continue;
      seen[c.id] = 1;
      e = cardNodes[c.id];
      if (!e) {
        e = document.createElement('button');
        e.className = 'card';
        e.dataset.id = c.id;
        e.dataset.type = c.type;
        e.style.zIndex = 100 + c.layer * 100 + Math.round(c.y * 10);
        e.innerHTML = cardInner(c.type);
        cardNodes[c.id] = e;
        el.board.appendChild(e);
        placeCard(e, c);
      } else if (+e.dataset.type !== c.type) {
        // 洗牌会换图案
        e.dataset.type = c.type;
        e.innerHTML = cardInner(c.type);
      }
    }
    for (var k in cardNodes) {
      if (!seen[k]) { cardNodes[k].remove(); delete cardNodes[k]; }
    }
    updateCovered();
  }

  function clearBoard() {
    for (var k in cardNodes) delete cardNodes[k];
    el.board.innerHTML = '';
    S.unit = 0;
  }

  function applyLayout() {
    var g = S.game;
    if (!g) return;
    var b = g.bounds;
    var padX = 14, padY = 14;
    var W = Math.max(120, el.wrap.clientWidth - padX * 2);
    var H = Math.max(120, el.wrap.clientHeight - padY * 2);
    // 关键：按固定的“设计尺寸”算格子大小，而不是按本局的牌面大小。
    // 这样不管第几局、多少张牌，牌永远一样大，四周也总留着空白。
    var unit = Math.min(W / C.UNIT_W, H / C.UNIT_H);
    unit = Math.max(16, unit);
    S.unit = unit;

    el.board.style.width = (b.w * unit) + 'px';
    el.board.style.height = (b.h * unit) + 'px';

    for (var k in cardNodes) {
      var c = g.cards[+k];
      if (c) placeCard(cardNodes[k], c);
    }
    updateCovered();
  }

  function updateCovered() {
    var g = S.game;
    if (!g) return;
    for (var k in cardNodes) {
      var c = g.cards[+k];
      if (!c) continue;
      var node = cardNodes[k];
      var cov = g.isCovered(c);
      if (cov !== node.classList.contains('covered')) {
        node.classList.toggle('covered', cov);
      }
    }
  }

  function renderSlots() {
    var s = S.game.slots;
    var html = '';
    for (var i = 0; i < C.SLOT_COUNT; i++) {
      if (i < s.length) {
        html += '<div class="slot"><div class="slot-card">' + cardInner(s[i].type) + '</div></div>';
      } else {
        html += '<div class="slot"></div>';
      }
    }
    el.slots.innerHTML = html;
  }

  function renderTools() {
    var t = S.game.tools;
    setBadge(el.badgeOut, el.toolOut, t.out);
    setBadge(el.badgeUndo, el.toolUndo, t.undo);
    setBadge(el.badgeShuffle, el.toolShuffle, t.shuffle);
  }

  function setBadge(badge, btn, n) {
    badge.textContent = n;
    if (n <= 0) { badge.classList.add('zero'); btn.classList.add('disabled'); }
    else { badge.classList.remove('zero'); btn.classList.remove('disabled'); }
  }

  /* ---------------- 动画小工具 ---------------- */
  function fly(from, to, type) {
    var d = document.createElement('div');
    d.className = 'fly-card';
    d.style.left = from.left + 'px';
    d.style.top = from.top + 'px';
    d.style.width = from.width + 'px';
    d.style.height = from.height + 'px';
    d.innerHTML = cardInner(type);
    el.fx.appendChild(d);

    var dx = (to.left + to.width / 2) - (from.left + from.width / 2);
    var dy = (to.top + to.height / 2) - (from.top + from.height / 2);
    var sc = to.width / Math.max(1, from.width);

    requestAnimationFrame(function () {
      d.style.transition = 'transform .24s cubic-bezier(.35,.9,.4,1), opacity .24s ease';
      d.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sc + ')';
      d.style.opacity = '0.85';
    });
    setTimeout(function () { d.remove(); }, 260);
  }

  function burst(rects) {
    rects.forEach(function (r) {
      if (!r) return;
      for (var i = 0; i < 7; i++) {
        var s = document.createElement('div');
        s.className = 'spark';
        var cx = r.left + r.width / 2 - 5;
        var cy = r.top + r.height / 2 - 5;
        s.style.left = cx + 'px';
        s.style.top = cy + 'px';
        var ang = Math.random() * Math.PI * 2;
        var dist = 22 + Math.random() * 34;
        s.style.setProperty('--dx', (Math.cos(ang) * dist) + 'px');
        s.style.setProperty('--dy', (Math.sin(ang) * dist - 8) + 'px');
        el.fx.appendChild(s);
        (function (node) { setTimeout(function () { node.remove(); }, 620); })(s);
      }
    });
  }

  function shake(node) {
    if (!node) return;
    node.classList.remove('wiggle');
    void node.offsetWidth;
    node.classList.add('wiggle');
    setTimeout(function () { node.classList.remove('wiggle'); }, 360);
  }

  /* ---------------- 弹窗 ---------------- */
  function showModal(html, cls) {
    el.modals.innerHTML = '<div class="backdrop"></div><div class="modal' +
      (cls ? ' ' + cls : '') + '">' + html + '</div>';
    el.modals.classList.add('show');
    return el.modals.querySelector('.modal');
  }

  function closeModal() {
    el.modals.classList.remove('show');
    el.modals.innerHTML = '';
  }

  function bindActs(scope, acts) {
    scope.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var fn = acts[b.dataset.act];
      if (fn) fn(b);
    });
  }

  /* ---------------- 关卡 ---------------- */
  function startLevel(level, restored) {
    closeModal();
    S.level = Math.max(1, (restored && restored.level) || (level | 0));
    store('mlm.level', S.level);
    S.busy = false;
    S.game = restored ? E.restore(restored) : E.create(S.level, S.types);

    renderHUD();
    el.board.style.transition = 'none';
    el.board.style.transform = 'translateX(0)';
    el.board.style.opacity = '1';
    clearBoard();
    applyLayout();      // 先按新关卡的尺寸算出 unit
    renderBoard();      // 再摆牌（每张一次到位）
    renderSlots();
    renderTools();
    writeSave();        // 新局立刻存档，下次打开接着玩
  }

  function nextLevel() {
    var b = el.board;
    S.busy = true;
    b.style.transition = 'transform .32s cubic-bezier(.5,.05,.7,.3), opacity .32s ease';
    b.style.transform = 'translateX(-118%)';
    b.style.opacity = '0.05';

    setTimeout(function () {
      startLevel(S.level + 1);
      b.style.transition = 'none';
      b.style.transform = 'translateX(118%)';
      b.style.opacity = '0.05';
      void b.offsetWidth;
      b.style.transition = 'transform .36s cubic-bezier(.2,.9,.3,1.05), opacity .36s ease';
      b.style.transform = 'translateX(0)';
      b.style.opacity = '1';
      sfx('right');
      S.busy = false;
    }, 330);
  }

  function win() {
    sfx('win');
    vibrate([14, 40, 14, 40, 26]);

    var banner = document.createElement('div');
    banner.className = 'win-banner';
    banner.textContent = '喵~ 通关啦！';
    document.body.appendChild(banner);
    requestAnimationFrame(function () { banner.classList.add('show'); });

    setTimeout(function () { banner.classList.remove('show'); }, 980);
    setTimeout(function () { banner.remove(); }, 1400);
    setTimeout(nextLevel, 900);
  }

  function die() {
    sfx('lose');
    vibrate([36, 70, 46]);
    writeSave();        // 死局不留档：下次打开就是重开这一局
    if (!S.game.revived) showRevive();
    else showGameOver();
  }

  /* ---------------- 复活答题（自己输入） ---------------- */
  function showRevive() {
    var tier = (S.game && S.game.cfg.idiom) || 'easy';
    var tierName = tier === 'easy' ? '简单' : (tier === 'hard' ? '进阶' : '困难');
    var q = I.makeQuestion(tier);
    if (!q) { showGameOver(); return; }

    var m = showModal(
      '<h2>猫窝已满</h2>' +
      '<p class="sub">把下面这句成语的<b>下一句</b>写出来<br>接得上的成语都算对，写错换一句接着接</p>' +
      '<div class="quiz-q">' +
        '<div class="big" data-role="ask">' + q.ask + '</div>' +
        '<div class="hint" data-role="hint"></div>' +
      '</div>' +
      '<form class="quiz-form" data-role="form" autocomplete="off">' +
        '<input class="quiz-input" data-role="input" type="text" maxlength="14" ' +
          'autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" ' +
          'enterkeyhint="done" placeholder="写下一句">' +
        '<button class="quiz-go" type="submit">接上</button>' +
      '</form>' +
      '<div class="quiz-tip" data-role="tip">下一句要和上一句接住哦</div>' +
      '<button class="btn ghost" data-act="giveup">不，谢谢（放弃本局）</button>',
      'quiz'
    );

    var askEl = m.querySelector('[data-role="ask"]');
    var hintEl = m.querySelector('[data-role="hint"]');
    var tipEl = m.querySelector('[data-role="tip"]');
    var input = m.querySelector('[data-role="input"]');
    var form = m.querySelector('[data-role="form"]');
    var goBtn = m.querySelector('.quiz-go');
    var qBox = m.querySelector('.quiz-q');
    var answered = false;
    var tries = 0;

    function hintText() {
      return '首字必须是 <b>「' + q.key + '」</b>　·　4 个字　·　' + tierName;
    }

    function setQ(next, keepFocus, note) {
      q = next;
      askEl.textContent = q.ask;
      hintEl.innerHTML = hintText();
      input.value = '';
      input.disabled = false;
      goBtn.disabled = false;
      qBox.classList.remove('ok', 'bad');
      // 提示要跟着换题一起换，别把上一题的字数提示留着
      var base = tries >= 3
        ? '提示：第 2 个字是 <b>' + q.answer.charAt(1) + '</b>'
        : '下一句要和上一句接住哦';
      tip((note ? '<span class="bad-note">' + note + '</span>　' : '') + base);
      if (keepFocus) { try { input.focus(); } catch (e) {} }
    }

    function tip(msg, ok) {
      tipEl.innerHTML = msg;
      tipEl.classList.toggle('ok', !!ok);
    }

    // 去掉空格、标点，懒得打标点也能算对
    function clean(s) {
      return String(s || '').replace(/[\s\u3000，。、,.!！?？；;：:"'“”‘’（）()《》【】\-—…·]/g, '');
    }

    // 只要是成语、首字接得上就算对，不用和题库原答案一字不差
    function isRight(v) {
      if (v === q.answer) return true;
      if (v.length !== 4) return false;
      if (v.charAt(0) !== q.key) return false;
      var d = window.IDIOM_DICT;
      return !!(d && d.has(v));
    }

    // 答错时给一句贴切的提示
    function whyWrong(v) {
      if (v.charAt(0) !== q.key) return '「' + v.charAt(0) + '」开头的不对哦，要用「' + q.key + '」接';
      if (v.length !== 4) return '要写四字成语哦（写了 ' + v.length + ' 个字）';
      return '这个词词典里没有，换一个「' + q.key + '」开头的成语';
    }

    // 换到新题后，只留一句简短的原因（别再提上一题的首字）
    function shortWhy(v) {
      if (v.charAt(0) !== q.key) return '首字没接上';
      if (v.length !== 4) return '不是四个字';
      return '不是成语';
    }

    setQ(q, false);
    tip('下一句要和上一句接住哦');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (answered) return;
      var v = clean(input.value);
      if (!v) {
        tip('先写一句，再按「接上」');
        shake(input);
        return;
      }
      if (isRight(v)) {
        answered = true;
        input.disabled = true;
        goBtn.disabled = true;
        qBox.classList.add('ok');
        sfx('right');
        vibrate([10, 30, 10]);
        tip('接上啦！猫窝清出 3 个位子，再送你 1 个「移出」', true);
        setTimeout(function () {
          try { input.blur(); } catch (e) {}
          closeModal();
          doRevive();
        }, 760);
        return;
      }
      // 答错：立刻换一句，接着来接
      tries++;
      sfx('wrong');
      vibrate(50);
      shake(input);
      qBox.classList.add('bad');
      var note = '刚才那句不对（' + shortWhy(v) + '）';
      tip(whyWrong(v));
      setTimeout(function () {
        if (answered) return;
        var next = I.makeQuestion(tier) || q;
        for (var k = 0; k < 5 && next.ask === q.ask; k++) next = I.makeQuestion(tier) || next;
        setQ(next, true, note);
      }, 620);
    });

    bindActs(m, {
      giveup: function () { closeModal(); showGameOver(); }
    });
  }

  function doRevive() {
    if (!S.game) return;
    S.game.revive();
    renderBoard();
    renderSlots();
    renderTools();
    writeSave();
    sfx('tool');
    toast('复活成功！猫窝清出 3 个位子');
  }

  function showGameOver(msg) {
    var m = showModal(
      '<h2>猫窝已满</h2>' +
      '<p class="sub">' + (msg || '这一局先到这里，再来一次？') + '</p>' +
      '<button class="btn orange" data-act="retry">重玩本局</button>' +
      '<button class="btn" data-act="first">回到第 1 局</button>' +
      '<button class="btn ghost" data-act="stay">先看看牌桌</button>'
    );
    bindActs(m, {
      retry: function () { closeModal(); startLevel(S.level); },
      first: function () { closeModal(); startLevel(1); },
      stay: function () { closeModal(); }
    });
  }

  /* ---------------- 点击牌 ---------------- */
  function handleTap(id, node) {
    if (S.busy || !S.game || S.game.status !== 'playing') return;
    var g = S.game;
    var card = g.cards[id];
    if (!card) return;

    var fromRect = node.getBoundingClientRect();

    // 记录当前猫窝里每张牌的位置（消除特效要用）
    var rectById = {};
    for (var i = 0; i < g.slots.length; i++) {
      var cell = el.slots.children[i];
      if (cell) rectById[g.slots[i].id] = cell.getBoundingClientRect();
    }
    var targetIdx = Math.min(g.slots.length, C.SLOT_COUNT - 1);
    var targetCell = el.slots.children[targetIdx];
    var toRect = targetCell ? targetCell.getBoundingClientRect() : fromRect;

    var res = g.tap(id);
    if (!res.ok) {
      if (res.reason === 'covered') {
        shake(node);
        sfx('nope');
        toast('先挪开压在上面的猫~');
      }
      return;
    }

    sfx('tap');
    vibrate(8);

    renderBoard();
    renderSlots();
    renderTools();
    saveGame();
    fly(fromRect, toRect, card.type);

    if (res.matched.length) {
      (function (matched) {
        setTimeout(function () {
          var rs = [];
          for (var n = 0; n < matched.length; n++) rs.push(rectById[matched[n].id]);
          burst(rs);
          sfx('match');
          vibrate([8, 26, 14]);
        }, 120);
      })(res.matched);
    }

    if (res.won) { setTimeout(win, 420); return; }
    if (res.dead) { setTimeout(die, 460); }
  }

  el.board.addEventListener('click', function (e) {
    var b = e.target.closest('.card');
    if (!b) return;
    handleTap(+b.dataset.id, b);
  });

  /* ---------------- 道具 ---------------- */
  el.toolOut.addEventListener('click', function () {
    if (S.busy || !S.game) return;
    var r = S.game.useOut();
    if (!r.ok) {
      if (r.reason === 'empty') toast('「移出」用完啦，答题复活还能再拿一个');
      else if (r.reason === 'noslot') toast('猫窝里还没有猫~');
      return;
    }
    sfx('tool');
    renderBoard(); renderSlots(); renderTools();
    saveGame();
    popIds(r.moved);
    toast('把 ' + r.moved.length + ' 张放回牌桌啦，还能再点');
  });

  el.toolUndo.addEventListener('click', function () {
    if (S.busy || !S.game) return;
    var r = S.game.useUndo();
    if (!r.ok) {
      if (r.reason === 'empty') toast('「撤回」用完啦');
      else if (r.reason === 'noslot') toast('猫窝里还没有猫~');
      return;
    }
    sfx('tool');
    renderBoard(); renderSlots(); renderTools();
    saveGame();
    popIds([r.card]);
  });

  el.toolShuffle.addEventListener('click', function () {
    if (S.busy || !S.game) return;
    var r = S.game.useShuffle();
    if (!r.ok) {
      if (r.reason === 'empty') toast('「洗牌」用完啦');
      else toast('牌太少啦，不用洗');
      return;
    }
    sfx('tool');
    renderBoard();
    saveGame();
    var kids = el.board.children;
    for (var i = 0; i < kids.length; i++) kids[i].classList.add('pop');
    setTimeout(function () {
      for (var j = 0; j < el.board.children.length; j++) {
        el.board.children[j].classList.remove('pop');
      }
    }, 420);
    toast('洗牌完成~');
  });

  function popIds(cards) {
    setTimeout(function () {
      for (var i = 0; i < cards.length; i++) {
        var n = el.board.querySelector('[data-id="' + cards[i].id + '"]');
        if (n) n.classList.add('pop');
      }
    }, 20);
  }

  /* ---------------- 设置 / 帮助 ---------------- */
  function openSettings() {
    var loadedCount = 0;
    var chips = '';
    for (var i = 0; i < C.MAX_TYPES; i++) {
      var ok = !!S.imgSrc[i];
      if (ok) loadedCount++;
      chips += '<span class="mat ' + (ok ? 'ok' : 'no') + '">' +
        pad2(i + 1) + ' ' + (C.CATS[i] ? C.CATS[i].name : '?') +
        (ok ? '' : ' ·缺') + '</span>';
    }

    var m = showModal(
      '<h2>设置</h2>' +
      '<div class="setting"><span>音效</span><button class="switch ' + (S.sound ? 'on' : '') + '" data-act="sound"></button></div>' +
      '<div class="setting"><span>震动</span><button class="switch ' + (S.vibrate ? 'on' : '') + '" data-act="vibe"></button></div>' +
      '<div class="setting"><span>卡牌素材</span><span style="font-size:13px;color:#8a7357">已就绪 <b style="color:#3f9c3f">' + loadedCount + '</b> / ' + C.MAX_TYPES + '</span></div>' +
      '<div class="material-list">' + chips + '</div>' +
      '<p class="mat-hint">缺图的卡会显示成文字方块，不影响玩<br>补图方法见 README：把图丢进 picture/ → 运行 python tools/prepare-cards.py</p>' +
      '<button class="btn orange" data-act="retry">重开本局</button>' +
      '<button class="btn ghost" data-act="first">从第 1 局重新开始</button>' +
      '<button class="btn ghost" data-act="close">关闭</button>'
    );

    bindActs(m, {
      sound: function (b) {
        S.sound = !S.sound; AU.on = S.sound;
        b.classList.toggle('on', S.sound);
        store('mlm.sound', S.sound ? '1' : '0');
        if (S.sound) sfx('tap');
      },
      vibe: function (b) {
        S.vibrate = !S.vibrate;
        b.classList.toggle('on', S.vibrate);
        store('mlm.vibrate', S.vibrate ? '1' : '0');
        if (S.vibrate) vibrate(20);
      },
      retry: function () { closeModal(); startLevel(S.level); },
      first: function () { closeModal(); startLevel(1); },
      close: closeModal
    });
  }

  function openHelp() {
    var m = showModal(
      '<h2>怎么玩</h2>' +
      '<p>点一张卡牌，它会跳进下面的<b>猫窝</b>；<br>猫窝里凑齐 <b>3 张一样</b>的就消掉。</p>' +
      '<p>猫窝只有 <b>7 个位子</b>，满了就「猫窝已满」。</p>' +
      '<p>被压住的牌是<b>暗的</b>，要先挪开上面的。</p>' +
      '<p>每局送你「移出」「撤回」「洗牌」各 1 次；<br>「移出」会把猫窝前 3 张<b>放回牌桌</b>，还能再点。</p>' +
      '<p>猫窝满了，自己写一句<b>成语接龙</b>就能复活，<br>接得上的成语都算对，写错换一句接着接。</p>' +
      '<button class="btn" data-act="ok">开始撸猫</button>'
    );
    bindActs(m, {
      ok: function () { closeModal(); store('mlm.help', 'done'); }
    });
  }

  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnRestart').addEventListener('click', function () {
    if (S.busy) return;
    var m = showModal(
      '<h2>重开本局？</h2>' +
      '<p class="sub">当前的进度会丢掉哦</p>' +
      '<button class="btn orange" data-act="yes">重开第 ' + S.level + ' 局</button>' +
      '<button class="btn ghost" data-act="no">继续玩</button>'
    );
    bindActs(m, {
      yes: function () { closeModal(); startLevel(S.level); },
      no: closeModal
    });
  });

  /* ---------------- 启动 ---------------- */
  function init() {
    S.sound = load('mlm.sound', '1') === '1';
    S.vibrate = load('mlm.vibrate', '1') === '1';
    AU.on = S.sound;

    var lv = parseInt(load('mlm.level', '1'), 10);
    S.level = (lv > 0 && lv < 9999) ? lv : 1;

    // 浏览器要求“用户点过才出声”，所以先偷偷建好（省得第一次点牌时卡 300ms），
    // 真正点的时候只需要 resume 一下
    setTimeout(function () { AU.ensure(); }, 300);
    document.addEventListener('pointerdown', function once() {
      document.removeEventListener('pointerdown', once);
      var c = AU.ensure();
      if (c && c.state === 'suspended') { try { c.resume(); } catch (e) {} }
    }, { once: true });

    probeAll().then(function () {
      var saved = readSave();
      if (saved) {
        startLevel(saved.level, saved);
        setTimeout(function () { toast('接着上次那局继续~'); }, 700);
      } else {
        startLevel(S.level);
      }
      if (load('mlm.help', '') !== 'done') setTimeout(openHelp, 260);
    });

    // 切后台 / 关页面前强制存一次（免得 350ms 的那次还没落盘）
    window.addEventListener('pagehide', writeSave);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) writeSave();
    });

    var rt = null;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { applyLayout(); }, 80);
    });
    window.addEventListener('orientationchange', function () {
      setTimeout(function () { applyLayout(); }, 280);
    });

    // 容器尺寸一变就重新排版（首屏、旋转、地址栏收起都靠它）
    if (window.ResizeObserver) {
      try { new ResizeObserver(function () { applyLayout(); }).observe(el.wrap); } catch (e) {}
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { applyLayout(); });
    }
    setTimeout(applyLayout, 60);
    setTimeout(applyLayout, 400);
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    // 离线 / 加到主屏（file:// 打开时不注册，避免报错）
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    }
  }

  // 调试用（控制台里可以 __MLM 看状态），不影响游戏
  window.__MLM = { state: S, startLevel: startLevel, config: C };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
