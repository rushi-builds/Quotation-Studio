# Proposal input checklist — what to fill before sending

A working sheet for the person preparing the quotation in `quotation.html`.
Every field named below exists in the form; nothing here is theory.

**The rule behind all of it:** everything downstream of *capacity* is computed,
not typed. You supply the site facts and the price. If a number is wrong, the
cause is almost always one of the inputs listed in this sheet — not the preview.

---

## 0. What stops the download — and what only warns

Pressing **Generate & Download PDF** first runs the studio's own checks. Nothing
is produced until they pass, and the dialog tells you exactly what is wrong.

**These block the PDF.** Each one would print a wrong offer, so the button
produces the dialog instead — with a *Fix this →* link that jumps straight to
the field:

| Field | Why it is checked |
|---|---|
| **Customer name** | Printed on the cover, the executive summary and the closing page. A fresh template has no name yet, so a new proposal is blocked until you add one. |
| **Capacity (kWp)** | Drives generation, module count, roof area, subsidy, CO₂ and every financial page. |
| **Cost per Wp (₹)** | Drives investment, subsidy-share, payback, IRR and the EMI page. |
| **Payment milestones** | They are printed as a payment schedule, so they must total 100 %. Default is 50 / 40 / 10. |
| **Loan** | All-or-nothing: amount, rate *and* tenure, or leave all three empty. A half-filled loan is what the studio refuses. |

**These also block — the engineering design basis.** A figure the studio has
already computed can prove the design wrong, and then there is nothing to send:

| Check | What it caught |
|---|---|
| **Roof smaller than the shading-safe rows need** | The array needs more roof than the input says is available, once row spacing is built from the tilt and the winter-solstice sun angle. |
| **String above the inverter's DC limit** | Cold-morning open-circuit voltage of the series string exceeds the inverter's maximum DC input. The input stage fails on the first cold morning. |
| **An inverter that cannot take one module** | The single-module cold Voc is already above the limit, so no string of these modules exists. |
| **String below the MPPT floor** | At the maximum cell temperature the string voltage falls under the inverter's MPPT minimum — the inverter stops tracking. |
| **String current above the inverter input** | 1.25 × Isc × strings exceeds the inverter's DC input current (IEC 62548). |
| **Wind above the module's own class** | IS 875 uplift exceeds the module's IEC 61215 mechanical-load rating. |

**These only warn.** The dialog names them, then offers **Download anyway**,
because an unusual figure is often deliberate:

- Any number outside its expected range (e.g. degradation of 150 %).
- A subsidy override larger than the project cost.
- **Roof area exactly tight** — the rows fit, but the 0.6 m clear band around
  them could not be confirmed from the figures given.
- **Cable voltage drop over its limit** — DC above the 2 % design limit, or AC
  above the IS 732 limit of 3 %.

**And these are printed, not gated.** A missing datasheet value is not a design
fault, so it never stops the PDF — it is printed on the specification page as
**DATA REQUIRED** and listed in the panel:

- No module Voc / Vmp / Isc / Imp or inverter DC limits → string design cannot be
  checked.
- No DC or AC run length → that voltage drop cannot be checked.
- No soil resistivity → no number of earth pits is invented.
- No module weight or roof area → roof load cannot be checked.

A proposal that claims nothing it cannot support has nothing to stop for. That
is the rule the three levels exist to keep.

**When everything passes**, no dialog appears — the PDF is produced immediately
and a green notice says *"All checks passed — your download has started."* and
fades away on its own. You never have to dismiss it.

Anything else left blank degrades honestly — the affected row or page is simply
not shown. Nothing is invented.

---

## 1. Fill this every time — it is the customer's identity

**Customer & System**

- **Customer name** — as it should appear on the offer. The audio briefing
  speaks its first name in the greeting, so keep a real name here for demos.
- **Say the name as (audio, optional)** — OS voices often stumble over
  Latin-spelled Indian names ("Ru-shi-kesh", robotic). Type the name exactly
  the way it should sound — in Devanagari, e.g. `रुशिकेश`, an Indic voice
  reads it exactly as a person would — and the greeting uses it verbatim.
  Leave empty to use the typed customer name as-is.
