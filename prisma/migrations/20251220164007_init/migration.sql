-- CreateTable
CREATE TABLE "DrawResult" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "game" TEXT NOT NULL,
    "numbers" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SuggestionRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "constraints" TEXT NOT NULL,
    "suggestions" TEXT NOT NULL,
    "seed" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "DrawResult_game_date_key" ON "DrawResult"("game", "date");
