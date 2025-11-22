import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/jwt";
import { sql, ensureDBInitialized } from "@/lib/course-db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  try {
    const { chapterId } = await params;

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

    await ensureDBInitialized();

    // Fetch all doubts for this chapter
    const doubts = await sql`
      SELECT 
        id,
        question,
        answer,
        created_at,
        updated_at
      FROM chapter_doubts
      WHERE chapter_id = ${parseInt(chapterId)}
      ORDER BY created_at DESC
      LIMIT 20
    `;

    return NextResponse.json(
      {
        success: true,
        doubts: doubts,
        count: doubts.length,
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch doubts",
      },
      { status: 500 }
    );
  }
}