- **Address customer as (audio greeting)** — optional. The briefing opens
  personally — "Welcome, Rushikesh sir", "नमस्कार प्रिया जी", "नमस्कार सर" —
  and by default the app detects sir/ma'am from the name: explicit titles
  (Mr./Shri, Mrs./Smt./Kumari) prove it, known names answer from a dictionary,
  unisex or unknown names take the neutral "ji", and company names never get a
  title. If the guess is ever wrong, pick Sir / Ma'am / Ji here — one click;
  "Name only" speaks the name bare. Hindi greets every gender with "जी".
  Every briefing ends with thanks in its own language.
- **Customer address** — the site, not the billing address. It is what makes the
  roof-fit and site statements meaningful.
- **Capacity (kWp)** — the contracted DC size you are quoting. Type `1`, `7`,
  `10`, whatever the deal is, and watch the rest of the sheet follow.
- **Prepared by** — optional, but the customer should know who to call back.
- **Proposal date** — defaults to today. Change it only if you are backdating.
- **Valid for (days)** — default 15. This becomes the printed "valid until" date.
- **Avg. monthly bill** — optional. Fill it if you want the bill-offset figure
  (how much of their bill the system covers) instead of a generic savings claim.
- **Proposal link** — optional, and only if you actually have a hosted URL. The
  cover QR is generated from this and is hidden when the field is empty.

**Proposals strip (top of the panel)**

- Press **New** for every new customer. That is what issues the next reference
  number in the `KTM/<year>/Solar/<NNN>` sequence and stamps today's date.
- **Duplicate** copies a similar job; **New version** bumps the minor version
  and issues a fresh reference. Never two live proposals on one number.
- Leaving the template's sample reference in place is the easiest avoidable
  mistake on this whole sheet — and the studio now watches for it. A warning sits
  under the proposal list whenever the reference is still the template sample,
  is empty, or is **already used by another proposal**; it clears as soon as the
  proposal has a number of its own.

---

## 2. Verify per site — these change with the roof and the design

**System Design & Equipment**

- **Generation (kWh/kWp/yr)** — default **1460**. This is the single most
  powerful number in the proposal: it drives generation, savings, payback and
  the CO₂ claim. Take it from the actual site study (PVsyst / Arka / your own
  yield history), not from the template. The hint under the field now shows the
  year-one kWh immediately, so you can sanity-check it in one glance.
- **Module make / rating (Wp) / length & width (mm)** — the rating decides how
  many modules the array needs, and the dimensions decide the roof area the
  array occupies. All three must match the datasheet you are quoting.
- **Module technology** — printed on the specification page.
- **Inverter make & rating (kW)** — blank falls back to 1:1 with the contracted
  capacity. Fill the real figure: the DC:AC ratio is shown as an engineering
  check.
- **Mounting structure, Cabling & protection, Roof type** — pick the real ones.
  Every list has a *Custom…* entry for anything not listed.
The engineering design basis behind every printed figure — tilt and row pitch,
IS 875 wind pressure, the IEC 62548 string check, IS 732 cable drop, IS 3043
earthing, IS/IEC 62305 lightning and roof load — has its own section: **2A**.

- **Available roof area (m²)** — **fill it.** With a figure in it the page shows
  the roof-fit verdict (required area vs available, with the clearance factor
  applied). Left blank, that whole row disappears and you lose the check.
- **Roof clearance factor** — **leave it blank.** The studio then derives it:
  raise the array to the chosen tilt and work out the row pitch that keeps the
  rows out of each other's shadow between 09:00 and 15:00 on 21 December, at the
  site's own latitude. For 15° tilt at Pune's 18.52°N that is a **1.428×**
  factor — 48 m² for 13 modules, against the flat 1.4× this sheet used to
  assume. Type a figure only to override that with your own engineering; the
  page then reads *manual factor* instead of showing the sun-angle arithmetic.

---

## 2A. The engineering design basis — the inputs behind the printed figures

The **Engineering design basis** panel holds 42 inputs. They are not decoration:
each one is either a figure you supply or arithmetic a named standard defines,
and every one of them prints on the *Technical Specification* page under
**ENGINEERING DESIGN BASIS**. Nothing is printed that is neither — a value the
studio does not have appears as **DATA REQUIRED**, never as a plausible-looking
number.

Five groups, and what each one changes on the page:

