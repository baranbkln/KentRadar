import { NextRequest, NextResponse } from "next/server";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;
const MAX_TRACKED_IPS = 10_000;

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitGlobal = typeof globalThis & {
  __kentRadarRateLimitBuckets?: Map<string, RateLimitBucket>;
  __kentRadarRateLimitSweepAt?: number;
};

const rateLimitGlobal = globalThis as RateLimitGlobal;
const buckets =
  rateLimitGlobal.__kentRadarRateLimitBuckets ??
  new Map<string, RateLimitBucket>();

rateLimitGlobal.__kentRadarRateLimitBuckets = buckets;

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstAddress = forwardedFor.split(",")[0]?.trim();
    if (firstAddress) return firstAddress;
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function shouldRateLimit(request: NextRequest): boolean {
  if (request.nextUrl.pathname.startsWith("/api/")) return true;

  return request.method === "POST" && request.headers.has("next-action");
}

function sweepExpiredBuckets(now: number) {
  const nextSweepAt = rateLimitGlobal.__kentRadarRateLimitSweepAt ?? 0;
  if (now < nextSweepAt && buckets.size <= MAX_TRACKED_IPS) return;

  for (const [ip, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(ip);
  }

  if (buckets.size > MAX_TRACKED_IPS) {
    const overflow = buckets.size - MAX_TRACKED_IPS;
    let removed = 0;
    for (const ip of buckets.keys()) {
      buckets.delete(ip);
      removed += 1;
      if (removed >= overflow) break;
    }
  }

  rateLimitGlobal.__kentRadarRateLimitSweepAt = now + WINDOW_MS;
}

export function middleware(request: NextRequest) {
  if (!shouldRateLimit(request)) return NextResponse.next();

  const now = Date.now();
  sweepExpiredBuckets(now);

  const ip = getClientIp(request);
  const current = buckets.get(ip);
  const bucket =
    !current || current.resetAt <= now
      ? { count: 0, resetAt: now + WINDOW_MS }
      : current;

  bucket.count += 1;
  buckets.set(ip, bucket);

  const remaining = Math.max(0, MAX_REQUESTS - bucket.count);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((bucket.resetAt - now) / 1_000),
  );

  if (bucket.count > MAX_REQUESTS) {
    return NextResponse.json(
      { error: "Too Many Requests" },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(retryAfterSeconds),
          "X-RateLimit-Limit": String(MAX_REQUESTS),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(bucket.resetAt / 1_000)),
        },
      },
    );
  }

  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(MAX_REQUESTS));
  response.headers.set("X-RateLimit-Remaining", String(remaining));
  response.headers.set(
    "X-RateLimit-Reset",
    String(Math.ceil(bucket.resetAt / 1_000)),
  );
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|woff|woff2|ttf)$).*)",
  ],
};
