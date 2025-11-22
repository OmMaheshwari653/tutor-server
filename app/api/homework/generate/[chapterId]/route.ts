import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/jwt";
import { sql, ensureDBInitialized } from "@/lib/course-db";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

// POST: Generate AI homework for a chapter
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  try {
    const { chapterId } = await params;
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

    // Fetch chapter details
    const chapterResult = await sql`
      SELECT c.*, co.title as course_title
      FROM chapters c
      JOIN courses co ON c.course_id = co.id
      WHERE c.id = ${parseInt(chapterId)}
    `;

    if (chapterResult.length === 0) {
      return NextResponse.json(
        { success: false, error: "Chapter not found" },
        { status: 404 }
      );
    }

    const chapter = chapterResult[0];

    // Check if homework already exists
    const existingHomework = await sql`
      SELECT COUNT(*) as count FROM homework_problems
      WHERE chapter_id = ${parseInt(chapterId)}
    `;

    if (parseInt(existingHomework[0].count) > 0) {
      return NextResponse.json({
        success: true,
        message: "Homework already exists for this chapter",
        problemsCount: parseInt(existingHomework[0].count),
      });
    }

    if (!genAI) {
      return NextResponse.json(
        { success: false, error: "AI service not configured" },
        { status: 503 }
      );
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `You are an expert educator creating homework problems for students.

Course: ${chapter.course_title}
Chapter: ${chapter.title}
Chapter Description: ${chapter.description || "Not provided"}
Chapter Content/Notes: ${chapter.ai_generated_notes || "Not provided"}

Create 3 thoughtful homework problems that test understanding of this chapter's concepts:
1. One EASY problem (basic concept check)
2. One MEDIUM problem (application of concepts)
3. One HARD problem (critical thinking/problem-solving)

For each problem, provide:
- title: Short problem title (max 60 chars)
- description: Detailed problem statement (what the student needs to do)
- difficulty: "easy", "medium", or "hard"
- expected_approach: What you expect in a correct answer (for AI evaluation)
- hints: Array of 3 progressive hints (subtle → more helpful, but never give away the full answer)

IMPORTANT:
- Problems should be specific to THIS chapter's content
- Make them practical and engaging
- Hints should guide thinking, not provide solutions
- Expected approach should be clear for AI evaluation

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
    let aiResponse;
    try {
      const jsonMatch =
        responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
        responseText.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[1] || jsonMatch[0] : responseText;
      aiResponse = JSON.parse(jsonText);
    } catch (e) {
      return NextResponse.json(
        { success: false, error: "Failed to generate valid homework" },
        { status: 500 }
      );
    }

    // Insert problems into database
    const insertedProblems = [];
    for (let i = 0; i < aiResponse.problems.length; i++) {
      const problem = aiResponse.problems[i];

      const result = await sql`
        INSERT INTO homework_problems 
          (chapter_id, problem_number, title, description, difficulty, expected_approach, hints)
        VALUES 
          (${parseInt(chapterId)}, ${i + 1}, ${problem.title}, ${
        problem.description
      }, ${problem.difficulty}, ${problem.expected_approach}, ${JSON.stringify(
        problem.hints
      )}::jsonb)
        RETURNING id, title, difficulty
      `;

      insertedProblems.push(result[0]);
    }

    return NextResponse.json({
      success: true,
      message: "Homework generated successfully",
      problemsCount: insertedProblems.length,
      problems: insertedProblems,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
