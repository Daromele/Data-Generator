# Calculations

Most of the engine is generic. The numbers are not, and a plausible-but-wrong
number is the defect most likely to reach a buyer unnoticed — it does not throw,
it does not look broken, and the buyer may act on it.

Treat every computed figure as code that must be tested before it is believed.

## Test first, and prove the test can fail

1. Work the expected answer out **by hand or by an independent method** before
   writing the implementation.
2. Write the test.
3. Run it against the *unfixed* code and watch it fail.
4. Implement. Watch it pass.

Step 3 is not optional. Two real failures from this family:

- **A fixture that compared nothing.** The debt-payoff test sorted both the
  snowball and the avalanche results into the same order, so it asserted that a
  list equalled itself. It passed continuously and measured nothing. The same
  flaw then reached the demo data, where the comparison showed a £0 saving — the
  bug was visible in the product before it was visible in the suite. Fixed by
  adding a 0%-interest family loan with a low minimum, which forces the two
  strategies apart.
- **A hand-guessed expectation.** I asserted total interest of $54.99 from
  rough arithmetic. The month-by-month calculation gives **$58.98**. The code
  was right; my expectation was wrong. If an assertion disagrees with the code,
  recompute the assertion properly before touching the implementation.

## Money

- Compute in integer minor units (pence/cents) or accept and document the
  rounding. Never round mid-calculation and then sum.
- **Iterate month by month** for anything with interest. Closed-form formulas
  silently disagree with the monthly reality buyers see on their statements —
  and the statement is what they will compare against.
- Round once, at display.
- Format with `formatMoney()`; currency is a setting, never hard-coded.

## Dates

- `null >= 0` is `true` in JavaScript. An undated record therefore matched
  *every* due bucket until `matchesDueBucket()` explicitly rejected null. Any
  comparison against a possibly-missing date needs an explicit null branch.
- Compute day differences from local midnight to local midnight, or a record
  due today reads as overdue after noon.
- `DUE_SOON_DAYS = 60`. See `assets/due-dates.js`.

## Domain rules

Rules that vary by state, country or year must be **entered by the buyer**, not
hard-coded:

- credit-hour and attendance requirements
- grading scales and GPA weighting
- tax brackets and categories
- retention periods

Hard-coding them guarantees the app is wrong for most buyers and stale for all
of them next year. Provide sensible defaults the buyer can edit, and label them
as defaults.

Research anything regulated before implementing it, and say in the app and the
listing that it tracks what the buyer enters and gives no legal, tax, medical
or financial advice.

## Demo data must demonstrate

Demo data has two jobs: make the app look alive, and **exercise every feature
visibly**.

- Anchor dates to *today* at load (offsets, never literals), so there is always
  something overdue, something due soon and something done. Hard-coded dates
  make a six-month-old app look abandoned.
- Make each feature produce a visible, non-trivial result. If the saving is £0,
  the comparison chart is flat or every entity has one record, the feature looks
  broken even though it works. The debt-payoff demo showed £0 for exactly this
  reason.
- Include awkward values on purpose: an apostrophe and an ampersand in a name, a
  long note, an empty optional field, a zero.

## Charts

Chart.js draws whatever it is given. Check the axis range, that a single data
point renders, and that an empty section shows an empty state rather than an
axis with nothing on it.

## Totals

`totalField` sums the on-screen filtered set. Make the printed total agree with
the screen total for the same filter — a mismatch is the kind of thing a buyer
photographs and puts in a review.
