import { betterAuth } from "better-auth";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

function getSqliteDatabase() {
  const envPath = process.env.AUTH_DB_PATH || process.env.SQLITE_PATH;
  let dbFilePath = "";
  if (envPath) {
    if (path.isAbsolute(envPath)) {
      dbFilePath = envPath;
    } else {
      const fromRoot = path.resolve(process.cwd(), "..", "..", envPath);
      const fromCwd = path.resolve(process.cwd(), envPath);
      dbFilePath = fs.existsSync(fromRoot) ? fromRoot : (fs.existsSync(fromCwd) ? fromCwd : fromRoot);
    }
  } else {
    const rootPath = path.resolve(process.cwd(), "..", "..", "data", "local.db");
    const cwdPath = path.resolve(process.cwd(), "data", "local.db");
    dbFilePath = fs.existsSync(rootPath) ? rootPath : (fs.existsSync(cwdPath) ? cwdPath : rootPath);
  }

  const dir = path.dirname(dbFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(dbFilePath);

  // Initialize Better Auth tables if not already present
  db.exec(`
    CREATE TABLE IF NOT EXISTS "user" (
      "id" text not null primary key,
      "name" text not null,
      "email" text not null unique,
      "emailVerified" integer not null,
      "image" text,
      "createdAt" date not null,
      "updatedAt" date not null
    );
    CREATE TABLE IF NOT EXISTS "session" (
      "id" text not null primary key,
      "expiresAt" date not null,
      "token" text not null unique,
      "createdAt" date not null,
      "updatedAt" date not null,
      "ipAddress" text,
      "userAgent" text,
      "userId" text not null references "user" ("id") on delete cascade
    );
    CREATE TABLE IF NOT EXISTS "account" (
      "id" text not null primary key,
      "accountId" text not null,
      "providerId" text not null,
      "userId" text not null references "user" ("id") on delete cascade,
      "accessToken" text,
      "refreshToken" text,
      "idToken" text,
      "accessTokenExpiresAt" date,
      "refreshTokenExpiresAt" date,
      "scope" text,
      "password" text,
      "createdAt" date not null,
      "updatedAt" date not null
    );
    CREATE TABLE IF NOT EXISTS "verification" (
      "id" text not null primary key,
      "identifier" text not null,
      "value" text not null,
      "expiresAt" date not null,
      "createdAt" date not null,
      "updatedAt" date not null
    );
  `);

  return db;
}

export const auth = betterAuth({
  database: getSqliteDatabase(),
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET || "roomi-devcamp-2026-auth-secret-key-32charsmin",
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
  },
});
