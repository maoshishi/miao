# -*- coding: utf-8 -*-
"""
生成 js/idiom-dict.js —— 复活答题用的成语词典。

数据来源（都只取四字、纯汉字、去重）：
  1. by-syk/chinese-idiom-db          12976 条（带释义，较常用）
  2. ChID 常用成语表                    3848 条
  3. pwxcoo/chinese-xinhua             3 万余条（新华字典成语库）
  4. funNLP / THUOCL_chengyu.txt       8519 条（清华成语词库）
  5. funNLP / ChengYu_Corpus(5W).txt   5 万条（覆盖最广）

体积控制：玩家写的成语必须「首字 = 上一句的末字」，
所以只保留「题库里出现过的接龙首字」开头的成语就够了。
题库（js/idioms.js）改了之后，重新跑一次本脚本即可。

用法：
    python tools/build-idiom-dict.py                 从 ./idiom-src/ 找文件（没有就跳过）
    python tools/build-idiom-dict.py --src D:\\语料  从指定文件夹找
（游戏本身不需要重新生成，js/idiom-dict.js 已经生成好了。）
"""
import csv
import io
import json
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'idiom-src')
OUT = os.path.join(ROOT, 'js', 'idiom-dict.js')

# 文件名 -> 解析方式
FILES = [
    ('chinese-idioms-12976.txt', 'csv'),
    ('idiom_4char.txt', 'lines'),
    ('idiom.json', 'json'),
    ('thu_idioms.txt', 'tsv'),
    ('corpus_idioms.txt', 'lines'),
]


def words_of(path, kind):
    if kind == 'csv':
        raw = open(path, encoding='utf-8').read()
        return [r[1] for r in csv.reader(io.StringIO(raw)) if len(r) >= 2]
    if kind == 'json':
        return [(it.get('word') or '') for it in json.load(open(path, encoding='utf-8'))]
    if kind == 'tsv':
        return [l.split('\t')[0] for l in open(path, encoding='utf-8').read().splitlines() if l.strip()]
    return [l for l in open(path, encoding='utf-8').read().splitlines() if l.strip()]


def main():
    src_dir = SRC_DIR
    args = sys.argv[1:]
    if '--src' in args:
        src_dir = args[args.index('--src') + 1]
    files = [(os.path.join(src_dir, n), k) for n, k in FILES]

    # 题库里出现过的接龙首字
    bank = open(os.path.join(ROOT, 'js', 'idioms.js'), encoding='utf-8').read()
    pairs = re.findall(r"'([^'|]{2,6})\|([^']{2,6})'", bank)
    keys = set(a[3] for a in (p[0] for p in pairs) if len(a) >= 4)
    keys |= set(a[0] for a in (p[1] for p in pairs))
    print('题库接龙首字 %d 个：%s' % (len(keys), ''.join(sorted(keys))))

    # 先全量收集，再按首字过滤
    good = []
    seen = set()
    for path, kind in files:
        if not os.path.exists(path):
            print('  [跳过] 找不到 %s' % path)
            continue
        ws = words_of(path, kind)
        add = 0
        for w in ws:
            w = re.sub(r'\s+', '', w)
            if len(w) != 4:
                continue
            if not all('\u4e00' <= c <= '\u9fff' for c in w):
                continue
            if w in seen:
                continue
            seen.add(w)
            good.append(w)
            add += 1
        print('  %-26s %6d 条 -> 新增 %d' % (os.path.basename(path), len(ws), add))

    kept = [w for w in good if w[0] in keys]
    print('全量 %d 条，按首字筛出 %d 条' % (len(good), len(kept)))

    # 检查题库答案是否都收进来了
    miss = [p[1] for p in pairs if p[1] not in seen]
    if miss:
        print('  [提示] 题库里有 %d 个答案不在词库中（不影响：原答案永远算对）：%s' % (len(miss), '、'.join(miss[:10])))

    body = '|'.join(kept)
    js = """/* 成语词典（本文件由 tools/build-idiom-dict.py 生成，请勿手改）
 * 来源：by-syk/chinese-idiom-db、ChID 常用成语表、pwxcoo/chinese-xinhua、
 *       funNLP 的 THUOCL 成语库 与 ChengYu_Corpus(5W)。
 * 只保留「题库里出现过的接龙首字」开头的四字成语，控制体积。
 * 用途：玩家答案只要「是词典里的成语」且「首字接得上」就算通过，不必和题库原答案一字不差。
 */
(function (root) {
  var raw = '%s';
  var list = raw.split('|');
  var map = Object.create(null);
  for (var i = 0; i < list.length; i++) {
    if (list[i]) map[list[i]] = 1;
  }
  root.IDIOM_DICT = {
    size: list.length,
    has: function (w) { return map[w] === 1; }
  };
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
""" % body

    open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
    print('写出 %s  %.1f KB' % (OUT, os.path.getsize(OUT) / 1024))


if __name__ == '__main__':
    main()
