export type DrawResult = {
  date: Date;
  game: string;
  numbers: number[];
};

export type Constraints = {
  game: string;
  count: number;
  evenMin: number;
  evenMax: number;
  sumMin: number;
  sumMax: number;
  avoidLastN: number;
  includeMas: boolean;
  includeSuperMas: boolean;
  drawDay: "auto" | "wednesday" | "saturday";
  target: "balanced" | "base" | "mas" | "supermas" | "jackpot";
  seed?: string | null;
};

export type SuggestionMetadata = {
  generatedAt: string;
  seed: string | null;
  candidatesConsidered: number;
  strategy: "legacy" | "improved" | "python-v2";
};

export type SuggestionResult = {
  tickets: number[][];
  metadata: SuggestionMetadata;
};

export type Frequency = {
  number: number;
  count: number;
};

export type PairFrequency = {
  pair: [number, number];
  count: number;
};
