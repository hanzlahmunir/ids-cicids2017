// Sidebar + Topbar
// `real: true`  -> screen is wired to the actual trained model
// `concept: true` -> illustrative design only (not backed by real data)
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "Dashboard", badge: null, real: true },
  { id: "livedetect", label: "Live Detection", icon: "Activity", badge: "LIVE", real: true },
  { id: "ml", label: "ML Analytics", icon: "Brain", badge: null, real: true },
  { id: "shap", label: "Explainability", icon: "Sparkles", badge: null, real: true },
  { id: "traffic", label: "Live Traffic", icon: "Globe", badge: null, concept: true },
  { id: "threats", label: "Threat Detection", icon: "Target", badge: null, concept: true },
  { id: "intel", label: "Attack History", icon: "Clock", badge: null, concept: true },
  { id: "api", label: "API Monitoring", icon: "Server", badge: null, concept: true },
  { id: "settings", label: "Settings", icon: "Settings", badge: null },
];

const Sidebar = ({ active, onNav, collapsed, onToggle }) => {
  return (
    <aside className="sidebar scroll" style={{
      gridRow: "1 / 3",
      borderRight: "1px solid var(--hairline)",
      background: "linear-gradient(180deg, rgba(10,14,30,0.85), rgba(6,9,20,0.85))",
      backdropFilter: "blur(8px)",
      padding: collapsed ? "12px 10px" : "14px 14px 14px 16px",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px 18px" }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: "linear-gradient(135deg, oklch(0.78 0.15 220 / 0.4), oklch(0.5 0.18 295 / 0.4))",
          border: "1px solid oklch(0.78 0.15 220 / 0.5)",
          display: "grid", placeItems: "center",
          boxShadow: "0 0 16px oklch(0.78 0.15 220 / 0.4), inset 0 0 0 1px rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}>
          <Icons.ShieldCheck size={16} style={{ color: "oklch(0.95 0.05 220)" }}/>
        </div>
        {!collapsed && (
          <div style={{ lineHeight: 1.15 }}>
            <div className="font-display" style={{ fontWeight: 600, fontSize: 13.5, letterSpacing: "-0.005em" }}>NetShield</div>
            <div className="t-eyebrow" style={{ fontSize: 9, letterSpacing: "0.22em", color: "oklch(0.82 0.14 220)" }}>AI · SOC</div>
          </div>
        )}
      </div>

      {!collapsed && <div className="t-eyebrow" style={{ padding: "10px 6px 6px" }}>Operations</div>}

      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map(item => {
          const Icon = Icons[item.icon];
          const isActive = active === item.id;
          return (
            <button key={item.id} onClick={() => onNav(item.id)}
              className="nav-item"
              style={{
                display: "flex", alignItems: "center", gap: 11,
                padding: collapsed ? "10px 6px" : "8px 10px",
                justifyContent: collapsed ? "center" : "flex-start",
                borderRadius: 8,
                background: isActive ? "linear-gradient(90deg, oklch(0.55 0.14 220 / 0.18), oklch(0.55 0.14 220 / 0.04))" : "transparent",
                border: "1px solid " + (isActive ? "oklch(0.78 0.15 220 / 0.35)" : "transparent"),
                color: isActive ? "oklch(0.95 0.05 220)" : "var(--text-1)",
                font: "500 12.5px/1 var(--font-body)",
                cursor: "pointer", textAlign: "left", width: "100%",
                position: "relative", transition: "all .15s",
                boxShadow: isActive ? "inset 2px 0 0 oklch(0.82 0.16 220), 0 0 16px oklch(0.78 0.15 220 / 0.15)" : "none",
              }}>
              <Icon size={16}/>
              {!collapsed && <>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge === "LIVE" && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4, color: "oklch(0.85 0.18 145)", fontSize: 9.5, letterSpacing: "0.08em", fontWeight: 600 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", boxShadow: "0 0 6px currentColor" }}/>
                    LIVE
                  </span>
                )}
                {typeof item.badge === "number" && (
                  <span style={{ minWidth: 18, padding: "2px 5px", borderRadius: 4, background: "oklch(0.55 0.20 25 / 0.2)",
                                 color: "oklch(0.88 0.14 25)", fontSize: 9.5, fontFamily: "JetBrains Mono", textAlign: "center" }}>
                    {item.badge}
                  </span>
                )}
                {item.concept && (
                  <span title="Illustrative design — not wired to the real model"
                    style={{ padding: "1px 5px", borderRadius: 4, border: "1px solid var(--hairline)",
                             color: "var(--text-3)", fontSize: 8.5, letterSpacing: "0.08em", fontWeight: 600 }}>
                    CONCEPT
                  </span>
                )}
              </>}
            </button>
          );
        })}
      </nav>

      <div style={{ flex: 1 }}/>

      {/* Bottom: model + user */}
      <div className="glass" style={{ padding: collapsed ? 8 : 12, borderRadius: 10 }}>
        {collapsed ? (
          <div style={{ display: "grid", placeItems: "center", height: 28 }}>
            <Icons.Cpu size={16} style={{ color: "oklch(0.82 0.14 295)" }}/>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span className="t-eyebrow">Active Model</span>
              <span className="dot" style={{ color: "oklch(0.85 0.18 145)" }}/>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icons.Cpu size={14} style={{ color: "oklch(0.82 0.14 295)" }}/>
              <span className="font-mono" style={{ fontSize: 11.5, color: "var(--text-0)" }}>XGBoost · multi</span>
            </div>
            <div className="font-mono" style={{ fontSize: 10, color: "var(--text-2)", marginTop: 4 }}>macro-F1 0.972 · 7 classes</div>
          </>
        )}
      </div>

      <button onClick={onToggle} className="btn btn-ghost"
        style={{ marginTop: 8, justifyContent: collapsed ? "center" : "flex-start", width: "100%" }}>
        {collapsed ? <Icons.ChevronRight size={14}/> : <><Icons.ChevronLeft size={14}/> Collapse</>}
      </button>
    </aside>
  );
};

