// Attack Intelligence / History
const IntelScreen = () => {
  // 7-day x 24-hour heatmap of attack intensity
  const heat = useMemo(() => {
    const rng = mulberry32(13);
    const out = [];
    for (let r = 0; r < 7; r++) {
      const row = [];
      for (let c = 0; c < 24; c++) {
        const base = Math.sin((c - 4) / 24 * Math.PI) * 0.6 + 0.4;
        const v = Math.max(0, Math.min(1, base * (0.6 + rng() * 0.6) + (r === 5 && c > 10 ? 0.3 : 0)));
        row.push(v);
      }
      out.push(row);
    }
    return out;
  }, []);

  const timeline = useMemo(() => {
    const rng = mulberry32(207);
    const items = [
      { t: "08:42:11", sev: 4, type: "DDoS · 240 Gbps spike", src: "203.0.113.0/24", note: "Auto-mitigated · CDN shield engaged · 14 min" },
      { t: "07:18:36", sev: 3, type: "Brute Force · SSH burst", src: "198.51.100.7", note: "Lockout after 24 failed attempts on bastion-az3" },
      { t: "05:51:09", sev: 4, type: "SQL Injection · CVE-2024-7174", src: "192.0.2.18", note: "Blocked by WAF rule WAF-128 · payload exfiltrated to honeypot" },
      { t: "04:22:51", sev: 2, type: "Port Scan · /24 sweep", src: "203.0.113.99", note: "Added to watchlist · ports 22, 3389, 445 enumerated" },
      { t: "02:08:14", sev: 4, type: "Botnet · C2 beacon", src: "10.42.18.7 ← 198.51.100.61", note: "Internal host quarantined · IR-2024-2891 opened" },
      { t: "00:14:02", sev: 3, type: "XSS attempt · stored", src: "203.0.113.42", note: "Payload sanitized · CSP report logged" },
    ];
    return items;
  }, []);

  return (
    <div className="scroll" style={{ height: "100%", padding: "18px 22px 32px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <div className="t-eyebrow">Forensic timeline · 7 day window</div>
          <h1 className="t-h1" style={{ margin: "6px 0 0", fontSize: 24 }}>Attack Intelligence</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn"><Icons.Globe size={13}/> All sources</button>
          <button className="btn"><Icons.Refresh size={13}/> 7 days <Icons.ChevronDown size={12}/></button>
          <button className="btn btn-primary"><Icons.Download size={13}/> Forensic export</button>
        </div>
      </div>

      {/* Summary row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 12 }}>
        <SummaryCell label="Incidents · 7d" value="142" delta={+12.4} intent="red"/>
        <SummaryCell label="Hosts compromised" value="3" delta={0} intent="amber"/>
        <SummaryCell label="Hosts quarantined" value="11" delta={+22.0} intent="cyan"/>
        <SummaryCell label="Mean time to detect" value="38s" delta={-14.0} intent="green"/>
        <SummaryCell label="Mean time to contain" value="2.4m" delta={-8.6} intent="green"/>
      </div>

      {/* Heatmap */}
      <div className="glass" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div className="t-eyebrow">Attack intensity · UTC</div>
            <div className="t-h2" style={{ marginTop: 4 }}>Hour-of-day × day-of-week</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-2)" }}>
            Low
            <div style={{ display: "flex", gap: 2 }}>
              {[0.1, 0.3, 0.5, 0.7, 0.9].map((v, i) => (
                <div key={i} style={{ width: 16, height: 10, borderRadius: 2, background: "oklch(0.72 0.22 25)", opacity: 0.15 + v * 0.7 }}/>
              ))}
            </div>
            High
          </div>
        </div>
        <Heatmap data={heat} w={900} h={170} color="oklch(0.72 0.22 25)"
                 rowLabels={["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]}
                 colLabels={["00","02","04","06","08","10","12","14","16","18","20","22"].flatMap(x => [x, ""]).slice(0,24)}/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 12 }}>
        {/* Timeline */}
        <div className="glass" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div className="t-eyebrow">Incident chronology · today (UTC)</div>
              <div className="t-h2" style={{ marginTop: 4 }}>Significant events</div>
            </div>
            <span className="badge badge-cyan">{timeline.length} events</span>
          </div>
          <div style={{ position: "relative", paddingLeft: 22 }}>
            <div style={{ position: "absolute", left: 12, top: 6, bottom: 6, width: 1, background: "var(--hairline-strong)" }}/>
            {timeline.map((e, i) => (
              <div key={i} style={{ position: "relative", paddingBottom: 14 }}>
                <div style={{ position: "absolute", left: -16, top: 4, width: 10, height: 10, borderRadius: 2,
                               background: e.sev === 4 ? "oklch(0.72 0.22 25)" : "oklch(0.82 0.16 75)",
                               boxShadow: e.sev === 4 ? "0 0 10px oklch(0.72 0.22 25 / 0.7)" : "0 0 8px oklch(0.82 0.16 75 / 0.6)" }}/>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span className="font-mono" style={{ fontSize: 11, color: "var(--text-2)" }}>{e.t}</span>
                  <span className={`badge badge-${e.sev === 4 ? "red" : "amber"}`} style={{ fontSize: 9.5 }}>{e.sev === 4 ? "CRIT" : "HIGH"}</span>
                  <span style={{ fontSize: 12.5, color: "var(--text-0)" }}>{e.type}</span>
                  <span className="dim font-mono" style={{ fontSize: 10.5 }}>from {e.src}</span>
                </div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 3, lineHeight: 1.5 }}>{e.note}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Top attacking IPs */}
          <div className="glass" style={{ padding: 16 }}>
            <div className="t-eyebrow">Top attacking IPs · 7d</div>
            <div className="t-h2" style={{ marginTop: 4, marginBottom: 10 }}>Persistent offenders</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { ip: "203.0.113.42", c: "🇷🇺", n: 4218, type: "DDoS · Botnet" },
                { ip: "198.51.100.7", c: "🇨🇳", n: 2841, type: "Brute Force · Scan" },
                { ip: "203.0.113.99", c: "🇰🇵", n: 1742, type: "Infiltration" },
                { ip: "192.0.2.18", c: "🇮🇷", n: 1208, type: "SQLi · XSS" },
                { ip: "198.51.100.61", c: "🇧🇷", n: 982, type: "Port Scan" },
              ].map(r => (
                <div key={r.ip} className="row-hover" style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 6 }}>
                  <span style={{ fontSize: 14 }}>{r.c}</span>
                  <span className="font-mono" style={{ fontSize: 11.5, color: "var(--text-0)", minWidth: 110 }}>{r.ip}</span>
                  <span className="dim" style={{ fontSize: 10.5, flex: 1 }}>{r.type}</span>
                  <span className="font-mono" style={{ fontSize: 11, color: "oklch(0.85 0.18 25)" }}>{r.n.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Targeted ports */}
          <div className="glass" style={{ padding: 16, flex: 1 }}>
            <div className="t-eyebrow">Most targeted services</div>
            <div className="t-h2" style={{ marginTop: 4, marginBottom: 10 }}>Last 7 days</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { p: "443 / HTTPS", v: 38, n: "18.4K" },
                { p: "22 / SSH", v: 28, n: "13.6K" },
                { p: "3389 / RDP", v: 18, n: "8.7K" },
                { p: "445 / SMB", v: 8, n: "3.9K" },
                { p: "80 / HTTP", v: 5, n: "2.4K" },
                { p: "1433 / MSSQL", v: 3, n: "1.5K" },
              ].map(p => (
                <div key={p.p}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: "var(--text-1)" }} className="font-mono">{p.p}</span>
                    <span className="font-mono dim">{p.n} · {p.v}%</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 2, background: "rgba(120,160,220,0.08)" }}>
                    <div style={{ width: `${p.v * 2.5}%`, maxWidth: "100%", height: "100%", borderRadius: 2,
                                   background: "linear-gradient(90deg, oklch(0.78 0.15 220), oklch(0.5 0.18 295))",
                                   boxShadow: "0 0 8px oklch(0.78 0.15 220 / 0.5)" }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Trend area */}
      <div className="glass" style={{ padding: 16, marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <div className="t-eyebrow">Trend · 30 days</div>
            <div className="t-h2" style={{ marginTop: 4 }}>Daily threats by class</div>
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 11 }}>
            <Legend color="oklch(0.72 0.22 25)" label="DDoS"/>
            <Legend color="oklch(0.82 0.16 75)" label="Port Scan"/>
            <Legend color="oklch(0.68 0.20 295)" label="Web Attack"/>
            <Legend color="oklch(0.78 0.15 220)" label="Brute Force"/>
          </div>
        </div>
        <AreaChart
          w={1100} h={200} gridY={4}
          series={[
            { name: "DDoS", color: "oklch(0.72 0.22 25)",
              data: Array.from({length: 30}).map((_,i) => 220 + Math.sin(i/4) * 80 + (i === 14 ? 320 : 0) + (i === 22 ? 180 : 0)) },
            { name: "Port", color: "oklch(0.82 0.16 75)",
              data: Array.from({length: 30}).map((_,i) => 140 + Math.cos(i/3) * 40 + 30) },
            { name: "Web", color: "oklch(0.68 0.20 295)",
              data: Array.from({length: 30}).map((_,i) => 80 + Math.sin(i/5+1) * 30 + 20) },
            { name: "BF", color: "oklch(0.78 0.15 220)",
              data: Array.from({length: 30}).map((_,i) => 60 + Math.cos(i/4+2) * 20 + 18) },
          ]}/>
      </div>
    </div>
  );
};

const SummaryCell = ({ label, value, delta, intent }) => {
  const intentColor = {
    cyan: "oklch(0.82 0.16 220)",
    green: "oklch(0.84 0.20 145)",
    amber: "oklch(0.82 0.16 75)",
    red: "oklch(0.72 0.22 25)",
  }[intent || "cyan"];
  return (
    <div className="glass" style={{ padding: "12px 14px" }}>
      <div className="t-eyebrow">{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
        <span className="font-mono" style={{ fontSize: 24, fontWeight: 500, color: "var(--text-0)" }}>{value}</span>
        {delta !== undefined && delta !== 0 && (
          <span style={{ fontSize: 11, color: delta > 0 ? (intent === "green" ? "oklch(0.82 0.18 25)" : "oklch(0.82 0.18 25)") : "oklch(0.85 0.18 145)", display: "flex", alignItems: "center", gap: 2 }}>
            {delta > 0 ? <Icons.ArrowUp size={11}/> : <Icons.ArrowDown size={11}/>}{Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      <div style={{ height: 2, marginTop: 8, background: `linear-gradient(90deg, ${intentColor}, transparent)`, opacity: 0.5 }}/>
    </div>
  );
};

window.IntelScreen = IntelScreen;
