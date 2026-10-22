"""@fontsource/zen-maru-gothic（SIL OFL 1.1）から、太さ500と700の woff2 だけを fonts/ にコピーして CSS を作る。
使い方: python3 tools/fonts.py <展開したパッケージのフォルダ>"""
import re, sys, shutil, pathlib
src = pathlib.Path(sys.argv[1]); dst = pathlib.Path(__file__).resolve().parent.parent / 'fonts'
dst.mkdir(exist_ok=True)
css = []
for w in ('500', '700'):
    t = (src / f'{w}.css').read_text()
    t = re.sub(r",\s*url\(\./files/[^)]+\.woff\) format\('woff'\)", '', t)
    for f in re.findall(r'url\(\./files/([^)]+\.woff2)\)', t):
        shutil.copy(src / 'files' / f, dst / f)
    css.append(t.replace('./files/', './'))
(dst / 'zen-maru-gothic.css').write_text('\n'.join(css))
shutil.copy(src / 'LICENSE', dst / 'OFL-zen-maru-gothic.txt')
print(len(list(dst.glob('*.woff2'))), 'files')
