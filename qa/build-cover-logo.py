"""Prepare transparent light/dark-background lockups from the approved cover.
Run: python qa/build-cover-logo.py (requires ImageMagick).
The source shapes/orange artwork are extracted, not redrawn. The navy matte is
removed; originally white letterforms become navy on light pages, white on dark.
The original full cover and archival pixel crop are never modified.
"""
from pathlib import Path
import subprocess
ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'assets/ktm-cover-page-1.png'
assert subprocess.check_output(['identify', '-format', '%wx%h', str(source)]).decode() == '1060x1484'
w, h = 304, 180
rgb = subprocess.check_output(['convert', str(source), '-crop', f'{w}x{h}+62+62', '+repage', '-depth', '8', 'rgb:-'])
def clamp(x): return max(0, min(1, x))
for variant, ink in [('light', (17, 42, 62)), ('dark', (248, 250, 252))]:
    rgba = bytearray()
    for i in range(0, len(rgb), 3):
        r, g, b = rgb[i:i+3]
        # Orange/brown artwork separates from the blue matte in the red-blue
        # channel difference. Neutral white letterforms separate by luminance.
        orange = clamp((r - b - 8) / 35) if r > g else 0
        white = clamp((min(r, g, b) - 40) / 150)
        alpha = max(orange, white)
        if alpha < 0.02:
            rgba.extend((0, 0, 0, 0))
            continue
        if orange > white:
            # Decontaminate antialiased edges from the navy background.
            color = tuple(round(max(0, min(255, (c - (1-alpha)*bg)/alpha)))
                          for c, bg in zip((r,g,b), (10,27,43)))
        else:
            color = ink
        rgba.extend((*color, round(alpha * 255)))
    subprocess.run(['convert', '-size', f'{w}x{h}', '-depth', '8', 'rgba:-',
                    str(ROOT / f'assets/images/ktm-logo-{variant}.png')], input=rgba, check=True)
