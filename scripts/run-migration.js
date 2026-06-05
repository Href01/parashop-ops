// Run a specific migration file
require('dotenv').config()
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

async function runMigration(migrationFile) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  try {
    const migrationPath = path.join(__dirname, '..', 'migrations', migrationFile)
    const sql = fs.readFileSync(migrationPath, 'utf8')

    console.log(`Running migration: ${migrationFile}`)
    await pool.query(sql)
    console.log(`✅ Migration ${migrationFile} completed successfully`)
  } catch (error) {
    console.error(`❌ Migration failed:`, error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

const migrationFile = process.argv[2]
if (!migrationFile) {
  console.error('Usage: node scripts/run-migration.js <migration-file.sql>')
  process.exit(1)
}

runMigration(migrationFile)
