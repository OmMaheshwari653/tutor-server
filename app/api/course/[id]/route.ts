import { NextRequest, NextResponse } from "next/server";
import { sql, ensureDBInitialized } from "@/lib/course-db";
import { verifyToken } from "@/lib/jwt";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Next.js 16: params is now a Promise, must await it
  const { id } = await params;

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

    const courseId = id;

    // Fetch course details
    const courseResult = await sql`
      SELECT * FROM courses 
      WHERE id = ${courseId} AND user_id = ${decoded.userId}
    `;

    if (courseResult.length === 0) {
      return NextResponse.json(
        { success: false, error: "Course not found" },
        { status: 404 }
      );
    }

    const course = courseResult[0];

    // Fetch chapters with videos and topics
    const chapters = await sql`
      SELECT 
        ch.*,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', cv.id,
              'title', cv.title,
              'videoId', cv.video_id,
              'channelName', cv.channel_name,
              'thumbnailUrl', cv.thumbnail_url,
              'duration', cv.duration
            )
          ) FILTER (WHERE cv.id IS NOT NULL), '[]'
        ) as videos,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', ct.id,
              'topicName', ct.topic_name,
              'explanation', ct.explanation,
              'examples', ct.examples,
              'practiceQuestions', ct.practice_questions
            )
          ) FILTER (WHERE ct.id IS NOT NULL), '[]'
        ) as topics
      FROM chapters ch
      LEFT JOIN chapter_videos cv ON cv.chapter_id = ch.id
      LEFT JOIN chapter_topics ct ON ct.chapter_id = ch.id
      WHERE ch.course_id = ${courseId}
      GROUP BY ch.id
      ORDER BY ch.chapter_number
    `;

    // Fetch user progress for chapters (video watching)
    const progressResult = await sql`
      SELECT chapter_id, completed, time_spent_minutes, notes
      FROM user_progress
      WHERE user_id = ${decoded.userId} 
        AND chapter_id IN (SELECT id FROM chapters WHERE course_id = ${courseId})
    `;

    // Fetch homework progress for chapters
    const homeworkProgressResult = await sql`
      SELECT 
        chapter_id, 
        total_problems, 
        solved_problems, 
        completion_percentage, 
        is_completed
      FROM chapter_progress
      WHERE user_id = ${decoded.userId}
        AND chapter_id IN (SELECT id FROM chapters WHERE course_id = ${courseId})
    `;

    const progressMap = progressResult.reduce((acc: any, p: any) => {
      acc[p.chapter_id] = {
        completed: p.completed,
        timeSpent: p.time_spent_minutes,
        notes: p.notes,
      };
      return acc;
    }, {});

    const homeworkProgressMap = homeworkProgressResult.reduce(
      (acc: any, p: any) => {
        acc[p.chapter_id] = {
          totalProblems: p.total_problems,
          solvedProblems: p.solved_problems,
          completionPercentage: p.completion_percentage,
          isCompleted: p.is_completed,
        };
        return acc;
      },
      {}
    );

    // Calculate overall course completion based on homework
    const totalChaptersCount = chapters.length;
    const completedChaptersCount = chapters.filter(
      (ch: any) => homeworkProgressMap[ch.id]?.isCompleted
    ).length;
    const courseCompletionPercentage =
      totalChaptersCount > 0
        ? Math.round((completedChaptersCount / totalChaptersCount) * 100)
        : 0;

    return NextResponse.json(
      {
        success: true,
        course: {
          ...course,
          overallProgress: {
            totalChapters: totalChaptersCount,
            completedChapters: completedChaptersCount,
            completionPercentage: courseCompletionPercentage,
            isCompleted:
              completedChaptersCount >= totalChaptersCount &&
              totalChaptersCount > 0,
          },
          chapters: chapters.map((ch: any) => ({
            ...ch,
            userProgress: progressMap[ch.id] || {
              completed: false,
              timeSpent: 0,
              notes: null,
            },
            homeworkProgress: homeworkProgressMap[ch.id] || {
              totalProblems: 0,
              solvedProblems: 0,
              completionPercentage: 0,
              isCompleted: false,
            },
          })),
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch course details",
      },
      { status: 500 }
    );
  }
}
