// У Индиры и водителя теперь общая страница «Производство / Развозка»
// с переключателем наверху — оба кода ведут на один и тот же экран (production).
export const USERS = {
  5577: { label: "Администратор", pages: "all" },
  2222: { label: "Индира (Производство/Развозка)", pages: ["production"] },
  3333: { label: "Водитель (Производство/Развозка)", pages: ["production"] },
};

const STORAGE_KEY = "gsAuthUser";

export function getStoredUser() {
  const u = localStorage.getItem(STORAGE_KEY) || "";
  return USERS[u] ? u : "";
}

export function setStoredUser(user) {
  if (user) localStorage.setItem(STORAGE_KEY, user);
  else localStorage.removeItem(STORAGE_KEY);
}

export function checkPassword(pwd) {
  const clean = String(pwd || "").trim();
  return USERS[clean] ? clean : null;
}

export function getAllowedPages(user) {
  return USERS[user]?.pages || [];
}

export function isPageAllowed(user, pageKey) {
  const allowed = getAllowedPages(user);
  return allowed === "all" || allowed.includes(pageKey);
}

export function getUserLabel(user) {
  return USERS[user]?.label || "";
}
