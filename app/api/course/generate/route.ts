import { NextRequest, NextResponse } from "next/server";
import { sql, ensureDBInitialized } from "@/lib/course-db";
import { verifyToken } from "@/lib/jwt";
import { generateCourseStructure, generateChapterNotes } from "@/lib/gemini";
import { getChapterVideos } from "@/lib/youtube";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

export async function POST(req: NextRequest) {
  await ensureDBInitialized();

  try {
    // Verify authentication
    const token = req.headers.get("authorization")?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 }
      );
    }

    const body = await req.json();

    const {
      topic,
      difficulty,
      duration,
      category,
      language = "English",
      includeVideos = true,
    } = body;

    // Validate required fields
    if (!topic || !difficulty || !duration) {
      return NextResponse.json(
        {
          success: false,
          error: "Topic, difficulty, and duration are required",
        },
        { status: 400 }
      );
    }

    // Step 1: Generate course structure with Gemini AI
    const courseData = await generateCourseStructure({
      topic,
      difficulty,
      duration: parseInt(duration),
      language,
      category,
    });

    // Step 2: Create course in database
    const courseResult = await sql`
      INSERT INTO courses (
        user_id, title, topic, difficulty, duration, 
        category, description, language, include_videos, status
      ) VALUES (
        ${decoded.userId}, ${courseData.courseTitle}, ${topic}, 
        ${difficulty}, ${duration}, ${category || "General"}, 
        ${courseData.description}, ${language}, ${includeVideos}, 'generating'
      )
      RETURNING id, title, topic, difficulty, duration, description, created_at
    `;

    const course = courseResult[0];

    // Step 3: Generate first chapter immediately (so user sees something)
    if (courseData.chapters.length > 0) {
      const firstChapter = courseData.chapters[0];

      const chapterResult = await sql`
        INSERT INTO chapters (
          course_id, title, chapter_number, description, 
          duration_minutes, content
        ) VALUES (
          ${course.id}, ${firstChapter.title}, ${firstChapter.chapterNumber},
          ${firstChapter.description}, ${firstChapter.durationMinutes || 45},
          ${JSON.stringify(firstChapter.topics)}
        )
        RETURNING id
      `;

      const firstChapterId = chapterResult[0].id;

      // Generate AI notes for first chapter
      try {
        const aiNotes = await generateChapterNotes({
          chapterTitle: firstChapter.title,
          topic,
          difficulty,
          language,
        });

        await sql`
          UPDATE chapters 
          SET ai_generated_notes = ${aiNotes}
          WHERE id = ${firstChapterId}
        `;
      } catch (error) {
        // Continue even if notes generation fails
      }

      // Generate homework for first chapter
      try {
        await generateChapterHomework(firstChapterId, {
          courseTitle: course.title,
          chapterTitle: firstChapter.title,
          chapterDescription: firstChapter.description,
          aiNotes: null, // Will fetch from DB if needed
        });
      } catch (error) {
        // Continue even if homework generation fails
      }

      // Fetch videos for first chapter
      if (includeVideos) {
        try {
          const videos = await getChapterVideos({
            chapterTitle: firstChapter.title,
            topic,
            difficulty,
            language,
          });

          for (const video of videos) {
            await sql`
              INSERT INTO chapter_videos (
                chapter_id, title, video_id, channel_name,
                thumbnail_url, duration, view_count, published_at
              ) VALUES (
                ${firstChapterId}, ${video.title}, ${video.videoId},
                ${video.channelName}, ${video.thumbnailUrl},
                ${video.duration}, ${video.viewCount}, ${video.publishedAt}
              )
            `;
          }
        } catch (error) {
          // Continue even if videos fetch fails
        }
      }

      // Save topics for first chapter
      for (const topic of firstChapter.topics) {
        await sql`
          INSERT INTO chapter_topics (
            chapter_id, topic_name, explanation, examples, practice_questions
          ) VALUES (
            ${firstChapterId}, ${topic.topicName}, ${topic.explanation},
            ${JSON.stringify(topic.examples)}, ${JSON.stringify(
          topic.practiceQuestions
        )}
          )
        `;
      }
    }

    // Process remaining chapters in background
    if (courseData.chapters.length > 1) {
      processChaptersInBackground(course.id, courseData.chapters.slice(1), {
        topic,
        difficulty,
        language,
        includeVideos,
        startChapterNumber: 2,
      });
    } else {
      // Only one chapter, mark as ready
      await sql`
        UPDATE courses 
        SET status = 'ready', progress = 100, completed_at = CURRENT_TIMESTAMP
        WHERE id = ${course.id}
      `;
    }

    return NextResponse.json(
      {
        success: true,
        message: "Course generation started successfully",
        course: {
          id: course.id,
          title: course.title,
          topic: course.topic,
          difficulty: course.difficulty,
          duration: course.duration,
          description: course.description,
          status: "generating",
          totalChapters: courseData.chapters.length,
          createdAt: course.created_at,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to generate course",
      },
      { status: 500 }
    );
  }
}

