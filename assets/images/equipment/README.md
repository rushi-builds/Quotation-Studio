# Equipment photos (page 6 — Technical Specification)

The proposal uses one shared solar-module image, brand-specific inverter images
where supplied, and shared structure/engineering imagery. The card header keeps
the selected make live; inverter photos resolve through `PHOTO_MAP` and missing
brands fall back to a clean, neutral inverter image. All displayed crops use a
consistent 4:3 frame.

    assets/images/equipment/customer/
      module-universal.webp
      inverter-sungrow.webp
      inverter-growatt.webp
      inverter-fronius.webp
      inverter-deye.webp
      structure-installation.webp
      earthing-system.webp
    assets/images/equipment/crops/
      (legacy product crops and brand-specific cable images)

Register each file in `PHOTO_MAP` in `assets/js/proposal-values.js`:

    'inverter:sungrow': '../customer/inverter-sungrow.webp',
    'inverter:growatt': '../customer/inverter-growatt.webp',

Keys are tried most specific first: `kind:brand:model` → `kind:brand` → `kind`,
so one photo can cover a whole brand, or a single model can have its own.

## How a photo should look

- product alone, centred, plain white or transparent background
- no text, no watermark, no screenshot borders, no price tags
- at least 600 × 600 px; we downscale to 480 px and WebP (quality 82)
- aim for under 40 KB per file — the page loads only the four it shows

Kinds in use: `modules`, `inverter`, `mount`, `other` (cabling/earthing).
