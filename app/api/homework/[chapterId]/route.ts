import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/jwt";
import { sql, ensureDBInitialized } from "@/lib/course-db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import cloudinary from "@/lib/cloudinary";

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

// GET: Fetch homework problems for a chapter
export async function GET(
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

    // Fetch homework problems
    const problems = await sql`
      SELECT 
        hp.*,
        COALESCE(
          (SELECT is_correct FROM homework_submissions 
           WHERE problem_id = hp.id AND user_id = ${decoded.userId} 
           ORDER BY created_at DESC LIMIT 1),
          false
        ) as is_solved,
        COALESCE(
          (SELECT attempts FROM homework_submissions 
           WHERE problem_id = hp.id AND user_id = ${decoded.userId} 
           ORDER BY created_at DESC LIMIT 1),
          0
        ) as user_attempts
      FROM homework_problems hp
      WHERE hp.chapter_id = ${parseInt(chapterId)}
      ORDER BY hp.problem_number
    `;

    // Fetch chapter progress
    const progress = await sql`
      SELECT * FROM chapter_progress
      WHERE user_id = ${decoded.userId} AND chapter_id = ${parseInt(chapterId)}
    `;

    return NextResponse.json({
      success: true,
      problems,
      progress: progress[0] || {
        total_problems: problems.length,
        solved_problems: 0,
        completion_percentage: 0,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST: Submit solution for checking
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

    const body = await req.json();
    const { problemId, solution, solutionImage, requestHint } = body;

    if (!problemId || (!solution && !solutionImage)) {
      return NextResponse.json(
        {
          success: false,
          error: "Problem ID and solution (text or image) required",
        },
        { status: 400 }
      );
    }

    await ensureDBInitialized();

    // Fetch problem details
    const problemResult = await sql`
      SELECT hp.*, ch.title as chapter_title, ch.ai_generated_notes
      FROM homework_problems hp
      JOIN chapters ch ON ch.id = hp.chapter_id
      WHERE hp.id = ${problemId}
    `;

    if (problemResult.length === 0) {
      return NextResponse.json(
        { success: false, error: "Problem not found" },
        { status: 404 }
      );
    }

    const problem = problemResult[0];

    // If requesting hint, return hint only
    if (requestHint) {
      if (!genAI) {
        return NextResponse.json(
          { success: false, error: "AI service not configured" },
          { status: 503 }
        );
      }

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const hintPrompt = `You are helping a student who is stuck on a homework problem.

Chapter: ${problem.chapter_title}
Problem: ${problem.title}
Description: ${problem.description}

Provide a helpful hint (not the full solution) that guides the student toward solving the problem. The hint should:
1. Be encouraging and positive
2. Point them in the right direction
3. Not give away the complete answer
4. Help them think about the approach

Provide just the hint (2-3 sentences):`;

      const result = await model.generateContent(hintPrompt);
      const hint = result.response.text();

      return NextResponse.json({
        success: true,
        hint,
        isHint: true,
      });
    }

    // Check solution with AI (with image support)
    if (!genAI) {
      return NextResponse.json(
        { success: false, error: "AI service not configured" },
        { status: 503 }
      );
    }

    // gemini-2.5-flash supports both text and image analysis
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const checkPrompt = `You are an expert tutor checking a student's homework solution.

Chapter: ${problem.chapter_title}
Chapter Notes: ${problem.ai_generated_notes || ""}

Problem: ${problem.title}
Description: ${problem.description}
Expected Approach: ${problem.expected_approach || "Any correct approach"}

Student's Solution:
${solution || "(Solution provided as image)"}

Task: Evaluate if the student's solution is correct and complete.

IMPORTANT: Respond with ONLY a clean JSON object. NO markdown, NO code blocks, NO extra text.

Format:
{"isCorrect":true/false,"feedback":"brief 2-3 sentence feedback","suggestions":"brief tip if needed"}

Keep feedback SHORT and encouraging. Be direct and concise.`;

    let result;

    // If image is provided, use vision model
    if (solutionImage) {
      // Image is base64 data URL, extract the base64 part
      const base64Data = solutionImage.split(",")[1];
      const mimeType = solutionImage.split(":")[1].split(";")[0];

      result = await model.generateContent([
        checkPrompt,
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        },
      ]);
    } else {
      result = await model.generateContent(checkPrompt);
    }

    const responseText = result.response.text();

    // Parse AI response - clean extraction
    let aiResponse;
    try {
      // Remove markdown code blocks and extra whitespace
      let cleanedText = responseText
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();

      // Extract JSON object
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiResponse = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found");
      }
    } catch (e) {
      // Fallback if JSON parsing fails
      aiResponse = {
        isCorrect: responseText.toLowerCase().includes("correct"),
        feedback: responseText.substring(0, 200),
        suggestions: "",
      };
    }

    // Get previous attempts
    const previousAttempts = await sql`
      SELECT attempts FROM homework_submissions
      WHERE problem_id = ${problemId} AND user_id = ${decoded.userId}
      ORDER BY created_at DESC LIMIT 1
    `;

    const attempts = (previousAttempts[0]?.attempts || 0) + 1;

    // Save submission (with optional image)
    await sql`
      INSERT INTO homework_submissions 
        (problem_id, user_id, solution, solution_image_url, is_correct, ai_feedback, attempts, completed_at)
      VALUES (
        ${problemId}, 
        ${decoded.userId}, 
        ${solution || null}, 
        ${solutionImage || null},
        ${aiResponse.isCorrect}, 
        ${aiResponse.feedback},
        ${attempts},
        ${aiResponse.isCorrect ? new Date().toISOString() : null}
      )
    `;

    // Update chapter progress if correct
    if (aiResponse.isCorrect) {
      // Get total problems in chapter
      const totalProblems = await sql`
        SELECT COUNT(*) as count FROM homework_problems
        WHERE chapter_id = ${parseInt(chapterId)}
      `;

      // Get solved problems count
      const solvedProblems = await sql`
        SELECT COUNT(DISTINCT problem_id) as count
        FROM homework_submissions
        WHERE user_id = ${decoded.userId}
          AND is_correct = true
          AND problem_id IN (
            SELECT id FROM homework_problems WHERE chapter_id = ${parseInt(
              chapterId
            )}
          )
      `;

      const total = parseInt(totalProblems[0].count);
      const solved = parseInt(solvedProblems[0].count);
      const percentage = Math.round((solved / total) * 100);
      const isCompleted = solved >= total;

      // Upsert progress
      await sql`
        INSERT INTO chapter_progress 
          (user_id, chapter_id, total_problems, solved_problems, completion_percentage, is_completed, completed_at, last_updated)
        VALUES (
          ${decoded.userId},
          ${parseInt(chapterId)},
          ${total},
          ${solved},
          ${percentage},
          ${isCompleted},
          ${isCompleted ? new Date().toISOString() : null},
          NOW()
        )
        ON CONFLICT (user_id, chapter_id)
        DO UPDATE SET
          solved_problems = ${solved},
          completion_percentage = ${percentage},
          is_completed = ${isCompleted},
          completed_at = CASE WHEN ${isCompleted} THEN NOW() ELSE chapter_progress.completed_at END,
          last_updated = NOW()
      `;

      // Update user_progress to mark chapter as completed if homework is 100% done
      if (isCompleted) {
        try {
          // Get course_id for this chapter
          const chapterInfo = await sql`
            SELECT course_id FROM chapters WHERE id = ${parseInt(chapterId)}
          `;

          if (chapterInfo.length > 0) {
            const courseId = chapterInfo[0].course_id;

            // Mark chapter as completed in user_progress
            await sql`
              INSERT INTO user_progress (user_id, course_id, chapter_id, completed, last_accessed)
              VALUES (${decoded.userId}, ${courseId}, ${parseInt(
              chapterId
            )}, true, NOW())
              ON CONFLICT (user_id, chapter_id)
            DO UPDATE SET 
              completed = true,
              last_accessed = NOW()
          `;

            // Combine queries into one for efficiency
            const courseStatus = await sql`
              SELECT 
                (SELECT COUNT(*) FROM chapters WHERE course_id = ${courseId}) as total_chapters,
                (SELECT COUNT(DISTINCT up.chapter_id) 
                 FROM user_progress up
                 JOIN chapters ch ON ch.id = up.chapter_id
                 WHERE up.user_id = ${decoded.userId}
                   AND up.completed = true
                   AND ch.course_id = ${courseId}) as completed_chapters
            `;

            if (courseStatus.length > 0) {
              const totalChaptersCount = parseInt(
                courseStatus[0].total_chapters
              );
              const completedChaptersCount = parseInt(
                courseStatus[0].completed_chapters
              );

              // Update course progress
              if (
                completedChaptersCount >= totalChaptersCount &&
                totalChaptersCount > 0
              ) {
                await sql`
                  UPDATE courses 
                  SET status = 'completed', progress = 100, completed_at = NOW(), updated_at = NOW()
                  WHERE id = ${courseId} AND user_id = ${decoded.userId}
                `;
                const courseProgress = Math.round(
                  (completedChaptersCount / totalChaptersCount) * 100
                );
                await sql`
                  UPDATE courses 
                  SET progress = ${courseProgress}, updated_at = NOW()
                  WHERE id = ${courseId} AND user_id = ${decoded.userId}
                `;
              }
            }
          }
        } catch (progressError: any) {
          // Don't fail the submission if course progress update fails
        }
      }
    }

    return NextResponse.json({
      success: true,
      isCorrect: aiResponse.isCorrect,
      feedback: aiResponse.feedback,
      suggestions: aiResponse.suggestions || "",
      attempts,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
