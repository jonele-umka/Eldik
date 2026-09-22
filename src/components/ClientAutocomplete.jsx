import { useMemo, useRef, useState, useEffect } from "react";

export function ClientAutocomplete({
  value,
  onChange,
  options = [],
  placeholder = "Client...",
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef(null);

  const filtered = useMemo(() => {
    if (!value) return options;
    return options.filter((o) => o.toLowerCase().includes(value.toLowerCase()));
  }, [value, options]);

  useEffect(() => {
    const handler = (e) => {
      if (!ref.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (val) => {
    onChange(val);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 180 }}>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        style={{
          background: "var(--s2)",
          border: "1px solid var(--b1)",
          borderRadius: 8,
          padding: "7px 10px",
          color: "var(--text)",
          fontSize: 12,
          width: "100%",
          outline: "none",
        }}
      />

      {open && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "110%",
            left: 0,
            right: 0,
            background: "var(--s1)",
            border: "1px solid var(--b1)",
            borderRadius: 8,
            maxHeight: 220,
            overflowY: "auto",
            zIndex: 999,
          }}
        >
          {filtered.map((c, i) => (
            <div
              key={c}
              onMouseDown={(e) => {
                e.preventDefault();
                select(c);
              }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding: "8px 10px",
                cursor: "pointer",
                fontSize: 12,
                background: i === highlight ? "var(--s2)" : "transparent",
              }}
            >
              {c}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