| Panel group | Inputs | What gets printed | If left blank |
|---|---|---|---|
| **Array geometry & row spacing** | Tilt, site latitude, no-shading window (± h around solar noon), clear band around the array | Row pitch in metres, the sun elevation it came from (21 December), and the roof area required — module area × the derived clearance | Tilt and latitude ship with Pune's own values (15°, 18.52°N). The window and clear band default to 3 h and 0.6 m (MNRE/UPNEDA edge clearance). |
| **Wind load — IS 875 (Part 3):2015** | Basic wind speed Vb, terrain category, building height, k1, k3, k4, net uplift coefficient, roof zone, anchors per module, module mechanical-load class | Vz = Vb·k1·k2·k3·k4, pressure pz = 0.6·Vz², then × net coefficient × roof-zone factor → N/m² on the array and N per anchor, against the module's own IEC 61215 class | Blank Vb → *DATA REQUIRED*, and no wind figure is invented. |
| **String & cable — IEC 62548, IEC 62109, IS 732** | Module Voc / Vmp / Isc / Imp and their temperature coefficients, inverter max DC voltage, MPPT minimum and maximum, inverter max DC input current, minimum ambient, maximum cell temperature, DC and AC run lengths and cable sizes | Strings in series × parallel, cold-morning string Voc against the inverter's DC limit, hot-afternoon Vmp against the MPPT floor, 1.25 × Isc × strings against the inverter's DC input current, and ΔU = 2ρLI/A for both the DC and AC runs | Any missing datasheet figure → *DATA REQUIRED*; the string configuration is not printed at all rather than guessed. |
| **Earthing & lightning — IS 3043, IS/IEC 62305** | Soil resistivity, earth resistance target, electrode length and diameter, group efficiency, thunderstorm days per year, protection level, building length and width | Single-electrode resistance R = (ρ/2πL)[ln(4L/d) − 1], parallel group R = R₁/(n × η), the number of pits that reaches the target; and Ng = 0.04·Td^1.25 with collection area A = LW + 2(L+W)H + πH² → expected strikes per year | Blank resistivity → *DATA REQUIRED*. The studio will not guess a number of earth pits. |
| **Roof load — MNRE / UPNEDA** | Module weight, racking kg/m², roof load benchmark | Dead load in kg/m² from modules and racking, against the benchmark | Missing weight or area → *DATA REQUIRED*. |

**Where the numbers come from.** Everything above is standard arithmetic, not a
rule of thumb:

- **Row pitch.** Row pitch = L·cosβ + L·sinβ / tan(altitude), with the sun
  elevation from the winter-solstice geometry at the site's latitude. No-shading
  is defined for 09:00–15:00 solar time on 21 December, so the design survives
  the worst day of the year rather than an average one.
- **Wind.** k2 is read from IS 875-3 Table 2, Class A, interpolated between the
  10 m and 15 m rows. **Above 15 m the studio refuses to extrapolate** and says
  so on the page — the table must be read for that height. The combination
  factors Kd, Ka and Kc are deliberately **not** applied and not shown.
- **String voltage.** Voc at the site's minimum ambient, Vmp at the maximum cell
  temperature — the two ends of the year, which is what IEC 62548 and
  IEC 62109 size against.
- **Cable drop.** ΔU = 2ρLI/A for the DC run and the single-phase AC run, with
  ρ for copper at its operating temperature. The DC limit is 2 %; the AC limit
  is the 3 % IS 732 allows for a power circuit.
- **Earthing and lightning.** IS 3043 electrode formulas and IEC 62305-3's
  protection-level parameters (sphere, mesh, down conductors, earth resistance).
  The lightning figure is an expected-strike count, not a verdict: whether a
  lightning protection system is provided is a risk decision that stays with the
  designer, and the page says so.

**What the page will not claim.** The roof's own structural capacity is a
structural check, not a solar calculation — the page prints the dead load and
says so. PVsyst-class yield numbers are yours to supply (see section 2); the
studio does not simulate shading, so it designs *around* shading between 09:00
and 15:00 instead. And a printed wind figure is a calculation to IS 875, not a
structural certificate.

