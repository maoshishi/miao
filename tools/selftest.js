/* 自检脚本：node tools/selftest.js
   1) 每局出牌数量、图案数量是否合法（3 的倍数）
   2) 内置“可行顺序”能不能真的打通
   3) 猫窝 7 格规则、移出/撤回/洗牌是否正常
   4) 成语接龙题库是否首尾接得上
*/
global.window = global;

require('../js/config.js');
require('../js/engine.js');
require('../js/idioms.js');
require('../js/idiom-dict.js');

const C = global.MLM_CONFIG;
const E = global.MLM_ENGINE;
const I = global.MLM_IDIOMS;

let fail = 0;
function ok(cond, msg) {
  if (!cond) { console.log('  ✗ ' + msg); fail++; }
  else console.log('  ✓ ' + msg);
}

console.log('=== 1. 关卡结构 ===');
const allTypes = [];
for (let i = 0; i < C.MAX_TYPES; i++) allTypes.push(i);

for (let lv = 1; lv <= 8; lv++) {
  const g = E.create(lv, allTypes);
  const counts = {};
  let bad = false;
  for (const c of g.cards) {
    counts[c.type] = (counts[c.type] || 0) + 1;
    if (c.state !== 'board') bad = true;
  }
  const types = Object.keys(counts);
  const multipleOf3 = Object.keys(counts).every(t => counts[t] % 3 === 0);
  console.log(`第 ${lv} 局 [${g.cfg.diff}]  牌数=${g.cards.length}  种类=${types.length}  层数=${g.cfg.layers}`);
  ok(!bad, '  所有牌都在桌面上');
  ok(g.cards.length % 3 === 0, '  总牌数是 3 的倍数');
  ok(multipleOf3, '  每种猫的数量都是 3 的倍数');
  ok(types.length >= 3 && types.length <= g.cfg.types, '  种类数合理');
  ok(g.cards.length >= types.length * 3, '  每种猫至少能凑一组');
}

console.log('\n=== 2. 内置解能否打通（跑 20 次 x 8 局）===');
let solved = 0, tried = 0;
for (let lv = 1; lv <= 8; lv++) {
  for (let round = 0; round < 20; round++) {
    tried++;
    const g = E.create(lv, allTypes);
    let won = false;
    for (const id of g.solution) {
      const r = g.tap(id);
      if (!r.ok) { console.log('  ✗ 第 ' + lv + ' 局第 ' + round + ' 次：解在第 ' + id + ' 张卡住 (' + r.reason + ')'); break; }
      if (r.won) { won = true; break; }
    }
    if (won) solved++;
  }
}
ok(solved === tried, `内置解通关 ${solved}/${tried}`);

console.log('\n=== 3. 规则检查 ===');
{
  const g = E.create(1, allTypes);
  const firstFree = g.cards.find(c => !g.isCovered(c));
  ok(!!firstFree, '存在可以点的牌');

  const covered = g.cards.find(c => g.isCovered(c));
  if (covered) {
    const r = g.tap(covered.id);
    ok(!r.ok && r.reason === 'covered', '被压住的牌点不动');
  }

  // 填满 7 格
  const g2 = E.create(1, allTypes);
  let dead = false, guard = 0;
  while (!dead && guard++ < 200) {
    const pick = g2.cards.filter(c => c.state === 'board' && !g2.isCovered(c))
      .sort((a, b) => a.type - b.type)[0];
    if (!pick) break;
    const r = g2.tap(pick.id);
    if (!r.ok) break;
    if (r.dead) dead = true;
    if (g2.slots.length >= 7) break;
  }
  ok(g2.slots.length <= 7, '猫窝不会超过 7 张（实际 ' + g2.slots.length + '）');

  // 移出
  const g3 = E.create(1, allTypes);
  const sol = g3.solution.slice(0, 8);
  for (const id of sol) g3.tap(id);
  const before = g3.slots.length;
  const rOut = g3.useOut();
  ok(rOut.ok && g3.slots.length === Math.max(0, before - 3), '移出把 3 张放回桌面');
  ok(g3.tools.out === 0, '移出道具被消耗');
  ok(rOut.moved.length >= 1 && rOut.moved.every(c => c.state === 'board'), '移出的牌回到牌桌、能再点');
  ok(rOut.moved.every(c => g3.cards[c.id] === c), '移出的牌还是同一张');

  // 撤回
  const g4 = E.create(1, allTypes);
  const firstId = g4.solution[0];
  g4.tap(firstId);
  const rUndo = g4.useUndo();
  ok(rUndo.ok && g4.cards[firstId].state === 'board', '撤回把牌放回桌面');
  ok(g4.slots.length === 0, '撤回后猫窝清空');

  // 洗牌：图案总数不变
  const g5 = E.create(3, allTypes);
  const before5 = {};
  g5.cards.forEach(c => before5[c.type] = (before5[c.type] || 0) + 1);
  ok(g5.useShuffle().ok, '洗牌可用');
  const after5 = {};
  g5.cards.forEach(c => after5[c.type] = (after5[c.type] || 0) + 1);
  ok(JSON.stringify(before5) === JSON.stringify(after5), '洗牌前后图案数量一致');

  // 复活
  const g6 = E.create(1, allTypes);
  for (const id of g6.solution.slice(0, 7)) g6.tap(id);
  if (g6.status === 'dead') {
    const n0 = g6.tools.out;
    g6.revive();
    ok(g6.status === 'playing', '复活后可以继续玩');
    ok(g6.slots.length <= 4, '复活后猫窝空出位置');
    ok(g6.tools.out === n0 + 1, '复活额外送 1 个移出');
  } else {
    ok(true, '（这一把没死，跳过复活测试）');
  }
}

