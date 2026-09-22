module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
  plugins: ["react"],
  settings: { react: { version: "18.2" } },
  extends: ["eslint:recommended", "plugin:react/recommended", "plugin:react/jsx-runtime"],
  rules: { "react/prop-types": "off", "no-unused-vars": "warn", "no-empty": "off" },
};
