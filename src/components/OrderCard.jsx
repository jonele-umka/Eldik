import { useMemo } from "react";
import { fmtM } from "../utils/index.js";
import { Badge, MoneyCell, ProductThumb } from "./UI.jsx";

export function OrderCard({ group, prices, onSelectClient, onOpen }) {
  const imageByProduct = useMemo(() => {
    const m = {};
    (prices || []).forEach((p) => {
      if (p.product) m[p.product] = p.image || "";
    });
    return m;
  }, [prices]);

  const {
    client,
    market,
    orderDate,
    deliveryDate,
    status,
    rows,
    totalSum,
    paidAmount = 0,
    returnedAmount = 0,

    // Новые поля
    offsetAmount = 0,
    totalPaidAmount,
  } = group;

  // Сумма заказа после возвратов
  const effectiveTotal = Math.max(
    0,
    Number(totalSum || 0) - Number(returnedAmount || 0),
  );

  // Обычная оплата
  const normalPayment = Number(paidAmount || 0);

  // Погашение через взаимозачёт
  const offsetPayment = Number(offsetAmount || 0);

  // Всего погашено.
  // Если totalPaidAmount передан из ClientDetailPage —
  // используем его.
  const paid =
    totalPaidAmount !== undefined
      ? Number(totalPaidAmount || 0)
      : normalPayment + offsetPayment;

  // Защита: погашение не должно быть больше суммы к оплате
  const actualPaid = Math.min(effectiveTotal, paid);

  // Остаток долга
  const debt = Math.max(0, effectiveTotal - actualPaid);

  // Статус оплаты
  const isFullyPaid = effectiveTotal > 0 && debt <= 0;

  const isPartiallyPaid = actualPaid > 0 && debt > 0;

  const hasReturn = Number(returnedAmount || 0) > 0;

  // Цвет карточки
  let borderColor;
  let bgColor;
  let statusDot;

  if (isFullyPaid) {
    borderColor = "rgba(63,185,80,0.5)";
    bgColor = "rgba(63,185,80,0.06)";
    statusDot = "var(--green)";
  } else if (isPartiallyPaid) {
    borderColor = "rgba(210,153,34,0.5)";
    bgColor = "rgba(210,153,34,0.07)";
    statusDot = "var(--yellow)";
  } else {
    borderColor = "rgba(248,81,73,0.4)";
    bgColor = "rgba(248,81,73,0.06)";
    statusDot = "var(--red)";
  }

  // Процент погашения
  const pct =
    effectiveTotal > 0
      ? Math.min(100, Math.round((actualPaid / effectiveTotal) * 100))
      : 0;

  return (
    <div
      style={{
        background: bgColor,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 12,
        marginBottom: 12,
        overflow: "hidden",
      }}
    >
      {/* =========================
          ЗАГОЛОВОК
      ========================= */}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: `1px solid ${borderColor}`,
          background: bgColor,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: statusDot,
              flexShrink: 0,
            }}
          />

          <span
            onClick={() => onSelectClient?.(client)}
            style={{
              fontWeight: 700,
              fontSize: 14,
              cursor: onSelectClient ? "pointer" : "default",
              color: onSelectClient ? "var(--accent)" : "inherit",
            }}
            onMouseEnter={(e) => {
              if (onSelectClient) {
                e.currentTarget.style.textDecoration = "underline";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.textDecoration = "none";
            }}
          >
            {client}
          </span>

          <span
            style={{
              fontSize: 11,
              color: "var(--muted)",
              background: "var(--s2)",
              borderRadius: 6,
              padding: "2px 7px",
            }}
          >
            {market}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: "var(--muted)",
            }}
          >
            📅 {orderDate}
          </span>

          {deliveryDate && (
            <span
              style={{
                fontSize: 12,
                color: "var(--muted)",
              }}
            >
              🚚 {deliveryDate}
            </span>
          )}

          {status && <Badge status={status} />}

          {onOpen && (
            <button
              onClick={() => onOpen(group)}
              title="Открыть заказ"
              style={{
                background: "var(--s2)",
                border: "1px solid var(--b1)",
                borderRadius: 7,
                padding: "4px 10px",
                color: "var(--accent)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ✏️ Открыть
            </button>
          )}
        </div>
      </div>

      {/* =========================
          ТОВАРЫ
      ========================= */}

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            minWidth: 500,
          }}
        >
          <thead>
            <tr
              style={{
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <th
                style={{
                  padding: "8px 14px",
                  textAlign: "left",
                  fontSize: 10,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                }}
              >
                Товар
              </th>

              <th
                style={{
                  padding: "8px 14px",
                  textAlign: "left",
                  fontSize: 10,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                }}
              >
                Кол-во
              </th>

              <th
                style={{
                  padding: "8px 14px",
                  textAlign: "left",
                  fontSize: 10,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                }}
              >
                Цена
              </th>

              <th
                style={{
                  padding: "8px 14px",
                  textAlign: "right",
                  fontSize: 10,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                }}
              >
                Сумма
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.id || i}
                style={{
                  borderTop: i === 0 ? "none" : "1px solid var(--b1)",
                }}
              >
                <td
                  style={{
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ProductThumb src={imageByProduct[r.product]} size={26} />
                    {r.product}
                  </div>
                </td>

                <td
                  style={{
                    padding: "8px 14px",
                    fontFamily: "JetBrains Mono,monospace",
                    fontSize: 12.5,
                  }}
                >
                  {r.paidQuantity ?? r.quantity}
                </td>

                <td
                  style={{
                    padding: "8px 14px",
                  }}
                >
                  <MoneyCell n={r.price} />
                </td>

                <td
                  style={{
                    padding: "8px 14px",
                    textAlign: "right",
                    fontWeight: 600,
                  }}
                >
                  <MoneyCell n={r.total} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* =========================
          ИТОГ
      ========================= */}

      <div
        style={{
          padding: "10px 16px",
          borderTop: `1px solid ${borderColor}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          {/* Общая сумма */}

          <div style={{ fontSize: 12 }}>
            <span
              style={{
                color: "var(--muted)",
              }}
            >
              Итого:{" "}
            </span>

            <span
              style={{
                fontFamily: "JetBrains Mono,monospace",
                fontWeight: 600,
              }}
            >
              {fmtM(totalSum)}
            </span>
          </div>

          {/* Возврат */}

          {hasReturn && (
            <div style={{ fontSize: 12 }}>
              <span
                style={{
                  color: "var(--muted)",
                }}
              >
                Возврат:{" "}
              </span>

              <span
                style={{
                  fontFamily: "JetBrains Mono,monospace",
                  color: "var(--yellow)",
                  fontWeight: 600,
                }}
              >
                −{fmtM(returnedAmount)}
              </span>
            </div>
          )}

          {/* К оплате */}

          {hasReturn && (
            <div style={{ fontSize: 12 }}>
              <span
                style={{
                  color: "var(--muted)",
                }}
              >
                К оплате:{" "}
              </span>

              <span
                style={{
                  fontFamily: "JetBrains Mono,monospace",
                  fontWeight: 600,
                }}
              >
                {fmtM(effectiveTotal)}
              </span>
            </div>
          )}

          {/* Обычная оплата */}

          {normalPayment > 0 && (
            <div style={{ fontSize: 12 }}>
              <span
                style={{
                  color: "var(--muted)",
                }}
              >
                Оплата:{" "}
              </span>

              <span
                style={{
                  fontFamily: "JetBrains Mono,monospace",
                  color: "var(--green)",
                  fontWeight: 600,
                }}
              >
                {fmtM(normalPayment)}
              </span>
            </div>
          )}

          {/* Взаимозачёт */}

          {offsetPayment > 0 && (
            <div style={{ fontSize: 12 }}>
              <span
                style={{
                  color: "var(--muted)",
                }}
              >
                Зачёт:{" "}
              </span>

              <span
                style={{
                  fontFamily: "JetBrains Mono,monospace",
                  color: "#a371f7",
                  fontWeight: 600,
                }}
              >
                {fmtM(offsetPayment)}
              </span>
            </div>
          )}
        </div>

        {/* =========================
            СТАТУС ОПЛАТЫ
        ========================= */}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          {isFullyPaid ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 16 }}>✅</span>

              <span
                style={{
                  fontFamily: "JetBrains Mono,monospace",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--green)",
                }}
              >
                {fmtM(actualPaid)}
              </span>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              {actualPaid > 0 && (
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--muted)",
                      marginBottom: 1,
                    }}
                  >
                    Погашено
                  </div>

                  <span
                    style={{
                      fontFamily: "JetBrains Mono,monospace",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--green)",
                    }}
                  >
                    {fmtM(actualPaid)}
                  </span>
                </div>
              )}

              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--muted)",
                    marginBottom: 1,
                  }}
                >
                  Долг
                </div>

                <span
                  style={{
                    fontFamily: "JetBrains Mono,monospace",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--red)",
                  }}
                >
                  {fmtM(debt)}
                </span>
              </div>
            </div>
          )}

          {/* Прогресс */}

          {effectiveTotal > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <div
                style={{
                  width: 80,
                  height: 5,
                  background: "var(--s3)",
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: isFullyPaid
                      ? "var(--green)"
                      : isPartiallyPaid
                        ? "var(--yellow)"
                        : "var(--red)",
                    borderRadius: 3,
                    transition: "width .3s",
                  }}
                />
              </div>

              <span
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  fontFamily: "JetBrains Mono,monospace",
                }}
              >
                {pct}%
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
