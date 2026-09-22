export const USERS = {
  5577: { label: "Администратор", pages: "all" },
  2222: { label: "Индира (Производство)", pages: ["production"] },
  3333: { label: "Водитель (Развозка)", pages: ["delivery"] },
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
