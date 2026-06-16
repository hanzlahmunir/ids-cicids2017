// ML Analytics
const MlScreen = () => {
  const backend = useBackend();   // { status, health, metrics }
  const live = backend.metrics && backend.metrics.available ? backend.metrics : null;

  const labels = live && live.confusion_matrix ? live.confusion_matrix.labels
    : ["Benign","DDoS","Port","BFsh","BFftp","Botnet","SQLi","XSS","Infil"];
  const matrix = live && live.confusion_matrix ? live.confusion_matrix.matrix : [
    [12482,    8,   12,    3,    2,    4,    6,    3,    1],
    [   14, 3204,    9,    1,    0,    2,    0,    0,    0],
    [   22,    6, 1842,    3,    1,    1,    1,    0,    0],
    [    8,    1,    4,  962,    2,    0,    1,    0,    1],
    [    6,    0,    2,    3,  548,    0,    0,    0,    1],
    [    9,    3,    1,    0,    0,  712,    2,    1,    2],
    [    5,    0,    0,    1,    0,    2,  421,    4,    1],
    [    4,    0,    1,    0,    0,    0,    7,  389,    0],
    [    7,    1,    1,    1,    1,    3,    2,    0,  264],
  ];

  const cmp = live && live.comparison ? live.comparison : null;
  const models = cmp ? [
    { name: "XGBoost", color: "oklch(0.82 0.16 220)",
      acc: cmp.multi["XGBoost"].accuracy, prec: cmp.multi["XGBoost"].macro_prec,
      rec: cmp.multi["XGBoost"].macro_rec, f1: cmp.multi["XGBoost"].macro_f1,
      auc: cmp.binary["XGBoost"].roc_auc, latency: "real" },
    { name: "Random Forest", color: "oklch(0.7 0.18 145)",
      acc: cmp.multi["Random Forest"].accuracy, prec: cmp.multi["Random Forest"].macro_prec,
      rec: cmp.multi["Random Forest"].macro_rec, f1: cmp.multi["Random Forest"].macro_f1,
      auc: cmp.binary["Random Forest"].roc_auc, latency: "real" },
    { name: "Scratch MLP", color: "oklch(0.68 0.20 295)",
      acc: cmp.multi["Scratch MLP"].accuracy, prec: cmp.multi["Scratch MLP"].macro_prec,
      rec: cmp.multi["Scratch MLP"].macro_rec, f1: cmp.multi["Scratch MLP"].macro_f1,
      auc: cmp.binary["Scratch MLP"].roc_auc, latency: "real" },
  ] : [
    { name: "XGBoost · v4.2.1", color: "oklch(0.82 0.16 220)", acc: 0.9847, prec: 0.984, rec: 0.981, f1: 0.982, auc: 0.997, latency: "8ms" },
    { name: "Random Forest · v3.8.0", color: "oklch(0.7 0.18 145)", acc: 0.9711, prec: 0.969, rec: 0.962, f1: 0.965, auc: 0.991, latency: "14ms" },
    { name: "MLP · v2.4.0", color: "oklch(0.68 0.20 295)", acc: 0.9628, prec: 0.958, rec: 0.951, f1: 0.954, auc: 0.987, latency: "21ms" },
  ];

  const realPerClass = live && live.per_class ? live.per_class : null;
  const dataBadge = live
    ? <span className="badge badge-green" style={{ fontSize: 9 }}>● REAL · held-out test</span>
    : <span className="badge badge-amber" style={{ fontSize: 9 }}>placeholder · backend offline</span>;

  const rocPoints = (steepness) => {
    const pts = [[0, 0]];
    for (let i = 1; i <= 20; i++) {
      const x = i / 20;
      const y = Math.min(1, 1 - Math.pow(1 - x, steepness));
      pts.push([x, y]);
    }
    pts.push([1, 1]);
    return pts;
  };

  return (
    <div className="scroll" style={{ height: "100%", padding: "18px 22px 32px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <div className="t-eyebrow">Model performance · held-out CICIDS-2017 test set</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 0" }}>
            <h1 className="t-h1" style={{ margin: 0, fontSize: 24 }}>ML Analytics</h1>
            {dataBadge}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn"><Icons.Refresh size={13}/> Last 24h <Icons.ChevronDown size={12}/></button>
          <button className="btn"><Icons.Database size={13}/> CIC-IDS2018 baseline</button>
          <button className="btn"><Icons.Download size={13}/> Export report</button>
        </div>
      </div>

      {/* Model comparison row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 12 }}>
        {models.map((m, i) => (
          <div key={m.name} className="glass" style={{ padding: 16, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, background: `radial-gradient(120% 80% at 100% 0%, ${m.color.replace(")"," / 0.12)")} , transparent 60%)`, pointerEvents: "none" }}/>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="t-eyebrow" style={{ color: m.color, opacity: 0.95 }}>Model {i+1}</div>
                <div className="t-h2" style={{ marginTop: 4 }}>{m.name}</div>
              </div>
              {i === 0 && <span className="badge badge-cyan">PRIMARY</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, marginTop: 14 }}>
              {[["Acc", m.acc],["Prec", m.prec],["Rec", m.rec],["F1", m.f1],["AUC", m.auc]].map(([k, v]) => (
                <div key={k} style={{ padding: "8px 4px", borderRadius: 6, background: "rgba(8,12,26,0.5)", border: "1px solid var(--hairline)" }}>
                  <div className="t-eyebrow" style={{ fontSize: 9, textAlign: "center" }}>{k}</div>
                  <div className="font-mono" style={{ fontSize: 14, fontWeight: 500, marginTop: 4, textAlign: "center" }}>{v.toFixed(3)}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--hairline)", fontSize: 10.5 }}>
              <span className="dim">Latency p95</span><span className="font-mono" style={{ color: m.color }}>{m.latency}</span>
              <span className="dim">·</span>
              <span className="dim">Trained</span><span className="font-mono">2d ago</span>
              <span style={{ marginLeft: "auto", color: "oklch(0.85 0.18 145)", display: "flex", gap: 3, alignItems: "center" }}><Icons.Check size={11}/> healthy</span>
            </div>
          </div>
        ))}
      </div>

      {/* Confusion matrix + ROC */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 12 }}>
        <div className="glass" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div className="t-eyebrow">XGBoost · classification</div>
              <div className="t-h2" style={{ marginTop: 4 }}>Confusion matrix · normalized</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn" style={{ height: 26, fontSize: 11, background: "oklch(0.55 0.14 220 / 0.18)", borderColor: "oklch(0.78 0.15 220 / 0.4)" }}>XGBoost</button>
              <button className="btn" style={{ height: 26, fontSize: 11 }}>RF</button>
              <button className="btn" style={{ height: 26, fontSize: 11 }}>MLP</button>
            </div>
          </div>
          <ConfusionMatrix labels={labels} matrix={matrix}/>
          <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 11 }}>
            <Legend color="oklch(0.7 0.18 145)" label="True positive (diagonal)"/>
            <Legend color="oklch(0.72 0.22 25)" label="Misclassification"/>
            <span className="dim" style={{ marginLeft: "auto" }}>Held-out test · 20,924 flows</span>
          </div>
        </div>

        <div className="glass" style={{ padding: 16 }}>
          <div>
            <div className="t-eyebrow">ROC · all attack classes vs benign</div>
            <div className="t-h2" style={{ marginTop: 4 }}>Receiver Operating Characteristic</div>
          </div>
          <RocCurve w={400} h={280} models={[
            { color: "oklch(0.82 0.16 220)", points: rocPoints(8) },
            { color: "oklch(0.7 0.18 145)", points: rocPoints(5.5) },
            { color: "oklch(0.68 0.20 295)", points: rocPoints(4.2) },
          ]}/>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {models.map(m => (
              <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                <span style={{ width: 12, height: 2, background: m.color, boxShadow: `0 0 6px ${m.color}` }}/>
                <span style={{ flex: 1, color: "var(--text-1)" }}>{m.name.split(" · ")[0]}</span>
                <span className="dim">AUC</span>
                <span className="font-mono" style={{ color: m.color }}>{m.auc.toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Per-class precision/recall */}
      <div className="glass" style={{ padding: 16, marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div className="t-eyebrow">Per-class precision / recall · XGBoost</div>
            <div className="t-h2" style={{ marginTop: 4 }}>Class-level model behavior</div>
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
            <Legend color="oklch(0.82 0.16 220)" label="Precision"/>
            <Legend color="oklch(0.7 0.18 145)" label="Recall"/>
            <Legend color="oklch(0.68 0.20 295)" label="F1"/>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(9,1fr)", gap: 8 }}>
          {[
            ["Benign",     0.998, 0.999, 0.998],
            ["DDoS",       0.991, 0.989, 0.990],
            ["Port Scan",  0.978, 0.981, 0.980],
            ["BF SSH",     0.972, 0.965, 0.968],
            ["BF FTP",     0.969, 0.961, 0.965],
            ["Botnet",     0.958, 0.952, 0.955],
            ["SQLi",       0.948, 0.942, 0.945],
            ["XSS",        0.942, 0.931, 0.937],
            ["Infiltrate", 0.918, 0.892, 0.905],
          ].map(([name, p, r, f]) => (
            <div key={name} style={{ padding: 12, borderRadius: 8, background: "rgba(8,12,26,0.5)", border: "1px solid var(--hairline)" }}>
              <div style={{ fontSize: 11, color: "var(--text-0)", marginBottom: 10, textAlign: "center" }}>{name}</div>
              <Bars data={[p*100, r*100, f*100]} labels={["P","R","F1"]} color="oklch(0.82 0.16 220)" w={120} h={64}/>
              <div className="font-mono" style={{ fontSize: 9.5, color: "var(--text-2)", textAlign: "center", marginTop: 4 }}>
                {(p*100).toFixed(1)} · {(r*100).toFixed(1)} · {(f*100).toFixed(1)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Training history */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div className="glass" style={{ padding: 16 }}>
          <div className="t-eyebrow">Training history · XGBoost</div>
          <div className="t-h2" style={{ marginTop: 4, marginBottom: 8 }}>Loss across 240 boosting rounds</div>
          <AreaChart
            w={560} h={200} gridY={4}
            series={[
              { name: "Train log-loss", color: "oklch(0.7 0.18 145)",
                data: Array.from({length: 60}).map((_,i)=>Math.max(0.04, 0.62*Math.exp(-i/12) + 0.04 + Math.sin(i/6)*0.005)) },
              { name: "Val log-loss", color: "oklch(0.82 0.16 220)",
                data: Array.from({length: 60}).map((_,i)=>Math.max(0.06, 0.66*Math.exp(-i/12) + 0.06 + Math.sin(i/6)*0.008)) },
            ]}/>
        </div>
        <div className="glass" style={{ padding: 16 }}>
          <div className="t-eyebrow">Drift monitor · last 30 days</div>
          <div className="t-h2" style={{ marginTop: 4, marginBottom: 8 }}>Feature distribution PSI</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              ["flow_duration", 0.06, "stable"],
              ["bwd_pkt_len_max", 0.11, "stable"],
              ["init_win_bytes_fwd", 0.18, "watch"],
              ["fwd_pkt_len_std", 0.09, "stable"],
              ["flow_iat_mean", 0.27, "drift"],
              ["pkt_size_avg", 0.04, "stable"],
              ["bwd_iat_total", 0.14, "watch"],
            ].map(([f, v, state]) => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 }}>
                <span style={{ flex: 1, color: "var(--text-1)" }} className="font-mono">{f}</span>
                <div style={{ width: 220, height: 6, borderRadius: 3, background: "rgba(120,160,220,0.1)", overflow: "hidden", position: "relative" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${v / 0.3 * 100}%`,
                                 background: state === "drift" ? "oklch(0.78 0.20 25)" : state === "watch" ? "oklch(0.82 0.16 75)" : "oklch(0.7 0.18 145)",
                                 boxShadow: `0 0 8px ${state === "drift" ? "oklch(0.78 0.20 25)" : state === "watch" ? "oklch(0.82 0.16 75)" : "oklch(0.7 0.18 145)"}` }}/>
                  <div style={{ position: "absolute", left: "33%", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.15)" }}/>
                  <div style={{ position: "absolute", left: "66%", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.15)" }}/>
                </div>
                <span className="font-mono" style={{ fontSize: 10.5, width: 42, textAlign: "right" }}>{v.toFixed(2)}</span>
                <span className={`badge badge-${state === "drift" ? "red" : state === "watch" ? "amber" : "green"}`} style={{ fontSize: 9, minWidth: 50, justifyContent: "center" }}>
                  {state.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

window.MlScreen = MlScreen;
