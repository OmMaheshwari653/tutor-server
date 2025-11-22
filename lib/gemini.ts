import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

// Generate course structure with Gemini
export async function generateCourseStructure(params: {
  topic: string;
  difficulty: string;
  duration: number;
  language: string;
  category?: string;
}) {
  if (!genAI) {
    throw new Error("Gemini API not configured");
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You are an expert educational content creator. Generate a comprehensive course structure for the following:

Topic: ${params.topic}
Difficulty Level: ${params.difficulty}
Duration: ${params.duration} weeks
Language: ${params.language}
Category: ${params.category || "General"}

Generate a JSON response with the following structure:
{
  "courseTitle": "Complete course title",
  "description": "Course description (2-3 sentences)",
  "chapters": [
    {
      "chapterNumber": 1,
      "title": "Chapter title",
      "description": "Chapter description",
      "durationMinutes": 45,
      "topics": [
        {
          "topicName": "Topic name",
          "explanation": "Detailed explanation in ${params.language}",
          "keyPoints": ["point 1", "point 2", "point 3"],
          "examples": [
            {
              "problem": "Example problem",
              "solution": "Solution",
              "explanation": "Explanation"
            }
          ],
          "practiceQuestions": [
            {
              "question": "Practice question",
              "difficulty": "easy|medium|hard",
              "hint": "Helpful hint"
            }
          ]
        }
      ]
    }
  ]
}

Generate ${Math.ceil(
    params.duration * 1.5
  )} chapters with 3-5 topics each. Make content engaging, practical, and suitable for ${
    params.difficulty
  } level learners.`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Extract JSON from response (sometimes wrapped in markdown)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Invalid JSON response from Gemini");
    }

    const courseData = JSON.parse(jsonMatch[0]);
    return courseData;
  } catch (error: any) {
    console.error("Gemini API error:", error);
    throw new Error("Failed to generate course content: " + error.message);
  }
}

// Generate chapter notes with AI
export async function generateChapterNotes(params: {
  chapterTitle: string;
  topic: string;
  difficulty: string;
  language: string;
}) {
  if (!genAI) {
    throw new Error("Gemini API not configured");
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You are an expert teacher. Create detailed study notes for:

Chapter: ${params.chapterTitle}
Subject: ${params.topic}
Difficulty: ${params.difficulty}
Language: ${params.language}

Generate comprehensive notes covering:
1. Introduction and overview
2. Key concepts with explanations
3. Important formulas/definitions
4. Real-world examples
5. Common mistakes to avoid
6. Practice tips

Write in a friendly, conversational tone suitable for ${params.difficulty} level students. Use ${params.language} language.

Format the notes in clean markdown with proper headings, bullet points, and examples.`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error: any) {
    console.error("Gemini notes generation error:", error);
    throw new Error("Failed to generate notes: " + error.message);
  }
}

// Generate voice notes script for TTS
export async function generateVoiceScript(params: {
  chapterTitle: string;
  topicName: string;
  content: string;
  language: string;
}) {
  if (!genAI) {
    throw new Error("Gemini API not configured");
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `Convert the following educational content into a natural, conversational script for text-to-speech:

Chapter: ${params.chapterTitle}
Topic: ${params.topicName}
Language: ${params.language}

Content:
${params.content}

Create a script that:
1. Sounds natural when spoken aloud
2. Uses conversational language (like a teacher explaining)
3. Includes pauses and transitions
4. Uses ${params.language} with appropriate expressions
5. Keeps sentences short and clear
6. Maximum 2-3 minutes when spoken

Format: Plain text, one paragraph per main idea.`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error: any) {
    console.error("Voice script generation error:", error);
    throw new Error("Failed to generate voice script: " + error.message);
  }
}
