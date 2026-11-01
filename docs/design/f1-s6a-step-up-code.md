# F1-S6a — Shared step-up code entry

| | |
|---|---|
| Status | **Implemented, in Owner review** (F1-S6a only). One flow migrated; no new authentication behaviour, no Core call, no receipt UI (F1-S6b), no D-A4 work, no Core change. |
| Admin baseline | `main` at `f070aa7` (PR #83 merged; F1-S7 PR #77 merged; no B1 PR open) |
| Design | [`f1-financial-authorization.md`](f1-financial-authorization.md) §13 (F1-S6 row); G0 audit [G0-P1-1](../audits/g0-frontend-gap-audit.md) (§7 U2) |
| Classification | LOCAL (Admin step-up flows; register in `ROADMAP.md`) |

The G0 audit found the step-up code entry copied into 11 in-app dialogs and pages. F1-S6a moves the copied **presentation** into
one component, `nw-step-up-code` (`src/app/shared/ui/step-up-code/`), and moves **one** flow onto it: **Create platform**
(`adm-create-platform-dialog`, purpose `platform.create`). The other 10 entries are unchanged (G0-P2-1, each a later, separately
authorized small PR).

## 1. What the component is

A presentational block: what the verification is for, the authenticator-code field and, in demo builds, the simulated-verification
note. Its copy is injected by the caller (`NwStepUpCodeLabels`), like every `nw-*` primitive; the caller builds it from the existing
shared `actions.stepUp.*` keys.

| Input / API | Meaning |
|---|---|
| `labels` | purpose intro, field label, hint, expired message, demo-note title (localized by the caller) |
| `purpose` | the localized description of what this one verification is for; the caller chooses it (the component never sees a purpose machine value) |
| `[(code)]` | the typed code, in the caller's signal |
| `error` | a localized error about the code; marks the field invalid |
| `expired` | shows `labels.expired` as the field error unless `error` is set |
| `busy` | read only and `aria-busy` while the verification is checked |
| `disabled` | no entry possible |
| `demoNote` | the demo builds' note (with the demo code), or `null` |
| `name`, `length` | the control's name (default `step-up-code`, as every existing entry), the code's digits (default 6) |
| `focus()` | moves focus to the code; the caller decides when |

**Code format**, from the current contracts: Core's TOTP factor is six digits (`otpauth` `digits=6`), and every existing Admin entry
that checks a shape uses `/^\d{6}$/`. The field is `inputmode="numeric"`, `autocomplete="one-time-code"`, `dir="ltr"`, no spell check.
It does **not** restrict what is typed (no `maxlength`, no client-side refusal): the migrated flow never did, and Core judges the code.

**Paste:** a pasted code whose spaces or hyphens are removed and that is then exactly six digits replaces the field's content (an
authenticator app's "123 456"). Any other paste is the browser's own; nothing is pasted while busy or disabled.

**Accessibility:** the label targets the control; `aria-describedby` lists the purpose, the hint and the error, in that order
(`nw-form-field` gained a `describedByRef` input for this; it never marks the control invalid). The purpose's intro and text are
separated by a real space, so the description reads as a sentence (in Arabic this leaves a space after the intro's final
"لـ"; the two are shown on separate lines, so only the spoken description is affected — a copy refinement for the Owner). The demo note is `role="note"`. Enter submits the caller's form.

**Direction, themes, accents, widths:** logical properties only; the code is always LTR, the rest follows the page. Colours are the
same semantic tokens the copied entries used (`--nw-surface-sunken`, `--nw-border-default`, `--nw-text-*`, `--nw-accent-orange-*`),
so the light/dark themes and the 11 accent palettes apply unchanged; the block is a single column that fits the dialog at any width.

## 2. What it never does

It obtains no grant and no receipt, chooses or changes no purpose, calls no gateway or Core API, never stores the code (no browser
storage; spies in the specs), never submits, retries or resends, and has no notion of authorization or financial completion. The
F1-S5 `FinancialAuthorizationRun` coordinator, the F1 registries and `StepUpGateway` are unchanged.

**Not in this slice:** a factor chooser. The F1 design lists one for F1-S6, but every existing entry offers only the authenticator
code, and adding passkey or secret-key entry would be new authentication behaviour. The chooser belongs with F1-S6b or a later,
separately authorized slice.

## 3. The migrated flow: Create platform

The dialog keeps its `ActionRun`, its purpose (`platform.create`), its proof (`{ method: 'totp', code }` from the typed code), its
buttons, its error mapping (`failureKey`), its focus rules (code on entering verification and after a refused code; main button after
a failure), its busy lock and its demo note. Only the verification step's markup moved into `nw-step-up-code`; three dialog style
rules moved with it.

Differences, all presentational:

- The purpose is now part of the field's `aria-describedby` (the old static `aria-describedby` was overwritten by `nwControl`'s
  binding, so it was never announced).
- A pasted "123 456" or "123-456" is entered as `123456`. Before, it was sent as pasted; the demo mock already ignored spaces, so the
  demo outcome is the same.
- `actions.stepUp.expired` added in EN/FR/AR (passed in the labels; the platform flow has no expired state, so it is never shown
  there).

## 4. Tests

| Spec | Checks |
|---|---|
| `shared/ui/step-up-code/step-up-code.spec.ts` (17) | attributes and label/description wiring; no purpose block when none; two-way code; paste normalised, other pastes untouched, ignored while busy/disabled; never writes storage; submits only through the caller's form; invalid and expired messages (error first); busy/read only and disabled; `focus()`; demo note; EN/FR/AR copy; LTR code inside an RTL page |
| `features/platforms/application/create-platform.action.spec.ts` | the 4 existing tests **unchanged and green**; 4 added: the shared entry is used, focused and described by the purpose; the proof is exactly `('platform.create', { method: 'totp', code })` per verification, a refused code stays on screen, invalid and focused, nothing written to storage; a pasted code verifies; Back keeps the name and continuing asks for a fresh code |
| `shared/ui/form-field/form-field.spec.ts` | `describedByRef` is listed first and never marks the control invalid |

Visual evidence (light/dark, an accent palette, RTL Arabic, a narrow viewport) is attached to the PR.