const TopBar = ({ onLogout }) => {
  const now = useClock();
  const tick = useTick(2000);
  // status oscillates demo
  const status = (Math.floor(tick / 6) % 9 === 8) ? "alert" : "protected";
  return (
    <header style={{
      gridColumn: "2 / 3", display: "flex", alignItems: "center", gap: 14,
      padding: "0 20px",
      borderBottom: "1px solid var(--hairline)",
      background: "linear-gradient(180deg, rgba(10,14,30,0.7), rgba(10,14,30,0.4))",
      backdropFilter: "blur(8px)",
    }}>
      {/* Status pill */}
      <div className="glass" style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "5px 12px 5px 10px", borderRadius: 999,
        borderColor: status === "alert" ? "oklch(0.72 0.22 25 / 0.5)" : "oklch(0.7 0.18 145 / 0.4)",
        boxShadow: status === "alert" ? "0 0 18px oklch(0.72 0.22 25 / 0.35)" : "0 0 14px oklch(0.7 0.18 145 / 0.25)",
      }}>
        <span className="dot" style={{ color: status === "alert" ? "oklch(0.82 0.18 25)" : "oklch(0.85 0.18 145)" }}/>
        <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.04em",
                       color: status === "alert" ? "oklch(0.92 0.12 25)" : "oklch(0.92 0.12 145)" }}>
          {status === "alert" ? "ACTIVE THREAT · ELEVATED" : "ALL SYSTEMS PROTECTED"}
        </span>
      </div>

      {/* Tenant */}
      <div className="dim" style={{ fontSize: 11.5, paddingLeft: 4, borderLeft: "1px solid var(--hairline)", paddingLeft: 14, marginLeft: 4 }}>
        <span className="muted">Tenant</span> <span style={{ color: "var(--text-0)" }}>ACME-GLOBAL</span>
        <span style={{ margin: "0 8px", color: "var(--text-3)" }}>/</span>
        <span className="muted">Region</span> <span style={{ color: "var(--text-0)" }}>us-east-2</span>
      </div>

      <div style={{ flex: 1 }}/>

      {/* Search */}
      <div style={{ position: "relative", width: 340 }}>
        <Icons.Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-2)" }}/>
        <input className="input" placeholder="Search IP, attack type, SHAP feature, run id…"
               style={{ width: "100%", paddingLeft: 30, paddingRight: 42 }}/>
        <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", display: "flex", gap: 3 }}>
          <span className="kbd">⌘</span><span className="kbd">K</span>
        </span>
      </div>

      {/* Clock */}
      <div className="font-mono" style={{ fontSize: 11.5, color: "var(--text-1)", textAlign: "right", lineHeight: 1.2 }}>
        <div style={{ color: "var(--text-0)", letterSpacing: "0.04em" }}>{fmtTime(now)} <span className="dim">UTC</span></div>
        <div style={{ fontSize: 9.5, color: "var(--text-2)", letterSpacing: "0.06em" }}>
          {now.toUTCString().split(" ").slice(0, 4).join(" ")}
        </div>
      </div>

      <button className="btn btn-ghost" style={{ width: 32, padding: 0, justifyContent: "center", position: "relative" }}>
        <Icons.Bell size={15}/>
        <span style={{ position: "absolute", top: 6, right: 6, width: 6, height: 6, borderRadius: "50%", background: "oklch(0.78 0.20 25)", boxShadow: "0 0 6px oklch(0.78 0.20 25)" }}/>
      </button>

      <div className="glass" style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 10px 4px 4px", borderRadius: 999 }}>
        <div style={{
          width: 26, height: 26, borderRadius: "50%",
          background: "linear-gradient(135deg, oklch(0.78 0.15 220 / 0.6), oklch(0.5 0.18 295 / 0.6))",
          display: "grid", placeItems: "center", fontSize: 10.5, fontWeight: 600, fontFamily: "Space Grotesk",
          border: "1px solid rgba(255,255,255,0.08)",
        }}>RM</div>
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ fontSize: 11.5, fontWeight: 500 }}>R. Mendoza</div>
          <div style={{ fontSize: 9.5, color: "var(--text-2)", letterSpacing: "0.06em" }}>TIER-3 ANALYST</div>
        </div>
        <Icons.ChevronDown size={12} style={{ color: "var(--text-2)" }}/>
      </div>
    </header>
  );
};

window.Sidebar = Sidebar;
window.TopBar = TopBar;
