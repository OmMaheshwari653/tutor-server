import { NextRequest, NextResponse } from "next/server";
import { sql, ensureDBInitialized } from "@/lib/db";
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

    // Fetch user details
    const userResult = await sql`
      SELECT id, name, email, created_at FROM users 
      WHERE id = ${decoded.userId}
    `;

    if (userResult.length === 0) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    const user = userResult[0];

    // Fetch user's courses with progress
    const coursesResult = await sql`
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM chapters WHERE course_id = c.id) as total_chapters,
        (SELECT COUNT(DISTINCT up.chapter_id) 
         FROM user_progress up
         JOIN chapters ch ON ch.id = up.chapter_id
         WHERE up.user_id = ${decoded.userId}
           AND up.completed = true
           AND ch.course_id = c.id) as completed_chapters
      FROM courses c
      WHERE c.user_id = ${decoded.userId}
      ORDER BY c.created_at DESC
    `;

    // Calculate statistics
    const completedCourses = coursesResult.filter(
      (c: any) => c.status === "completed"
    ).length;
    const inProgressCourses = coursesResult.filter(
      (c: any) => c.status === "ready"
    ).length;

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.email.split("@")[0],
          createdAt: user.created_at,
        },
        stats: {
          totalCourses: coursesResult.length,
          completedCourses,
          inProgressCourses,
        },
        courses: coursesResult.map((course: any) => ({
          id: course.id,
          title: course.title,
          topic: course.topic,
          difficulty: course.difficulty,
          status: course.status,
          progress: course.progress || 0,
          totalChapters: course.total_chapters,
          completedChapters: course.completed_chapters,
          isCompleted: course.status === "completed",
          createdAt: course.created_at,
        })),
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch user profile",
      },
      { status: 500 }
    );
  }
}