**Reading it on the page.** The worked 7 kWp example — 13 × 545 Wp modules at
15° tilt on 18.52°N — prints as: row pitch 3.25 m from a 29.3° mid-morning sun;
required roof area 48 m² (module area × 1.43); Vz 35.5 m/s and 755.7 N/m², so
2040.5 N/m² design uplift and 1317.8 N per anchor against the module's 2400 Pa
class; 1 × 13 in series, 690 V cold against the 1100 V limit and 462 V hot
against the 200 V MPPT floor; DC drop 0.81 %, AC drop 1.34 %; 4 × 3 m pipe
electrodes at 50 Ω·m giving ≈4.0 Ω against the 5 Ω target; and 10.1 kg/m² of
roof load against the 60 kg/m² benchmark.

---

## 3. Fill per deal — this is where your price and your promises live

**Financial Assumptions**

- **Cost per Wp (₹)** — the rate you are actually quoting. Everything financial
  follows it. See section 6 — read that before your next quotation.
- **GST (%)** — default **8.9 %**, the composite EPC rate (70 % goods @ 5 % +
  30 % services @ 18 %). Change it only if the contract is structured
  differently (e.g. supply-only or services-only).
- **Blended tariff saved (₹/unit)** and **Tariff escalation (%/yr)** — default
  ₹10 and 4 %/yr. If you know the customer's slab, put their real blended tariff
  in: it is the second-largest lever on payback after the price.
- **Panel degradation (%/yr)** — default 0.5 %, from a typical warranty curve.
- **Subsidy override (₹)** — **leave it blank.** Blank means the MNRE
  *PM Surya Ghar* slabs are applied automatically, on the DC capacity actually
  installed: ₹30,000/kW for the first 2 kW, ₹18,000 for the third, capped at
  ₹78,000, residential only. Type a figure only when you are deliberately
  showing something else — it wins over the calculation, so it also becomes your
  responsibility on the page.
- **Grid CO₂ factor** — 0.71 kg/kWh, CEA CO₂ Baseline Database v21.0 for
  FY 2024-25. **Tree absorption** — 22 kg CO₂/yr, a mature tree. Both are
  defensible published figures; do not adjust them by feel.
- **Payment terms** — 50 / 40 / 10 by default; must total 100 %.

**Commercial / industrial customers only**

- **Depreciation (%)** — 40 % (IT Act Sec 32 written-down value).
- **Tax rate (%)** — the customer's slab; 25 % is assumed.
- These feed the tax-shield banner. They appear for commercial and industrial
  customer types only — residential proposals never show them.

---

## 4. Optional — fill only when you have the real data

Each of these adds a page or a section for the customer. Blank means it is not
shown, which is the honest default.

- **Cost breakdown (BOM)** — six line items: modules, inverter, structure, BOS,
  installation, net-metering. Entered, they render as a donut and table on the
  *Investment & Cost Breakdown* page — a customer-facing page. They are shown
  exactly as entered, and the page warns when the itemised total does not cover
  the quoted price. Leave blank rather than entering estimates.
- **PVsyst / Arka links** — appear as reference chips on the technical page.
  Only add links that resolve to a report for *this* site.
- **Photos** — nine slots. Blank slots fall back to the bundled stock images,
  which is fine for a first look and not fine for a signed offer.
- **Battery storage (BESS)** — off by default, and while it is off your
  solar-only proposal is untouched. Switched on, it adds two pages plus a
  separate report, and it asks for datasheet values (capacity, DoD, round-trip
  efficiency, converter limit, warranty terms). It has its own engineering
  status line and it will refuse to claim a sizing it cannot support — fill it
  from the datasheet or leave it off.
- **Additional system** — Zero Export, monitoring, EV charging, PFC, DG
  coordination or Custom. Off by default. It never invents a price: you type the
  separately agreed figure, or it shows none.
- **System options (Good / Better / Best)** — save **two or more** and the
  Options comparison page appears. One option, no page.
- **Customer experience (QR & audio)** — QR destination and public URL. The PDF
  QR is only drawn when the URL is a real `https://` link. The audio briefing is
  a browser read-out, never part of the PDF.

---

## 5. Before you send it — ten-point pre-flight

