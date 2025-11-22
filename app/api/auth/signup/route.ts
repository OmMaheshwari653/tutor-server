import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql, ensureDBInitialized } from "@/lib/db";
import { generateToken } from "@/lib/jwt";
import { signupSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  try {
    // Ensure database is initialized
    await ensureDBInitialized();

    const body = await req.json();

    // Validate input
    const validatedData = signupSchema.parse(body);
    const { name, email, password } = validatedData;

    // Check if user already exists
    const existingUser = await sql`
      SELECT id FROM users WHERE email = ${email}
    `;

    if (existingUser.length > 0) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = await sql`
      INSERT INTO users (name, email, password)
      VALUES (${name}, ${email}, ${hashedPassword})
      RETURNING id, name, email, created_at
    `;

    const user = result[0];

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Account created successfully",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        token,
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: error.errors,
        },
        { status: 400 }
      );
    }

    // Database constraint violation (duplicate email)
    if (error.code === "23505" || error.message?.includes("duplicate")) {
      return NextResponse.json(
        {
          success: false,
          error: "User with this email already exists",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to create account. Please try again.",
      },
      { status: 500 }
    );
  }
}
