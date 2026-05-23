export type LeidsaDraw = {
  date: Date;
  numbers: number[];
};

function parseNumbersFromString(value: string): number[] {
  return value
    .split(/[^0-9]+/)
    .map((item) => Number(item))
    .filter((item) => !Number.isNaN(item));
}

function asNumberArray(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    const flattened: number[] = [];
    for (const item of value) {
      if (item && typeof item === "object" && "drawnValues" in item) {
        const nested = asNumberArray((item as Record<string, unknown>).drawnValues);
        if (nested) {
          flattened.push(...nested);
        }
      } else {
        const parsed = Number(item);
        if (!Number.isNaN(parsed)) {
          flattened.push(parsed);
        }
      }
    }
    const numbers = flattened.filter((item) => !Number.isNaN(item));
    return numbers.length > 0 ? numbers : null;
  }
  if (typeof value === "string") {
    const numbers = parseNumbersFromString(value);
    return numbers.length > 0 ? numbers : null;
  }
  return null;
}

function pickFirstDate(entry: Record<string, unknown>): Date | null {
  const candidates = [
    entry.date,
    entry.drawDate,
    entry.draw_date,
    entry.resultDate,
    entry.result_date
  ];
  for (const value of candidates) {
    if (typeof value === "string") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }
  return null;
}

function pickNumbers(entry: Record<string, unknown>): number[] | null {
  const candidates = [
    entry.numbers,
    entry.results,
    entry.drawNumbers,
    entry.winningNumbers,
    entry.numberCombination,
    entry.combination
  ];
  for (const value of candidates) {
    const numbers = asNumberArray(value);
    if (numbers) {
      return numbers;
    }
  }
  return null;
}

function maybeAppendExtras(numbers: number[], entry: Record<string, unknown>): number[] {
  const extras: number[] = [];
  const mas = asNumberArray(entry.mas ?? entry.masNumber ?? entry.mas_number);
  const superMas = asNumberArray(entry.superMas ?? entry.supermas ?? entry.superMasNumber ?? entry.supermasNumber);

  if (mas && mas.length > 0) {
    extras.push(mas[0]);
  }
  if (superMas && superMas.length > 0) {
    extras.push(superMas[0]);
  }

  if (extras.length === 0) {
    return numbers;
  }
  return [...numbers, ...extras];
}

export function parseLeidsaDraws(payload: unknown): LeidsaDraw[] {
  if (payload && typeof payload === "object") {
    const objectPayload = payload as Record<string, unknown>;
    const drawTime = objectPayload.drawTime;
    const results = objectPayload.results;
    if (typeof drawTime === "string" && results && typeof results === "object") {
      const parsedDate = new Date(drawTime);
      const resultsObj = results as Record<string, unknown>;
      const mainDraws = resultsObj.drawnValues;
      const bonusDraws = resultsObj.bonusDraws;
      const mainNumbers = asNumberArray(mainDraws);
      const bonusNumbers = asNumberArray(bonusDraws);

      const combined = mainNumbers ? [...mainNumbers] : [];
      if (bonusNumbers && bonusNumbers.length > 0) {
        combined.push(...bonusNumbers);
      }

      if (!Number.isNaN(parsedDate.getTime()) && combined.length > 0) {
        return [{ date: parsedDate, numbers: combined }];
      }
    }
  }

  let entries: unknown[] = [];
  if (Array.isArray(payload)) {
    entries = payload;
  } else if (payload && typeof payload === "object") {
    const objectPayload = payload as Record<string, unknown>;
    const candidates = [
      objectPayload.data,
      objectPayload.results,
      objectPayload.drawResults,
      objectPayload.draws
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        entries = candidate;
        break;
      }
    }
  }

  const parsed: LeidsaDraw[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const date = pickFirstDate(record);
    if (!date) {
      continue;
    }
    const numbers = pickNumbers(record);
    if (!numbers || numbers.length === 0) {
      continue;
    }
    const enriched = maybeAppendExtras(numbers, record);
    parsed.push({ date, numbers: enriched });
  }
  return parsed;
}
