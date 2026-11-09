# Emergency triage frontend

React 18 + Vite client for the hospital queue. The UI is Spanish. Source folders and identifiers are English.

## Stack

- React (views)
- Vite
- REST client against the Spring Boot API (`VITE_API_URL`)

## Layers

- `src/views` — screens (login, staff queue, admin)
- `src/models` — patient helpers, catalog, explanations, wait targets
- `src/services` — HTTP API
- `src/ml` — in-browser boosting trained on the local dataset

## Scripts

```bash
npm install
npm run dev
npm run build
```

## Code language

Identifiers are English. The staff UI stays Spanish.

