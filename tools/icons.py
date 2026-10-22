"""アプリのアイコン（八分目まで入ったお茶碗）を作る。python3 tools/icons.py"""
from PIL import Image, ImageDraw, ImageChops
import pathlib
OUT = pathlib.Path(__file__).resolve().parent.parent / 'icons'
AI, OK, BG = '#23457a', '#2c8a57', '#f5f7fb'
def icon(size, path, maskable=False):
    S = 2048
    im = Image.new('RGB', (S, S), BG)
    sc = (0.74 if maskable else 0.98) * 2
    def P(x, y): return (S/2 + (x-512)*sc, S/2 + (y-512)*sc)
    L, R, RIM, B2 = 170, 854, 300, 780
    def cub(t):
        x = (1-t)**3*L + 3*(1-t)**2*t*L + 3*(1-t)*t**2*R + t**3*R
        y = (1-t)**3*RIM + 3*(1-t)**2*t*B2 + 3*(1-t)*t**2*B2 + t**3*RIM
        return x, y
    pts = [cub(i/400) for i in range(401)]
    bottom = max(p[1] for p in pts)
    inner = [P(*p) for p in pts]
    d = ImageDraw.Draw(im)
    d.polygon(inner, fill='#ffffff')
    level = bottom - 0.8*(bottom-RIM)
    mask = Image.new('L', (S, S), 0); ImageDraw.Draw(mask).polygon(inner, fill=255)
    lv = Image.new('L', (S, S), 0); ImageDraw.Draw(lv).rectangle([0, P(0, level)[1], S, S], fill=255)
    im.paste(Image.new('RGB', (S, S), OK), (0, 0), ImageChops.multiply(mask, lv))
    d = ImageDraw.Draw(im)
    def stroke(points, w):
        r = w/2
        for i in range(len(points)-1):
            (x0, y0), (x1, y1) = points[i], points[i+1]
            n = max(1, int(((x1-x0)**2+(y1-y0)**2)**.5/2))
            for k in range(n+1):
                x, y = x0+(x1-x0)*k/n, y0+(y1-y0)*k/n
                d.ellipse([x-r, y-r, x+r, y+r], fill=AI)
    # 高台（足）
    stroke([P(410, bottom-14), P(428, bottom+78), P(596, bottom+78), P(614, bottom-14)], 30*sc)
    d.polygon([P(428, bottom+60), P(596, bottom+60), P(608, bottom-10), P(416, bottom-10)], fill='#ffffff')
    stroke(inner, 34*sc)
    stroke([P(L-44, RIM), P(R+44, RIM)], 46*sc)
    for i in range(13):
        x = L + 60 + i*(R-L-120)/12
        p = P(x, RIM+62); r = 9*sc
        d.ellipse([p[0]-r, p[1]-r, p[0]+r, p[1]+r], fill=AI)
    im.resize((size, size), Image.LANCZOS).save(path)
for s in (180, 192, 512):
    icon(s, OUT / f'icon-{s}.png')
icon(512, OUT / 'maskable-512.png', maskable=True)
