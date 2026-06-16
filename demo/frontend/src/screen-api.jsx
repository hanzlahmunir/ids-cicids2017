// API Monitoring (Grafana/Datadog-style observability — original design)
const ApiScreen = () => {
  const tick = useTick(2500);
  const series = useMemo(() => {
    const rng = mulberry32(tick * 3 + 1);
    const N = 60;
    const lat = [], rps = [], err = [];
    for (let i = 0; i < N; i++) {
      lat.push(15 + Math.sin(i / 7) * 5 + rng() * 4 + (i > 48 && i < 53 ? 18 : 0));
      rps.push(8400 + Math.sin(i / 5) * 1400 + rng() * 800);
      err.push(Math.max(0, 2 + Math.sin(i / 9) * 1.5 + rng() * 1 + (i > 48 && i < 53 ? 8 : 0)));
    }
    return { lat, rps, err };
  }, [tick]);

  const replicas = useMemo(() => {
    const rng = mulberry32(91);
    return Array.from({ length: 12 }).map((_, i) => ({
      id: `infer-${(i + 1).toString().padStart(2, "0")}`,
      cpu: 30 + Math.floor(rng() * 60),
      mem: 40 + Math.floor(rng() * 50),
      rps: 600 + Math.floor(rng() * 1200),
      lat: 12 + Math.floor(rng() * 18),
      status: i === 7 ? "degraded" : i === 11 ? "warning" : "healthy",
    }));
  }, []);

  const logs = useMemo(() => {
    const items = [
      { t: "12:42:18.413", lvl: "INFO",  msg: "POST /infer/predict_batch  200  37ms  batch=128  model=xgb-v4.2.1" },
      { t: "12:42:18.411", lvl: "INFO",  msg: "POST /infer/predict        200  18ms  flow=fl-9e2a7c  pred=botnet  conf=0.962" },
      { t: "12:42:18.402", lvl: "WARN",  msg: "GET  /infer/health         200  214ms infer-08 SLA 200ms BREACH" },
      { t: "12:42:18.398", lvl: "INFO",  msg: "POST /infer/predict        200  21ms  flow=fl-2c81bb  pred=benign  conf=0.998" },
      { t: "12:42:18.391", lvl: "ERROR", msg: "POST /shap/explain         503  -    upstream model worker timeout (8s)  trace=abc-7e2c" },
      { t: "12:42:18.380", lvl: "INFO",  msg: "GET  /metrics/prom          200  4ms" },
      { t: "12:42:18.374", lvl: "INFO",  msg: "POST /infer/predict        200  16ms  flow=fl-7f4112  pred=ddos    conf=0.991" },
      { t: "12:42:18.361", lvl: "WARN",  msg: "rate_limit                  429  -    src=203.0.113.42 exceeded 1k req/min on /infer/predict" },
      { t: "12:42:18.348", lvl: "INFO",  msg: "POST /infer/predict        200  19ms  flow=fl-31aaee  pred=port    conf=0.864" },
    ];
    return items;
  }, []);

  return (
    <div className="scroll" style={{ height: "100%", padding: "18px 22px 32px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <div className="t-eyebrow">FastAPI inference service · observability</div>
          <h1 className="t-h1" style={{ margin: "6px 0 0", fontSize: 24 }}>API Monitoring</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span className="badge badge-green"><span className="dot" style={{ width: 6, height: 6 }}/> Uptime 99.987%</span>
          <button className="btn"><Icons.Refresh size={13}/> Last 1h <Icons.ChevronDown size={12}/></button>
          <button className="btn"><Icons.Code size={13}/> OpenAPI</button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 12 }}>
        <ApiKpi label="Requests · 1h" value="2.41M" sub="↑ 6.4% vs prev" sparkData={series.rps} color="oklch(0.82 0.16 220)"/>
        <ApiKpi label="Throughput" value="9,842 rps" sub="p99 11.2K" sparkData={series.rps} color="oklch(0.82 0.16 220)"/>
        <ApiKpi label="p50 latency" value="14 ms" sub="SLO 25 ms" sparkData={series.lat} color="oklch(0.7 0.18 145)"/>
        <ApiKpi label="p95 latency" value="23 ms" sub="SLO 50 ms" sparkData={series.lat} color="oklch(0.82 0.16 75)"/>
        <ApiKpi label="Error rate" value="0.34%" sub="3.2× burn rate" sparkData={series.err} color="oklch(0.78 0.20 25)"/>
        <ApiKpi label="Saturation" value="62%" sub="12 replicas · auto-scaling" sparkData={series.rps.map(v => v/200)} color="oklch(0.68 0.20 295)"/>
      </div>

      {/* Charts grid */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <div className="glass" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>
              <div className="t-eyebrow">Latency distribution · 60 min</div>
              <div className="t-h2" style={{ marginTop: 4 }}>p50 / p95 / p99</div>
            </div>
            <div style={{ display: "flex", gap: 14, fontSize: 11 }}>
              <Legend color="oklch(0.7 0.18 145)" label="p50"/>
              <Legend color="oklch(0.82 0.16 75)" label="p95"/>
              <Legend color="oklch(0.78 0.20 25)" label="p99"/>
            </div>
          </div>
          <AreaChart
            w={760} h={200} gridY={4}
            series={[
              { name: "p50", color: "oklch(0.7 0.18 145)", data: series.lat.map(v => v) },
              { name: "p95", color: "oklch(0.82 0.16 75)", data: series.lat.map(v => v + 8) },
              { name: "p99", color: "oklch(0.78 0.20 25)", data: series.lat.map(v => v + 22 + Math.sin(v) * 4) },
            ]}/>
        </div>

        <div className="glass" style={{ padding: 16 }}>
          <div className="t-eyebrow">SLO burn-rate</div>
          <div className="t-h2" style={{ marginTop: 4, marginBottom: 14 }}>Error budget · 30d</div>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <Donut value={62} max={100} size={100} stroke={9} color="oklch(0.78 0.20 25)" label="Burned"/>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, fontSize: 11.5 }}>
              <Row k="Budget remaining" v="38% · 11.4d" color="oklch(0.85 0.18 145)"/>
              <Row k="Burn rate · 1h" v="3.2× target" color="oklch(0.85 0.18 25)"/>
              <Row k="Burn rate · 6h" v="1.4× target" color="oklch(0.85 0.14 75)"/>
              <Row k="Time to exhaust" v="4d 18h"/>
              <Row k="Last incident" v="2d ago · INC-04812"/>
            </div>
          </div>
          <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, background: "oklch(0.55 0.20 25 / 0.08)", border: "1px solid oklch(0.78 0.20 25 / 0.25)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <Icons.AlertTriangle size={13} style={{ color: "oklch(0.85 0.18 25)" }}/>
              <span style={{ color: "var(--text-0)" }}>Page on-call if 6h burn rate exceeds 2.0×</span>
            </div>
          </div>
        </div>

        {/* Replica grid */}
        <div className="glass" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div className="t-eyebrow">Inference replicas · K8s</div>
              <div className="t-h2" style={{ marginTop: 4 }}>netshield-infer · 12 pods</div>
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
              <Legend color="oklch(0.7 0.18 145)" label="Healthy 10"/>
              <Legend color="oklch(0.82 0.16 75)" label="Warning 1"/>
              <Legend color="oklch(0.78 0.20 25)" label="Degraded 1"/>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {replicas.map(r => {
              const c = r.status === "healthy" ? "oklch(0.7 0.18 145)" : r.status === "warning" ? "oklch(0.82 0.16 75)" : "oklch(0.78 0.20 25)";
              return (
                <div key={r.id} style={{
                  padding: 10, borderRadius: 8,
                  background: "rgba(8,12,26,0.5)", border: `1px solid ${c.replace(")", " / 0.3)")}`,
                  boxShadow: r.status !== "healthy" ? `0 0 12px ${c.replace(")", " / 0.25)")}` : "none",
                  position: "relative", overflow: "hidden",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="font-mono" style={{ fontSize: 11, color: "var(--text-0)" }}>{r.id}</span>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: c, boxShadow: `0 0 6px ${c}` }}/>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <MicroBar k="CPU" v={r.cpu}/>
                    <MicroBar k="MEM" v={r.mem}/>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10, color: "var(--text-2)" }}>
                    <span className="font-mono">{r.rps} rps</span>
                    <span className="font-mono">{r.lat} ms</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Endpoints table */}
        <div className="glass" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <div className="t-eyebrow">Endpoint health · top 6</div>
              <div className="t-h2" style={{ marginTop: 4 }}>By request volume</div>
            </div>
            <span className="badge badge-cyan">FastAPI 0.110</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 60px 70px 70px 60px", gap: 8, padding: "4px 6px",
                          fontSize: 9.5, color: "var(--text-2)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              <span>Route</span><span style={{ textAlign: "right" }}>RPS</span><span style={{ textAlign: "right" }}>p95</span><span style={{ textAlign: "right" }}>Error</span><span style={{ textAlign: "right" }}>SLO</span>
            </div>
            {[
              { r: "POST /infer/predict", rps: 6240, lat: 18, err: 0.21 },
              { r: "POST /infer/predict_batch", rps: 1840, lat: 37, err: 0.42 },
              { r: "POST /shap/explain", rps: 124, lat: 84, err: 1.84 },
              { r: "GET /infer/health", rps: 920, lat: 6, err: 0.02 },
              { r: "GET /metrics/prom", rps: 380, lat: 4, err: 0.00 },
              { r: "POST /feed/threat", rps: 218, lat: 22, err: 0.31 },
            ].map(e => {
              const ok = e.lat < 50 && e.err < 1.0;
              return (
                <div key={e.r} className="row-hover" style={{
                  display: "grid", gridTemplateColumns: "1.6fr 60px 70px 70px 60px", gap: 8, padding: "8px 6px", alignItems: "center",
                  borderTop: "1px solid rgba(120,160,220,0.05)", fontSize: 11.5,
                }}>
                  <span className="font-mono" style={{ color: "var(--text-0)" }}>{e.r}</span>
                  <span className="font-mono dim" style={{ textAlign: "right" }}>{e.rps.toLocaleString()}</span>
                  <span className="font-mono" style={{ textAlign: "right", color: e.lat > 50 ? "oklch(0.85 0.18 25)" : "var(--text-1)" }}>{e.lat} ms</span>
                  <span className="font-mono" style={{ textAlign: "right", color: e.err > 1 ? "oklch(0.85 0.18 25)" : e.err > 0.4 ? "oklch(0.85 0.14 75)" : "oklch(0.85 0.18 145)" }}>{e.err.toFixed(2)}%</span>
                  <span style={{ textAlign: "right" }}>
                    <span className={`badge badge-${ok ? "green" : "amber"}`} style={{ fontSize: 9 }}>{ok ? "OK" : "WATCH"}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Logs */}
      <div className="glass" style={{ padding: 16, marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <div className="t-eyebrow">Live request logs</div>
            <div className="t-h2" style={{ marginTop: 4 }}>Structured JSON · streaming</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <FilterChip label="Level" value="ALL"/>
            <FilterChip label="Service" value="netshield-infer"/>
            <FilterChip label="Trace" value="off"/>
          </div>
        </div>
        <div style={{ fontFamily: "JetBrains Mono", fontSize: 11.5, lineHeight: 1.7, padding: 10, borderRadius: 8,
                       background: "rgba(4,6,14,0.7)", border: "1px solid var(--hairline)", maxHeight: 220, overflow: "auto" }}>
          {logs.map((l, i) => (
            <div key={i} style={{ display: "flex", gap: 10 }}>
              <span style={{ color: "var(--text-3)", flexShrink: 0 }}>{l.t}</span>
              <span style={{
                color: l.lvl === "ERROR" ? "oklch(0.85 0.18 25)" : l.lvl === "WARN" ? "oklch(0.85 0.14 75)" : "oklch(0.85 0.14 220)",
                fontWeight: 600, minWidth: 50, flexShrink: 0,
              }}>{l.lvl}</span>
              <span style={{ color: l.lvl === "ERROR" ? "oklch(0.92 0.10 25)" : "var(--text-1)" }}>{l.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ApiKpi = ({ label, value, sub, sparkData, color }) => (
  <div className="glass" style={{ padding: "12px 14px", position: "relative", overflow: "hidden" }}>
    <div className="t-eyebrow">{label}</div>
    <div className="font-mono" style={{ fontSize: 22, fontWeight: 500, marginTop: 6, color: "var(--text-0)" }}>{value}</div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginTop: 4 }}>
      <span className="dim" style={{ fontSize: 10.5 }}>{sub}</span>
      <Spark data={sparkData} w={70} h={20} color={color}/>
    </div>
  </div>
);

const MicroBar = ({ k, v }) => {
  const c = v > 80 ? "oklch(0.78 0.20 25)" : v > 65 ? "oklch(0.82 0.16 75)" : "oklch(0.7 0.18 145)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 9 }}>
      <span className="dim" style={{ width: 24, fontFamily: "JetBrains Mono" }}>{k}</span>
      <div style={{ flex: 1, height: 3, borderRadius: 2, background: "rgba(120,160,220,0.1)" }}>
        <div style={{ width: `${v}%`, height: "100%", borderRadius: 2, background: c, boxShadow: `0 0 6px ${c}` }}/>
      </div>
      <span className="font-mono" style={{ color: "var(--text-1)", minWidth: 22, textAlign: "right" }}>{v}%</span>
    </div>
  );
};

const Row = ({ k, v, color }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
    <span style={{ color: "var(--text-2)" }}>{k}</span>
    <span className="font-mono" style={{ color: color || "var(--text-0)" }}>{v}</span>
  </div>
);

window.ApiScreen = ApiScreen;
