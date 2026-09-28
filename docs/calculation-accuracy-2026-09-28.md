# Calculation accuracy review — 28 September 2026

Audit of the input → calculation chain (`capacity` → modules → generation →
savings → subsidy → environment), with every assumption checked against a
published source. No layout, copy, styling or workflow behaviour was changed;
the only new control is one numeric field.

---

## 1. Verified already correct (left untouched)

| Item | Finding | Source |
|---|---|---|
| **GST 8.9 %** | Correct. Post-22 Sep 2025 the 70:30 composite rule gives `(0.70 × 5 %) + (0.30 × 18 %) = 8.9 %`, down from the earlier ~13.8 %. | GST Council / MNRE, effective 22 Sep 2025 |
| **Subsidy slabs** | Correct and unchanged in 2026: ₹30,000/kW for the first 2 kW, ₹18,000 for the 3rd kW, capped at ₹78,000. Residential only. | PM Surya Ghar: Muft Bijli Yojana |
| **Module count** | `ceil()` with a floating-point round-off guard; 54,600 sizing scenarios already cover the ±1 W boundary. | `qa/engineering-boundaries.test.js` |
| **EMI / IRR / payback** | Standard reducing-balance EMI, bisection IRR with a sign-change guard, and interpolated payback on the same cumulative-savings curve the chart draws. | `qa/finance.test.js`, `qa/release-audit.test.js` |

A GST change was expected during this review and did **not** materialise — the
existing 8.9 % default was already the current figure.

---

## 2. Fixed

### 2.1 Generation used the contracted capacity, not the installed array

A 7 kWp contract at 545 Wp is `ceil(7000/545) = 13` modules = **7.085 kWp**
installed. Page 6 printed 7.085 kWp while page 9 computed generation from
7.000 kWp, so the document contradicted itself:

| | Before | After |
|---|---|---|
| Generation | 7.000 × 1460 = **10,220 kWh** | 7.085 × 1460 = **10,344 kWh** |

The engine now carries both figures explicitly:

- `contractedKwp` — what the customer agreed. The **quoted investment stays on
  this**, so selecting a different module never moves the agreed price.
- `installedKwp` — what physically gets built. **All physics follows this**:
  generation, subsidy, area, DC/AC ratio, CO₂.

`capacityExact` reports whether whole modules land exactly on the contract; the
Tech Spec page prints the contracted figure beside the installed one whenever
they differ, and `costPerWpDelivered` exposes the delivered ₹/Wp separately from
the quoted rate.

### 2.2 Subsidy was assessed on the contracted capacity

PM Surya Ghar CFA is assessed on the DC capacity actually installed and
registered with the DISCOM. Below the 3 kW slab this changed real money:

| Contracted | Modules @ 545 Wp | Installed | Before | After |
|---|---|---|---|---|
| 2 kWp | 4 | 2.18 kWp | ₹60,000 | **₹63,240** |
| 2.5 kWp | 5 | 2.725 kWp | ₹69,000 | **₹73,050** |

At and above 3 kWp the ₹78,000 cap absorbs the difference, so larger proposals
were unaffected. Commercial/industrial stay nil, and an explicit override still
wins.

### 2.3 Grid emission factor was outdated

`0.79 → 0.71` kg CO₂/kWh. CEA *CO₂ Baseline Database* **Version 21.0**
(Nov 2025), FY2024-25 all-India weighted average = **0.710 tCO₂/MWh**. The 0.79
figure was several years old and overstated CO₂ by roughly 11 %.

### 2.4 Tree-equivalent factor was overstated

`58.4 → 22` kg CO₂/tree/year. A mature tree absorbs **20–25 kg/yr** (the widely
used EPA-derived figure); 58.4 overstated tree counts by ~2.7×. At 7 kWp the
page previously claimed 138 trees when the same CO₂ equates to ~334.

### 2.5 Roof area fit-check understated the requirement

The check compared bare module area with the available roof and reported
"fits ✓". Module area is not roof area — walkways, parapet setback and inter-row
shadow spacing need extra space, so a 34 m² array was reported as fitting a
35 m² roof.

The check now applies an explicit **roof clearance factor**, printed on the page
(`Roof Area Required: 48 m² (module area × 1.4 clearance)`) rather than hidden
inside the verdict. The new field is editable:

| Layout | Factor |
|---|---|
| Flush / parallel-mounted rows | 1.1 – 1.2 |
| Typical tilted RCC terrace | 1.4 (default) |
| Wide inter-row spacing | 1.8 – 2.0 |

Values below 1 are clamped to 1 (bare module area is the floor).

---

## 3. Conservative defaults

These are business assumptions, not corrections, but the shipped defaults were
optimistic enough to invite challenge. Both remain editable per proposal.

