-- CreateTable
CREATE TABLE "WinnerRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "signature" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "drawDate" DATETIME,
    "winnerName" TEXT,
    "prizeAmountText" TEXT,
    "prizeAmountValue" REAL,
    "currency" TEXT,
    "location" TEXT,
    "detailUrl" TEXT,
    "sourcePage" INTEGER,
    "sourceOrder" INTEGER,
    "rawText" TEXT NOT NULL,
    "rawPayload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "drawResultId" INTEGER,
    CONSTRAINT "WinnerRecord_drawResultId_fkey" FOREIGN KEY ("drawResultId") REFERENCES "DrawResult" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WinnerRecord_signature_key" ON "WinnerRecord"("signature");

-- CreateIndex
CREATE INDEX "WinnerRecord_game_category_drawDate_idx" ON "WinnerRecord"("game", "category", "drawDate");

-- CreateIndex
CREATE INDEX "WinnerRecord_drawResultId_idx" ON "WinnerRecord"("drawResultId");
