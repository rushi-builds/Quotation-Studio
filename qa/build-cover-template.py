"""Make the editable cover background from the original supplied artwork.

Requires ImageMagick `convert`. Only the seven variable-value rectangles are
cleared; the supplied PNG stays untouched. Coordinates refer to its 1060x1484
pixels. Matching HTML text is rendered over these areas using existing state IDs.
Run from the repository root: python qa/build-cover-template.py
"""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/ktm-cover-page-1.png'
TARGET = ROOT / 'assets/images/cover-editable-background.png'
W, H = 1060, 1484
# The cover is 794 CSS px wide and the PDF export captures at scale:2, so store
# 1588 px of real pixels; otherwise the browser upscales 1060 and it looks soft.
OUT_W, OUT_H = 1588, 2223
K = OUT_W / W
size = subprocess.check_output(['identify', '-format', '%w %h', str(SOURCE)]).decode()
assert size == f'{W} {H}', 'Recalibrate rectangles if the source artwork changes.'
pixels = bytearray(subprocess.check_output([
    'convert', str(SOURCE), '-filter', 'Lanczos', '-resize', f'{OUT_W}x{OUT_H}',
    '-unsharp', '0x0.75+0.65+0.02', '-depth', '8', 'rgb:-']))
assert len(pixels) == OUT_W * OUT_H * 3, len(pixels)
RECTS = [
    (68, 975, 305, 38),     # customer name
    (242, 1035, 135, 24),   # location
    (242, 1071, 100, 23),   # system size
    (242, 1107, 122, 24),   # proposal reference
    (242, 1144, 162, 25),   # proposal date
    (246, 1290, 205, 54),   # project capacity KPI
    (718, 1290, 285, 54),   # projected savings KPI
]
# Interpolate the navy panel at each row using clean pixels beside the text.
# No generative changes, resizing, or recompression of the original asset.
for rx, ry, rw, rh in RECTS:
    x, y = round(rx * K), round(ry * K)
    width, height = round(rw * K), round(rh * K)
    for row in range(y, y + height):
        left = (row * OUT_W + x - 2) * 3
        right = (row * OUT_W + x + width + 2) * 3
        a, b = pixels[left:left + 3], pixels[right:right + 3]
        for col in range(width):
            t = (col + 1) / (width + 1)
            idx = (row * OUT_W + x + col) * 3
            pixels[idx:idx + 3] = bytes(round(a[c] * (1-t) + b[c] * t) for c in range(3))
subprocess.run(['convert', '-size', f'{OUT_W}x{OUT_H}', '-depth', '8', 'rgb:-', '-define', 'png:compression-level=9', str(TARGET)], input=pixels, check=True)
print(TARGET)
