import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { deleteResultSchema, drawSchema, resultsQuerySchema } from "@/src/core/lottery/schema";
import { splitDrawNumbers } from "@/src/core/lottery/analysis";

function parseDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = resultsQuerySchema.safeParse({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const fromDate = parseDate(parsed.data.from);
  const toDate = parseDate(parsed.data.to);

  if (parsed.data.from && !fromDate) {
    return NextResponse.json({ error: "Invalid from date" }, { status: 400 });
  }
  if (parsed.data.to && !toDate) {
    return NextResponse.json({ error: "Invalid to date" }, { status: 400 });
  }

  const where: { date?: { gte?: Date; lte?: Date } } = {};
  if (fromDate || toDate) {
    const range: { gte?: Date; lte?: Date } = {};
    if (fromDate) {
      range.gte = fromDate;
    }
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      range.lte = end;
    }
    where.date = range;
  }

  const results = await prisma.drawResult.findMany({
    where,
    orderBy: { date: "desc" }
  });

  return NextResponse.json({
    results: results.map((draw) => ({
      id: draw.id,
      date: draw.date.toISOString().slice(0, 10),
      game: draw.game,
      numbers: JSON.parse(draw.numbers ?? "[]")
    }))
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = drawSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid draw", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const date = parseDate(parsed.data.date);
  if (!date) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const numbers = parsed.data.numbers;
  const { base } = splitDrawNumbers(numbers);
  const uniqueBase = new Set(base);
  if (uniqueBase.size !== base.length) {
    return NextResponse.json({ error: "Base numbers must be unique" }, { status: 400 });
  }

  try {
    const created = await prisma.drawResult.create({
      data: {
        date,
        game: parsed.data.game,
        numbers: JSON.stringify(numbers)
      }
    });

    return NextResponse.json({
      id: created.id,
      date: created.date.toISOString().slice(0, 10)
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Could not create draw. Ensure date is unique per game." },
      { status: 409 }
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = deleteResultSchema.safeParse({
    id: searchParams.get("id") ?? ""
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid id", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const id = Number(parsed.data.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  await prisma.drawResult.delete({ where: { id } });
  return NextResponse.json({ deleted: id });
}
