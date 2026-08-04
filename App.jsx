import React, { useState, useEffect, useMemo, useRef } from "react";

const CATEGORIES = [
  { key: "hot", label: "Hot com Filadélfia" },
  { key: "uramaki", label: "Uramaki" },
  { key: "hossomaki", label: "Hossomaki" },
  { key: "sushi", label: "Sushi" },
  { key: "sashimi", label: "Sashimi" },
  { key: "temaki", label: "Temaki" },
  { key: "harumaki", label: "Harumaki (unidade)" },
];

const UNITS = ["g", "ml", "un"];

const DEFAULT_INGREDIENTS = [
  { id: "salmao", name: "Salmão", unit: "g", cost: "" },
  { id: "atum", name: "Atum", unit: "g", cost: "" },
  { id: "kani", name: "Kani", unit: "g", cost: "" },
  { id: "camarao", name: "Camarão", unit: "g", cost: "" },
  { id: "skin", name: "Skin", unit: "g", cost: "" },
  { id: "arroz", name: "Arroz temperado", unit: "g", cost: "" },
  { id: "nori", name: "Folha de nori", unit: "un", cost: "" },
  { id: "cream_cheese", name: "Cream cheese", unit: "g", cost: "" },
  { id: "massa_harumaki", name: "Massa de harumaki", unit: "un", cost: "" },
];

const COMBOS = [
  {
    key: "individual",
    name: "Individual",
    subtitle: "Sabor padrão: salmão",
    pieces: { hot: 8, sushi: 6, sashimi: 4, harumaki: 2 },
  },
  {
    key: "casal",
    name: "Casal",
    subtitle: "Sabores à escolha",
    pieces: { hot: 10, uramaki: 8, sushi: 8, sashimi: 8, harumaki: 2 },
  },
  {
    key: "familia",
    name: "Família / Festa",
    subtitle: "Sabores à escolha",
    pieces: { hot: 20, uramaki: 8, hossomaki: 16, sushi: 8, sashimi: 8, harumaki: 4 },
  },
];

const STORAGE_KEY = "kai-sushi-state-v1";

