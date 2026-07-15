import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type HealthResponse = {
  status: "healthy" | "unhealthy";
  timestamp: string;
  database: "connected" | "disconnected";
};

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("road_issues").select("id").limit(1);

    if (error) throw error;

    return NextResponse.json<HealthResponse>(
      {
        status: "healthy",
        timestamp,
        database: "connected",
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("Health check database ping failed", error);

    return NextResponse.json<HealthResponse>(
      {
        status: "unhealthy",
        timestamp,
        database: "disconnected",
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
