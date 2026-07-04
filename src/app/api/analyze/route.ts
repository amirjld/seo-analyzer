import { NextResponse } from "next/server";
import { analyzeUrl } from "@/lib/seo-analyzer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: unknown };

    if (typeof body.url !== "string" || body.url.trim().length === 0) {
      return NextResponse.json(
        { error: "Enter a valid URL to analyze." },
        { status: 400 }
      );
    }

    const result = await analyzeUrl(body.url);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The page could not be analyzed right now.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