function formatBRL(v) {
  if (isNaN(v) || v === null) return "R$ 0,00";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const [tab, setTab] = useState("ingredientes");

  const [ingredients, setIngredients] = useState(DEFAULT_INGREDIENTS);
  const [recipes, setRecipes] = useState(
    CATEGORIES.reduce((acc, c) => {
      acc[c.key] = [];
      return acc;
    }, {})
  );
  const [margins, setMargins] = useState({ individual: 60, casal: 60, familia: 60 });
  const [monthlySales, setMonthlySales] = useState({ individual: "", casal: "", familia: "" });

  const saveTimer = useRef(null);
  const hydrated = useRef(false);
  const fileInputRef = useRef(null);
  const [importMessage, setImportMessage] = useState("");

  // Load persisted state on mount (localStorage - this is a standalone site, not a Claude artifact)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.ingredients) setIngredients(parsed.ingredients);
        if (parsed.recipes) setRecipes(parsed.recipes);
        if (parsed.margins) setMargins(parsed.margins);
        if (parsed.monthlySales) setMonthlySales(parsed.monthlySales);
      }
    } catch (e) {
      // no saved state yet, keep defaults
    } finally {
      hydrated.current = true;
      setLoading(false);
    }
  }, []);

  // Autosave (debounced) whenever relevant state changes
  useEffect(() => {
    if (!hydrated.current) return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ingredients, recipes, margins, monthlySales })
        );
        setSaveState("saved");
      } catch (e) {
        setSaveState("idle");
      }
    }, 600);
    return () => clearTimeout(saveTimer.current);
  }, [ingredients, recipes, margins, monthlySales]);

  const ingredientMap = useMemo(() => {
    const m = {};
    ingredients.forEach((i) => (m[i.id] = i));
    return m;
  }, [ingredients]);

  const pieceCosts = useMemo(() => {
    const costs = {};
    CATEGORIES.forEach((cat) => {
      const items = recipes[cat.key] || [];
      let total = 0;
      items.forEach((item) => {
        const ing = ingredientMap[item.ingredientId];
        const qty = parseFloat(item.qty) || 0;
        const cost = ing ? parseFloat(ing.cost) || 0 : 0;
        total += qty * cost;
      });
      costs[cat.key] = total;
    });
    return costs;
  }, [recipes, ingredientMap]);

  const comboTotals = useMemo(() => {
    const totals = {};
    COMBOS.forEach((combo) => {
      let cost = 0;
      Object.entries(combo.pieces).forEach(([catKey, qty]) => {
        cost += (pieceCosts[catKey] || 0) * qty;
      });
      totals[combo.key] = cost;
    });
    return totals;
  }, [pieceCosts]);

  const comboPrices = useMemo(() => {
    const prices = {};
    COMBOS.forEach((combo) => {
      const cost = comboTotals[combo.key];
      const margin = margins[combo.key] || 0;
      prices[combo.key] = cost * (1 + margin / 100);
    });
    return prices;
  }, [comboTotals, margins]);

  const monthlyTotals = useMemo(() => {
    let revenue = 0;
    let cost = 0;
    COMBOS.forEach((combo) => {
      const qty = parseFloat(monthlySales[combo.key]) || 0;
      revenue += (comboPrices[combo.key] || 0) * qty;
      cost += (comboTotals[combo.key] || 0) * qty;
    });
    return { revenue, cost, profit: revenue - cost };
  }, [monthlySales, comboPrices, comboTotals]);

  // --- Ingredient handlers ---
  const updateIngredient = (id, field, value) => {
    setIngredients((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: value } : i))
    );
  };
  const addIngredient = () => {
    setIngredients((prev) => [
      ...prev,
      { id: uid(), name: "Novo ingrediente", unit: "g", cost: "" },
    ]);
  };
  const removeIngredient = (id) => {
    setIngredients((prev) => prev.filter((i) => i.id !== id));
    setRecipes((prev) => {
      const next = {};
      Object.entries(prev).forEach(([catKey, items]) => {
        next[catKey] = items.filter((it) => it.ingredientId !== id);
      });
      return next;
    });
  };

  // --- Recipe handlers ---
  const addRecipeItem = (catKey) => {
    if (ingredients.length === 0) return;
    setRecipes((prev) => ({
      ...prev,
      [catKey]: [
        ...prev[catKey],
        { rowId: uid(), ingredientId: ingredients[0].id, qty: "" },
      ],
    }));
  };
  const updateRecipeItem = (catKey, rowId, field, value) => {
    setRecipes((prev) => ({
      ...prev,
      [catKey]: prev[catKey].map((it) =>
        it.rowId === rowId ? { ...it, [field]: value } : it
      ),
    }));
  };
  const removeRecipeItem = (catKey, rowId) => {
    setRecipes((prev) => ({
      ...prev,
      [catKey]: prev[catKey].filter((it) => it.rowId !== rowId),
    }));
  };

  // --- Export / Import ---
  const exportData = () => {
    const payload = { ingredients, recipes, margins, monthlySales };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `kai-sushi-backup-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const triggerImport = () => {
    setImportMessage("");
    fileInputRef.current?.click();
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (parsed.ingredients) setIngredients(parsed.ingredients);
        if (parsed.recipes) setRecipes(parsed.recipes);
        if (parsed.margins) setMargins(parsed.margins);
        if (parsed.monthlySales) setMonthlySales(parsed.monthlySales);
        setImportMessage("Dados importados com sucesso.");
      } catch (err) {
        setImportMessage("Arquivo inválido — não foi possível importar.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleMarginChange = (key, value) => {
    setMargins((prev) => ({ ...prev, [key]: Number(value) }));
  };

  const handleSalesChange = (key, value) => {
    if (value === "" || /^\d*$/.test(value)) {
      setMonthlySales((prev) => ({ ...prev, [key]: value }));
    }
  };

  if (loading) {
    return (
      <div style={{ ...styles.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <FontImport />
        <div style={{ color: "#a99f95", fontFamily: "'Zen Kaku Gothic New', sans-serif" }}>
          Carregando...
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <FontImport />

      <header style={styles.header}>
        <div style={styles.hankoWrap}>
          <div style={styles.hanko}>海</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={styles.eyebrow}>Kai Sushi · Delivery</div>
          <h1 style={styles.title}>Precificação dos Combos</h1>
          <p style={styles.subtitle}>
            Cadastre ingredientes, monte a receita de cada categoria e acompanhe custo, preço e faturamento.
          </p>
        </div>
        <div style={styles.headerActions}>
          <div style={styles.saveIndicator}>
            {saveState === "saving" ? "Salvando…" : "Salvo"}
          </div>
          <div style={styles.backupBtns}>
            <button style={styles.backupBtn} onClick={exportData}>
              Exportar
            </button>
            <button style={styles.backupBtn} onClick={triggerImport}>
              Importar
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={handleImportFile}
            />
          </div>
        </div>
      </header>
      {importMessage && (
        <div style={styles.importBanner}>{importMessage}</div>
      )}

      <nav style={styles.tabs}>
        {[
          { key: "ingredientes", label: "Ingredientes" },
          { key: "receitas", label: "Receitas" },
          { key: "combos", label: "Combos" },
          { key: "faturamento", label: "Faturamento" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              ...styles.tabBtn,
              ...(tab === t.key ? styles.tabBtnActive : {}),
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main style={styles.main}>
        {tab === "ingredientes" && (
          <section>
            <h2 style={styles.sectionTitle}>Ingredientes</h2>
            <p style={styles.sectionHint}>
              Cadastre o custo de cada ingrediente pela unidade que você compra ou usa nas receitas (g, ml ou unidade).
            </p>

            <div style={styles.ingredientTable}>
              <div style={{ ...styles.ingredientRow, ...styles.ingredientHeaderRow }}>
                <span style={styles.colName}>Ingrediente</span>
                <span style={styles.colUnit}>Un.</span>
                <span style={styles.colCost}>Custo</span>
                <span style={styles.colAction}></span>
              </div>
              {ingredients.map((ing) => (
                <div key={ing.id} style={styles.ingredientRow}>
                  <input
                    style={{ ...styles.textInput, ...styles.colName }}
                    value={ing.name}
                    onChange={(e) => updateIngredient(ing.id, "name", e.target.value)}
                  />
                  <select
                    style={{ ...styles.selectInput, ...styles.colUnit }}
                    value={ing.unit}
                    onChange={(e) => updateIngredient(ing.id, "unit", e.target.value)}
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  <div style={{ ...styles.inputWrap, ...styles.colCost }}>
                    <span style={styles.currencyPrefix}>R$</span>
                    <input
                      style={styles.costInputSmall}
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={ing.cost}
                      onChange={(e) => {
                        const clean = e.target.value.replace(",", ".");
                        if (clean === "" || /^\d*\.?\d*$/.test(clean)) {
                          updateIngredient(ing.id, "cost", clean);
                        }
                      }}
                    />
                  </div>
                  <button style={styles.removeBtn} onClick={() => removeIngredient(ing.id)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button style={styles.addBtn} onClick={addIngredient}>
              + Adicionar ingrediente
            </button>
          </section>
        )}

        {tab === "receitas" && (
          <section>
            <h2 style={styles.sectionTitle}>Receitas por categoria</h2>
            <p style={styles.sectionHint}>
              Para cada categoria, informe quanto de cada ingrediente entra em 1 peça. O custo por peça é calculado automaticamente.
            </p>
            <div style={styles.recipeGrid}>
              {CATEGORIES.map((cat) => (
                <div key={cat.key} style={styles.recipeCard}>
                  <div style={styles.recipeCardHeader}>
                    <span style={styles.recipeCardTitle}>{cat.label}</span>
                    <span style={styles.recipeCardCost}>{formatBRL(pieceCosts[cat.key])}/peça</span>
                  </div>
                  {(recipes[cat.key] || []).map((item) => (
                    <div key={item.rowId} style={styles.recipeRow}>
                      <select
                        style={styles.recipeSelect}
                        value={item.ingredientId}
                        onChange={(e) =>
                          updateRecipeItem(cat.key, item.rowId, "ingredientId", e.target.value)
                        }
                      >
                        {ingredients.map((ing) => (
                          <option key={ing.id} value={ing.id}>
                            {ing.name}
                          </option>
                        ))}
                      </select>
                      <input
                        style={styles.recipeQtyInput}
                        type="text"
                        inputMode="decimal"
                        placeholder="qtd"
                        value={item.qty}
                        onChange={(e) => {
                          const clean = e.target.value.replace(",", ".");
                          if (clean === "" || /^\d*\.?\d*$/.test(clean)) {
                            updateRecipeItem(cat.key, item.rowId, "qty", clean);
                          }
                        }}
                      />
                      <span style={styles.recipeUnitLabel}>
                        {ingredientMap[item.ingredientId]?.unit || ""}
                      </span>
                      <button
                        style={styles.removeBtnSmall}
                        onClick={() => removeRecipeItem(cat.key, item.rowId)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button style={styles.addBtnSmall} onClick={() => addRecipeItem(cat.key)}>
                    + Ingrediente
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === "combos" && (
          <section>
            <h2 style={styles.sectionTitle}>Combos</h2>
            <div style={styles.comboGrid}>
              {COMBOS.map((combo) => {
                const cost = comboTotals[combo.key];
                const margin = margins[combo.key];
                const price = comboPrices[combo.key];
                const profit = price - cost;
                return (
                  <div key={combo.key} style={styles.comboCard}>
                    <div style={styles.comboCardHeader}>
                      <div style={styles.comboName}>{combo.name}</div>
                      <div style={styles.comboSubtitle}>{combo.subtitle}</div>
                    </div>

                    <ul style={styles.pieceList}>
                      {Object.entries(combo.pieces).map(([catKey, qty]) => {
                        const cat = CATEGORIES.find((c) => c.key === catKey);
                        return (
                          <li key={catKey} style={styles.pieceItem}>
                            <span>{cat.label}</span>
                            <span style={styles.pieceQty}>{qty}x</span>
                          </li>
                        );
                      })}
                    </ul>

                    <div style={styles.divider} />

                    <div style={styles.row}>
                      <span style={styles.rowLabel}>Custo total</span>
                      <span style={styles.rowValue}>{formatBRL(cost)}</span>
                    </div>

                    <div style={styles.marginRow}>
                      <div style={styles.row}>
                        <span style={styles.rowLabel}>Margem</span>
                        <span style={styles.marginValue}>{margin}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="200"
                        step="5"
                        value={margin}
                        onChange={(e) => handleMarginChange(combo.key, e.target.value)}
                      />
                    </div>

                    <div style={styles.stampWrap}>
                      <div style={styles.stamp}>
                        <div style={styles.stampLabel}>Preço sugerido</div>
                        <div style={styles.stampPrice}>{formatBRL(price)}</div>
                      </div>
                    </div>

                    <div style={styles.row}>
                      <span style={styles.rowLabel}>Lucro por combo</span>
                      <span style={styles.profitValue}>{formatBRL(profit)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === "faturamento" && (
          <section>
            <h2 style={styles.sectionTitle}>Faturamento mensal estimado</h2>
            <p style={styles.sectionHint}>
              Informe quantos combos de cada tipo você espera vender por mês.
            </p>

            <div style={styles.salesGrid}>
              {COMBOS.map((combo) => (
                <div key={combo.key} style={styles.salesRow}>
                  <div>
                    <div style={styles.salesComboName}>{combo.name}</div>
                    <div style={styles.salesComboPrice}>
                      {formatBRL(comboPrices[combo.key])} / combo
                    </div>
                  </div>
                  <input
                    style={styles.salesInput}
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={monthlySales[combo.key]}
                    onChange={(e) => handleSalesChange(combo.key, e.target.value)}
                  />
                  <span style={styles.salesUnitLabel}>combos/mês</span>
                </div>
              ))}
            </div>

            <div style={styles.divider} />

            <div style={styles.summaryGrid}>
              <div style={styles.summaryCard}>
                <div style={styles.summaryLabel}>Faturamento</div>
                <div style={styles.summaryValue}>{formatBRL(monthlyTotals.revenue)}</div>
              </div>
              <div style={styles.summaryCard}>
                <div style={styles.summaryLabel}>Custo total</div>
                <div style={styles.summaryValue}>{formatBRL(monthlyTotals.cost)}</div>
              </div>
              <div style={{ ...styles.summaryCard, ...styles.summaryCardHighlight }}>
                <div style={styles.summaryLabel}>Lucro estimado</div>
                <div style={{ ...styles.summaryValue, color: "#7fa876" }}>
                  {formatBRL(monthlyTotals.profit)}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function FontImport() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap');
      * { box-sizing: border-box; }
      input[type=range] {
        -webkit-appearance: none;
        width: 100%;
        height: 3px;
        background: #4a4340;
        border-radius: 2px;
        outline: none;
      }
      input[type=range]::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #c4432b;
        cursor: pointer;
        border: 2px solid #f5f0e8;
      }
      ::selection { background: #c4432b; color: #f5f0e8; }
      select { color-scheme: dark; }
    `}</style>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#1c1917",
    color: "#f5f0e8",
    fontFamily: "'Zen Kaku Gothic New', sans-serif",
    padding: "24px 16px 64px",
  },
  header: {
    display: "flex",
    gap: 16,
    alignItems: "flex-start",
    maxWidth: 1080,
    margin: "0 auto 20px",
  },
  hankoWrap: { flexShrink: 0 },
  hanko: {
    width: 48,
    height: 48,
    borderRadius: 10,
    background: "#c4432b",
    color: "#f5f0e8",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 24,
    fontFamily: "'Shippori Mincho', serif",
    fontWeight: 700,
    boxShadow: "0 0 0 1px rgba(245,240,232,0.15)",
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#b08d57",
    marginBottom: 4,
    fontWeight: 500,
  },
  title: {
    fontFamily: "'Shippori Mincho', serif",
    fontSize: "clamp(20px, 4vw, 28px)",
    fontWeight: 700,
    margin: "0 0 6px",
    color: "#f5f0e8",
  },
  subtitle: {
    color: "#a99f95",
    fontSize: 13,
    lineHeight: 1.5,
    margin: 0,
    maxWidth: 480,
  },
  saveIndicator: {
    fontSize: 11,
    color: "#8a8078",
    textAlign: "right",
  },
  headerActions: {
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 8,
  },
  backupBtns: { display: "flex", gap: 6 },
  backupBtn: {
    background: "transparent",
    border: "1px solid #3a332f",
    borderRadius: 7,
    color: "#c9c0b7",
    fontSize: 11.5,
    padding: "6px 10px",
    cursor: "pointer",
    fontFamily: "'Zen Kaku Gothic New', sans-serif",
    whiteSpace: "nowrap",
  },
  importBanner: {
    maxWidth: 1080,
    margin: "0 auto 16px",
    background: "#1f231d",
    border: "1px solid #3f5c3a",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 12.5,
    color: "#a8c9a0",
  },
  tabs: {
    maxWidth: 1080,
    margin: "0 auto 24px",
    display: "flex",
    gap: 6,
    borderBottom: "1px solid #38312d",
    overflowX: "auto",
  },
  tabBtn: {
    background: "transparent",
    border: "none",
    color: "#8a8078",
    fontSize: 13,
    fontWeight: 500,
    padding: "10px 14px",
    cursor: "pointer",
    borderBottom: "2px solid transparent",
    fontFamily: "'Zen Kaku Gothic New', sans-serif",
    whiteSpace: "nowrap",
  },
  tabBtnActive: {
    color: "#f5f0e8",
    borderBottom: "2px solid #c4432b",
  },
  main: { maxWidth: 1080, margin: "0 auto" },
  sectionTitle: {
    fontFamily: "'Shippori Mincho', serif",
    fontSize: 18,
    fontWeight: 700,
    margin: "0 0 6px",
  },
  sectionHint: {
    color: "#8a8078",
    fontSize: 12.5,
    lineHeight: 1.5,
    margin: "0 0 20px",
  },

  ingredientTable: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 14,
  },
  ingredientRow: {
    display: "grid",
    gridTemplateColumns: "1fr 60px 110px 32px",
    gap: 8,
    alignItems: "center",
  },
  ingredientHeaderRow: {
    fontSize: 11,
    color: "#8a8078",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  colName: {},
  colUnit: {},
  colCost: {},
  colAction: {},
  textInput: {
    background: "#171412",
    border: "1px solid #3a332f",
    borderRadius: 8,
    padding: "9px 10px",
    color: "#f5f0e8",
    fontSize: 13.5,
    fontFamily: "'Zen Kaku Gothic New', sans-serif",
    outline: "none",
  },
  selectInput: {
    background: "#171412",
    border: "1px solid #3a332f",
    borderRadius: 8,
    padding: "9px 6px",
    color: "#f5f0e8",
    fontSize: 13,
    outline: "none",
  },
  inputWrap: {
    display: "flex",
    alignItems: "center",
    background: "#171412",
    border: "1px solid #3a332f",
    borderRadius: 8,
    padding: "0 8px",
  },
  currencyPrefix: { color: "#8a8078", fontSize: 12.5, marginRight: 4 },
  costInputSmall: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "#f5f0e8",
    fontSize: 13.5,
    padding: "9px 0",
    fontFamily: "'Zen Kaku Gothic New', sans-serif",
    width: "100%",
  },
  removeBtn: {
    background: "transparent",
    border: "none",
    color: "#8a6a63",
    fontSize: 20,
    cursor: "pointer",
    lineHeight: 1,
  },
  addBtn: {
    background: "transparent",
    border: "1px dashed #4a4340",
    borderRadius: 8,
    color: "#b08d57",
    fontSize: 13,
    padding: "9px 14px",
    cursor: "pointer",
    fontFamily: "'Zen Kaku Gothic New', sans-serif",
  },

  recipeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 16,
  },
  recipeCard: {
    background: "#211d1b",
    border: "1px solid #38312d",
    borderRadius: 12,
    padding: 16,
  },
  recipeCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 12,
  },
  recipeCardTitle: {
    fontFamily: "'Shippori Mincho', serif",
    fontSize: 14.5,
    fontWeight: 700,
  },
  recipeCardCost: { fontSize: 12, color: "#b08d57", fontWeight: 600 },
  recipeRow: {
    display: "grid",
    gridTemplateColumns: "1fr 56px 24px 20px",
    gap: 6,
    alignItems: "center",
    marginBottom: 8,
  },
  recipeSelect: {
    background: "#171412",
    border: "1px solid #3a332f",
    borderRadius: 7,
    padding: "7px 6px",
    color: "#f5f0e8",
    fontSize: 12.5,
    outline: "none",
  },
  recipeQtyInput: {
    background: "#171412",
    border: "1px solid #3a332f",
    borderRadius: 7,
    padding: "7px 6px",
    color: "#f5f0e8",
    fontSize: 12.5,
    outline: "none",
    width: "100%",
  },
  recipeUnitLabel: { fontSize: 11, color: "#8a8078" },
  removeBtnSmall: {
    background: "transparent",
    border: "none",
    color: "#8a6a63",
    fontSize: 16,
    cursor: "pointer",
    lineHeight: 1,
  },
  addBtnSmall: {
    background: "transparent",
    border: "1px dashed #4a4340",
    borderRadius: 7,
    color: "#b08d57",
    fontSize: 12,
    padding: "6px 10px",
    cursor: "pointer",
    marginTop: 4,
    fontFamily: "'Zen Kaku Gothic New', sans-serif",
  },

  comboGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 20,
  },
  comboCard: {
    background: "#211d1b",
    border: "1px solid #38312d",
    borderRadius: 14,
    padding: 22,
    display: "flex",
    flexDirection: "column",
  },
  comboCardHeader: { marginBottom: 12 },
  comboName: {
    fontFamily: "'Shippori Mincho', serif",
    fontSize: 19,
    fontWeight: 700,
  },
  comboSubtitle: { fontSize: 12, color: "#8a8078", marginTop: 2 },
  pieceList: {
    listStyle: "none",
    padding: 0,
    margin: "0 0 12px",
    display: "flex",
    flexDirection: "column",
    gap: 5,
  },
  pieceItem: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 13,
    color: "#c9c0b7",
  },
  pieceQty: { color: "#b08d57", fontWeight: 500 },
  divider: { height: 1, background: "#38312d", margin: "16px 0" },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  rowLabel: { fontSize: 13, color: "#a99f95" },
  rowValue: { fontSize: 14, fontWeight: 600, color: "#f5f0e8" },
  marginRow: { margin: "10px 0 18px" },
  marginValue: { fontSize: 13, fontWeight: 600, color: "#b08d57" },
  stampWrap: { display: "flex", justifyContent: "center", margin: "6px 0 16px" },
  stamp: {
    border: "2px solid #c4432b",
    borderRadius: "50%",
    width: 128,
    height: 128,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    transform: "rotate(-4deg)",
  },
  stampLabel: {
    fontSize: 9.5,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#c4432b",
    marginBottom: 4,
    textAlign: "center",
    padding: "0 10px",
  },
  stampPrice: {
    fontFamily: "'Shippori Mincho', serif",
    fontSize: 19,
    fontWeight: 700,
    color: "#c4432b",
  },
  profitValue: { fontSize: 14, fontWeight: 600, color: "#7fa876" },

  salesGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginBottom: 20,
  },
  salesRow: {
    display: "grid",
    gridTemplateColumns: "1fr 90px auto",
    gap: 10,
    alignItems: "center",
    background: "#211d1b",
    border: "1px solid #38312d",
    borderRadius: 10,
    padding: "12px 14px",
  },
  salesComboName: { fontSize: 14, fontWeight: 600 },
  salesComboPrice: { fontSize: 12, color: "#8a8078", marginTop: 2 },
  salesInput: {
    background: "#171412",
    border: "1px solid #3a332f",
    borderRadius: 8,
    padding: "8px 10px",
    color: "#f5f0e8",
    fontSize: 14,
    textAlign: "right",
    outline: "none",
    fontFamily: "'Zen Kaku Gothic New', sans-serif",
  },
  salesUnitLabel: { fontSize: 11.5, color: "#8a8078", whiteSpace: "nowrap" },

  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 14,
  },
  summaryCard: {
    background: "#211d1b",
    border: "1px solid #38312d",
    borderRadius: 12,
    padding: 18,
  },
  summaryCardHighlight: {
    border: "1px solid #3f5c3a",
    background: "#1f231d",
  },
  summaryLabel: { fontSize: 12, color: "#8a8078", marginBottom: 6 },
  summaryValue: {
    fontFamily: "'Shippori Mincho', serif",
    fontSize: 20,
    fontWeight: 700,
  },
};
