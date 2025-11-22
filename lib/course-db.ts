import { sql as neonSql, ensureDBInitialized } from "./db";

export { ensureDBInitialized };
export const sql = neonSql;

// Initialize course-related tables
export async function initCourseDB() {
  await ensureDBInitialized();

  try {
    // Courses table
    await neonSql`
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

    // Chapters table
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

    // Videos table
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

    // Topics/Concepts table
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

    // User progress tracking
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

    // Chapter doubts/questions table
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

    // Homework problems table
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

    // Homework submissions table
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

    // Chapter progress tracking
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

    return true;
  } catch (error) {
    return false;
  }
}

// Auto-initialize
initCourseDB();
