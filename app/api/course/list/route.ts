import { NextRequest, NextResponse } from "next/server";
import { sql, ensureDBInitialized } from "@/lib/course-db";
import { verifyToken } from "@/lib/jwt";

export async function GET(req: NextRequest) {
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

    // Fetch user's courses with chapter count
    const courses = await sql`
      SELECT 
        c.id,
        c.title,
        c.topic,
        c.difficulty,
        c.duration,
        c.category,
        c.description,
        c.language,
        c.status,
        c.progress,
        c.created_at,
        c.completed_at,
        COUNT(ch.id) as total_chapters,
        COALESCE(
          SUM(CASE WHEN up.completed = true THEN 1 ELSE 0 END), 0
        ) as completed_chapters
      FROM courses c
      LEFT JOIN chapters ch ON ch.course_id = c.id
      LEFT JOIN user_progress up ON up.chapter_id = ch.id AND up.user_id = ${decoded.userId}
      WHERE c.user_id = ${decoded.userId}
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `;

    // Calculate actual progress based on completed chapters
    const coursesWithProgress = courses.map((course: any) => ({
      id: course.id,
      title: course.title,
      topic: course.topic,
      difficulty: course.difficulty,
      duration: course.duration,
      category: course.category,
      description: course.description,
      language: course.language,
      status: course.status,
      progress:
        course.total_chapters > 0
          ? Math.round(
              (course.completed_chapters / course.total_chapters) * 100
            )
          : course.progress,
      totalChapters: course.total_chapters,
      completedChapters: course.completed_chapters,
      isCompleted: course.status === "ready" && course.completed_at !== null,
      createdAt: course.created_at,
      completedAt: course.completed_at,
    }));

    return NextResponse.json(
      {
        success: true,
        courses: coursesWithProgress,
        totalCourses: courses.length,
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch courses",
      },
      { status: 500 }
    );
  }
}
