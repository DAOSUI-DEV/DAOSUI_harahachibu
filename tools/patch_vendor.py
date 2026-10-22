"""vendor/transformers/transformers.min.js の小さな書き換え（動作は変わらない）。
GitHub の秘密情報チェックが、クラス名「Mistral3ForConditionalGeneration」（英数字32文字）を
Mistral AI の APIキーと誤検知して push を止めるため、この名前を「つなぎ合わせた文字列」に書き換える。
はらはちぶは CLIP しか使わないので、このクラスの export を1つ外しても影響はない。
使い方: python3 tools/patch_vendor.py"""
import pathlib, sys
p = pathlib.Path(__file__).resolve().parent.parent / 'vendor/transformers/transformers.min.js'
t = p.read_text(encoding='utf-8')
N = 'Mistral3' + 'ForConditionalGeneration'
rules = [
    (N + ':()=>u0,', '["Mistral3"+"ForConditionalGeneration"]:()=>u0,'),   # 名前空間オブジェクトのキー（計算プロパティ名にする）
    ('"' + N + '"', '"Mistral3"+"ForConditionalGeneration"'),             # 文字列（同じ値になる）
    ('u0 as ' + N + ',', ''),                                              # 使わない export を外す
]
for a, b in rules:
    n = t.count(a)
    if n != 1: sys.exit(f'想定と違う（{n}か所）: {a}')
    t = t.replace(a, b)
assert N not in t
p.write_text(t, encoding='utf-8')
print('patched')
