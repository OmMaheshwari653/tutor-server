import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql, ensureDBInitialized } from "@/lib/db";
import { generateToken } from "@/lib/jwt";
import { signinSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  try {
    // Ensure database is initialized
    await ensureDBInitialized();

    const body = await req.json();

    // Validate input
    const validatedData = signinSchema.parse(body);
    const { email, password } = validatedData;

    // Find user
    const users = await sql`
      SELECT id, name, email, password FROM users WHERE email = ${email}
    `;

    if (users.length === 0) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const user = users[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Signed in successfully",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        token,
      },
      { status: 200 }
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

    return NextResponse.json(
      {
        success: false,
        error: "Failed to sign in. Please try again.",
      },
      { status: 500 }
    );
  }
}
