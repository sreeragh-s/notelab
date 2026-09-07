# Zilobase Web Clipper

WXT browser extension. Load unpacked from `.output/chrome-mv3` after a build.

```sh
npm run dev:clipper
npm run build:clipper
npm run build --workspace @zilobase/clipper -- -b firefox
```

`dev:clipper` is not the Zilobase API. It starts WXT’s hot-reload server on `http://localhost:3400` and opens Chrome with the extension loaded. Keep `npm run dev:local` running separately; the clipper still saves to `http://localhost:3000`.

Connect a workspace-scoped API key in the extension options page (`nl_…` from Settings → API Keys).
