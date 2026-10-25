# PowerCMS 12 · Admin UI

Management console for PowerCMS Community Edition. React 18 + TypeScript + Vite + Ant Design.

This repository contains **Community Edition code only**. UI entries for commercial modules
(Knox-Media, interaction operations, AI / RAG, MCP, licensing, enterprise SSO, etc.) are not included.

## Requirements

- Node.js 20+
- npm 10+

## Develop

```bash
npm ci
npm run dev
```

The dev server runs on `http://localhost:5173` and proxies `/api` and the local media endpoints to
`http://localhost:8080` (cms-core). See `.env.example` for preview-related settings.

## Build and test

```bash
npm run build   # tsc --noEmit && vite build
npm test        # vitest run
```

## License

Apache License 2.0. See [LICENSE](LICENSE).
