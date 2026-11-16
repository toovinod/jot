import { lstatSync } from "node:fs";
import { authoredSourceFiles, excludedSourcePath } from "./source-inventory";

const maxTextFileBytes = 10 * 1024 * 1024;
const decoder = new TextDecoder("utf-8", { fatal: true });
const violations: string[] = [];
for (const path of authoredSourceFiles()) {
  if (excludedSourcePath(path)) continue;
  try {
    const metadata = lstatSync(path);
    if (!metadata.isFile()) continue;
    if (metadata.size > maxTextFileBytes)
      throw new Error(`Source policy text file exceeds its safety bound: ${path}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
    throw error;
  }
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  if (bytes.includes(0)) continue;
  let content: string;
  try {
    content = decoder.decode(bytes);
  } catch {
    continue;
  }
  for (const [index, line] of content.split("\n").entries()) {
    if (/\u2014/u.test(line)) violations.push(`${path}:${index + 1}: em dash`);
    if (/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20E3]/u.test(line))
      violations.push(`${path}:${index + 1}: emoji`);
  }
}
if (violations.length) {
  console.error("Source policy failed:\n" + violations.join("\n"));
  process.exit(1);
}
console.log("Source policy passed.");
