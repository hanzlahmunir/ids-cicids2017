// Main SOC Dashboard
const KpiCard = ({ label, value, suffix, trend, sparkColor, sparkData, delta, intent }) => {
  const animated = useAnimatedNumber(value, 800);
  const intentColor = {
    cyan: "oklch(0.82 0.16 220)",
    green: "oklch(0.84 0.20 145)",
    amber: "oklch(0.82 0.16 75)",
    red: "oklch(0.72 0.22 25)",
    purple: "oklch(0.68 0.20 295)",
  }[intent || "cyan"];
  return (
    <div className="glass" style={{ position: "relative", padding: "14px 16px", overflow: "hidden", minHeight: 116 }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "inherit",
                     background: `radial-gradient(120% 80% at 100% 0%, ${intentColor.replace(")", " / 0.10)")}, transparent 60%)`,
                     pointerEvents: "none" }}/>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span className="t-eyebrow">{label}</span>
        {delta != null && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10.5, fontWeight: 500,
                          color: delta >= 0 ? "oklch(0.85 0.18 145)" : "oklch(0.82 0.18 25)" }}>
            {delta >= 0 ? <Icons.ArrowUp size={10}/> : <Icons.ArrowDown size={10}/>}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 10 }}>
        <span className="font-mono" style={{ fontSize: 30, fontWeight: 500, color: "var(--text-0)", letterSpacing: "-0.01em" }}>
          {typeof value === "number" ? fmtNum(animated, { decimals: value % 1 ? 2 : 0, compact: value >= 1000 }) : value}
        </span>
        {suffix && <span className="dim font-mono" style={{ fontSize: 12 }}>{suffix}</span>}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 6 }}>
        <span className="dim" style={{ fontSize: 10.5 }}>{trend}</span>
        <Spark data={sparkData} w={92} h={26} color={sparkColor || intentColor}/>
      </div>
    </div>
  );
};

