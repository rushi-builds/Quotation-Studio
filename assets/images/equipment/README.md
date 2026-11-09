# Equipment photos (page 6 — Technical Specification)

One file per brand, per kind. The page picks them up by itself; a brand without
a photo falls back to the neutral render of its kind, so nothing ever shows a
hole.

    assets/images/equipment/
      waaree-module.webp
      panasonic-module.webp
      sungrow-inverter.webp
      growatt-inverter.webp
      solartech-structure.webp
      polycab-cable.webp

Register each file in `PHOTO_MAP` in `assets/js/proposal-values.js`:

    'module:waaree'   : 'waaree-module.webp',
    'inverter:sungrow': 'sungrow-inverter.webp',

Keys are tried most specific first: `kind:brand:model` → `kind:brand` → `kind`,
so one photo can cover a whole brand, or a single model can have its own.

## How a photo should look

- product alone, centred, plain white or transparent background
- no text, no watermark, no screenshot borders, no price tags
- at least 600 × 600 px; we downscale to 480 px and WebP (quality 82)
- aim for under 40 KB per file — the page loads only the four it shows

Kinds in use: `modules`, `inverter`, `mount`, `other` (cabling/earthing).
