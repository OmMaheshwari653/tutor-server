import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Get origin from request or default to localhost:5173
  const origin = request.headers.get("origin") || "http://localhost:5173";

  // Allow local development and production origins
  const allowedOrigins = [
    "http://localhost:5173", 
    "http://localhost:5174",
    "https://tutor-client-git-main-oms-projects-51b74251.vercel.app",
    "https://tutor-client.vercel.app" // Add your main domain if different
  ];

  const isAllowedOrigin = allowedOrigins.includes(origin);
  const allowOrigin = isAllowedOrigin ? origin : allowedOrigins[0];

  // Handle preflight OPTIONS request
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": allowOrigin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Handle CORS for API routes
  const response = NextResponse.next();

  response.headers.set("Access-Control-Allow-Origin", allowOrigin);
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  response.headers.set("Access-Control-Allow-Credentials", "true");

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
