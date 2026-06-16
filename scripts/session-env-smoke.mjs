#!/usr/bin/env node

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const oldFetch = globalThis.fetch;
const hadKey = Object.prototype.hasOwnProperty.call(process.env, "OPENAI_API_KEY");
const oldKey = process.env.OPENAI_API_KEY;

process.env.OPENAI_API_KEY = "";

globalThis.fetch = async () =>
  new Response(JSON.stringify({ value: "mock-client-secret" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

try {
  const route = require("../.next/server/app/api/session/route.js");
  const req = new Request("http://localhost/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ outputLanguage: "en" }),
  });
  const res = await route.routeModule.userland.POST(req);
  const body = await res.json();
  const ok = res.status === 200 && Boolean(body.clientSecret) && !body.error;
  console.log(
    JSON.stringify({
      status: res.status,
      hasClientSecret: Boolean(body.clientSecret),
      emptyEnvFallback: ok,
      error: body.error ?? null,
    }),
  );
  if (!ok) process.exitCode = 1;
} finally {
  globalThis.fetch = oldFetch;
  if (hadKey) process.env.OPENAI_API_KEY = oldKey;
  else delete process.env.OPENAI_API_KEY;
}
