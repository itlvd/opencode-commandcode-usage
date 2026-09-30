import { transformAsync } from "@babel/core";
import typescript from "@babel/preset-typescript";
import solid from "babel-preset-solid";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
await mkdir(new URL("dist/", root), { recursive: true });
for (const file of await readdir(new URL("src/", root))) {
  if (!/\.tsx?$/.test(file)) continue;
  const result = await transformAsync(await readFile(new URL(`src/${file}`, root), "utf8"), {
    filename: file,
    configFile: false,
    babelrc: false,
    presets: [
      ...(file.endsWith(".tsx") ? [[solid, { moduleName: "@opentui/solid", generate: "universal" }]] : []),
      typescript,
    ],
    plugins: [() => ({ visitor: {
      ImportDeclaration(path) {
        if (path.node.source.value.startsWith(".")) {
          path.node.source.value = path.node.source.value.replace(/\.tsx?$/, ".js");
        }
      },
    } })],
  });
  if (!result?.code) throw new Error(`No build output for ${file}`);
  await writeFile(new URL(`dist/${file.replace(/\.tsx?$/, ".js")}`, root), result.code + "\n");
}
