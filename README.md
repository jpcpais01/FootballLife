# FootbalLife

Online multiplayer football career game. Create a player, join or found a club, train, and watch every league match play out live in 3D.

Stack: Vite + TypeScript + three.js + vite-plugin-pwa, with a Node API (`server/`) and Postgres.

## Develop

```sh
npm install
npm run dev        # app + API on http://localhost:5173, embedded PGlite in ./.data/pglite
npm test           # match engine + API logic checks
npm run build      # typecheck, client build, Vercel Build Output in .vercel/output
```

Set `PGLITE_DIR=memory` for a throwaway database.

## Deploy (Vercel)

1. Import the repo in Vercel (framework settings come from `vercel.json`).
2. Add a Postgres database (Neon from the Vercel Marketplace) so `DATABASE_URL` or `POSTGRES_URL` is set.
3. Deploys run from `main`. The schema migrates itself on first request, and the world (AI clubs, season 1) bootstraps itself.

Without a database URL the API answers 503.

## Layout

- `shared/` engine, attributes, formations, timeline, commentary (used by client and server)
- `server/` API routes, auth, league scheduling, progression
- `src/` client pages, UI, and the 3D viewer (`src/viewer/`)
- `src/patchnotes.ts` player-facing patch notes, grouped by hour
