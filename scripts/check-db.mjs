import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL);

async function checkDatabase() {
  try {
    console.log("🔍 Checking database connection...\n");

    // Check tables
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;

    console.log("📋 Tables in database:");
    tables.forEach((t) => console.log("  -", t.table_name));
    console.log();

    // Check users
    const users = await sql`SELECT COUNT(*) as count FROM users`;
    console.log("👤 Users count:", users[0].count);

    // Check courses
    const courses = await sql`SELECT COUNT(*) as count FROM courses`;
    console.log("📚 Courses count:", courses[0].count);

    // Check chapters
    const chapters = await sql`SELECT COUNT(*) as count FROM chapters`;
    console.log("📖 Chapters count:", chapters[0].count);

    console.log("\n✅ Database is accessible and working!");
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

checkDatabase();
