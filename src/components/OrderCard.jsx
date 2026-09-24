import { useMemo, useState } from "react";
import { fmtM } from "../utils/index.js";
import { Badge, MoneyCell, ProductThumb } from "./UI.jsx";
import { useData, AFFECTS } from "../store/DataContext.jsx";
import { useUI } from "../store/UIContext.jsx";
import { updateStatus } from "../services/api.js";

export function OrderCard({ group, prices, stockOutMap, onSelectClient, onOpen }) {
  const { mutate } = useData();
  const { toast } = useUI();
  const [statusBusy, setStatusBusy] = useState(false);

  const imageByProduct = useMemo(() => {
    const m = {};
    (prices || []).forEach((p) => {
      if (p.product) m[p.product] = p.image || "";
    });
    return m;
  }, [prices]);

  const handleToggleStatus = async (e) => {
    e.stopPropagation();
    const next = group.status === "Доставлен" ? "Новый" : "Доставлен";
    try {
      setStatusBusy(true);
      await mutate(() => updateStatus(group.oid, next), AFFECTS.order);
      toast(`Статус: ${next}`, "ok");
    } catch (err) {
      toast(err.message, "err");
    } finally {
      setStatusBusy(false);
    }
  };

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

  const hasOldBox = (rows || []).some((r) => r.oldBox);

  // Сколько не хватает по каждой строке (отмечено на странице
  // производства/развозки на дату доставки этого заказа) — тот же
  // источник данных, что и там, просто показываем ещё и тут.
  const missingFor = (r) => {
    if (!deliveryDate || !r.product || !stockOutMap) return 0;
    const qty = Number(r.paidQuantity ?? r.quantity ?? 0);
    const missing = Number(stockOutMap.get(`${deliveryDate}::${r.product}`) || 0);
    return Math.min(qty, missing);
  };

  const hasStockOut = (rows || []).some((r) => missingFor(r) > 0);

  // На сколько сумма заказа уменьшается из-за нехватки товара —
  // недостающие штуки не должны входить ни в итог, ни в долг клиента.
  const stockOutDeduction = (rows || []).reduce(
    (s, r) => s + missingFor(r) * Number(r.price || 0),
    0,
  );

  // Сумма заказа после возвратов и недостачи
  const effectiveTotal = Math.max(
    0,
    Number(totalSum || 0) - Number(returnedAmount || 0) - stockOutDeduction,
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
  const hasStockOutDeduction = stockOutDeduction > 0;

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

          {hasOldBox && (
            <span
              title="В заказе есть товар, который клиент забрал в своей таре"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#d29922",
                background: "rgba(210,153,34,0.12)",
                border: "1px solid rgba(210,153,34,0.4)",
                borderRadius: 6,
                padding: "2px 7px",
              }}
            >
              📦 старая коробка
            </span>
          )}

          {hasStockOut && (
            <span
              title="В заказе есть товар, которого не хватает на складе"
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--red)",
                background: "rgba(248,81,73,.14)",
                border: "1px solid rgba(248,81,73,0.4)",
                borderRadius: 6,
                padding: "2px 7px",
              }}
            >
              🚫 не хватает товара
            </span>
          )}
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

          <button
            onClick={handleToggleStatus}
            disabled={statusBusy}
            title="Переключить статус доставки"
            style={{
              background:
                status === "Доставлен" ? "rgba(210,153,34,0.12)" : "rgba(63,185,80,0.12)",
              border: `1px solid ${status === "Доставлен" ? "#d29922" : "var(--green)"}55`,
              borderRadius: 7,
              padding: "4px 10px",
              color: status === "Доставлен" ? "#d29922" : "var(--green)",
              fontSize: 12,
              fontWeight: 600,
              cursor: statusBusy ? "default" : "pointer",
              opacity: statusBusy ? 0.6 : 1,
            }}
          >
            {status === "Доставлен" ? "🚚 Сделать новым" : "✅ Доставлен"}
          </button>

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
            {rows.map((r, i) => {
              const qty = Number(r.paidQuantity ?? r.quantity ?? 0);
              const missingQty = missingFor(r);
              const isOut = missingQty > 0;
              const isFullyOut = isOut && missingQty >= qty;
              const availableQty = Math.max(0, qty - missingQty);
              const availableSum = availableQty * Number(r.price || 0);

              return (
                <tr
                  key={r.id || i}
                  style={{
                    borderTop: i === 0 ? "none" : "1px solid var(--b1)",
                    opacity: isFullyOut ? 0.65 : 1,
                  }}
                >
                  <td
                    style={{
                      padding: "8px 14px",
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <ProductThumb src={imageByProduct[r.product]} size={26} />
                      <span
                        style={{
                          textDecoration: isFullyOut ? "line-through" : "none",
                        }}
                      >
                        {r.product}
                      </span>
                      {r.oldBox && (
                        <span
                          title="Своя тара"
                          style={{ fontSize: 11, color: "#d29922", fontWeight: 600 }}
                        >
                          📦
                          {r.oldBoxColor === "white"
                            ? " белый"
                            : r.oldBoxColor === "dark"
                              ? " тёмный"
                              : ""}
                        </span>
                      )}
                      {isOut && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "2px 7px",
                            borderRadius: 20,
                            fontSize: 10.5,
                            fontWeight: 700,
                            background: "rgba(248,81,73,.14)",
                            color: "var(--red)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {isFullyOut ? "🚫 нет в наличии" : `🚫 не хватает: ${missingQty}`}
                        </span>
                      )}
                    </div>
                  </td>

                  <td
                    style={{
                      padding: "8px 14px",
                      fontFamily: "JetBrains Mono,monospace",
                      fontSize: 12.5,
                    }}
                  >
                    {isOut ? (
                      <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1.3 }}>
                        <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                          <span style={{ color: "var(--red)", fontWeight: 700 }}>
                            {availableQty}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--muted)",
                              textDecoration: "line-through",
                            }}
                          >
                            {qty}
                          </span>
                        </span>
                      </span>
                    ) : (
                      qty
                    )}
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
                    {isOut ? (
                      <span
                        style={{
                          display: "inline-flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                          lineHeight: 1.3,
                        }}
                      >
                        <span style={{ color: "var(--red)" }}>
                          <MoneyCell n={availableSum} />
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--muted)",
                            textDecoration: "line-through",
                          }}
                        >
                          <MoneyCell n={r.total} />
                        </span>
                      </span>
                    ) : (
                      <MoneyCell n={r.total} />
                    )}
                  </td>
                </tr>
              );
            })}
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

          {/* Недостача (не хватает товара) */}

          {hasStockOutDeduction && (
            <div style={{ fontSize: 12 }}>
              <span
                style={{
                  color: "var(--muted)",
                }}
              >
                Недостача:{" "}
              </span>

              <span
                style={{
                  fontFamily: "JetBrains Mono,monospace",
                  color: "var(--red)",
                  fontWeight: 600,
                }}
              >
                −{fmtM(stockOutDeduction)}
              </span>
            </div>
          )}

          {/* К оплате */}

          {(hasReturn || hasStockOutDeduction) && (
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
