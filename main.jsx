import React from "react";
import ReactDOM from "react-dom/client";
import App from "./src/App";
import { initTheme } from "./src/utils/theme.js";
import "./index.css";

// Применяем сохранённую тему СРАЗУ при старте, до первого рендера —
// иначе страница всегда открывается со светлой темой (дефолт в CSS),
// и только переход в «Настройки» (где стоит useTheme()) возвращает
// тёмную тему, создавая впечатление случайного «сброса».
initTheme();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
