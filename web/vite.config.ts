import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** Paths the backend answers itself, HTML or not — `req.url` carries the query string, hence `\?`. */
const BACKEND = /^\/(api|auth|mcp|healthz|openapi|\.well-known)(\/|$|\?)/

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': `${import.meta.dirname}/src`,
    },
  },
  server: {
    // Everything belongs to the Flash app on 8080 except what only this dev server can answer,
    // so dev and prod (where the SPA is served from 8080 itself, see Main#webBundlerConfig)
    // hit the same relative paths — no VITE_API_URL or CORS wiring either way.
    //
    // Deliberately a catch-all rather than a list of prefixes: a list silently answers every
    // path nobody remembered to add with Vite's SPA fallback, i.e. `index.html` under a 200.
    // That breaks protocol endpoints in ways that are hard to see — an MCP client cannot parse
    // HTML from `/mcp` or `/.well-known/*`, and no request ever reaches the backend to log it.
    proxy: {
      '^/': {
        target: 'http://localhost:8080',
        ws: true,
        // `/@…`, `/src/…`, `/node_modules/…` are Vite's own module graph, and `public/` is
        // served from the root. Past those, an HTML request is a client-side route that falls
        // through to index.html — unless the backend owns the path outright, which for /auth
        // means real navigations answered with a redirect. BACKEND therefore only ever gates
        // the HTML case; anything unlisted still proxies, so an endpoint added later cannot
        // silently start answering index.html.
        bypass(req) {
          const url = req.url ?? '/'
          // `/` is never proxied, whatever the Accept header: in DEV it is
          // WebBundlerExtension that spawns this dev server and then blocks on
          // GET http://127.0.0.1:5173/ returning 200 before the backend finishes booting.
          // Proxying that ping upstream deadlocks the boot it is gating.
          if (url === '/') return url
          if (/^\/(@|src\/|node_modules\/|favicon\.svg)/.test(url)) return url
          if (!BACKEND.test(url) && req.headers.accept?.includes('text/html')) return '/index.html'
        },
      },
    },
  },
})
