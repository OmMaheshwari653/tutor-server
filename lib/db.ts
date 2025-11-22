import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

export const sql = neon(process.env.DATABASE_URL);

// Initialize database schema
export async function initDB() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    return true;
  } catch (error) {
    return false;
  }
}

// Initialize database on module load
let dbInitialized = false;
const dbInitPromise = initDB().then(() => {
  dbInitialized = true;
});

export async function ensureDBInitialized() {
  if (!dbInitialized) {
    await dbInitPromise;
  }
}
