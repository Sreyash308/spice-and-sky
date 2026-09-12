/**
 * Supabase Migration & Seed Runner
 * Executes the SQL schema migration and seed data against Supabase/PostgreSQL.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

async function runSqlFile(client, filePath) {
  const fullPath = path.resolve(__dirname, '..', filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }
  const sql = fs.readFileSync(fullPath, 'utf8');
  console.log(`⏳ Executing ${filePath}...`);
  await client.query(sql);
  console.log(`✅ Successfully executed ${filePath}`);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.log('ℹ️ DATABASE_URL is not set in .env.');
    console.log('To run migrations directly on Supabase PostgreSQL:');
    console.log('1. Open your Supabase Dashboard -> Project Settings -> Database.');
    console.log('2. Copy the URI connection string (Transaction or Session pooler).');
    console.log('3. Set DATABASE_URL=postgresql://postgres:[password]@... in your .env');
    console.log('4. Run: npm run db:migrate');
    console.log('\nAlternatively, paste the contents of:');
    console.log('- supabase/migrations/20260912000000_spice_sky_schema.sql');
    console.log('- supabase/seed.sql');
    console.log('directly into the Supabase SQL Editor.');
    return;
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL database.');

    const args = process.argv.slice(2);
    const runMigrate = args.includes('--migrate') || args.length === 0;
    const runSeed = args.includes('--seed') || args.length === 0;

    if (runMigrate) {
      await runSqlFile(client, 'supabase/migrations/20260912000000_spice_sky_schema.sql');
    }

    if (runSeed) {
      await runSqlFile(client, 'supabase/seed.sql');
    }

    client.release();
    console.log('🎉 Database setup completed successfully!');
  } catch (err) {
    console.error('❌ Database migration error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
