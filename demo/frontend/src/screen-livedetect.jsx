// ──────────────────────────────────────────────────────────────────
// Live Detection — the REAL model-driven simulation.
// Streams held-out CICIDS-2017 test flows (which the model never saw in
// training) through the actual XGBoost model via the /stream websocket.
// Pick a scenario; watch the model classify each flow in real time.
// ──────────────────────────────────────────────────────────────────
const SCENARIOS = [
  { id: "normal",  label: "Normal Traffic", desc: "benign flows only",        icon: "Check" },
  { id: "attack",  label: "Under Attack",   desc: "attack flows only",        icon: "AlertTriangle" },
  { id: "mixed",   label: "Mixed / Realistic", desc: "real-world blend",      icon: "Activity" },
  { id: "DDoS",    label: "DDoS Burst",     desc: "volumetric flood",         icon: "Target" },
  { id: "PortScan",label: "Port Scan",      desc: "reconnaissance sweep",     icon: "Search" },
  { id: "Web Attack", label: "Web Attack",  desc: "XSS / SQLi / brute",       icon: "Code" },
];

const CLASS_COLORS = {
  "BENIGN": "oklch(0.78 0.15 220)",
  "DoS": "oklch(0.72 0.22 25)",
  "DDoS": "oklch(0.72 0.22 25)",
  "PortScan": "oklch(0.82 0.16 75)",
  "Brute Force": "oklch(0.78 0.18 40)",
  "Web Attack": "oklch(0.68 0.20 295)",
  "Bot/Infiltration": "oklch(0.72 0.20 10)",
};
const classColor = (n) => CLASS_COLORS[n] || "oklch(0.7 0.12 220)";

