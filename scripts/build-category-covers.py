"""Compose category photos into the approved cover; never regenerate its branding.
Requires Pillow. Run from any directory: python scripts/build-category-covers.py
4096px long-edge outputs are resampled compositions, not native-4K AI photographs.
The original residential PNG is read-only and remains the residential default.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps, ImageChops

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets/images'
original = Image.open(ASSETS / 'cover-editable-background.png').convert('RGB')
height = 4096
width = round(original.width * height / original.height)
size = (width, height)
base = original.resize(size, Image.Resampling.LANCZOS)
# Coordinates in the approved 1060 x 1484 layout. Keep the navy panel,
# gold diagonal, top-right slogan, KPI strip and footer completely intact.
kx, ky = width / 1060, height / 1484
point = lambda x, y: (round(x*kx), round(y*ky))
polygon = [(380,0),(1060,0),(1060,1216),(552,1216),(379,998),(551,598)]
mask = Image.new('L',size)
ImageDraw.Draw(mask).polygon([point(x,y) for x,y in polygon],fill=255)
# Preserve the existing slogan and sky at the top; blend into the new sky
# before any building pixels. This avoids regenerating or retyping artwork.
fade = Image.new('L',(1,height))
fade.putdata([round(255*max(0,min(1,(y/ky-150)/150))) for y in range(height)])
mask = ImageChops.multiply(mask,fade.resize(size))
x0,y0 = point(376,0)
x1,y1 = point(1060,1216)
for category in ('commercial','industrial','rwa'):
    scene = Image.open(ASSETS / f'cover-{category}-scene.jpg').convert('RGB')
    photo = ImageOps.fit(scene,(x1-x0,y1-y0),method=Image.Resampling.LANCZOS)
    layer = base.copy()
    layer.paste(photo,(x0,y0))
    result = Image.composite(layer,base,mask)
    destination = ASSETS / f'cover-{category}-background.webp'
    result.save(destination,'WEBP',quality=96,method=6)
    print(destination.name, result.size)
