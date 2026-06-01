#!/usr/bin/env node
// Apply SQL migrations under supabase/migrations/ to the linked Supabase project.
// Idempotent via the `public.schema_migrations` tracking table.
// Pattern lifted from the hundred-days project.

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv() {
  let fileEnv = {};
  try {
    const raw = readFileSync(join(root, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const s = line.trim();
      if (!s || s.startsWith("#")) continue;
      const eq = s.indexOf("=");
      if (eq === -1) continue;
      fileEnv[s.slice(0, eq).trim()] = s.slice(eq + 1).trim();
    }
  } catch {}
  return { ...fileEnv, ...process.env };
}

const env = loadEnv();
const url = env.SUPABASE_URL;
const password = env.SUPABASE_DB_PASSWORD;
if (!url || !password) {
  console.error("✗  SUPABASE_URL or SUPABASE_DB_PASSWORD missing. Add them to .env or export them.");
  process.exit(1);
}

const ref = new URL(url).hostname.split(".")[0];
const host = env.SUPABASE_POOLER_HOST || "aws-1-us-west-2.pooler.supabase.com";

const sql = postgres({
  host,
  port: Number(env.SUPABASE_POOLER_PORT || 5432),
  user: `postgres.${ref}`,
  password,
  database: "postgres",
  ssl: "require",
  connect_timeout: 30,
  idle_timeout: 5,
  max: 1,
  prepare: false,
});

const migrationsDir = join(root, "supabase", "migrations");
const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

try {
  await sql`
    create table if not exists public.schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  for (const f of files) {
    const version = f.replace(/\.sql$/, "");
    const existing = await sql`select 1 from public.schema_migrations where version = ${version}`;
    if (existing.length > 0) {
      console.log(`⏭  skip ${f} (already applied)`);
      continue;
    }
    console.log(`▶  applying ${f}`);
    const body = readFileSync(join(migrationsDir, f), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into public.schema_migrations (version) values (${version})`;
    });
    console.log(`✓  applied ${f}`);
  }
  console.log("All migrations applied.");
} catch (e) {
  console.error("Migration failed:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