const DashboardScreen = () => {
  const tick = useTick(2500);
  const spark = useMemo(() => {
    const rng = mulberry32(tick * 7 + 1);
    return Array.from({ length: 24 }).map(() => 30 + rng() * 70);
  }, [tick]);
  const sparkB = useMemo(() => {
    const rng = mulberry32(tick * 11 + 3);
    return Array.from({ length: 24 }).map(() => 30 + rng() * 70);
  }, [tick]);
  const trafficSeries = useMemo(() => {
    const rng = mulberry32(tick + 17);
    const N = 60;
    const benign = []; const malicious = [];
    for (let i = 0; i < N; i++) {
      const base = 4000 + Math.sin(i / 7) * 1200 + rng() * 600;
      benign.push(base);
      malicious.push(Math.max(0, 120 + Math.sin(i / 4) * 60 + rng() * 80 - 30 + (i > 40 && i < 48 ? 380 : 0)));
    }
    return [
      { name: "Benign", color: "oklch(0.78 0.15 220)", data: benign },
      { name: "Malicious", color: "oklch(0.72 0.22 25)", data: malicious },
    ];
  }, [tick]);

  const recent = useMemo(() => {
    const rng = mulberry32(91);
    const types = [
      ["DDoS", "red", 4], ["Port Scan", "amber", 2], ["SQL Injection", "red", 3],
      ["Brute Force SSH", "amber", 3], ["Botnet C2", "red", 4], ["XSS", "amber", 2],
      ["Infiltration", "red", 4], ["Brute Force FTP", "amber", 2],
    ];
    return Array.from({ length: 7 }).map((_, i) => {
      const t = types[Math.floor(rng() * types.length)];
      return {
        id: i, type: t[0], sev: t[2], color: t[1],
        src: ipFrom(rng), dst: ipFrom(rng),
        conf: 0.72 + rng() * 0.27,
        secAgo: Math.floor(rng() * 240) + 2,
        model: ["XGBoost","Random Forest","MLP"][Math.floor(rng()*3)],
      };
    });
  }, [tick]);

  return (
    <div className="scroll" style={{ height: "100%", padding: "18px 22px 32px" }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div className="t-eyebrow">Mission Control · Tier-3 View</div>
          <h1 className="t-h1" style={{ margin: "6px 0 0", fontSize: 24 }}>SOC Dashboard</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn"><Icons.Refresh size={13}/> Last 24h <Icons.ChevronDown size={12}/></button>
          <button className="btn"><Icons.Filter size={13}/> All segments</button>
          <button className="btn btn-primary"><Icons.AlertTriangle size={13}/> Open Incident</button>
        </div>
      </div>

      {/* KPI grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 14 }}>
        <KpiCard label="Packets Analyzed · 24h" value={2487329141} suffix="" trend="across 1,284 segments" sparkData={spark} delta={+4.2} intent="cyan"/>
        <KpiCard label="Active Threats" value={47} trend="12 critical · 23 high" sparkData={sparkB} delta={+18.4} intent="red"/>
        <KpiCard label="Detection Rate" value={99.32} suffix="%" trend="rolling 1h window" sparkData={spark.slice().reverse()} delta={+0.4} intent="green"/>
        <KpiCard label="False-Positive Rate" value={0.41} suffix="%" trend="target ≤ 0.50%" sparkData={sparkB.slice().reverse()} delta={-0.08} intent="green"/>
        <KpiCard label="API Latency · p95" value={23} suffix="ms" trend="FastAPI / 12 replicas" sparkData={spark.map(v => 60-v*0.4)} delta={-2.1} intent="cyan"/>
        <KpiCard label="Model Accuracy" value={0.9847} trend="XGB-v4.2.1 ensemble" sparkData={spark.slice(8)} delta={+0.12} intent="purple"/>
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1.65fr 1fr", gap: 12 }}>
        {/* Traffic chart */}
        <div className="glass" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div>
              <div className="t-eyebrow">Network Traffic · 60 min</div>
              <div className="t-h2" style={{ marginTop: 4 }}>Flow classification stream</div>
            </div>
            <div style={{ display: "flex", gap: 14, fontSize: 11 }}>
              <Legend color="oklch(0.78 0.15 220)" label="Benign" value="2.41B pkt"/>
              <Legend color="oklch(0.72 0.22 25)" label="Malicious" value="14.2M pkt"/>
              <div style={{ display: "flex", gap: 4 }}>
                {["1m","5m","1h","24h","7d"].map(p => (
                  <button key={p} className="btn btn-ghost" style={{ height: 24, padding: "0 8px", fontSize: 10.5,
                    background: p === "1h" ? "oklch(0.55 0.14 220 / 0.18)" : "transparent",
                    color: p === "1h" ? "oklch(0.92 0.08 220)" : "var(--text-2)" }}>{p}</button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ height: 220, marginTop: 6 }}>
            <AreaChart series={trafficSeries} w={760} h={220} gridY={4}/>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--hairline)" }}>
            <SegStat label="DDoS" value="3.42M" pct={24} color="oklch(0.72 0.22 25)"/>
            <SegStat label="Port Scan" value="1.86M" pct={13} color="oklch(0.82 0.16 75)"/>
            <SegStat label="Brute Force" value="982K" pct={7} color="oklch(0.78 0.18 40)"/>
            <SegStat label="Web Attack" value="421K" pct={3} color="oklch(0.68 0.20 295)"/>
            <SegStat label="Botnet" value="218K" pct={2} color="oklch(0.72 0.22 25)"/>
            <SegStat label="Infiltration" value="89K" pct={1} color="oklch(0.82 0.18 40)"/>
          </div>
        </div>

        {/* Threat composition */}
        <div className="glass" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>
              <div className="t-eyebrow">Threat Composition · live</div>
              <div className="t-h2" style={{ marginTop: 4 }}>Active classifications</div>
            </div>
            <span className="badge badge-cyan"><Icons.Sparkles size={10}/> Ensemble</span>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center", paddingTop: 6 }}>
            <Donut value={87} max={100} size={120} stroke={10} color="oklch(0.82 0.16 220)" label="Severity Score"/>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { name: "DDoS · Volumetric", v: 38, c: "oklch(0.72 0.22 25)" },
                { name: "Port Scan", v: 24, c: "oklch(0.82 0.16 75)" },
                { name: "Brute Force SSH", v: 14, c: "oklch(0.78 0.18 40)" },
                { name: "SQL Injection", v: 11, c: "oklch(0.68 0.20 295)" },
                { name: "Botnet C2", v: 8, c: "oklch(0.72 0.22 25)" },
                { name: "Infiltration", v: 5, c: "oklch(0.82 0.18 40)" },
              ].map(d => (
                <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: d.c, boxShadow: `0 0 6px ${d.c}` }}/>
                  <span style={{ flex: 1, fontSize: 11.5, color: "var(--text-1)" }}>{d.name}</span>
                  <span className="font-mono dim" style={{ fontSize: 10.5 }}>{d.v}%</span>
                  <div style={{ width: 56, height: 4, borderRadius: 2, background: "rgba(120,160,220,0.1)" }}>
                    <div style={{ width: `${d.v * 1.8}%`, maxWidth: "100%", height: "100%", borderRadius: 2, background: d.c }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent threats feed */}
        <div className="glass" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <div className="t-eyebrow">Detection Stream · live</div>
              <div className="t-h2" style={{ marginTop: 4 }}>Recently flagged flows</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", color: "oklch(0.85 0.18 145)", fontSize: 11 }}>
              <span className="dot" style={{ color: "currentColor" }}/> Streaming · 2.1k flows/s
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "12px 1fr 1fr 100px 70px 60px", gap: 10, padding: "0 4px 6px", fontSize: 10, color: "var(--text-2)", letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid var(--hairline)" }}>
            <span/><span>Attack · Source → Dest</span><span>Model · Reason</span><span>Confidence</span><span>When</span><span style={{ textAlign: "right" }}>Sev</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {recent.map(r => (
              <div key={r.id} className="row-hover" style={{
                display: "grid", gridTemplateColumns: "12px 1fr 1fr 100px 70px 60px", gap: 10,
                padding: "10px 4px", alignItems: "center",
                borderBottom: "1px solid rgba(120,160,220,0.05)",
              }}>
                <span className={`sev sev-${r.sev}`}/>
                <div style={{ lineHeight: 1.25 }}>
                  <div style={{ fontSize: 12, color: "var(--text-0)" }}>{r.type}</div>
                  <div className="font-mono dim" style={{ fontSize: 10.5 }}>{r.src} <span className="text-cyan">→</span> {r.dst}</div>
                </div>
                <div style={{ lineHeight: 1.3 }}>
                  <div style={{ fontSize: 11, color: "var(--text-1)" }}>{r.model}</div>
                  <div className="dim" style={{ fontSize: 10.5 }}>
                    {r.type.includes("DDoS") ? "high pps · spoofed src" :
                     r.type.includes("Port") ? "many dst ports · short conn" :
                     r.type.includes("SQL") ? "anomalous payload tokens" :
                     r.type.includes("Brute") ? "auth-fail burst · repeating creds" :
                     r.type.includes("Botnet") ? "beacon cadence · known C2" :
                     r.type.includes("XSS") ? "script tags in form fields" :
                     "lateral movement pattern"}
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(120,160,220,0.12)" }}>
                      <div style={{ width: `${r.conf * 100}%`, height: "100%", borderRadius: 2,
                                     background: `linear-gradient(90deg, oklch(0.78 0.15 220), oklch(0.7 0.18 295))` }}/>
                    </div>
                    <span className="font-mono" style={{ fontSize: 10.5, color: "var(--text-0)" }}>{(r.conf*100).toFixed(1)}%</span>
                  </div>
                </div>
                <span className="dim font-mono" style={{ fontSize: 10.5 }}>{relTime(r.secAgo)}</span>
                <span style={{ textAlign: "right" }}>
                  <span className={`badge badge-${r.color}`}>{["LOW","MED","HIGH","CRIT"][r.sev-1]}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Geographic + model board */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="glass" style={{ padding: 16, position: "relative", flex: 1 }}>
            <div className="t-eyebrow">Top Attacking Geographies · 1h</div>
            <div className="t-h2" style={{ marginTop: 4, marginBottom: 12 }}>Origin heat</div>
            <WorldMini/>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 12 }}>
              {[
                { c: "🇨🇳 China", v: 28.4, n: "8,492" },
                { c: "🇷🇺 Russia", v: 22.1, n: "6,602" },
                { c: "🇰🇵 N. Korea", v: 11.8, n: "3,531" },
                { c: "🇧🇷 Brazil", v: 8.4, n: "2,510" },
                { c: "🇮🇷 Iran", v: 7.2, n: "2,153" },
                { c: "🇻🇳 Vietnam", v: 5.1, n: "1,524" },
              ].map(g => (
                <div key={g.c} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                  <span style={{ flex: 1 }}>{g.c}</span>
                  <span className="font-mono dim" style={{ fontSize: 10.5 }}>{g.n}</span>
                  <span className="font-mono text-red" style={{ fontSize: 10.5, minWidth: 38, textAlign: "right" }}>{g.v}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="t-eyebrow">Model Ensemble · vote</div>
              <span className="badge badge-purple"><Icons.Cpu size={10}/> 3 models</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 10 }}>
              {[
                { n: "XGBoost", v: "0.9847", w: 0.45, c: "oklch(0.82 0.16 220)" },
                { n: "Random Forest", v: "0.9711", w: 0.30, c: "oklch(0.7 0.18 145)" },
                { n: "MLP", v: "0.9628", w: 0.25, c: "oklch(0.68 0.20 295)" },
              ].map(m => (
                <div key={m.n} style={{ padding: "10px 10px 8px", borderRadius: 8, background: "rgba(8,12,26,0.5)", border: "1px solid var(--hairline)" }}>
                  <div className="t-eyebrow" style={{ fontSize: 9, color: m.c, opacity: 0.9 }}>{m.n}</div>
                  <div className="font-mono" style={{ fontSize: 17, fontWeight: 500, marginTop: 4 }}>{m.v}</div>
                  <div style={{ height: 3, borderRadius: 2, background: "rgba(120,160,220,0.1)", marginTop: 6 }}>
                    <div style={{ width: `${m.w * 100}%`, height: "100%", borderRadius: 2, background: m.c, boxShadow: `0 0 8px ${m.c}` }}/>
                  </div>
                  <div className="dim font-mono" style={{ fontSize: 9.5, marginTop: 4 }}>weight {m.w.toFixed(2)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Legend = ({ color, label, value }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    <span style={{ width: 8, height: 8, borderRadius: 2, background: color, boxShadow: `0 0 8px ${color}` }}/>
    <span style={{ color: "var(--text-1)" }}>{label}</span>
    <span className="font-mono dim" style={{ fontSize: 10.5 }}>{value}</span>
  </div>
);

const SegStat = ({ label, value, pct, color }) => (
  <div style={{ flex: 1, padding: "8px 10px", borderRadius: 8, background: "rgba(8,12,26,0.4)", border: "1px solid var(--hairline)" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: 1, background: color }}/>
      <span className="t-eyebrow" style={{ fontSize: 9 }}>{label}</span>
    </div>
    <div className="font-mono" style={{ fontSize: 14, fontWeight: 500, marginTop: 4 }}>{value}</div>
    <div className="dim font-mono" style={{ fontSize: 9.5 }}>{pct}% of malicious</div>
  </div>
);

// Mini world map — schematic, dotted continents
const WorldMini = () => {
  // attack origin points (lon, lat-ish %)
  const hits = [
    { x: 78, y: 30, v: 1.0 }, // China
    { x: 62, y: 22, v: 0.9 }, // Russia
    { x: 82, y: 28, v: 0.8 }, // NK
    { x: 38, y: 70, v: 0.7 }, // Brazil
    { x: 60, y: 36, v: 0.7 }, // Iran
    { x: 78, y: 42, v: 0.5 }, // Vietnam
    { x: 22, y: 38, v: 0.5 }, // US-east attacks origin
    { x: 50, y: 32, v: 0.45 }, // EU
  ];
  // dotted background — pseudo-continents
  const dots = useMemo(() => {
    const rng = mulberry32(42);
    const out = [];
    for (let i = 0; i < 600; i++) {
      const x = rng() * 100, y = rng() * 100;
      // crude shape filter — flatten poles, gap mid-Atlantic
      const inLand = (y > 22 && y < 80) && Math.random() > 0.0 && (
        (x > 12 && x < 30 && y > 26 && y < 70) ||   // Americas
        (x > 42 && x < 60 && y > 26 && y < 56) ||   // EU/Africa
        (x > 56 && x < 90 && y > 22 && y < 56) ||   // Asia
        (x > 82 && x < 96 && y > 60 && y < 78)      // AUS
      );
      if (inLand) out.push([x, y]);
    }
    return out;
  }, []);
  return (
    <svg viewBox="0 0 100 60" style={{ width: "100%", display: "block" }}>
      {dots.map((d, i) => (
        <circle key={i} cx={d[0]} cy={d[1] * 0.6} r="0.35" fill="rgba(120,160,220,0.35)"/>
      ))}
      {hits.map((h, i) => (
        <g key={i}>
          <circle cx={h.x} cy={h.y * 0.6} r={h.v * 3.5} fill="oklch(0.72 0.22 25)" opacity="0.15"/>
          <circle cx={h.x} cy={h.y * 0.6} r={h.v * 1.6} fill="oklch(0.72 0.22 25)" opacity="0.5"/>
          <circle cx={h.x} cy={h.y * 0.6} r="0.7" fill="oklch(0.92 0.12 25)"/>
        </g>
      ))}
    </svg>
  );
};

window.DashboardScreen = DashboardScreen;
window.KpiCard = KpiCard;
window.Legend = Legend;
window.SegStat = SegStat;
window.WorldMini = WorldMini;