| Assumption | Before | After | Reason |
|---|---|---|---|
| Blended tariff saved | ₹15/unit | **₹10/unit** | ₹15 sat above even the top MSEDCL slab. Blended LT-1 residential rate for a ~400-unit consumer is ≈₹10.3/unit including electricity duty and fixed charges. |
| Tariff escalation | 6 %/yr | **4 %/yr** | 6 % compounded to ₹64/unit by year 25. 4 % is a defensible long-run Indian tariff CAGR. |

Effect on the default 7 kWp proposal: lifetime savings ₹78.09 L → ₹40.18 L and
payback 3.6 → 5.4 years. The new figures are lower but defensible in front of a
customer, which was the stated goal.

`genFactor` (1460 kWh/kWp/yr) was reviewed and **retained**: at 4.00 units/kWp/day
it is reasonable-to-conservative for Pune. `unitsPerKwpDay` and `cufPercent`
(16.67 %) are now derived and exposed for verification.

---

## 4. Deliberately not changed

- **Maharashtra state top-up subsidy — not added.** The only live state scheme is
  the MSEDCL **SMART** scheme (₹330 cr FY25-26, ₹325 cr FY26-27). It is *not* a
  universal top-up: it is restricted to **BPL/EWS households consuming under
  100 units/month**, at a fixed 1 kW benchmark (₹17,500 state for BPL, ₹15,000
  SC/ST, ₹10,000 others, alongside the ₹30,000 central CFA). Reported "₹15,000/kW
  up to 3 kW" figures were not verifiable as a general entitlement. The existing
  **`subsidyOverride` field already covers this case** for eligible customers, so
  no new automatic calculation was introduced.
- **First-year degradation** — the model starts at full `genFactor`, which
  already bundles real-world losses (soiling, temperature, inverter, LID). This
  is standard practice and matches the page's stated basis.
- **Pricing basis** — the quoted ₹/kWp stays on contracted capacity. Rounding up
  to whole modules always lands *at or above* the contract, so the customer
  never receives less than they paid for.

---

## 5. Verification

`npm --prefix qa test` — **634 passed, 0 failed** (474 before this review).

New coverage includes: installed-vs-contracted separation, subsidy at the
installed-capacity slab boundary, clearance-factor clamping and live re-render,
`capacityExact`, delivered ₹/Wp, derived CUF, and the environmental defaults.

### 5.1 Permanent reconciliation suite

Two new files were added so this audit stays enforceable rather than being a
one-off:

- **`qa/reconcile.test.js` (83 tests)** — recomputes every figure the engine
  returns using deliberately different methods: ratio-rounding instead of the
  epsilon-guarded `ceil`, marginal-rate integration instead of slab piecewise,
  closed-form geometric sums instead of iterative multiplication, a full
  amortisation schedule instead of the closed-form EMI, and high-precision
  bisection instead of the engine's early-exit IRR. The whole 25-year
  generation/tariff/saving/cumulative series is compared term by term across a
  1 → 500 kWp sweep and 24 edge cases. It ends with the printed 7 kWp hand
  calculation, so the arithmetic a reviewer repeats on paper is asserted.
- **`qa/reconcile-render.test.js` (48 tests)** — boots the real app in jsdom,
  drives the real capacity input, and reads each figure back **out of the DOM**
  at 1, 2, 2.5, 3, 7, 10, 25 and 100 kWp. This catches a renderer that drifts
  from the engine even when the engine is correct, and asserts the pages agree
  with each other (summary vs savings page vs investment cards).

**Mutation-tested to prove the suite has teeth.** Deliberately reintroducing
each defect was confirmed to fail the suite:

| Injected regression | Caught by |
|---|---|
| Generation back on the contracted capacity | reconcile 44 failures, render 9 |
| Subsidy back on the contracted basis | reconcile 6, render 7 |
| CO₂ default back to 0.79 | reconcile 49 |
| Tree factor back to 58.4 | reconcile 48 |
| Clearance factor no longer applied | render 1 |
| Any reviewed default changed in the HTML form or in `state.js` | render 1–3 |

That last row exposed a real gap during development: reading the live form value
and computing the expectation from it is **tautological** — the test would simply
follow whatever the default became. The suite now pins both default sources,
because boot reads `StateStore.DEFAULTS` while "New proposal" reads the HTML
`value` attributes.

Browser suites (`test:browser`) had their expected figures recomputed against the
new engine and updated; they require a dev server and Chromium, which the review
environment could not provide, so they were not executed here.

Files changed: `assets/js/finance.js`, `assets/js/state.js`, `assets/js/render.js`,
`quotation.html`, the affected `qa/` expectations, and the two new reconciliation
suites. No CSS, content, model, export or workflow file was touched.
