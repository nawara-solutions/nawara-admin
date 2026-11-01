# F1-S6b — visual evidence (financial authorization dialog)

Captured 2026-11-01 with Playwright (Chromium) against `ng serve` (demo build). The reviewer signs in as the fictional demo owner
and opens `/foundation/financial-authorization`, the development-only preview, which is never registered or bundled in production.
Styles come from the real `@nawara-solutions/design-tokens` **0.1.0**, built from `nawara-frontend` tag `design-tokens-v0.1.0`; its
tarball's sha512 equals the lockfile's `integrity`.

The receipts are the F1-S4 **demo** adapter's, labelled "simulated". The service is the preview's simulation: no Billing or Payment
command exists or is sent.

| File | Shows |
|---|---|
| `01-code-en-light.png` | Authorize a refund: target summary, both state lines, code entry with purpose and demo note |
| `02-wrong-code-en-light.png` | wrong code: the field is invalid, the error is announced, nothing is issued |
| `03-issued-en-light.png` | issued (simulated) with Core's expiry and receipt id; the financial result still reads "Not sent…"; Discard / Send |
| `04-applied-en-light.png` | the service answered "applied": only now is the result line a success; the authorization reads "used" |
| `05-discarded-en-dark.png` | Discard authorization: cancelled, secret dropped, nothing sent |
| `06-unresolved-en-dark.png` | "not settled yet": the authorization is kept only for the identical repeat; Check the result / Repeat the identical request |
| `07-unknown-replay-en-light.png` | no answer on a route with a key: the identical repeat is safe |
| `08-unknown-blocked-writeoff-en-dark.png` | no answer on a route without a key (write-off): discarded, never resent, only a check (CF-74) |
| `09-refused-service-en-light.png` | the service refused: nothing applied, the receipt spent |
| `10-nothing-changed-fr-light.png` | French: the service said nothing changed, so the same request may be sent again |
| `11-unavailable-op-en-light.png` | fraud-hold place, which Core does not offer to Admin users: refused before anything is asked |
| `12-code-ar-light.png`, `13-issued-ar-dark.png` | Arabic, right to left; machine values stay left to right |
| `14-applied-fr-dark.png` | French, dark, applied |
| `15-mobile-360-ar-dark-issued.png`, `16-mobile-360-en-light-blocked.png` | 360 px (device scale 2), Arabic issued and English blocked |
| `17-tablet-768-fr-light-code.png` | 768 px, French |
| `sheet-accents-light.png`, `sheet-accents-dark.png` | the issued state in all 11 accent palettes, light and dark |

Checked in all 39 captures:

- the moves offered match the state;
- focus is on the code, the main action, or Close when there is no move;
- `dir` is `rtl` for Arabic;
- the page has no horizontal scroll;
- `localStorage` holds only the three preference keys;
- no console message looks like a receipt secret.
