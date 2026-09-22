import { useEffect, useState } from "react";

// Тема по умолчанию — светлая (белая). Тёмная включается вручную и
// запоминается в localStorage.
const KEY = "appTheme";

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function getStoredTheme() {
  const t = localStorage.getItem(KEY);
  return t === "dark" ? "dark" : "light";
}

// Вызывается один раз при старте приложения, до первого рендера.
export function initTheme() {
  applyTheme(getStoredTheme());
}

export function useTheme() {
  const [theme, setTheme] = useState(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem(KEY, next);
      return next;
    });
  };

  return { theme, toggleTheme };
}
