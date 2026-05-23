const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg.startsWith("--")) {
    const key = arg.slice(2);
    const value = args[i + 1];
    options[key] = value;
    i += 1;
  }
}

const endpoint = options.endpoint || "http://localhost:3000/api/import-leidsa";
const months = Number(options.months || "12");
const game = options.game || "leidsa-loto";
const filePath = options.file;

if (!filePath) {
  console.error("Usage: node scripts/import-leidsa-select.mjs --file select.html [--months 12] [--game leidsa-loto] [--endpoint http://localhost:3000/api/import-leidsa]");
  process.exit(1);
}

const fs = await import("node:fs/promises");
const html = await fs.readFile(filePath, "utf8");

const values = [];
const regex = /value="([^"]+)"/g;
let match;
while ((match = regex.exec(html)) !== null) {
  if (match[1]) {
    values.push(match[1]);
  }
}

const unique = Array.from(new Set(values));
if (unique.length === 0) {
  console.error("No option values found in the provided HTML.");
  process.exit(1);
}

const payload = {
  gameKeys: unique,
  game,
  months
};

const response = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
});

const body = await response.text();
if (!response.ok) {
  console.error(`Request failed (${response.status}): ${body}`);
  process.exit(1);
}

console.log(body);
