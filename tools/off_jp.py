"""Open Food Facts の全データ（CSV・タブ区切り）から、日本で売られている食品で、エネルギーの値がある物だけを取り出して JSON にする。
GitHub Actions（.github/workflows/off-jp.yml）が毎月これを動かして data/off-jp.json を作り直す。
使い方: curl -sSL https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz | gzip -dc | python3 tools/off_jp.py > data/off-jp.json
データのライセンス：Open Database License（ODbL）。出典「Open Food Facts」を表示する。"""
import sys, io, json, re, datetime

COLS = ['code', 'product_name', 'brands', 'quantity', 'serving_size', 'serving_quantity', 'countries_tags',
        'energy-kcal_100g', 'energy-kj_100g', 'energy_100g', 'proteins_100g', 'fat_100g', 'carbohydrates_100g', 'salt_100g', 'sodium_100g']
NEED = ['code', 'product_name', 'countries_tags', 'energy-kcal_100g', 'proteins_100g', 'fat_100g', 'carbohydrates_100g']

def num(s):
    if s is None: return None
    s = s.strip()
    if not s: return None
    try:
        v = float(s)
    except ValueError:
        return None
    return v if v == v and abs(v) != float('inf') else None

UNIT = re.compile(r'(\d+(?:[.,]\d+)?)\s*(kg|g|ｇ|グラム|ml|mL|ｍｌ|l|L|リットル)', re.I)
def grams(text):
    """「60g」「500 ml」「1袋（60g）」から g（ml は 1ml=1g とみなす）を取り出す"""
    if not text: return None
    m = UNIT.search(text.replace('，', ','))
    if not m: return None
    v = float(m.group(1).replace(',', '.'))
    u = m.group(2).lower()
    if u in ('kg', 'l', 'リットル'): v *= 1000
    return round(v, 1) if 0 < v <= 5000 else None

def clean(s, n=80):
    s = re.sub(r'\s+', ' ', (s or '').replace('\\n', ' ')).strip()
    return s[:n]

def r1(v): return None if v is None else round(v, 1)

def main():
    inp = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8', errors='replace', newline='\n')
    header = inp.readline().rstrip('\r\n').split('\t')
    idx = {h: i for i, h in enumerate(header)}
    miss = [c for c in NEED if c not in idx]
    if miss:
        sys.exit('Open Food Facts の列名が変わった？ 見つからない列: ' + ', '.join(miss))
    get = lambda r, c: r[idx[c]] if c in idx and idx[c] < len(r) else ''
    seen, items, scanned, jp = set(), [], 0, 0
    for line in inp:
        scanned += 1
        if 'en:japan' not in line:
            continue
        r = line.rstrip('\r\n').split('\t')
        if 'en:japan' not in get(r, 'countries_tags').split(','):
            continue
        jp += 1
        code = re.sub(r'\D', '', get(r, 'code'))
        name = clean(get(r, 'product_name'))
        if not code or not name or code in seen:
            continue
        kcal = num(get(r, 'energy-kcal_100g'))
        if kcal is None:
            kj = num(get(r, 'energy-kj_100g')) or num(get(r, 'energy_100g'))
            kcal = kj / 4.184 if kj is not None else None
        if kcal is None or not (0 <= kcal <= 950):
            continue
        p, f, c = num(get(r, 'proteins_100g')), num(get(r, 'fat_100g')), num(get(r, 'carbohydrates_100g'))
        if any(v is not None and not (0 <= v <= 100) for v in (p, f, c)):
            continue
        salt = num(get(r, 'salt_100g'))
        if salt is None:
            na = num(get(r, 'sodium_100g'))
            salt = na * 2.54 if na is not None else None
        if salt is not None and not (0 <= salt <= 100):
            salt = None
        serv = num(get(r, 'serving_quantity'))
        if serv is not None and not (0 < serv <= 5000):
            serv = None
        if serv is None:
            serv = grams(get(r, 'serving_size'))
        qty = grams(get(r, 'quantity'))
        brand = clean(get(r, 'brands').split(',')[0], 40)
        seen.add(code)
        items.append([code, name, brand, round(kcal), r1(p), r1(f), r1(c), r1(salt), serv, qty])
    items.sort(key=lambda x: x[0])
    out = {
        'source': 'Open Food Facts', 'license': 'ODbL 1.0', 'url': 'https://world.openfoodfacts.org/',
        'note': 'Contains data from Open Food Facts, available under the Open Database License (ODbL). 日本で売られている食品のうち、エネルギーの値がある物だけを取り出した（100gあたり）',
        'made': datetime.date.today().isoformat(),
        'cols': ['code', 'name', 'brand', 'kcal', 'protein', 'fat', 'carb', 'salt', 'serving_g', 'package_g'],
        'items': items,
    }
    json.dump(out, sys.stdout, ensure_ascii=False, separators=(',', ':'))
    print(f'rows scanned {scanned}, japan {jp}, kept {len(items)}', file=sys.stderr)

if __name__ == '__main__':
    main()
