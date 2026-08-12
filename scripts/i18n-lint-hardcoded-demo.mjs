import { ESLint } from "eslint";
import path from "node:path";

const cwd = process.cwd();
const eslint = new ESLint({ cwd });
const [{ messages }] = await eslint.lintText(
  "export function Demo() {\n  return <p>Hardcoded copy</p>;\n}\n",
  { filePath: path.join(cwd, "apps/web/src/components/I18nDemo.tsx") },
);

const failed = messages.some(
  (message) => message.ruleId === "garage-i18n/no-hardcoded-user-visible-strings",
);

if (!failed) {
  console.error("Expected the i18n hardcoded-string rule to report a JSX text failure.");
  process.exitCode = 1;
} else {
  console.log("i18n hardcoded-string rule reported the demo JSX text as expected.");
}
