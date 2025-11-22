import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/jwt";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { sql, ensureDBInitialized } from "@/lib/course-db";

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

export async function POST(req: NextRequest) {
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

    if (!genAI) {
      return NextResponse.json(
        { success: false, error: "AI service not configured" },
        { status: 503 }
      );
    }

    const body = await req.json();

    const {
      message,
      chapterTitle,
      chapterNotes,
      chapterId,
      conversationHistory = [],
    } = body;

    if (!message || !chapterTitle) {
      return NextResponse.json(
        { success: false, error: "Message and chapter title are required" },
        { status: 400 }
      );
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); // Build conversation context
    let conversationContext = "";
    if (conversationHistory.length > 0) {
      conversationContext = "\n\nPrevious conversation:\n";
      conversationHistory.forEach((msg: any) => {
        conversationContext += `${msg.role === "user" ? "Student" : "Tutor"}: ${
          msg.content
        }\n`;
      });
    }

    const prompt = `You are an expert AI tutor helping a student understand "${chapterTitle}".

Chapter Notes/Context:
${chapterNotes || "No specific notes provided for this chapter."}
${conversationContext}

Student's Question: ${message}

Instructions:
1. Answer based ONLY on the chapter notes provided above
2. Be clear, concise, and educational
3. Use simple language suitable for students
4. If the question is not related to this chapter, politely redirect them
5. Provide examples when helpful
6. Encourage further questions

Provide a helpful, friendly response:`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Save doubt to database if chapterId is provided
    if (chapterId) {
      try {
        await ensureDBInitialized();

        const result = await sql`
          INSERT INTO chapter_doubts (chapter_id, user_id, question, answer, created_at)
          VALUES (${chapterId}, ${decoded.userId}, ${message}, ${response}, NOW())
          RETURNING id
        `;
      } catch (dbError: any) {
        // Don't fail the request if DB save fails
      }
    }

    return NextResponse.json(
      {
        success: true,
        response: response,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to generate response",
      },
      { status: 500 }
    );
  }
}
