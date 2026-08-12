import tseslint from "typescript-eslint";

const visibleAttributeNames = new Set(["aria-label", "alt", "placeholder", "title"]);
const hardcodedUserVisibleStringsRule = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      hardcoded: "Use i18n keys instead of hardcoded user-visible strings.",
    },
  },
  create(context) {
    function reportIfVisible(node, value) {
      if (/[A-Za-z]/.test(value.trim())) {
        context.report({ node, messageId: "hardcoded" });
      }
    }
    return {
      JSXText(node) {
        reportIfVisible(node, node.value);
      },
      JSXAttribute(node) {
        const attrName = node.name.type === "JSXIdentifier" ? node.name.name : "";
        if (!visibleAttributeNames.has(attrName) || !node.value || node.value.type !== "Literal") return;
        reportIfVisible(node, String(node.value.value));
      },
    };
  },
};

export default tseslint.config(
  { ignores: ["**/dist/**", "**/legacy/**", "**/.turbo/**", "**/coverage/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["apps/web/src/components/**/*.{ts,tsx}"],
    plugins: {
      "garage-i18n": {
        rules: {
          "no-hardcoded-user-visible-strings": hardcodedUserVisibleStringsRule,
        },
      },
    },
    rules: {
      "garage-i18n/no-hardcoded-user-visible-strings": "error",
    },
  },
);
