import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const examplesDir = path.join(root, "public", "examples");
const indexPath = path.join(examplesDir, "index.json");

if (!fs.existsSync(indexPath)) {
  console.error(`missing examples index: ${indexPath}`);
  process.exit(1);
}

const parsed = JSON.parse(fs.readFileSync(indexPath, "utf-8")) as { examples?: Array<{ id: string; name: string; file: string; imported?: boolean }> };
const target = process.argv[2]?.trim();
const rows = (parsed.examples || []).filter((item) => item.imported !== false);
const selected = target ? rows.filter((item) => item.id === target) : rows;

if (!selected.length) {
  console.error(target ? `no imported example matched: ${target}` : "no imported examples found");
  process.exit(1);
}

for (const item of selected) {
  const filePath = path.join(root, "public", item.file.replace(/^\//, ""));
  const run = spawnSync("npx", ["tsx", "scripts/import_board_json_to_db.ts", filePath, item.id, item.name], {
    cwd: root,
    stdio: "inherit",
  });
  if (run.status !== 0) process.exit(run.status || 1);
}

console.log(JSON.stringify({ imported: selected.map((item) => item.id) }));
