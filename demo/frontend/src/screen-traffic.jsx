// Live Traffic Visualization
const TrafficScreen = () => {
  const tick = useTick(80);

  // Network nodes — fixed positions, packets animate along edges
  const { nodes, edges } = useMemo(() => {
    const rng = mulberry32(31);
    const nodes = [];
    // Core ring
    const core = ["EDGE-FW", "WAF", "API-GW", "K8S-PROD", "K8S-STAGE", "DB-CLUSTER", "OBJ-STORE", "AUTH-IDP"];
    core.forEach((label, i) => {
      const a = (i / core.length) * Math.PI * 2 - Math.PI / 2;
      nodes.push({ id: label, x: 50 + Math.cos(a) * 22, y: 50 + Math.sin(a) * 22, type: "core", label });
    });
    // Outer attackers / users
    const outer = [
      ["EXT-SCANNER", 8, 14, "bad"], ["EXT-BOTNET", 88, 18, "bad"],
      ["EXT-VPN", 10, 70, "warn"], ["EXT-USER-NA", 90, 70, "ok"],
      ["EXT-USER-EU", 14, 88, "ok"], ["EXT-USER-APAC", 86, 88, "ok"],
      ["EXT-CDN", 50, 6, "ok"], ["EXT-PARTNER", 50, 94, "ok"],
    ];
    outer.forEach(o => nodes.push({ id: o[0], x: o[1], y: o[2], type: o[3], label: o[0] }));
    // Edges
    const edges = [];
    // Core ring
    for (let i = 0; i < core.length; i++) {
      const a = core[i], b = core[(i + 1) % core.length];
      edges.push({ from: a, to: b, kind: "ok" });
    }
    // Hub spokes
    ["WAF","API-GW","K8S-PROD","DB-CLUSTER","AUTH-IDP"].forEach(c => edges.push({ from: "EDGE-FW", to: c, kind: "ok" }));
    ["K8S-PROD","K8S-STAGE"].forEach(c => edges.push({ from: "API-GW", to: c, kind: "ok" }));
    // External edges
    edges.push({ from: "EXT-SCANNER", to: "EDGE-FW", kind: "bad" });
    edges.push({ from: "EXT-BOTNET", to: "WAF", kind: "bad" });
    edges.push({ from: "EXT-VPN", to: "AUTH-IDP", kind: "warn" });
    edges.push({ from: "EXT-USER-NA", to: "EDGE-FW", kind: "ok" });
    edges.push({ from: "EXT-USER-EU", to: "EDGE-FW", kind: "ok" });
    edges.push({ from: "EXT-USER-APAC", to: "EDGE-FW", kind: "ok" });
    edges.push({ from: "EXT-CDN", to: "EDGE-FW", kind: "ok" });
    edges.push({ from: "EXT-PARTNER", to: "API-GW", kind: "ok" });
    return { nodes, edges };
  }, []);

  const nodeMap = useMemo(() => {
    const m = {}; nodes.forEach(n => m[n.id] = n); return m;
  }, [nodes]);

  const t = (tick * 0.012) % 1;

  const colorFor = (kind) => kind === "bad" ? "oklch(0.78 0.20 25)" : kind === "warn" ? "oklch(0.82 0.16 75)" : "oklch(0.82 0.16 220)";

  return (
    <div className="scroll" style={{ height: "100%", padding: "18px 22px 32px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <div className="t-eyebrow">Live · L4–L7 flow visualization</div>
          <h1 className="t-h1" style={{ margin: "6px 0 0", fontSize: 24 }}>Network Traffic</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span className="badge badge-green"><span className="dot" style={{ width: 6, height: 6 }}/> 2,148 flows/sec</span>
          <button className="btn"><Icons.Eye size={13}/> View: Logical <Icons.ChevronDown size={12}/></button>
          <button className="btn"><Icons.Filter size={13}/> All protocols</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 12 }}>
        {/* Network viz */}
        <div className="glass" style={{ padding: 16, position: "relative", minHeight: 480 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <div className="t-h2">Topology · packet flow</div>
            <div style={{ display: "flex", gap: 14, fontSize: 11 }}>
              <Legend color="oklch(0.82 0.16 220)" label="Allowed"/>
              <Legend color="oklch(0.82 0.16 75)" label="Inspecting"/>
              <Legend color="oklch(0.78 0.20 25)" label="Malicious"/>
            </div>
          </div>
          <svg viewBox="0 0 100 70" style={{ width: "100%", aspectRatio: "100 / 70", display: "block" }}>
            <defs>
              <radialGradient id="coreglow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="oklch(0.78 0.15 220)" stopOpacity="0.4"/>
                <stop offset="100%" stopColor="oklch(0.78 0.15 220)" stopOpacity="0"/>
              </radialGradient>
              <filter id="g-glow">
                <feGaussianBlur stdDeviation="0.4"/>
                <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            {/* Core halo */}
            <circle cx="50" cy="35" r="26" fill="url(#coreglow)"/>
            <circle cx="50" cy="35" r="22" fill="none" stroke="rgba(120,160,220,0.18)" strokeDasharray="0.8 1.6"/>

            {/* Edges */}
            {edges.map((e, i) => {
              const a = nodeMap[e.from], b = nodeMap[e.to];
              if (!a || !b) return null;
              const ax = a.x, ay = a.y * 0.7;
              const bx = b.x, by = b.y * 0.7;
              const c = colorFor(e.kind);
              return (
                <g key={i}>
                  <line x1={ax} y1={ay} x2={bx} y2={by} stroke={c} strokeWidth="0.16" opacity={e.kind === "bad" ? 0.55 : 0.3}/>
                </g>
              );
            })}

            {/* Animated packets along each edge */}
            {edges.map((e, i) => {
              const a = nodeMap[e.from], b = nodeMap[e.to];
              if (!a || !b) return null;
              const ax = a.x, ay = a.y * 0.7;
              const bx = b.x, by = b.y * 0.7;
              const offset = (i * 0.07) % 1;
              const p = (t + offset) % 1;
              const x = ax + (bx - ax) * p;
              const y = ay + (by - ay) * p;
              const c = colorFor(e.kind);
              return (
                <g key={"p"+i}>
                  <circle cx={x} cy={y} r="0.45" fill={c} filter="url(#g-glow)" opacity="0.95"/>
                  {e.kind === "bad" && <circle cx={x} cy={y} r="0.9" fill="none" stroke={c} strokeWidth="0.08" opacity="0.6"/>}
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map(n => {
              const c = n.type === "bad" ? "oklch(0.78 0.20 25)" : n.type === "warn" ? "oklch(0.82 0.16 75)" : n.type === "core" ? "oklch(0.82 0.16 220)" : "oklch(0.7 0.18 145)";
              const isCore = n.type === "core";
              return (
                <g key={n.id}>
                  {n.type === "bad" && (
                    <circle cx={n.x} cy={n.y * 0.7} r="2.4" fill="none" stroke={c} strokeWidth="0.18"
                            opacity={0.4 + 0.5 * Math.abs(Math.sin(tick * 0.06))}/>
                  )}
                  <circle cx={n.x} cy={n.y * 0.7} r={isCore ? 1.5 : 1.1} fill={c} opacity="0.25"/>
                  <circle cx={n.x} cy={n.y * 0.7} r={isCore ? 0.9 : 0.7} fill={c} filter="url(#g-glow)"/>
                  <text x={n.x} y={n.y * 0.7 + (n.y > 50 ? 3.2 : -1.8)} fontSize="1.5" fontFamily="JetBrains Mono"
                        fill={isCore ? "#e8edf7" : "rgba(170,179,200,0.9)"} textAnchor="middle">{n.label}</text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="glass" style={{ padding: 14 }}>
            <div className="t-eyebrow">Throughput · Mbps</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
              <span className="font-mono" style={{ fontSize: 26, fontWeight: 500 }}>14.82</span>
              <span className="dim font-mono">Gbps</span>
              <span style={{ marginLeft: "auto", color: "oklch(0.85 0.18 145)", fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}>
                <Icons.ArrowUp size={11}/> 6.4%
              </span>
            </div>
            <div style={{ height: 64, marginTop: 6 }}>
              <Spark data={useMemo(() => Array.from({length: 50}).map((_,i)=>40+Math.sin(i/3+tick*0.05)*15+(i%7===0?12:0)), [tick])}
                     w={280} h={64} color="oklch(0.82 0.16 220)"/>
            </div>
          </div>

          <div className="glass" style={{ padding: 14 }}>
            <div className="t-eyebrow">Protocol Distribution</div>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { name: "HTTPS / TLS 1.3", v: 64, c: "oklch(0.82 0.16 220)" },
                { name: "HTTP/2", v: 14, c: "oklch(0.7 0.18 145)" },
                { name: "DNS · UDP/53", v: 8, c: "oklch(0.68 0.20 295)" },
                { name: "QUIC / UDP", v: 6, c: "oklch(0.82 0.16 75)" },
                { name: "SSH / SFTP", v: 4, c: "oklch(0.78 0.18 40)" },
                { name: "Other", v: 4, c: "rgba(120,160,220,0.4)" },
              ].map(p => (
                <div key={p.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span style={{ color: "var(--text-1)" }}>{p.name}</span>
                    <span className="font-mono dim">{p.v}%</span>
                  </div>
                  <div style={{ height: 4, marginTop: 4, borderRadius: 2, background: "rgba(120,160,220,0.1)" }}>
                    <div style={{ width: `${p.v}%`, height: "100%", borderRadius: 2, background: p.c, boxShadow: `0 0 6px ${p.c}` }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass" style={{ padding: 14, flex: 1 }}>
            <div className="t-eyebrow">Top Talkers · last 5m</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {[
                { ip: "203.0.113.42", bytes: "812 MB", flag: "🇷🇺", role: "bad" },
                { ip: "198.51.100.7", bytes: "421 MB", flag: "🇨🇳", role: "warn" },
                { ip: "192.0.2.18", bytes: "318 MB", flag: "🇺🇸", role: "ok" },
                { ip: "203.0.113.99", bytes: "204 MB", flag: "🇰🇵", role: "bad" },
                { ip: "198.51.100.61", bytes: "186 MB", flag: "🇩🇪", role: "ok" },
                { ip: "203.0.113.5", bytes: "144 MB", flag: "🇮🇷", role: "warn" },
              ].map(t => (
                <div key={t.ip} className="row-hover" style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", borderRadius: 6 }}>
                  <span style={{ fontSize: 14 }}>{t.flag}</span>
                  <span className="font-mono" style={{ fontSize: 11.5, flex: 1 }}>{t.ip}</span>
                  <span className={`badge badge-${t.role === "bad" ? "red" : t.role === "warn" ? "amber" : "green"}`} style={{ fontSize: 9 }}>
                    {t.role === "bad" ? "MAL" : t.role === "warn" ? "INSP" : "OK"}
                  </span>
                  <span className="font-mono dim" style={{ fontSize: 10.5, minWidth: 60, textAlign: "right" }}>{t.bytes}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 12, marginTop: 12 }}>
        <div className="glass" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div>
              <div className="t-eyebrow">Geographic Attack Heat · 1h rolling</div>
              <div className="t-h2" style={{ marginTop: 4 }}>Origin → Destination flows</div>
            </div>
            <span className="badge badge-cyan">14,892 flagged flows</span>
          </div>
          <WorldMini/>
        </div>
        <div className="glass" style={{ padding: 16 }}>
          <div className="t-eyebrow">Port Activity · last 60s</div>
          <div className="t-h2" style={{ marginTop: 4, marginBottom: 12 }}>Inbound destination ports</div>
          <Bars
            data={[120, 240, 80, 410, 60, 90, 700, 220, 410, 60, 130, 220, 60, 90, 380, 110]}
            labels={["22","23","53","80","139","389","443","445","465","636","993","1433","2049","3306","3389","5432"]}
            color="oklch(0.78 0.15 220)" w={420} h={120}/>
          <div className="dim" style={{ fontSize: 10.5, marginTop: 8, lineHeight: 1.4 }}>
            Spike on <span className="text-amber font-mono">3389/RDP</span> from /22 in eastern EU — auto-quarantined per policy <span className="font-mono">P-44</span>.
          </div>
        </div>
      </div>
    </div>
  );
};

window.TrafficScreen = TrafficScreen;
