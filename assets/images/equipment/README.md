# Equipment photos (page 6 — Technical Specification)

One photograph per card, in `cards/`. Page 6 shows four cards, so exactly four
photos are needed — the make is printed on the card itself as its real logo,
not encoded in the file name:

    assets/images/equipment/cards/
      solar-module-card.webp        # card 01 - solar modules
      solis-inverter.webp           # card 02 - inverter
      mount-structure-callouts.webp # card 03 - mounting & cabling
      earthing-safety-3pit.webp     # card 04 - electrical safety (LA / DC / AC)

`assets/js/proposal-v2.js` maps each card kind to its file in `CARD_PHOTO`.
Swapping a photo means replacing the file, not editing any code.

Everything in this folder comes from the owner's `5&6 pages` Drive folder. Do
not add brand-wise spares here: whichever make a quotation names, the card keeps
its one photograph and the brand identity is carried by the logo badge.

## Brand marks

The page 6 badge prints `assets/images/brands/<make>.webp` — fifteen marks cut
from the owner's brand sheet (`All Brands logos sheet .png`). `BRAND_LOGOS` in
`proposal-v2.js` maps a make name to its file. A brand with no mark on the sheet
falls back to its name set in type, so the badge is never empty.

## How a photo should look

- the product alone, centred, plain light background — or a diagram where the
  card explains a part rather than sells it
- 4:3 landscape reads best on the card; 900 x 675 is what ships today
- keep each file under ~120 KB — the page loads only the four it shows
