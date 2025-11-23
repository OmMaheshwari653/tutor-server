import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { generateChapterNotes } from "@/lib/gemini";
import { verifyToken } from "@/lib/jwt";

export async function GET(
  req: NextRequest,
  { params }: { params: { chapterId: string } }
) {
  try {
    const { chapterId } = params;

    // Verify auth
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
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

    // Get chapter details
    const chapter = await sql`
      SELECT c.*, co.topic, co.difficulty
      FROM chapters c
      JOIN courses co ON c.course_id = co.id
      WHERE c.id = ${chapterId}
    `;

    if (chapter.length === 0) {
      return NextResponse.json(
        { success: false, error: "Chapter not found" },
        { status: 404 }
      );
    }

    const chapterData = chapter[0];

    // If notes already exist, return them
    if (chapterData.ai_generated_notes) {
      return NextResponse.json({
        success: true,
        notes: chapterData.ai_generated_notes,
        cached: true,
      });
    }

    // Generate notes on-demand
    const aiNotes = await generateChapterNotes({
      chapterTitle: chapterData.title,
      topic: chapterData.topic,
      difficulty: chapterData.difficulty,
      language: "English",
    });

    // Save to database
    await sql`
      UPDATE chapters 
      SET ai_generated_notes = ${aiNotes}
      WHERE id = ${chapterId}
    `;

    return NextResponse.json({
      success: true,
      notes: aiNotes,
      cached: false,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to generate notes",
      },
      { status: 500 }
    );
  }
}
