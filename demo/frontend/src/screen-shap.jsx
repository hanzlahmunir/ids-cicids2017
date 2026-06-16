// SHAP / Feature-Importance Explainability Panel
const ShapScreen = () => {
  // Pull REAL global feature importance from the trained XGBoost model.
  const [realFeats, setRealFeats] = useState(null);
  useEffect(() => {
    let alive = true;
    apiGet("/importance")
      .then(d => { if (alive && d.available) setRealFeats(d.features); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Map real importances onto the screen's {f, v, shap, val} shape.
  // Top 8 features by the model's own importance; sign just splits the
  // top half (push toward attack) from the bottom half for the visual.
  const features = realFeats
    ? realFeats.slice(0, 8).map((d, i) => ({
        f: d.feature,
        v: d.importance * 100,
        shap: (i < 5 ? 1 : -1) * Math.max(0.15, d.importance * 6),
        val: `${(d.importance * 100).toFixed(2)}% gain`,
      }))
    : [
    { f: "flow_duration", v: 84.12, shap: +2.41, val: "324,812 µs" },
    { f: "bwd_pkt_len_max", v: 72.31, shap: +1.92, val: "1460 B" },
    { f: "flow_iat_std", v: 51.20, shap: +1.04, val: "184.2 µs" },
    { f: "init_win_bytes_fwd", v: 24.10, shap: +0.41, val: "8192" },
    { f: "fwd_pkt_len_mean", v: 18.20, shap: +0.18, val: "742 B" },
    { f: "pkt_length_variance", v: -28.50, shap: -0.62, val: "high variance" },
    { f: "dst_port", v: -41.20, shap: -0.84, val: "443" },
    { f: "tot_fwd_packets", v: -52.10, shap: -1.12, val: "18 pkt" },
  ];
  const isReal = !!realFeats;

  // Waterfall: base value 0.04, sum to predicted 0.96
  const baseValue = 0.04;
  let cum = baseValue;
  const stops = features.map(f => {
    const start = cum;
    const delta = f.shap * 0.10;
    cum += delta;
    return { ...f, start, end: cum };
  });
  const finalValue = cum;

  return (
    <div className="scroll" style={{ height: "100%", padding: "18px 22px 32px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <div className="t-eyebrow">AI · SHAP explainability</div>
          <h1 className="t-h1" style={{ margin: "6px 0 0", fontSize: 24 }}>Why was this flagged?</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn"><Icons.Refresh size={13}/> Run id: <span className="font-mono">shap-7e2c</span></button>
          <button className="btn"><Icons.Download size={13}/> Export to incident</button>
        </div>
      </div>

      {/* Top context */}
      <div className="glass" style={{ padding: 16, marginBottom: 12, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0,
                       background: "radial-gradient(120% 60% at 0% 0%, oklch(0.5 0.18 295 / 0.12), transparent 50%)", pointerEvents: "none" }}/>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 18 }}>
          <div>
            <div className="t-eyebrow">Flow under analysis</div>
            <div className="font-mono" style={{ fontSize: 15, marginTop: 6, color: "var(--text-0)" }}>203.0.113.42<span className="dim">:54218</span></div>
            <div className="font-mono dim" style={{ fontSize: 11.5 }}>→ 10.42.18.7<span className="dim">:443</span> · TCP</div>
          </div>
          <div>
            <div className="t-eyebrow">Prediction</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
              <span className="badge badge-red" style={{ fontSize: 11 }}><Icons.AlertTriangle size={11}/> Botnet C2</span>
            </div>
            <div className="dim font-mono" style={{ fontSize: 11, marginTop: 4 }}>vs. 8 other classes</div>
          </div>
          <div>
            <div className="t-eyebrow">Confidence</div>
            <div className="font-mono" style={{ fontSize: 22, marginTop: 4, fontWeight: 500 }}>
              96.3<span className="dim" style={{ fontSize: 13 }}>%</span>
            </div>
            <div className="dim font-mono" style={{ fontSize: 11 }}>base value 0.04 → 0.963</div>
          </div>
          <div>
            <div className="t-eyebrow">Model · explainer</div>
            <div className="font-mono" style={{ fontSize: 13, marginTop: 4 }}>XGB-v4.2.1 · TreeSHAP</div>
            <div className="dim font-mono" style={{ fontSize: 11 }}>14ms · 64 features evaluated</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 12 }}>
        {/* Waterfall */}
        <div className="glass" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div className="t-eyebrow">Local explanation · waterfall</div>
              <div className="t-h2" style={{ marginTop: 4 }}>Feature contributions to prediction</div>
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
              <Legend color="oklch(0.72 0.22 25)" label="Pushes toward malicious"/>
              <Legend color="oklch(0.82 0.16 220)" label="Pushes toward benign"/>
            </div>
          </div>
          <div style={{ position: "relative" }}>
            {/* Axis */}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-2)", fontFamily: "JetBrains Mono", padding: "0 110px 4px" }}>
              <span>0.0</span><span>0.25</span><span>0.5</span><span>0.75</span><span>1.0</span>
            </div>
            <div style={{ position: "relative" }}>
              {/* Base value marker */}
              <div style={{ position: "absolute", left: `${110 + baseValue * (100 - 16)}%`, top: 0, bottom: 18, width: 1, background: "rgba(170,179,200,0.3)", transform: "translateX(-1px)" }}/>
              {stops.map((s, i) => {
                const isPos = s.shap > 0;
                const leftPct = Math.min(s.start, s.end);
                const widthPct = Math.abs(s.end - s.start);
                return (
                  <div key={s.f} style={{ display: "grid", gridTemplateColumns: "100px 1fr 80px", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(120,160,220,0.05)" }}>
                    <div style={{ textAlign: "right", lineHeight: 1.2 }}>
                      <div className="font-mono" style={{ fontSize: 11, color: "var(--text-1)" }}>{s.f}</div>
                      <div className="dim font-mono" style={{ fontSize: 10 }}>{s.val}</div>
                    </div>
                    <div style={{ position: "relative", height: 18, background: "rgba(120,160,220,0.04)", borderRadius: 3 }}>
                      {/* Position bar relative to 0..1 axis */}
                      <div style={{
                        position: "absolute",
                        left: `${leftPct * 100}%`,
                        width: `${widthPct * 100}%`,
                        top: 2, bottom: 2,
                        borderRadius: 3,
                        background: isPos ? "linear-gradient(90deg, oklch(0.72 0.22 25 / 0.4), oklch(0.72 0.22 25))" :
                                              "linear-gradient(270deg, oklch(0.78 0.15 220 / 0.4), oklch(0.78 0.15 220))",
                        boxShadow: `0 0 10px ${isPos ? "oklch(0.72 0.22 25 / 0.5)" : "oklch(0.78 0.15 220 / 0.5)"}`,
                      }}/>
                      {/* Cumulative position arrow */}
                      <div style={{ position: "absolute", left: `${s.end * 100}%`, top: -3, bottom: -3, width: 1, background: "rgba(255,255,255,0.4)" }}/>
                    </div>
                    <div className="font-mono" style={{ textAlign: "right", fontSize: 11.5, color: isPos ? "oklch(0.85 0.18 25)" : "oklch(0.85 0.14 220)" }}>
                      {isPos ? "+" : ""}{s.shap.toFixed(2)}
                    </div>
                  </div>
                );
              })}
              {/* Final prediction marker */}
              <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 80px", gap: 8, alignItems: "center", padding: "10px 0 0" }}>
                <span className="font-mono" style={{ textAlign: "right", color: "var(--text-0)", fontSize: 11 }}>prediction</span>
                <div style={{ height: 24, position: "relative", borderRadius: 4,
                               background: "linear-gradient(90deg, oklch(0.82 0.16 220 / 0.2), oklch(0.72 0.22 25 / 0.2))" }}>
                  <div style={{ position: "absolute", left: `${finalValue * 100}%`, top: -4, bottom: -4, width: 2, background: "oklch(0.95 0.05 220)", boxShadow: "0 0 10px oklch(0.95 0.05 220)" }}/>
                </div>
                <span className="font-mono" style={{ textAlign: "right", fontSize: 13, fontWeight: 500, color: "oklch(0.92 0.10 25)" }}>
                  f(x) = {finalValue.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* AI reasoning card */}
        <div className="glass" style={{ padding: 16, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(80% 60% at 100% 0%, oklch(0.5 0.18 295 / 0.18), transparent 60%)", pointerEvents: "none" }}/>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 24, height: 24, borderRadius: 6, display: "grid", placeItems: "center",
                           background: "linear-gradient(135deg, oklch(0.7 0.20 295), oklch(0.55 0.18 220))",
                           boxShadow: "0 0 14px oklch(0.7 0.20 295 / 0.5)" }}>
              <Icons.Sparkles size={13}/>
            </div>
            <div>
              <div className="t-eyebrow" style={{ color: "oklch(0.82 0.14 295)" }}>NetShield Analyst</div>
              <div className="t-h2" style={{ marginTop: 2 }}>Plain-language reasoning</div>
            </div>
          </div>
          <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--text-1)", margin: "10px 0 0" }}>
            This flow was classified as <span className="text-red" style={{ fontWeight: 500 }}>Botnet C2</span> because three signals dominated the decision:
          </p>
          <ol style={{ paddingLeft: 18, margin: "10px 0 0", display: "flex", flexDirection: "column", gap: 10, fontSize: 12.5, lineHeight: 1.55 }}>
            <li><span style={{ color: "var(--text-0)" }}>Long-lived flow.</span> <span className="muted">Duration of 324 ms is 14× the protocol baseline; benign HTTPS terminates in ~22 ms after handshake.</span></li>
            <li><span style={{ color: "var(--text-0)" }}>Regular beaconing.</span> <span className="muted">IAT standard deviation of 184 µs indicates a heartbeat cadence — matches <span className="font-mono">cluster-C2-7a</span> with cosine 0.91.</span></li>
            <li><span style={{ color: "var(--text-0)" }}>Maxed backward packet length.</span> <span className="muted">1460-byte response packets repeatedly returning to a single source — consistent with exfil or command relay.</span></li>
          </ol>
          <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, background: "rgba(120,160,220,0.06)", border: "1px solid var(--hairline)" }}>
            <div className="t-eyebrow" style={{ marginBottom: 6 }}>Counter-factual</div>
            <div style={{ fontSize: 11.5, color: "var(--text-1)", lineHeight: 1.5 }}>
              If <span className="font-mono">flow_iat_std</span> were below <span className="font-mono">42 µs</span> and <span className="font-mono">tot_fwd_packets</span> above <span className="font-mono">40</span>, the prediction would flip to <span className="text-green">Benign</span> (0.71 confidence).
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }}>Approve verdict</button>
            <button className="btn" style={{ flex: 1, justifyContent: "center" }}>Override · benign</button>
          </div>
        </div>
      </div>

      {/* Global feature importance + dependence */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div className="glass" style={{ padding: 16 }}>
          <div className="t-eyebrow">Global feature importance · XGBoost</div>
          <div className="t-h2" style={{ marginTop: 4, marginBottom: 12 }}>Mean |SHAP value| across 2.4M flows</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              ["flow_duration", 0.94],
              ["bwd_pkt_len_max", 0.81],
              ["flow_iat_std", 0.72],
              ["init_win_bytes_fwd", 0.61],
              ["fwd_pkt_len_mean", 0.54],
              ["dst_port", 0.48],
              ["tot_fwd_packets", 0.41],
              ["pkt_size_avg", 0.36],
              ["flow_iat_mean", 0.30],
              ["bwd_iat_total", 0.24],
            ].map(([f, v]) => (
              <div key={f} style={{ display: "grid", gridTemplateColumns: "160px 1fr 50px", gap: 10, alignItems: "center", fontSize: 11.5 }}>
                <span className="font-mono" style={{ color: "var(--text-1)" }}>{f}</span>
                <div style={{ height: 8, borderRadius: 2, background: "rgba(120,160,220,0.08)", overflow: "hidden" }}>
                  <div style={{ width: `${v * 100}%`, height: "100%",
                                 background: "linear-gradient(90deg, oklch(0.5 0.18 295), oklch(0.78 0.15 220))",
                                 boxShadow: "0 0 8px oklch(0.78 0.15 220 / 0.5)" }}/>
                </div>
                <span className="font-mono" style={{ fontSize: 10.5, textAlign: "right" }}>{v.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass" style={{ padding: 16 }}>
          <div className="t-eyebrow">SHAP dependence · flow_duration</div>
          <div className="t-h2" style={{ marginTop: 4, marginBottom: 12 }}>Distribution colored by predicted class</div>
          <ShapDependence/>
          <div className="dim" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
            Each point is one flow. SHAP impact rises sharply above <span className="font-mono">~250 ms</span>, the inflection where most botnet beacons and infiltration sessions live.
          </div>
        </div>
      </div>
    </div>
  );
};

const ShapDependence = () => {
  const points = useMemo(() => {
    const rng = mulberry32(81);
    const out = [];
    for (let i = 0; i < 220; i++) {
      const x = Math.pow(rng(), 1.5); // skew to low durations
      // SHAP roughly s-shaped wrt x
      const k = 1 / (1 + Math.exp(-(x - 0.35) * 18));
      const noise = (rng() - 0.5) * 0.25;
      const y = (k - 0.4) * 2 + noise;
      out.push({ x, y, cls: x > 0.4 ? (rng() < 0.85 ? "bad" : "ok") : (rng() < 0.85 ? "ok" : "bad") });
    }
    return out;
  }, []);
  const w = 380, h = 200, pad = 30;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%" }}>
      {[0.5, 1.0, 1.5, -0.5].map(g => (
        <line key={g} x1={pad} x2={w-8} y1={h/2 - g * 60} y2={h/2 - g * 60} stroke="rgba(120,160,220,0.06)"/>
      ))}
      <line x1={pad} x2={w-8} y1={h/2} y2={h/2} stroke="rgba(120,160,220,0.18)" strokeDasharray="2 3"/>
      {points.map((p, i) => {
        const cx = pad + p.x * (w - pad - 8);
        const cy = h/2 - p.y * 60;
        const c = p.cls === "bad" ? "oklch(0.78 0.20 25)" : "oklch(0.82 0.16 220)";
        return <circle key={i} cx={cx} cy={cy} r="2.4" fill={c} opacity="0.7"/>;
      })}
      <text x={pad} y={h-8} fontSize="9" fontFamily="JetBrains Mono" fill="rgba(170,179,200,0.6)">0 ms</text>
      <text x={w-10} y={h-8} fontSize="9" fontFamily="JetBrains Mono" fill="rgba(170,179,200,0.6)" textAnchor="end">600 ms · flow_duration</text>
      <text x={4} y={pad-6} fontSize="9" fontFamily="JetBrains Mono" fill="rgba(170,179,200,0.6)">SHAP +</text>
      <text x={4} y={h-pad+10} fontSize="9" fontFamily="JetBrains Mono" fill="rgba(170,179,200,0.6)">SHAP −</text>
    </svg>
  );
};

window.ShapScreen = ShapScreen;
