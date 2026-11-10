# Equipment photos (page 6 — Technical Specification)

One photograph per card, in `cards/`. Page 6 shows four cards, so exactly four
photos are needed - the brand is printed on the card itself, not encoded in the
file name:

    assets/images/equipment/cards/
      solar-module-card.webp      # card 01 - solar modules
      solis-inverter.webp         # card 02 - inverter
      ars-structure.webp          # card 03 - mounting & cabling
      earthing-safety-3pit.webp   # card 04 - electrical safety (LA / DC / AC)

`assets/js/proposal-v2.js` maps each card kind to its file in `CARD_PHOTO`.
Swapping a photo means replacing the file, not editing any code.

## How a photo should look

- the product alone, centred, plain light background
- no text overlay, no watermark, no screenshot borders, no price tags
- 4:3 landscape reads best on the card; 900 x 675 is what ships today
- keep each file under ~120 KB - the page loads only the four it shows