1. **New** was pressed, and the reference number and date are right.
2. Customer name and address are the customer's, not the template's.
3. Capacity matches what you actually intend to build.
4. **Generation figure** is defensible for this site.
5. **Cost per Wp** is the rate you meant to quote (see section 6).
6. Subsidy override is **blank** unless you meant to override it.
7. Payment milestones total 100 %; loan is either complete or empty.
8. The pre-flight dialog is silent. If it appears, fix the blocking items —
   the PDF is not produced until you do (see section 0).
9. Roof area is filled, so the fit verdict is on the page — and the engineering
   design basis reads without *DATA REQUIRED* on the figures that matter for
   this job (module datasheet values, cable runs, soil resistivity).
10. Set the status to **Ready** or **Sent**, press **Save now**, then
    **Generate & Download PDF** and actually read pages 1, 2, the savings page
    and the investment page before it goes out.

### Two buttons that do less than they look like they do

- **WhatsApp share** opens WhatsApp with a pre-written message — customer name,
  your company, the capacity, and the proposal link *if you filled it*. It does
  **not** attach the PDF. You still have to attach the file yourself.
- **Customer view** opens `share.html?p=<id>`, which reads the proposal out of
  **this browser's storage**. It therefore works only on your own machine: a
  customer who opens that address sees *"Proposal not found"*. Same for the
  cover QR — it points at whatever URL you typed, so only point it at something
  that genuinely resolves for them.

**Storage warning.** Autosave and *Save now* keep the proposal **in this browser
only** — there is no server. Use **Save proposal file** to write a single
proposal to a JSON file you can keep or move to another machine, and **Open
proposal file** to bring it back. Clearing browser data loses every proposal
that was not exported.

**Send the customer the PDF.** Not a link, not the customer view, not a QR
unless you have hosted the file yourself.

---

## 6. The quoted rate — now ₹63.63/Wp by default

The shipped default was ₹90/Wp (₹90,000/kWp), a carry-over from before the form
switched to ₹/Wp. It was never set from a market figure, and it sat above the
range 2026 references give for residential rooftop around Pune while the app's
own presets sat inside it. **On 2026-09-28 the default was set to ₹63.63/Wp.**

| Path | ₹/Wp | ₹/kWp |
|---|---|---|
| **Template default (a fresh proposal)** | **63.63** | 63,630 |
| Preset 3 kW | 62 | 62,000 |
| Preset 5 kW | 58 | 58,000 |
| Preset 25 kW | 48 | 48,000 |
| Preset 100 kW | 42 | 42,000 |

Reference points behind the number — residential rooftop around Pune, 2026:

- ₹59,000–85,000 for 1 kW, ~₹2.95 L for 5 kW
  ([Bluebird Solar, Pune 2026](https://bluebirdsolar.com/blogs/all/solar-panel-price-and-subsidy-in-pune-2026))
- ₹2.50–3.10 L for 5 kW, ~₹56–65/W across 1–10 kW
  ([EnergyTech Engineers, Pune 2026](https://www.energytechengineers.in/blog/solar-panel-cost-pune-2026))
- ~₹56–65/W by system size, ₹65/W at 1 kW falling to ₹56/W at 10 kW
  ([Bluebird Solar, India 2026](https://bluebirdsolar.com/blogs/all/solar-panel-installation-cost-in-india))
- MNRE's own scheme benchmark: ₹50,000/kW for the first 2 kW, ₹45,000/kW after
  ([MNRE benchmark summary](https://qbitsenergy.com/blog/solar-panel-price-india/))

What the default now produces — 7 kWp, 13 modules, 7.085 kWp installed:

| | |
|---|---|
| Project cost, ex-GST | ₹4,45,410 |
| With GST 8.9 % | ₹4,85,051 |
| Less subsidy (cap) | ₹78,000 |
| **Net investment** | **₹4,07,051** |
| Year-one generation | 10,344 kWh |
| Payback | 3.7 years |

Two things to keep in mind:

- **This is a starting point, not a price.** Overwrite the rate on every
  quotation. The presets move it too — applying a preset replaces the rate with
  that preset's own ₹/Wp, which is why the numbers above only hold for a fresh,
  untouched proposal.
- **The document prints the rate to one decimal**, so a ₹63.63/Wp entry appears
  as *₹63.6 / Wp* on the Investment page (and as ₹63.63/Wp in the panel
  summary). If the quoted rate should appear exact on the customer's copy, that
  is a one-line change — ask.
