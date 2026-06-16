#!/usr/bin/env node

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const oldFetch = globalThis.fetch;
const envSnapshot = snapshotEnv([
  "OPENAI_API_KEY",
  "OPENAI_ORGANIZATION",
  "OPENAI_ORG_ID",
  "OPENAI_PROJECT",
  "OPENAI_PROJECT_ID",
]);
let capturedHeaders = null;

process.env.OPENAI_API_KEY = "";
process.env.OPENAI_ORGANIZATION = "org_session_smoke";
process.env.OPENAI_PROJECT = "proj_session_smoke";
delete process.env.OPENAI_ORG_ID;
delete process.env.OPENAI_PROJECT_ID;

globalThis.fetch = async (_url, init = {}) => {
  capturedHeaders = init.headers ?? null;
  return new Response(JSON.stringify({ value: "mock-client-secret" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

try {
  const route = require("../.next/server/app/api/session/route.js");
  const req = new Request("http://localhost/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ outputLanguage: "en" }),
  });
  const res = await route.routeModule.userland.POST(req);
  const body = await res.json();
  const projectHeader = capturedHeaders?.["OpenAI-Project"] ?? null;
  const organizationHeader = capturedHeaders?.["OpenAI-Organization"] ?? null;
  const scopedHeaders =
    projectHeader === "proj_session_smoke" &&
    organizationHeader === "org_session_smoke";
  const ok =
    res.status === 200 && Boolean(body.clientSecret) && !body.error && scopedHeaders;
  console.log(
    JSON.stringify({
      status: res.status,
      hasClientSecret: Boolean(body.clientSecret),
      emptyEnvFallback: ok,
      scopedHeaders,
      error: body.error ?? null,
    }),
  );
  if (!ok) process.exitCode = 1;
} finally {
  globalThis.fetch = oldFetch;
  restoreEnv(envSnapshot);
}

function snapshotEnv(keys) {
  return Object.fromEntries(
    keys.map((key) => [
      key,
      {
        had: Object.prototype.hasOwnProperty.call(process.env, key),
        value: process.env[key],
      },
    ]),
  );
}

function restoreEnv(snapshot) {
  for (const [key, state] of Object.entries(snapshot)) {
    if (state.had) process.env[key] = state.value;
    else delete process.env[key];
  }
}