const LiveDetectScreen = () => {
  const { connected, flows, stats, scenario, setScenario, rate, setRate, reset } = useFlowStream("mixed", 6);
  const acc = stats.total ? stats.correct / stats.total : 0;
  const detRate = stats.attacks ? "—" : "—"; // detection rate computed below from confusion

  // detection rate = attacks correctly flagged as some attack class / true attacks seen
  let trueAttacks = 0, caughtAttacks = 0, falseAlarms = 0, trueBenign = 0;
  Object.entries(stats.confusion).forEach(([k, v]) => {
    const [truth, pred] = k.split(">");
    const tIsAtk = truth.toUpperCase() !== "BENIGN";
    const pIsAtk = pred.toUpperCase() !== "BENIGN";
    if (tIsAtk) { trueAttacks += v; if (pIsAtk) caughtAttacks += v; }
    else { if (pIsAtk) falseAlarms += v; else trueBenign += v; }
  });
  const detectionRate = trueAttacks ? caughtAttacks / trueAttacks : null;
  const falsePosRate = (falseAlarms + trueBenign) ? falseAlarms / (falseAlarms + trueBenign) : null;

  return (
    <div className="scroll" style={{ height: "100%", padding: "18px 22px 32px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div className="t-eyebrow">Real model · held-out CICIDS-2017 flows</div>
          <h1 className="t-h1" style={{ margin: "6px 0 0", fontSize: 24 }}>Live Detection</h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className={`badge badge-${connected ? "green" : "red"}`}>
            <span className="dot" style={{ width: 6, height: 6 }}/> {connected ? "MODEL LIVE" : "OFFLINE"}
          </span>
          <button className="btn" onClick={reset}><Icons.Refresh size={13}/> Reset</button>
        </div>
      </div>

      {!connected && (
        <div className="glass" style={{ padding: 14, marginBottom: 12, borderColor: "oklch(0.72 0.22 25 / 0.4)" }}>
          <span className="text-red" style={{ fontSize: 12.5 }}>
            Backend not connected. Start it with <span className="font-mono">uvicorn app:app</span> in demo/backend,
            then reload. Showing no data until connected.
          </span>
        </div>
      )}

      {/* Scenario selector */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 8, marginBottom: 14 }}>
        {SCENARIOS.map(s => {
          const Icon = Icons[s.icon] || Icons.Activity;
          const on = scenario === s.id;
          return (
            <button key={s.id} onClick={() => { setScenario(s.id); }}
              className="glass" style={{
                padding: "11px 12px", textAlign: "left", cursor: "pointer",
                border: "1px solid " + (on ? "oklch(0.78 0.15 220 / 0.6)" : "var(--hairline)"),
                background: on ? "oklch(0.55 0.14 220 / 0.14)" : undefined,
                boxShadow: on ? "0 0 16px oklch(0.78 0.15 220 / 0.2)" : "none",
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Icon size={14} style={{ color: on ? "oklch(0.92 0.08 220)" : "var(--text-2)" }}/>
                <span style={{ fontSize: 12, fontWeight: 600, color: on ? "var(--text-0)" : "var(--text-1)" }}>{s.label}</span>
              </div>
              <div className="dim" style={{ fontSize: 10, marginTop: 4 }}>{s.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Rate control */}
      <div className="glass" style={{ padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 14 }}>
        <span className="t-eyebrow">Replay rate</span>
        <input type="range" min="1" max="30" value={rate} onChange={e => setRate(+e.target.value)} style={{ flex: 1, maxWidth: 320 }}/>
        <span className="font-mono" style={{ fontSize: 12 }}>{rate} flows/s</span>
        <span className="dim" style={{ fontSize: 10.5, marginLeft: "auto" }}>
          replaying real held-out test rows · no synthetic data
        </span>
      </div>

      {/* KPI row driven by real stream stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 14 }}>
        <StreamKpi label="Flows Classified" value={fmtNum(stats.total)} intent="cyan"/>
        <StreamKpi label="Attacks Detected" value={fmtNum(stats.attacks)} intent="red"/>
        <StreamKpi label="Live Accuracy" value={stats.total ? (acc*100).toFixed(1)+"%" : "—"} intent="green"/>
        <StreamKpi label="Detection Rate" value={detectionRate!=null ? (detectionRate*100).toFixed(1)+"%" : "—"}
                   sub="attacks caught / true attacks" intent="green"/>
        <StreamKpi label="False-Positive Rate" value={falsePosRate!=null ? (falsePosRate*100).toFixed(2)+"%" : "—"}
                   sub="benign flagged as attack" intent="amber"/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 12 }}>
        {/* Live flow feed */}
        <div className="glass" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <div className="t-eyebrow">Detection Stream · live</div>
              <div className="t-h2" style={{ marginTop: 4 }}>Model predictions, newest first</div>
            </div>
            <span className="dim" style={{ fontSize: 10.5 }}>each row = one real flow → model verdict</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "10px 1.1fr 1.1fr 70px 54px", gap: 10,
                        padding: "0 4px 6px", fontSize: 10, color: "var(--text-2)",
                        textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--hairline)" }}>
            <span/><span>Predicted</span><span>Ground truth</span><span>Conf</span><span style={{textAlign:"right"}}>✓/✗</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", minHeight: 360 }}>
            {flows.length === 0 && (
              <div className="dim" style={{ padding: "30px 4px", fontSize: 12, textAlign: "center" }}>
                {connected ? "Waiting for flows…" : "Backend offline."}
              </div>
            )}
            {flows.map(f => (
              <div key={f.id} className="row-hover" style={{
                display: "grid", gridTemplateColumns: "10px 1.1fr 1.1fr 70px 54px", gap: 10,
                padding: "8px 4px", alignItems: "center",
                borderBottom: "1px solid rgba(120,160,220,0.05)",
              }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: classColor(f.pred),
                               boxShadow: `0 0 6px ${classColor(f.pred)}` }}/>
                <span style={{ fontSize: 12, color: f.isAttack ? "oklch(0.9 0.12 25)" : "var(--text-1)", fontWeight: f.isAttack ? 600 : 400 }}>
                  {f.pred}
                </span>
                <span className="dim" style={{ fontSize: 11.5 }}>{f.truth}</span>
                <span className="font-mono" style={{ fontSize: 11 }}>{(f.conf*100).toFixed(0)}%</span>
                <span style={{ textAlign: "right" }}>
                  {f.correct
                    ? <Icons.Check size={13} style={{ color: "oklch(0.85 0.18 145)" }}/>
                    : <span className="text-red" style={{ fontSize: 12, fontWeight: 700 }}>✗</span>}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Live class breakdown */}
        <div className="glass" style={{ padding: 16 }}>
          <div className="t-eyebrow">Predicted Class Mix · this session</div>
          <div className="t-h2" style={{ marginTop: 4, marginBottom: 12 }}>What the model is calling it</div>
          {Object.keys(stats.byClass).length === 0 && (
            <div className="dim" style={{ fontSize: 12 }}>No predictions yet.</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(stats.byClass).sort((a,b)=>b[1]-a[1]).map(([name, n]) => {
              const pct = stats.total ? n / stats.total : 0;
              return (
                <div key={name}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: classColor(name) }}/>
                      <span style={{ color: "var(--text-1)" }}>{name}</span>
                    </span>
                    <span className="font-mono dim">{n} · {(pct*100).toFixed(0)}%</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: "rgba(120,160,220,0.1)" }}>
                    <div style={{ width: `${pct*100}%`, height: "100%", borderRadius: 3, background: classColor(name),
                                   boxShadow: `0 0 6px ${classColor(name)}` }}/>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--hairline)" }}>
            <div className="t-eyebrow" style={{ marginBottom: 6 }}>Running confusion (live)</div>
            <div className="dim font-mono" style={{ fontSize: 10.5, lineHeight: 1.6 }}>
              correct {stats.correct} / {stats.total}<br/>
              attacks caught {caughtAttacks} / {trueAttacks}<br/>
              false alarms {falseAlarms}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StreamKpi = ({ label, value, sub, intent }) => {
  const c = { cyan:"oklch(0.82 0.16 220)", red:"oklch(0.72 0.22 25)", green:"oklch(0.84 0.20 145)", amber:"oklch(0.82 0.16 75)" }[intent||"cyan"];
  return (
    <div className="glass" style={{ padding: "13px 15px", position: "relative", overflow: "hidden", minHeight: 92 }}>
      <div style={{ position:"absolute", inset:0, background:`radial-gradient(120% 80% at 100% 0%, ${c.replace(")"," / 0.10)")}, transparent 60%)`, pointerEvents:"none" }}/>
      <div className="t-eyebrow">{label}</div>
      <div className="font-mono" style={{ fontSize: 26, fontWeight: 500, marginTop: 8, color: "var(--text-0)" }}>{value}</div>
      {sub && <div className="dim" style={{ fontSize: 9.5, marginTop: 4 }}>{sub}</div>}
    </div>
  );
};

window.LiveDetectScreen = LiveDetectScreen;
