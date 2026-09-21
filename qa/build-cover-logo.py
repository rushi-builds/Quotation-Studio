"""Extract the approved logo without redrawing it. Requires ImageMagick.
Run: python qa/build-cover-logo.py
The navy-backed 304x180 tile is an exact pixel crop of the original cover.
"""
from pathlib import Path
import subprocess
ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'assets/ktm-cover-page-1.png'
assert subprocess.check_output(['identify', '-format', '%wx%h', str(source)]).decode() == '1060x1484'
subprocess.run(['convert', str(source), '-crop', '304x180+62+62', '+repage',
                str(ROOT / 'assets/images/ktm-cover-logo.png')], check=True)
