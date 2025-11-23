import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: join(__dirname, "../.env.local") });

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL not found in environment variables!");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function setupDatabase() {
  console.log("🚀 Starting database setup...\n");

  try {
    // 1. Users table
    console.log("📋 Creating users table...");
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
    console.log("✅ Users table created\n");

    // 2. Courses table
    console.log("📋 Creating courses table...");
    await sql`
      CREATE TABLE IF NOT EXISTS courses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        topic VARCHAR(500) NOT NULL,
        difficulty VARCHAR(50) NOT NULL,
        duration INTEGER NOT NULL,
        category VARCHAR(100),
        description TEXT,
        language VARCHAR(50) DEFAULT 'English',
        include_videos BOOLEAN DEFAULT true,
        status VARCHAR(50) DEFAULT 'generating',
        progress INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `;
    console.log("✅ Courses table created\n");

    // 3. Chapters table
    console.log("📋 Creating chapters table...");
    await sql`
      CREATE TABLE IF NOT EXISTS chapters (
        id SERIAL PRIMARY KEY,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        chapter_number INTEGER NOT NULL,
        description TEXT,
        duration_minutes INTEGER,
        content JSONB,
        ai_generated_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(course_id, chapter_number)
      )
    `;
    console.log("✅ Chapters table created\n");

    // 4. Videos table
    console.log("📋 Creating chapter_videos table...");
    await sql`
      CREATE TABLE IF NOT EXISTS chapter_videos (
        id SERIAL PRIMARY KEY,
        chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        video_id VARCHAR(100) NOT NULL,
        channel_name VARCHAR(255),
        thumbnail_url TEXT,
        duration VARCHAR(50),
        view_count BIGINT,
        published_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log("✅ Chapter videos table created\n");

    // 5. Topics table
    console.log("📋 Creating chapter_topics table...");
    await sql`
      CREATE TABLE IF NOT EXISTS chapter_topics (
        id SERIAL PRIMARY KEY,
        chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
        topic_name VARCHAR(500) NOT NULL,
        explanation TEXT,
        examples JSONB,
        practice_questions JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log("✅ Chapter topics table created\n");

    // 6. User progress table
    console.log("📋 Creating user_progress table...");
    await sql`
      CREATE TABLE IF NOT EXISTS user_progress (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
        completed BOOLEAN DEFAULT false,
        time_spent_minutes INTEGER DEFAULT 0,
        last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        UNIQUE(user_id, chapter_id)
      )
    `;
    console.log("✅ User progress table created\n");

    // 7. Chapter doubts table
    console.log("📋 Creating chapter_doubts table...");
    await sql`
      CREATE TABLE IF NOT EXISTS chapter_doubts (
        id SERIAL PRIMARY KEY,
        chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log("✅ Chapter doubts table created\n");

    // 8. Homework problems table
    console.log("📋 Creating homework_problems table...");
    await sql`
      CREATE TABLE IF NOT EXISTS homework_problems (
        id SERIAL PRIMARY KEY,
        chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
        problem_number INTEGER NOT NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT NOT NULL,
        difficulty VARCHAR(20) DEFAULT 'medium',
        expected_approach TEXT,
        hints JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(chapter_id, problem_number)
      )
    `;
    console.log("✅ Homework problems table created\n");

    // 9. Homework submissions table
    console.log("📋 Creating homework_submissions table...");
    await sql`
      CREATE TABLE IF NOT EXISTS homework_submissions (
        id SERIAL PRIMARY KEY,
        problem_id INTEGER REFERENCES homework_problems(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        solution TEXT,
        solution_image_url TEXT,
        is_correct BOOLEAN DEFAULT false,
        ai_feedback TEXT,
        attempts INTEGER DEFAULT 1,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log("✅ Homework submissions table created\n");

    // 10. Chapter progress table
    console.log("📋 Creating chapter_progress table...");
    await sql`
      CREATE TABLE IF NOT EXISTS chapter_progress (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
        total_problems INTEGER DEFAULT 0,
        solved_problems INTEGER DEFAULT 0,
        completion_percentage INTEGER DEFAULT 0,
        is_completed BOOLEAN DEFAULT false,
        completed_at TIMESTAMP,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, chapter_id)
      )
    `;
    console.log("✅ Chapter progress table created\n");

    console.log("🎉 Database setup completed successfully!");
    console.log("\n📊 Summary:");
    console.log("✅ 10 tables created");
    console.log("✅ All foreign key relationships established");
    console.log("✅ Database is ready to use!");
  } catch (error) {
    console.error("\n❌ Database setup failed!");
    console.error("Error:", error.message);
    console.error("\nFull error:", error);
    process.exit(1);
  }
}

setupDatabase();
