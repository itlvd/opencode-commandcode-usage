import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = await mkdtemp(join(tmpdir(), "commandcode-package-"));
const run = (command, args, cwd = temp, env = process.env) =>
  execFileSync(command, args, { cwd, env, stdio: "inherit" });
try {
  // A real tarball and installation, outside the repository and its tsconfig.
  const output = execFileSync("npm", ["pack", "--json", "--pack-destination", temp], { cwd: root, encoding: "utf8" });
  const [packed] = JSON.parse(output);
  assert(packed.files.some(file => file.path === "dist/tui.js"));
  assert(!packed.files.some(file => /\.(ts|tsx)$/.test(file.path)));
  await writeFile(join(temp, "package.json"), JSON.stringify({ private: true, type: "module" }));
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", join(temp, packed.filename)]);
  const manifest = JSON.parse(await readFile(join(temp, "node_modules/@itlvd/opencode-commandcode-usage/package.json"), "utf8"));
  assert.equal(manifest.exports["./tui"], "./dist/tui.js");
  await writeFile(join(temp, "exports.ts"), `
    import assert from "node:assert/strict";
    import server from "@itlvd/opencode-commandcode-usage";
    import { CommandCode, StatusSchema } from "@itlvd/opencode-commandcode-usage/rpc";
    assert.equal(typeof server.setup, "function");
    assert.ok(CommandCode);
    assert.ok(StatusSchema.safeParse({}).success === false);
  `);
  run("bun", ["exports.ts"]);
  await copyFile(join(root, "tests/tui-smoke.tsx"), join(temp, "smoke.ts"));
  // No JSX preload: the installed artifact must already be compiled.
  run("bun", ["--conditions=browser", "smoke.ts"], temp, { ...process.env, PACKAGE_SMOKE: "1" });
  console.log("npm artifact smoke passed outside source: import, native render and reactive update.");
} finally {
  await rm(temp, { recursive: true, force: true });
}