console.log('\n=== 4. 成语接龙题库 ===');
['easy', 'hard', 'expert'].forEach(tier => {
  const list = I.packs[tier];
  const bad = list.filter(p => p[0].charAt(3) !== p[1].charAt(0) || p[0].length !== 4 || p[1].length !== 4);
  ok(list.length >= 20, `${tier} 题量 ${list.length} 条`);
  ok(bad.length === 0, `${tier} 全部首尾相接` + (bad.length ? ' 问题：' + JSON.stringify(bad.slice(0, 3)) : ''));
});

let qok = 0;
for (let i = 0; i < 500; i++) {
  const tier = ['easy', 'hard', 'expert'][i % 3];
  const q = I.makeQuestion(tier);
  if (!q) continue;
  const hasAnswer = q.options.indexOf(q.answer) >= 0;
  const dupKey = q.options.filter(o => o.charAt(0) === q.key);
  if (hasAnswer && q.options.length === 4 && dupKey.length === 1 && new Set(q.options).size === 4) qok++;
}
ok(qok === 500, `500 道题选项全部合法（${qok}/500）`);

console.log('\n=== 5. 成语词典（复活答题可写别的成语）===');
{
  const D = global.IDIOM_DICT;
  ok(!!D, '词典已加载');
  ok(D && D.size > 8000, '词典条数 ' + (D ? D.size : 0));
  ['人山人海', '飞黄腾达', '海阔天空', '得心应手', '前程似锦', '一见钟情'].forEach(w => {
    ok(D.has(w), '认得「' + w + '」');
  });
  ok(!D.has('一二三四'), '不认识的词会被拒（一二三四）');

  // 模拟 ui 的判定：原答案，或词典里首字接得上的四字成语
  function accept(v, q) {
    if (v === q.answer) return true;
    if (v.length !== 4 || v.charAt(0) !== q.key) return false;
    return D.has(v);
  }
  const q = { ask: '一鸣惊人', key: '人', answer: '人山人海' };
  ok(accept('人山人海', q), '原答案通过');
  ok(accept('人定胜天', q), '另一个「人」开头的成语也通过');
  ok(!accept('天马行空', q), '首字不对不通过');
  ok(!accept('人山', q), '字数不对不通过');

  // 题库里的答案有没有被词典收录（没收录也没关系，原答案永远算对）
  let inDict = 0, total = 0;
  ['easy', 'hard', 'expert'].forEach(tier => I.packs[tier].forEach(p => {
    total++;
    if (D.has(p[1])) inDict++;
  }));
  console.log(`  题库答案被词典收录 ${inDict}/${total}`);
  ok(inDict / total > 0.9, '题库答案绝大多数都在词典里');
}

console.log('\n' + (fail === 0 ? '全部通过 ✅' : `有 ${fail} 项失败 ❌`));
process.exit(fail === 0 ? 0 : 1);
