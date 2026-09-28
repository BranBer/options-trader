# src/components/desk — Desk page (Story S8)

Contract: `src/types/desk.ts` (`DeskResponse` from GET `/api/desk`,
`DeskRunSummary` from POST `/api/desk/run`, 409 while a run is in progress).
Owned by the backend developer (`src/lib/desk`, `src/app/api/desk`) — do not
edit that contract from here; if it's wrong, flag it, don't reshape it locally.

## Gotchas

- `PaperTrade.entryValue`: **positive = debit paid, negative = credit
  received** (per-share, pre-×100). `formatEntryValue` in `desk-format.ts`
  is the single place that turns the sign into a "Debit"/"Credit" label —
  don't re-derive it inline in a component.
- Dollar amounts in the contract (`entryValue`, `risk`, `pnl`, `markValue`)
  are **per-share/per-unit**; multiply by 100 for the dollar figure a trader
  reads. `desk-format.ts` does this once; call its helpers rather than
  multiplying in JSX.
- Jev readings (`PaperTradeContext.jev`) are evidence, never a probability of
  profit — every place they're rendered must carry that caption verbatim
  (`TradeRow`), even though `jev[].p` exists on the type.
- `useDeskData`/`useRunDesk` live in `src/hooks/useApiData.ts` (project
  convention: one hooks file, not a hooks folder per feature). `DeskPage`
  mocks that module directly in tests rather than wrapping in a
  `QueryClientProvider` — see `src/__tests__/components/desk-page.test.tsx`
  for the pattern other market-pulse/squeeze tests already use.
- `constants.ts` and `desk-format.ts` are flat files directly under
  `src/components/desk/` (the `src/utils/`-style exemption from the
  folder-per-component rule) — import them via `@/components/desk/constants`
  / `@/components/desk/desk-format`, never by relative path from a nested
  component folder (e.g. `TradesTable/TradeRow`).
- This page has no `QueryClientProvider` of its own — it relies on whatever
  the app root already provides for React Query.
