# R0 Core alignment evidence (F0)

Owner review evidence for the Core-aligned Admin V2 master roadmap (R0) and the F0 documentation alignment.

| | |
|---|---|
| Owner decision | 2026-10-30: the roadmap's **direction** approved as a planning baseline; **F0 only** authorized (documentation and contract reconciliation inside Admin). The roadmap itself is **not** an approval of any later slice (F1–F16) |
| Core revision | `nawara-solutions/nawara-core` `main` = `0044b20cc7278c1d23d71ee1a39c3d8ab9118db9` (PR #409 merge), verified 2026-10-30T20:30:48Z by `git ls-remote`; read-only clone, nothing written to Core |
| Admin revision | `cf4b1a9998f2b1ca4192f691f602a1067155e903` (PR #51 merge) |
| Not accessed | production, Nawara Lab 01, deployed infrastructure |

## Files

| File | Content |
|---|---|
| [`master-roadmap.md`](master-roadmap.md) | the complete R0 master roadmap as delivered to the Owner. Only the file locations in its §0.3 and §4.1 were changed from the session scratchpad to this folder |
| [`core-routes.tsv`](core-routes.tsv) | the source-derived Core HTTP route inventory at `0044b20`: service, method, path, file, line, handler (208 rows, no header) |
| [`core-routes-auth.tsv`](core-routes-auth.tsv) | the same 208 routes with the class-level (`CLS[...]`) and method-level (`M[...]`) authorization decorators found next to each handler |
| [`tools/routes.py`](tools/routes.py), [`tools/routes2.py`](tools/routes2.py) | the scripts that produced the two inventories (`python3 -I tools/routes.py <nawara-core checkout>`) |

SHA-256: `core-routes.tsv` `c1a8313cb14b6cbcc9bdc975dc36937a1e39a4101c8055560c46766b613cd824`;
`core-routes-auth.tsv` `a2253218eb2e0a91ea79c5c911cc8e6e95fbc515e4127f41e2b6acdb69ceaf6f`.

## Errata

The files here are kept exactly as delivered. Corrections found later are recorded, dated, in
[`CORE-INTEGRATION.md` §11.12](../../CORE-INTEGRATION.md#1112-errata-f1-s0-2026-10-30) (F1-S0, 2026-10-30): receipt issuance
and Audit legal holds take the step-up as **body** `stepUpToken` (this roadmap's §9.3 and §11.2 say header), and a receipt secret
may have to stay in memory for one intent.

## Limits of this evidence

- The inventory is **source-derived**: it counts controller handlers under `apps/*/src`, not routes mounted by `libs/service-kit`
  (health, docs), and not what any environment serves. 56 of the 208 handlers are in modules that mount nothing in production
  ([`CORE-INTEGRATION.md` §11.3](../../CORE-INTEGRATION.md#113-production-refused-modules)).
- The authorization column is a **decorator heuristic**. Several services check the actor inside the handler (Audit's owner reads,
  Payment's `ServiceOrUserGuard` routes), so an empty `M[]` does not mean "public". Core decides authority per request.
- The original Core handoff and its 208-route appendix were not available; the count agrees, the identity of the two sets is
  unproven.
- Nothing here is deployment or operational evidence.

The reconciled contract states, the financial register and the Core follow-ups derived from this evidence are in
[`docs/CORE-INTEGRATION.md`](../../CORE-INTEGRATION.md) §11 and §9 (CF-65 to CF-73), and the plan in
[`docs/ROADMAP.md`](../../ROADMAP.md#r0--f0-core-v2-alignment-owner-authorized-2026-10-30).
