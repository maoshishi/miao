/* ==========================================================
   咪了个喵 · 关卡生成 + 游戏规则（不碰 DOM）
   ========================================================== */
window.MLM_ENGINE = (function () {
  'use strict';

  var C = window.MLM_CONFIG;
  var ASPECT = C.CARD_ASPECT;
  var OX = 1 - 0.001;          // 水平方向“压住”的判定阈值（卡片宽 1）
  var OY = ASPECT - 0.001;     // 垂直方向

  function rnd(n) { return (Math.random() * n) | 0; }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = rnd(i + 1);
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------------- 一、按难度摆出位置 ---------------- */

  /* 简单局：图一那种摆法 —— 3×3 的格子，格子之间留缝，
     上面一行每格叠 3 张、中间 2 张、下面 1 张（3+3+3 + 2+2+2 + 1+1+1 = 18 张），
     没有两侧的牌堆，整坨居中，四周空空的。 */
  function buildPicPositions(cfg) {
    var list = [];
    var gap = (cfg.cellGap == null) ? 0.16 : cfg.cellGap;
    var step = cfg.stackStep || 0.13;          // 每多一张往上错开多少
    var stacks = cfg.rowStacks || [];
    for (var i = 0; i < cfg.cols; i++) {
      for (var j = 0; j < cfg.rows; j++) {
        var n = stacks[j] || Math.max(1, cfg.rows - j);
        for (var k = 0; k < n; k++) {
          list.push({
            x: i * (1 + gap),
            y: j * (ASPECT + gap) - k * step,   // 后面的牌往上露一条边
            layer: n - 1 - k                    // 最前面那张层号最大，能点
          });
        }
      }
    }
    return list;
  }

  /* 地狱局：中间一大坨密堆 + 四角扇形牌堆 + 两侧散牌（照着羊了个羊的地狱布局） */
  /* 所有难度都用这一套摆法：中间一大坨密堆 + 四角扇形牌堆 + 两侧竖排散牌。
     牌桌的“设计尺寸”固定（见 config.js 的 UNIT_W / UNIT_H），
     所以第 1 局和第 20 局的牌一样大，只是叠的层数不同。 */
  function buildHellPositions(cfg) {
    var list = [];
    var st = cfg.stagger || 0.5;
    var W = cfg.cols;                 // 中间那坨的宽（单位：一张牌）
    var H = cfg.rows * ASPECT;        // 中间那坨的高
    var topLayer = cfg.layers - 1;

    // 1) 中间的主体：每层同样的行列，靠 0.5 张错位露出下层。
    //    最顶上那层是“稀疏”的：只铺 2/5 的格子，散在一整片暗牌上（参考图那种感觉）。
    //    顶层不歪，正好压住下面那层的 4 张，所以下面的牌会变暗。
    for (var l = 0; l < cfg.layers; l++) {
      var sparse = !!cfg.sparseTop && l === topLayer && topLayer > 0;
      var fill = cfg.sparseFill || 2;      // 顶层铺几分之几（5 为满）
      var m4 = sparse ? 0 : (l % 4);
      var sx = (m4 === 1 || m4 === 3) ? st : 0;
      var sy = (m4 === 2 || m4 === 3) ? st * ASPECT : 0;
      for (var i = 0; i < cfg.cols; i++) {
        for (var j = 0; j < cfg.rows; j++) {
          if (sparse && ((i * 2 + j * 3 + 1) % 5) >= fill) continue;
          list.push({ x: i + sx, y: j * ASPECT + sy, layer: l });
        }
      }
    }

    // 2) 四角的“扇形牌堆”：几乎完全叠住，只能从最上面一张张掀
    var piles = cfg.sideStacks || 0;
    var size = cfg.stackSize || 0;
    var step = 0.075;                        // 每张露出的边有多宽
    var gap = 0.06;                          // 和中间那坨留的缝
    var tall = size ? ASPECT + (size - 1) * step : 0;
    var spots = [
      { x: -1 - gap, y: 0 },                 // 左上
      { x: W + gap,  y: 0 },                 // 右上
      { x: -1 - gap, y: H - tall },          // 左下
      { x: W + gap,  y: H - tall }           // 右下
    ];
    for (var s = 0; s < Math.min(piles, spots.length); s++) {
      var sp = spots[s];
      for (var d = 0; d < size; d++) {
        // 越往下层号越大：最下面那张露全脸，上面的只露一条边
        list.push({ x: sp.x, y: sp.y + d * step, layer: cfg.layers + s * 3 + d });
      }
    }

    // 3) 两侧中间的散牌：在上下两摞之间均匀排开
    var n = cfg.sideCards || 0;
    if (n > 0) {
      var lo = tall + 0.15;
      var hi = H - tall - 0.15;
      var lead = (hi - lo - n * ASPECT) / (n + 1);
      if (lead < 0.08) lead = 0.08;
      for (var c = 0; c < n; c++) {
        var y = lo + lead + c * (ASPECT + lead);
        if (y + ASPECT > hi + 0.001) break;
        list.push({ x: -1 - gap, y: y, layer: 0 });
        list.push({ x: W + gap,  y: y, layer: 0 });
      }
    }

    return list;
  }

  function buildPositions(cfg) {
    if (cfg.style === 'pic') return buildPicPositions(cfg);
    if (cfg.style === 'hell') return buildHellPositions(cfg);
    var list = [];
    var baseW = cfg.cols;
    var baseH = cfg.rows * ASPECT;

    for (var l = 0; l < cfg.layers; l++) {
      var cols = Math.max(2, cfg.cols - l * (cfg.shrink || 0));
      var rows = Math.max(1, cfg.rows - l * (cfg.shrink || 0));
      var lw = cols;
      var lh = rows * ASPECT;
      // 每层的错位方向循环：右、下、右下 —— 这样没有哪两层会完全对齐，
      // 下层的牌总能露出半边，玩家看得见摸得着
      var m4 = l % 4;
      var sx = (m4 === 1 || m4 === 3) ? cfg.stagger : 0;
      var sy = (m4 === 2 || m4 === 3) ? cfg.stagger * ASPECT : 0;
      var ox = Math.floor((baseW - lw) / 2) + sx;
      var oy = Math.floor((baseH - lh) / 2 / ASPECT + 1e-6) * ASPECT + sy;
      for (var i = 0; i < cols; i++) {
        for (var j = 0; j < rows; j++) {
          list.push({ x: ox + i, y: oy + j * ASPECT, layer: l });
        }
      }
    }

    // 两侧的“叠叠乐”牌堆：4 张完全叠在一起，只能一张张掀
    var stacks = cfg.stacks || 0;
    for (var s = 0; s < stacks; s++) {
      var isLeft = (s % 2 === 0);
      var rank = Math.floor(s / 2);
      var sx = isLeft ? -0.18 : baseW - 0.82;
      var sy = 1.05 + rank * 1.5;
      for (var d = 0; d < 4; d++) {
        list.push({ x: sx + d * 0.03, y: sy + d * 0.035, layer: cfg.layers + d });
      }
    }
    return list;
  }

  /* 总数必须是 3 的倍数：从最高层随手抽掉多余的牌 */
  function trimToMultipleOf3(list) {
    var guard = 0;
    while (list.length % 3 !== 0 && guard++ < 200) {
      var maxLayer = -1;
      for (var i = 0; i < list.length; i++) if (list[i].layer > maxLayer) maxLayer = list[i].layer;
      var idxs = [];
      for (var j = 0; j < list.length; j++) if (list[j].layer === maxLayer) idxs.push(j);
      list.splice(idxs[rnd(idxs.length)], 1);
    }
    return list;
  }

  function overlaps(a, b) {
    return Math.abs(a.x - b.x) < OX && Math.abs(a.y - b.y) < OY;
  }

  /* 模拟“一层层掀开”的拿牌顺序：保证这条顺序是可行的
     （用「每张牌被几张压着」的计数增量维护，267 张牌也是一瞬间的事） */
  function peelOrder(pos) {
    var n = pos.length;
    var alive = new Array(n);
    var cover = new Array(n);
    var i, j;
    for (i = 0; i < n; i++) { alive[i] = true; cover[i] = 0; }
    for (i = 0; i < n; i++) {
      for (j = 0; j < n; j++) {
        if (i === j) continue;
        if (pos[j].layer > pos[i].layer && overlaps(pos[i], pos[j])) cover[i]++;
      }
    }
    var free = [];
    for (i = 0; i < n; i++) if (cover[i] === 0) free.push(i);

    var order = [];
    while (order.length < n) {
      if (!free.length) {                 // 理论上不会发生，兜底
        for (i = 0; i < n; i++) if (alive[i]) { free.push(i); break; }
        if (!free.length) break;
      }
      var k = rnd(free.length);
      var pick = free[k];
      free[k] = free[free.length - 1];
      free.pop();
      if (!alive[pick]) continue;
      alive[pick] = false;
      order.push(pick);
      for (j = 0; j < n; j++) {
        if (!alive[j]) continue;
        if (pos[pick].layer > pos[j].layer && overlaps(pos[pick], pos[j])) {
          if (--cover[j] <= 0) free.push(j);
        }
      }
    }
    return order;
  }

  /* ---------------- 二、生成一整局 ---------------- */
  function generate(level, typeIds) {
    var cfg = C.levelConfig(level);

    var pool = [];
    if (typeIds && typeIds.length) {
      for (var p = 0; p < typeIds.length; p++) pool.push(typeIds[p]);
    } else {
      for (var q = 0; q < C.MAX_TYPES; q++) pool.push(q);
    }
    shuffle(pool);
    var nTypes = Math.max(3, Math.min(cfg.types, pool.length));
    var usePool = pool.slice(0, nTypes);

    var pos = buildPositions(cfg);
    trimToMultipleOf3(pos);

    var n = pos.length;
    var order = peelOrder(pos);

    // 按“拿牌顺序”每 3 张分一组，同组同款 —— 一定有解
    var groups = n / 3;
    var seq = [];
    for (var g = 0; g < groups; g++) seq.push(g % nTypes);
    shuffle(seq);

    var typeAt = new Array(n);
    for (var k = 0; k < n; k++) typeAt[order[k]] = usePool[seq[Math.floor(k / 3)]];

    // 坐标归一化到左上角
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < n; i++) {
      var p = pos[i];
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x + 1 > maxX) maxX = p.x + 1;
      if (p.y + ASPECT > maxY) maxY = p.y + ASPECT;
    }

    var cards = [];
    for (var c = 0; c < n; c++) {
      cards.push({
        id: c,
        type: typeAt[c],
        x: pos[c].x - minX,
        y: pos[c].y - minY,
        layer: pos[c].layer,
        state: 'board',
        from: 'board'
      });
    }

    var w = maxX - minX, h = maxY - minY;

    return {
      cfg: cfg,
      cards: cards,
      typeCount: nTypes,
      solution: order,     // 一份可行的拿牌顺序（调试 / 自检用）
      bounds: { w: w, h: h }
    };
  }

  /* ---------------- 三、一局的运行状态 ---------------- */
  function Game(level, typeIds) {
    var g = generate(level, typeIds);
    this.level = level;
    this.cfg = g.cfg;
    this.cards = g.cards;
    this.typeCount = g.typeCount;
    this.solution = g.solution;
    this.bounds = g.bounds;

    this.slots = [];
    this.tools = {
      out: C.START_TOOLS.out,
      undo: C.START_TOOLS.undo,
      shuffle: C.START_TOOLS.shuffle
    };
    this.status = 'playing';   // playing | dead | won
    this.revived = false;      // 本局是否已经复活过
  }

  Game.prototype.isCovered = function (card) {
    var cards = this.cards;
    for (var i = 0; i < cards.length; i++) {
      var o = cards[i];
      if (o === card || o.state !== 'board') continue;
      if (o.layer <= card.layer) continue;
      if (overlaps(o, card)) return true;
    }
    return false;
  };

  Game.prototype.isEmpty = function () {
    for (var i = 0; i < this.cards.length; i++) {
      if (this.cards[i].state !== 'gone') return false;
    }
    return true;
  };

  /* 槽位里同款凑够 3 张就消除 */
  Game.prototype.resolve = function () {
    var byType = {};
    for (var i = 0; i < this.slots.length; i++) {
      var t = this.slots[i].type;
      if (!byType[t]) byType[t] = [];
      byType[t].push(this.slots[i]);
    }
    var matched = [];
    for (var k in byType) {
      if (byType[k].length >= 3) {
        var three = byType[k].slice(0, 3);
        for (var m = 0; m < three.length; m++) three[m].state = 'gone';
        matched = matched.concat(three);
      }
    }
    if (matched.length) {
      this.slots = this.slots.filter(function (c) { return c.state === 'slot'; });
    }
    return matched;
  };

  /* 点一张牌 */
  Game.prototype.tap = function (id) {
    if (this.status !== 'playing') return { ok: false, reason: 'over' };
    var c = this.cards[id];
    if (!c || c.state !== 'board') return { ok: false, reason: 'gone' };
    if (this.isCovered(c)) return { ok: false, reason: 'covered', card: c };
    if (this.slots.length >= C.SLOT_COUNT) return { ok: false, reason: 'full' };

    c.from = 'board';
    c.state = 'slot';
    this.slots.push(c);

    var matched = this.resolve();
    var res = { ok: true, card: c, matched: matched, won: false, dead: false };

    if (this.isEmpty()) {
      this.status = 'won';
      res.won = true;
    } else if (this.slots.length >= C.SLOT_COUNT) {
      this.status = 'dead';
      res.dead = true;
    }
    return res;
  };

  /* 移出：把猫窝最前面 3 张放回牌桌原位（还能再点） */
  Game.prototype.useOut = function () {
    if (this.status !== 'playing') return { ok: false, reason: 'over' };
    if (this.tools.out <= 0) return { ok: false, reason: 'empty' };
    if (!this.slots.length) return { ok: false, reason: 'noslot' };

    var take = Math.min(3, this.slots.length);
    var moved = [];
    for (var i = 0; i < take; i++) {
      var c = this.slots[i];
      c.state = 'board';
      c.from = 'board';
      moved.push(c);
    }
    this.slots = this.slots.slice(take);
    this.tools.out--;
    return { ok: true, moved: moved };
  };

  /* 撤回：把最后放进猫窝的那张退回原位 */
  Game.prototype.useUndo = function () {
    if (this.status !== 'playing') return { ok: false, reason: 'over' };
    if (this.tools.undo <= 0) return { ok: false, reason: 'empty' };
    if (!this.slots.length) return { ok: false, reason: 'noslot' };

    var c = this.slots.pop();
    c.state = 'board';
    this.tools.undo--;
    return { ok: true, card: c };
  };

  /* 洗牌：把牌桌上还没拿走的牌重新分配图案 */
  Game.prototype.useShuffle = function () {
    if (this.status !== 'playing') return { ok: false, reason: 'over' };
    if (this.tools.shuffle <= 0) return { ok: false, reason: 'empty' };

    var board = [];
    for (var i = 0; i < this.cards.length; i++) {
      if (this.cards[i].state === 'board') board.push(this.cards[i]);
    }
    if (board.length < 3) return { ok: false, reason: 'few' };

    var types = board.map(function (c) { return c.type; });
    shuffle(types);
    for (var j = 0; j < board.length; j++) board[j].type = types[j];

    this.tools.shuffle--;
    return { ok: true, count: board.length };
  };

  /* 复活：等于自动用一次「移出」，再额外送一个移出道具 */
  Game.prototype.revive = function () {
    var moved = [];
    if (this.slots.length) {
      var take = Math.min(3, this.slots.length);
      for (var i = 0; i < take; i++) {
        var c = this.slots[i];
        c.state = 'board';
        c.from = 'board';
        moved.push(c);
      }
      this.slots = this.slots.slice(take);
    }
    this.tools.out += 1;
    this.status = 'playing';
    this.revived = true;
    return { ok: true, moved: moved };
  };

  /* ---------------- 四、存档 / 读档（关掉浏览器还能接着玩） ---------------- */
  Game.prototype.save = function () {
    var packs = [];
    for (var i = 0; i < this.cards.length; i++) {
      var c = this.cards[i];
      // [图案, x, y, 层, 状态] —— 用短数组省空间，336 张约 13KB
      // 坐标必须存全精度：错半张的牌是靠「有没有重叠」判定的，四舍五入会算错
      packs.push([c.type, c.x, c.y, c.layer, c.state]);
    }
    var slotIds = [];
    for (var s = 0; s < this.slots.length; s++) slotIds.push(this.slots[s].id);
    return {
      level: this.level,
      cfg: this.cfg,
      typeCount: this.typeCount,
      bounds: this.bounds,
      tools: { out: this.tools.out, undo: this.tools.undo, shuffle: this.tools.shuffle },
      status: this.status,
      revived: !!this.revived,
      slotIds: slotIds,
      cards: packs
    };
  };

  function restore(d) {
    var g = Object.create(Game.prototype);
    g.level = d.level;
    g.cfg = d.cfg;
    g.typeCount = d.typeCount;
    g.bounds = d.bounds;
    g.tools = {
      out: d.tools.out | 0,
      undo: d.tools.undo | 0,
      shuffle: d.tools.shuffle | 0
    };
    g.status = 'playing';
    g.revived = !!d.revived;
    g.solution = [];

    var cards = [];
    for (var i = 0; i < d.cards.length; i++) {
      var p = d.cards[i];
      cards.push({
        id: i, type: p[0], x: p[1], y: p[2], layer: p[3],
        state: p[4], from: 'board'
      });
    }
    g.cards = cards;

    g.slots = [];
    var ids = d.slotIds || [];
    for (var k = 0; k < ids.length; k++) {
      var c = cards[ids[k]];
      if (c && c.state === 'slot') g.slots.push(c);
    }
    return g;
  }

  return {
    create: function (level, typeIds) { return new Game(level, typeIds); },
    restore: restore,
    generate: generate
  };
})();
