"""チェーン店のメニュー（各社が公開している栄養成分）をまとめる → data/chains.json
- 元データ：tools/chains/*.txt（各社の公式ページ・PDFから、栄養成分だけを手で写した物）
- ファイルの形：
    # チェーン名（出典・確認した日）   ← 1行目。チェーン名は「（」の前まで
    # （ほかのコメント行は無視）
    商品名 | kcal | たんぱく質 | 脂質 | 炭水化物 | 食塩相当量    ← 分からない値は -
- 店を増やす時は、tools/chains/ に txt を1つ足して、このスクリプトを動かすだけ
使い方: python3 tools/make_chains.py
"""
import json, pathlib, re, sys, unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'tools/chains'

# 検索で使う別名（読み・略し方）。チェーン名そのものは自動で入る
ALIAS = {
    'マクドナルド': 'まくどなるど マック マクド mcdonalds',
    'モスバーガー': 'もすばーがー モス mos',
    'ケンタッキーフライドチキン': 'けんたっきー ケンタ KFC',
    'CoCo壱番屋': 'ここいちばんや ココイチ ここいち カレー',
    'ミスタードーナツ': 'みすたーどーなつ ミスド',
    'くら寿司': 'くらずし 回転寿司 すし',
    'リンガーハット': 'りんがーはっと ちゃんぽん',
    'サブウェイ': 'さぶうぇい subway サンドイッチ',
    'デニーズ': 'でにーず ファミレス',
    '天丼てんや': 'てんや てんどん',
    'フレッシュネスバーガー': 'ふれっしゅねす フレッシュネス',
    'ロッテリア': 'ろってりあ',
    'ドミノ・ピザ': 'どみの ドミノ ピザ dominos',
}

def clean(s):
    s = unicodedata.normalize('NFKC', s)
    s = re.sub(r'[®™©]', '', s)
    s = s.replace('　', ' ')
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def num(x, kcal=False):
    x = x.strip()
    if x in ('-', '', '—'): return None
    v = float(x)
    if v < 0 or v > (5000 if kcal else 500): raise ValueError('ありえない値: ' + x)
    return int(round(v)) if kcal else round(v, 1)

def date_of(head):
    m = re.findall(r'(\d{4})[-.年/](\d{1,2})[-.月/](\d{1,2})', head)
    return '{}-{:02d}-{:02d}'.format(*map(int, m[-1])) if m else ''   # いちばん後ろの日付（確認した日）

def url_of(head):
    m = re.search(r'https?://[^\s）)]+', head)
    return m.group(0) if m else ''

def main():
    chains, rows, warn = [], [], []
    for path in sorted(SRC.glob('*.txt')):
        lines = path.read_text(encoding='utf-8').splitlines()
        head = lines[0]
        if not head.startswith('#'): sys.exit(f'{path.name}: 1行目は「# チェーン名（出典）」にしてね')
        name = clean(head[1:].split('（')[0])
        ci = len(chains)
        chains.append({'id': path.stem, 'n': name, 'src': clean(head[1:].split('（', 1)[1].rstrip('）')) if '（' in head else '',
                       'url': url_of(head), 'date': date_of(head), 'y': ALIAS.get(name, '')})
        seen = set()
        for i, line in enumerate(lines[1:], 2):
            if not line.strip() or line.lstrip().startswith('#'): continue
            parts = line.split('|')
            if len(parts) != 6: sys.exit(f'{path.name}:{i}: 「|」で6つに分けてね → {line}')
            n = clean(parts[0])
            if not n: sys.exit(f'{path.name}:{i}: 名前がない')
            try:
                k = num(parts[1], True); p, f, c, s = (num(x) for x in parts[2:])
            except ValueError as e:
                sys.exit(f'{path.name}:{i}: {e}')
            if k is None: sys.exit(f'{path.name}:{i}: kcal がない')
            if n in seen: continue                      # 同じ店で同じ名前は最初の1つだけ
            seen.add(n)
            # エネルギーの確かめ（たんぱく質4・脂質9・炭水化物4。お酒は合わないので除く）
            if None not in (p, f, c) and k >= 60:
                est = p * 4 + f * 9 + c * 4
                if abs(est - k) > max(40, k * 0.25) and not re.search(r'ビール|ワイン|ハイボール|サワー|チューハイ|日本酒|酒', n):
                    warn.append(f'{path.name}: {n} kcal={k} 計算={est:.0f}')
            elif p is not None and f is not None and p * 4 + f * 9 > k * 1.1 + 5:
                warn.append(f'{path.name}: {n} kcal={k} たんぱく質と脂質だけで {p*4+f*9:.0f}')
            u = '1ピース' if '1ピース' in n else '1品'
            rows.append([n, k, p, f, c, s, u, ci])
    out = {'note': '各チェーン店が公開している栄養成分（確認した日の値）。メニューや量の変更で変わることがある',
           'chains': chains, 'rows': rows}
    (ROOT / 'data/chains.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    for c in chains:
        print(f"{c['n']}: {sum(1 for r in rows if chains[r[7]] is c)}品 {c['date']}")
    print(f'合計 {len(chains)}チェーン {len(rows)}品')
    if warn:
        print('\n--- エネルギーが合わない行（元の表を見直してね） ---')
        print('\n'.join(warn))

if __name__ == '__main__':
    main()
