const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  { ignores: ["app/public/**"] },
  js.configs.recommended,
  {
    files: ["app/**/*.js"],
    languageOptions: { sourceType: "commonjs", globals: globals.node },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { sourceType: "module", globals: globals.node },
  },
];
