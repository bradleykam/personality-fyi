#!/usr/bin/env node
// Runs a Supabase migration directly via the Postgres connection.
// Usage: SUPABASE_DB_URL="postgresql://..." node tools/run-migration.js <start-marker>
//   start-marker = a substring that marks the beginning of the SQL block in supabase-schema.sql
//
// Reads supabase-schema.sql, extracts everything from the marker to end of file,
// and executes it as a single SQL script against Supabase Postgres.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error('Missing SUPABASE_DB_URL env var');
  process.exit(1);
}

const marker = process.argv[2];
if (!marker) {
  console.error('Usage: SUPABASE_DB_URL=... node tools/run-migration.js <start-marker>');
  process.exit(1);
}

const schemaPath = path.join(__dirname, '..', 'supabase-schema.sql');
const full = fs.readFileSync(schemaPath, 'utf8');
const idx = full.indexOf(marker);
if (idx === -1) {
  console.error('Marker not found in schema file:', marker);
  process.exit(1);
}
const sql = full.slice(idx);

(async () => {
  const client = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    console.log('Connected. Running migration (' + sql.length + ' bytes)...');
    await client.query(sql);
    console.log('Migration completed.');
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
