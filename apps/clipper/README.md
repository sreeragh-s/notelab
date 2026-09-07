# Zilobase Web Clipper

WXT browser extension. Load unpacked from `.output/chrome-mv3` after a build.

```sh
npm run dev:clipper
npm run build:clipper
npm run build --workspace @zilobase/clipper -- -b firefox
```

`dev:clipper` is not the Zilobase API. It starts WXT’s hot-reload server on `http://localhost:3400` and opens Chrome with the extension loaded. Keep `npm run dev:local` running separately; the clipper still saves to `http://localhost:3000`.

In the extension options, enter the API origin (locally `http://localhost:3000`) and choose **Connect with Zilobase**. Sign in, select a workspace, and approve access. The extension exchanges the authorization code with PKCE and refreshes expired access tokens. Apply the server migrations before connecting; discovery registers the official client. A workspace-scoped API key (`nl_…` from Settings → API Keys) is also available under Advanced.
