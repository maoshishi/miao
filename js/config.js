/* ==========================================================
   咪了个喵 · 配置
   想改难度、改猫猫名字，改这个文件就够了
   ========================================================== */
window.MLM_CONFIG = {

  /* 版本号：每次发版 +1。
     要和 index.html 的 <meta name="mlm-version" content="9">、sw.js 里的
     var V = 'mlm-v9'、以及 index.html 里所有 ?v=9 保持一致（数字对上就行）。
     页面加载完会自动比对服务器上的版本，发现更新就自己重载一次。 */
  VERSION: 9,

  /* 猫窝位置数：满了就“猫窝已满” */
  SLOT_COUNT: 7,

  /* 每局开局送的三个道具各几个 */
  START_TOOLS: { out: 1, undo: 1, shuffle: 1 },

  /* 卡面图片目录（prepare-images.bat 生成到这里） */
  IMAGE_DIR: 'picture/cards/',
  IMAGE_EXTS: ['png', 'jpg', 'jpeg', 'webp', 'svg'],

  /* 最多识别多少种卡牌（代号 01 ~ 17） */
  MAX_TYPES: 17,

  /* 卡牌名单，顺序 = 编号 01,02,03...
     前 11 个是猫，后 6 个是猫咪玩具
     name 用在“素材缺失”时的占位文字，color 是占位底色 */
  CATS: [
    { name: '橘猫',     color: '#FFCF9B' },
    { name: '三花猫',   color: '#FFC7C7' },
    { name: '狸花猫',   color: '#D6BC93' },
    { name: '奶牛猫',   color: '#D9D9D9' },
    { name: '黑猫',     color: '#B9B9C4' },
    { name: '白猫',     color: '#E9E4D6' },
    { name: '英短蓝猫', color: '#BCC6D6' },
    { name: '布偶猫',   color: '#E4D3F0' },
    { name: '暹罗猫',   color: '#CBB7A6' },
    { name: '银渐层',   color: '#DCE3EA' },
    { name: '玄猫',     color: '#B7B7C6' },
    { name: '猫包',     color: '#BFD8EE' },
    { name: '猫砂铲',   color: '#CFE0EA' },
    { name: '猫粮',     color: '#F5DCA5' },
    { name: '玩具鼠',   color: '#CDBBA8' },
    { name: '逗猫棒',   color: '#F3C6C0' },
    { name: '鱼骨头',   color: '#C9D7E4' }
  ],

  /* ----------------------------------------------------------
     关卡难度（所有局都是同一套摆法：中间密堆 + 四角牌堆 + 两侧散牌）
     style   'hell' 中间密堆 / 'grid' 老式网格（已经不用了，留着备用）
     types   本局用几种猫
     layers  叠几层（第 1 局 1 层、第 2 局 3 层、地狱 7 层）
     cols/rows  中间那坨几列几行（所有局一样，牌才一样大）
     stagger 奇数层错开多少（0.5 = 错半张牌，最经典）
     sideStacks / stackSize  四角的扇形牌堆：几摞、每摞几张
     sideCards  两侧中间竖排的散牌（每边几张）
     sparseTop  最上面那层只铺 2/5 的格子（亮牌散在暗牌上）
     idiom   复活答题的成语难度：easy / hard / expert
     ---------------------------------------------------------- */
  LEVELS: [
    /* 第 1 局：图一那种 —— 3×3 的格子，上面一行叠 3 张、中间 2 张、下面 1 张，共 18 张 */
    { types: 6,  style: 'pic', cols: 3, rows: 3, cellGap: 0.16, stackStep: 0.13,
      rowStacks: [3, 2, 1], idiom: 'easy', diff: '简单' },

    /* 第 2 局：中间密堆 3 层（两层实心 + 一层稀疏顶层），加上四角牌堆和两侧散牌 */
    { types: 9,  style: 'hell', layers: 3, cols: 5, rows: 7, stagger: 0.5,
      sideStacks: 4, stackSize: 2, sideCards: 2, sparseTop: true,  idiom: 'hard', diff: '中等' },

    /* 第 3 局起：同样的牌面范围，往上叠 9 层，15 种猫，336 张 */
    { types: 15, style: 'hell', layers: 9, cols: 5, rows: 7, stagger: 0.5,
      sideStacks: 4, stackSize: 6, sideCards: 2, sparseTop: true, sparseFill: 4,
      idiom: 'expert', diff: '地狱' }
  ],

  /* 第 4 局往后都是同一个“地狱” */
  levelConfig: function (level) {
    var L = this.LEVELS;
    var c = (level <= L.length) ? L[level - 1] : L[L.length - 1];
    return {
      types: c.types,
      style: c.style || 'hell',
      layers: c.layers || 1, cols: c.cols, rows: c.rows,
      stagger: c.stagger || 0,
      sideStacks: c.sideStacks || 0,
      stackSize: c.stackSize || 0,
      sideCards: c.sideCards || 0,
      sparseTop: !!c.sparseTop,
      sparseFill: c.sparseFill || 2,
      cellGap: c.cellGap,
      stackStep: c.stackStep,
      rowStacks: c.rowStacks,
      idiom: c.idiom, diff: c.diff
    };
  },

  /* 卡片宽高比（高 = 宽 * 1.15） */
  CARD_ASPECT: 1.15,

  /* 牌桌的“设计尺寸”，单位是一张牌的宽：
     所有难度都按这个尺寸算牌的大小（再按屏幕缩放到放得下），
     所以第 1 局和第 20 局的牌一样大，不会这局大那局小。
     7.12 = 左右各一列散牌(1) + 中间 5 列 + 两条缝
     8.625 = 中间 7 行(7 × 1.15) + 顶层错开的半张 */
  UNIT_W: 7.12,
  UNIT_H: 8.625
};
