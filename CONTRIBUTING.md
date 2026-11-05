# Contributing / Katkı

Türkçe ya da İngilizce yazabilirsiniz. You can write in Turkish or English.

## Reporting a bad plan

Attach a **share link**. It reproduces vehicle, cargo and rules exactly. If you know a better arrangement from real loading, describe it; those cases make the planner better.

## Development

```bash
npm ci
npm run dev
npm test
npm run typecheck
```

- Planner logic lives in `src/lib/` and stays framework-free. Every rule change needs a test in `src/lib/lib.test.ts`; plans in tests are checked by the independent `assertValid` validator, so keep that validator strict.
- Every UI string goes through `src/i18n.ts` in **both** languages.
- Keep the app dependency-light. A new runtime dependency needs a clear reason in the PR.
- Interactive elements must work with the keyboard and keep a visible focus ring.

## Pull requests

1. Open an issue first for larger changes.
2. One topic per PR, with a short description of the why.
3. `npm test` and `npm run build` must pass (CI runs both).