// Background processing function
async function processChaptersInBackground(
  courseId: number,
  chapters: any[],
  params: {
    topic: string;
    difficulty: string;
    language: string;
    includeVideos: boolean;
    startChapterNumber?: number;
  }
) {
  try {
    let completedChapters = params.startChapterNumber
      ? params.startChapterNumber - 1
      : 0;

    for (const chapter of chapters) {
      // Create chapter
      const chapterResult = await sql`
        INSERT INTO chapters (
          course_id, title, chapter_number, description, 
          duration_minutes, content
        ) VALUES (
          ${courseId}, ${chapter.title}, ${chapter.chapterNumber},
          ${chapter.description}, ${chapter.durationMinutes || 45},
          ${JSON.stringify(chapter.topics)}
        )
        RETURNING id
      `;

      const chapterId = chapterResult[0].id;

      // Generate AI notes for chapter
      try {
        const aiNotes = await generateChapterNotes({
          chapterTitle: chapter.title,
          topic: params.topic,
          difficulty: params.difficulty,
          language: params.language,
        });

        await sql`
          UPDATE chapters 
          SET ai_generated_notes = ${aiNotes}
          WHERE id = ${chapterId}
        `;
      } catch (error) {
        // Failed to generate notes
      }

      // Fetch YouTube videos if enabled
      if (params.includeVideos) {
        try {
          const videos = await getChapterVideos({
            chapterTitle: chapter.title,
            topic: params.topic,
            difficulty: params.difficulty,
            language: params.language,
          });

          // Save videos to database
          for (const video of videos) {
            await sql`
              INSERT INTO chapter_videos (
                chapter_id, title, video_id, channel_name,
                thumbnail_url, duration, view_count, published_at
              ) VALUES (
                ${chapterId}, ${video.title}, ${video.videoId},
                ${video.channelName}, ${video.thumbnailUrl},
                ${video.duration}, ${video.viewCount}, ${video.publishedAt}
              )
            `;
          }
        } catch (error) {
          // Failed to fetch videos
        }
      }

      // Generate homework for chapter
      try {
        await generateChapterHomework(chapterId, {
          courseTitle: params.topic,
          chapterTitle: chapter.title,
          chapterDescription: chapter.description,
          aiNotes: null,
        });
      } catch (error) {
        // Failed to generate homework
      }

      // Save topics
      for (const topic of chapter.topics) {
        await sql`
          INSERT INTO chapter_topics (
            chapter_id, topic_name, explanation, examples, practice_questions
          ) VALUES (
            ${chapterId}, ${topic.topicName}, ${topic.explanation},
            ${JSON.stringify(topic.examples)}, ${JSON.stringify(
          topic.practiceQuestions
        )}
          )
        `;
      }

      completedChapters++;

      // Update course progress
      const progress = Math.round((completedChapters / chapters.length) * 100);
      await sql`
        UPDATE courses 
        SET progress = ${progress}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${courseId}
      `;
    }

    // Mark course as completed
    await sql`
      UPDATE courses 
      SET status = 'ready', progress = 100, completed_at = CURRENT_TIMESTAMP
      WHERE id = ${courseId}
    `;
  } catch (error) {
    // Mark course as failed
    await sql`
      UPDATE courses 
      SET status = 'failed'
      WHERE id = ${courseId}
    `;
  }
}

// Helper function to generate homework for a chapter
async function generateChapterHomework(
  chapterId: number,
  params: {
    courseTitle: string;
    chapterTitle: string;
    chapterDescription: string;
    aiNotes: string | null;
  }
) {
  if (!genAI) {
    throw new Error("AI service not configured");
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You are an expert educator creating homework problems for students.

Course: ${params.courseTitle}
Chapter: ${params.chapterTitle}
Chapter Description: ${params.chapterDescription}
Chapter Content/Notes: ${params.aiNotes || "Not provided"}

Create 3 thoughtful homework problems that test understanding of this chapter's concepts:
1. One EASY problem (basic concept check)
2. One MEDIUM problem (application of concepts)
3. One HARD problem (critical thinking/problem-solving)

For each problem, provide:
- title: Short problem title (max 60 chars)
- description: Detailed problem statement (what the student needs to do)
- difficulty: "easy", "medium", or "hard"
- expected_approach: What you expect in a correct answer (for AI evaluation)
- hints: Array of 3 progressive hints (subtle → more helpful)

Return ONLY valid JSON in this exact format:
{
  "problems": [
    {
      "title": "Problem title here",
      "description": "Problem description here",
      "difficulty": "easy",
      "expected_approach": "What makes an answer correct",
      "hints": ["hint 1", "hint 2", "hint 3"]
    }
  ]
}`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  // Parse AI response
  const jsonMatch =
    responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
    responseText.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[1] || jsonMatch[0] : responseText;
  const aiResponse = JSON.parse(jsonText);

  // Insert problems into database
  for (let i = 0; i < aiResponse.problems.length; i++) {
    const problem = aiResponse.problems[i];

    await sql`
      INSERT INTO homework_problems 
        (chapter_id, problem_number, title, description, difficulty, expected_approach, hints)
      VALUES 
        (${chapterId}, ${i + 1}, ${problem.title}, ${problem.description}, ${
      problem.difficulty
    }, ${problem.expected_approach}, ${JSON.stringify(problem.hints)}::jsonb)
    `;
  }
}
