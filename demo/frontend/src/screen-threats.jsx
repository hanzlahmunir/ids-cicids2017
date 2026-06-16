// Threat Detection Table
const THREAT_TYPES = [
  { t: "DDoS · Volumetric", sev: 4, color: "red", action: "Block source /24 · scale CDN shield" },
  { t: "DDoS · SYN Flood", sev: 4, color: "red", action: "Enable SYN cookies · rate-limit" },
  { t: "Port Scan", sev: 2, color: "amber", action: "Add to watchlist · firewall log review" },
  { t: "Brute Force · SSH", sev: 3, color: "amber", action: "Lockout source · enforce MFA on bastion" },
  { t: "Brute Force · FTP", sev: 2, color: "amber", action: "Disable account · rotate credentials" },
  { t: "SQL Injection", sev: 4, color: "red", action: "WAF rule WAF-128 · audit DB session" },
  { t: "XSS · Reflected", sev: 3, color: "amber", action: "Block payload · review CSP" },
  { t: "Botnet · C2 Beacon", sev: 4, color: "red", action: "Quarantine host · trace command channel" },
  { t: "Infiltration", sev: 4, color: "red", action: "Isolate segment · forensic snapshot" },
];

const ThreatsScreen = () => {
  const [expanded, setExpanded] = useState(2);
  const tick = useTick(8000);
  const rows = useMemo(() => {
    const rng = mulberry32(101 + tick);
    return Array.from({ length: 14 }).map((_, i) => {
      const tt = THREAT_TYPES[Math.floor(rng() * THREAT_TYPES.length)];
      return {
        id: i,
        src: ipFrom(rng),
        dst: ipFrom(rng),
        srcPort: Math.floor(rng() * 60000) + 1024,
        dstPort: [22, 80, 443, 3389, 21, 445][Math.floor(rng() * 6)],
        proto: ["TCP","UDP","TCP","TCP"][Math.floor(rng()*4)],
        type: tt.t, sev: tt.sev, color: tt.color, action: tt.action,
        conf: 0.62 + rng() * 0.37,
        secAgo: Math.floor(rng() * 3600) + 10,
        model: ["XGBoost","Random Forest","MLP","Ensemble"][Math.floor(rng()*4)],
        bytes: Math.floor(rng() * 5_000_000),
        packets: Math.floor(rng() * 20000),
        country: ["🇨🇳","🇷🇺","🇰🇵","🇮🇷","🇧🇷","🇻🇳","🇺🇸","🇩🇪"][Math.floor(rng()*8)],
      };
    });
  }, [tick]);

  return (
    <div className="scroll" style={{ height: "100%", padding: "18px 22px 32px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <div className="t-eyebrow">Threats · prioritized queue</div>
          <h1 className="t-h1" style={{ margin: "6px 0 0", fontSize: 24 }}>Threat Detection</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn"><Icons.Download size={13}/> Export STIX</button>
          <button className="btn btn-primary"><Icons.Pin size={13}/> Pin to Incident</button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="glass" style={{ padding: 10, display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 380 }}>
          <Icons.Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-2)" }}/>
          <input className="input" placeholder="Search IP, CVE, payload signature, model run…" style={{ width: "100%", paddingLeft: 30 }}/>
        </div>
        <FilterChip label="Severity" value="Critical + High" active/>
        <FilterChip label="Attack Type" value="All 9 classes"/>
        <FilterChip label="Confidence" value="≥ 0.75"/>
        <FilterChip label="Time" value="Last 24h"/>
        <FilterChip label="Model" value="Ensemble"/>
        <div style={{ flex: 1 }}/>
        <span className="dim" style={{ fontSize: 11 }}>Showing <span style={{ color: "var(--text-0)" }}>{rows.length}</span> of <span style={{ color: "var(--text-0)" }}>2,418</span> · <span className="text-cyan font-mono">auto-refresh 8s</span></span>
      </div>

      {/* Table */}
      <div className="glass" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "16px 1.2fr 1.2fr 1.4fr 110px 70px 90px 1fr 24px",
          gap: 12, padding: "10px 16px",
          fontSize: 10, color: "var(--text-2)", letterSpacing: "0.08em", textTransform: "uppercase",
          borderBottom: "1px solid var(--hairline)",
          background: "rgba(8,12,26,0.5)",
        }}>
          <span/>
          <span>Source</span>
          <span>Destination</span>
          <span>Attack Class · Model</span>
          <span>Confidence</span>
          <span style={{ textAlign: "center" }}>Sev</span>
          <span>When</span>
          <span>Recommended action</span>
          <span/>
        </div>
        {rows.map(r => (
          <div key={r.id}>
            <div className="row-hover"
              onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              style={{
                display: "grid", gridTemplateColumns: "16px 1.2fr 1.2fr 1.4fr 110px 70px 90px 1fr 24px",
                gap: 12, padding: "12px 16px", alignItems: "center",
                borderBottom: "1px solid rgba(120,160,220,0.05)",
                cursor: "pointer",
                background: expanded === r.id ? "rgba(120,160,220,0.04)" : "transparent",
                transition: "background .12s",
              }}>
              <span className={`sev sev-${r.sev}`}/>
              <div style={{ lineHeight: 1.25 }}>
                <div className="font-mono" style={{ fontSize: 12, color: "var(--text-0)" }}>{r.country} {r.src}<span className="dim">:{r.srcPort}</span></div>
                <div className="dim" style={{ fontSize: 10 }}>AS-{(r.id * 137) % 65535} · {["Comcast","DigitalOcean","OVH","Hetzner","Aliyun","Tencent"][r.id % 6]}</div>
              </div>
              <div style={{ lineHeight: 1.25 }}>
                <div className="font-mono" style={{ fontSize: 12, color: "var(--text-0)" }}>{r.dst}<span className="dim">:{r.dstPort}</span></div>
                <div className="dim" style={{ fontSize: 10 }}>{r.proto} · {["us-east-2","eu-west-1","ap-south-1"][r.id % 3]} · prod-{(r.id % 12) + 1}</div>
              </div>
              <div style={{ lineHeight: 1.3 }}>
                <div style={{ fontSize: 12.5, color: "var(--text-0)" }}>{r.type}</div>
                <div className="dim" style={{ fontSize: 10.5 }}>{r.model} · {r.bytes.toLocaleString()} B · {r.packets.toLocaleString()} pkt</div>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(120,160,220,0.12)" }}>
                    <div style={{ width: `${r.conf * 100}%`, height: "100%", borderRadius: 2,
                                   background: r.conf > 0.9 ? "linear-gradient(90deg, oklch(0.72 0.22 25), oklch(0.7 0.18 295))" : "linear-gradient(90deg, oklch(0.78 0.15 220), oklch(0.7 0.18 295))" }}/>
                  </div>
                  <span className="font-mono" style={{ fontSize: 10.5 }}>{(r.conf*100).toFixed(1)}%</span>
                </div>
              </div>
              <span style={{ textAlign: "center" }}>
                <span className={`badge badge-${r.color}`} style={{ fontSize: 9.5 }}>{["LOW","MED","HIGH","CRIT"][r.sev-1]}</span>
              </span>
              <span className="dim font-mono" style={{ fontSize: 10.5 }}>{relTime(r.secAgo)}</span>
              <span className="dim" style={{ fontSize: 11 }}>{r.action}</span>
              <Icons.ChevronRight size={14} style={{ color: "var(--text-2)",
                transform: expanded === r.id ? "rotate(90deg)" : "none", transition: "transform .15s" }}/>
            </div>

            {/* Expanded row */}
            {expanded === r.id && (
              <div style={{ padding: "0 16px 16px 32px", borderBottom: "1px solid rgba(120,160,220,0.05)",
                            background: "rgba(8,12,26,0.4)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 14, padding: 14,
                              borderRadius: 10, background: "rgba(8,12,26,0.6)", border: "1px solid var(--hairline)" }}>
                  <div>
                    <div className="t-eyebrow" style={{ marginBottom: 6 }}>Flow features ranked</div>
                    {[
                      ["Flow duration", "+2.41", 0.85],
                      ["Bwd packet length max", "+1.92", 0.72],
                      ["Flow IAT std", "+1.04", 0.55],
                      ["Pkt length variance", "-0.62", 0.32],
                      ["Init win bytes fwd", "+0.41", 0.22],
                    ].map(([f, v, w]) => (
                      <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 11 }}>
                        <span style={{ flex: 1, color: "var(--text-1)" }}>{f}</span>
                        <span style={{ width: 120, height: 6, borderRadius: 3, background: "rgba(120,160,220,0.1)", position: "relative", overflow: "hidden" }}>
                          <span style={{ position: "absolute", left: v.startsWith("-") ? "auto" : "50%", right: v.startsWith("-") ? "50%" : "auto",
                                          top: 0, bottom: 0, width: `${w * 50}%`,
                                          background: v.startsWith("-") ? "oklch(0.78 0.15 220)" : "oklch(0.72 0.22 25)",
                                          boxShadow: `0 0 6px ${v.startsWith("-") ? "oklch(0.78 0.15 220)" : "oklch(0.72 0.22 25)"}` }}/>
                          <span style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.15)" }}/>
                        </span>
                        <span className="font-mono" style={{ fontSize: 10.5, color: v.startsWith("-") ? "oklch(0.85 0.14 220)" : "oklch(0.85 0.18 25)", width: 40, textAlign: "right" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="t-eyebrow" style={{ marginBottom: 6 }}>AI reasoning</div>
                    <p style={{ fontSize: 11.5, lineHeight: 1.55, color: "var(--text-1)", margin: 0 }}>
                      Flow exhibits classic <span className="text-red">{r.type}</span> markers — abnormally long duration paired with high backward packet length variance and beacon-like IAT cadence. Confidence boosted by similarity to <span className="font-mono">cluster-C2-7a</span> (cosine 0.91) in the threat feed updated <span className="font-mono">12m ago</span>.
                    </p>
                    <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 6, background: "oklch(0.5 0.18 295 / 0.1)", border: "1px solid oklch(0.7 0.20 295 / 0.25)", display: "flex", alignItems: "center", gap: 8 }}>
                      <Icons.Sparkles size={13} style={{ color: "oklch(0.82 0.14 295)" }}/>
                      <span style={{ fontSize: 11, color: "var(--text-1)" }}>Analyst playbook <span className="font-mono">PB-IR-024</span> auto-attached</span>
                    </div>
                  </div>
                  <div>
                    <div className="t-eyebrow" style={{ marginBottom: 6 }}>Actions</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <button className="btn btn-primary" style={{ justifyContent: "flex-start" }}>
                        <Icons.ShieldCheck size={13}/> Block source IP &amp; /24
                      </button>
                      <button className="btn" style={{ justifyContent: "flex-start" }}><Icons.Pin size={13}/> Open incident · escalate to Tier-3</button>
                      <button className="btn" style={{ justifyContent: "flex-start" }}><Icons.Eye size={13}/> View PCAP · 2.1 MB</button>
                      <button className="btn" style={{ justifyContent: "flex-start" }}><Icons.X size={13}/> Mark false-positive</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const FilterChip = ({ label, value, active }) => (
  <button className="btn" style={{
    background: active ? "oklch(0.55 0.14 220 / 0.18)" : "rgba(120,160,220,0.06)",
    borderColor: active ? "oklch(0.78 0.15 220 / 0.4)" : "var(--hairline)",
    height: 28,
  }}>
    <span className="dim" style={{ fontSize: 10.5 }}>{label}</span>
    <span style={{ color: active ? "oklch(0.92 0.08 220)" : "var(--text-0)", fontSize: 11 }}>{value}</span>
    <Icons.ChevronDown size={11} style={{ color: "var(--text-2)" }}/>
  </button>
);

window.ThreatsScreen = ThreatsScreen;
window.FilterChip = FilterChip;
