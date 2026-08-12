import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type LocaleValue = string | LocaleTree;
type LocaleTree = { [key: string]: LocaleValue };

const localesDir = path.join(process.cwd(), "apps/web/src/locales");
const englishPath = path.join(localesDir, "en.json");

const english = JSON.parse(await readFile(englishPath, "utf8")) as LocaleTree;
const localeFiles = (await readdir(localesDir)).filter((file) => file.endsWith(".json") && file !== "en.json");

for (const file of localeFiles) {
  const targetPath = path.join(localesDir, file);
  const existing = JSON.parse(await readFile(targetPath, "utf8")) as LocaleTree;
  const stubbed = stubFromEnglish(english, existing);
  await writeFile(targetPath, `${JSON.stringify(stubbed, null, 2)}\n`);
}

function stubFromEnglish(englishNode: LocaleTree, targetNode: LocaleTree): LocaleTree {
  return Object.fromEntries(
    Object.entries(englishNode).map(([key, englishValue]) => {
      const targetValue = targetNode[key];
      if (typeof englishValue === "string") {
        return [key, typeof targetValue === "string" ? targetValue : englishValue];
      }
      const targetChild = isLocaleTree(targetValue) ? targetValue : {};
      return [key, stubFromEnglish(englishValue, targetChild)];
    }),
  );
}

function isLocaleTree(value: LocaleValue | undefined): value is LocaleTree {
  return typeof value === "object" && value !== null;
}
