import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

// The real password lives in an environment variable on the server and is NEVER shipped to the
// browser bundle. The fallback only exists so the feature works out-of-the-box in local dev.
const PASSWORD = process.env.MODEL_UNLOCK_PASSWORD ?? "Nandan@123";

// Secret used to sign the unlock cookie so it can't be forged on the client.
const SECRET = process.env.MODEL_UNLOCK_SECRET ?? "dev-only-insecure-secret-change-me";

const COOKIE_NAME = "model_unlock";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

// Naive per-process, in-memory rate limiter. Enough to slow brute-force guessing; for a multi-
// instance deployment, back this with a shared store (e.g. Redis) instead.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; first: number }>();

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Still run a comparison so the response time doesn't leak length information.
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

function signToken(expires: number): string {
  const payload = String(expires);
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  if (!timingSafeEqual(sig, expected)) return false;
  const expires = Number(payload);
  return Number.isFinite(expires) && expires > Date.now();
}

function clientKey(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

// Lets the client restore the "unlocked" state after a reload without re-entering the password.
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  return NextResponse.json({ unlocked: verifyToken(token) });
}

export async function POST(req: NextRequest) {
  const key = clientKey(req);
  const now = Date.now();
  const record = attempts.get(key);

  if (record && now - record.first < RATE_WINDOW_MS && record.count >= RATE_MAX_ATTEMPTS) {
    return NextResponse.json(
      { success: false, error: "Too many attempts. Please wait a minute and try again." },
      { status: 429 }
    );
  }

  let password = "";
  try {
    const body = await req.json();
    if (typeof body?.password === "string") password = body.password;
  } catch {
    password = "";
  }

  const ok = timingSafeEqual(password, PASSWORD);

  if (!ok) {
    const next =
      record && now - record.first < RATE_WINDOW_MS
        ? { count: record.count + 1, first: record.first }
        : { count: 1, first: now };
    attempts.set(key, next);
    return NextResponse.json({ success: false, error: "Incorrect password." }, { status: 401 });
  }

  attempts.delete(key);

  const res = NextResponse.json({ success: true });
  res.cookies.set(COOKIE_NAME, signToken(now + TOKEN_TTL_MS), {
    httpOnly: true, // not readable by JavaScript
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(TOKEN_TTL_MS / 1000),
  });
  return res;
}
