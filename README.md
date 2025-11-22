# 🔐 Authentication System with Next.js & Neon DB

Complete authentication backend for TUTOR application.

## ✨ Features

- **Next.js 15** with App Router
- **Neon PostgreSQL** serverless database
- **TypeScript** for type safety
- **JWT Authentication** with 7-day expiration
- **Bcrypt** password hashing (10 rounds)
- **Zod** schema validation
- **CORS** enabled for React client

## 🚀 Quick Setup

### 1. Configure Neon Database

1. Go to **[Neon Console](https://console.neon.tech)**
2. Sign up (free tier available)
3. Create a new project
4. Copy your connection string

### 2. Update .env.local

```env
DATABASE_URL=your_neon_connection_string_here
JWT_SECRET=your_secret_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Start Server

```bash
npm run dev
```

Server runs on: **http://localhost:3000**

## 📡 API Endpoints

### POST `/api/auth/signup`

- Name (min 2 chars)
- Email (valid format)
- Password (min 6 chars)

### POST `/api/auth/signin`

- Email
- Password

## 🔧 Integration with React Client

**Terminal 1:**

```bash
cd auth-system
npm run dev
```

**Terminal 2:**

```bash
cd ../client
npm run dev
```

React client already configured to use this backend at `http://localhost:3000`.

---

**Ready to use! Just add Neon DB credentials.** 🚀
