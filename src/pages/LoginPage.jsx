import { useState } from "react";
import { S } from "../utils/styles.js";

export default function LoginPage({ onLogin }) {
  const [pwd, setPwd] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const submit = () => {
    const ok = onLogin(pwd);
    if (!ok) {
      setError("Неверный пароль");
      setPwd("");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        padding: 16,
      }}
    >
      <div
        style={{
          ...S.card,
          width: "100%",
          maxWidth: 320,
          padding: "32px 28px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>📦</div>

        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
            marginBottom: 20,
          }}
        >
          Вход в систему
        </div>

        <div style={{ position: "relative", marginBottom: 12 }}>
          <input
            type={showPassword ? "text" : "password"}
            autoFocus
            value={pwd}
            onChange={(e) => {
              setPwd(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Пароль"
            style={{
              background: "var(--s2)",
              border: `1px solid ${error ? "var(--red, #f85149)" : "var(--b1)"}`,
              borderRadius: 8,
              padding: "10px 42px 10px 14px",
              color: "var(--text)",
              fontSize: 14,
              outline: "none",
              fontFamily: "Inter, sans-serif",
              width: "100%",
              boxSizing: "border-box",
            }}
          />

          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 18,
              color: "var(--muted)",
              padding: 0,
            }}
          >
            {showPassword ? "🙈" : "👁️"}
          </button>
        </div>

        {error && (
          <div
            style={{
              color: "var(--red, #f85149)",
              fontSize: 12.5,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        <button
          onClick={submit}
          style={{
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 22px",
            fontSize: 13.5,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "Inter, sans-serif",
            width: "100%",
          }}
        >
          Войти
        </button>
      </div>
    </div>
  );
}
