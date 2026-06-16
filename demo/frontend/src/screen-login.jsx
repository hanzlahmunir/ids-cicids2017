// Login screen
const LoginScreen = ({ onLogin }) => {
  const [email, setEmail] = useState("r.mendoza@netshield.ai");
  const [pwd, setPwd] = useState("••••••••••••");
  const [mfa, setMfa] = useState(["7","2","9","0","4","6"]);
  const tick = useTick(50);

  return (
    <div style={{ width: "100%", height: "100%", display: "grid", gridTemplateColumns: "1fr 480px", overflow: "hidden", position: "relative" }}>
      {/* Animated network grid */}
      <NetworkBackdrop tick={tick}/>

      {/* Left: brand panel */}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 56 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "linear-gradient(135deg, oklch(0.78 0.15 220 / 0.5), oklch(0.5 0.18 295 / 0.5))",
            border: "1px solid oklch(0.78 0.15 220 / 0.5)",
            display: "grid", placeItems: "center",
            boxShadow: "0 0 22px oklch(0.78 0.15 220 / 0.5), inset 0 0 0 1px rgba(255,255,255,0.08)",
          }}>
            <Icons.ShieldCheck size={20}/>
          </div>
          <div>
            <div className="font-display" style={{ fontWeight: 600, fontSize: 18, letterSpacing: "-0.01em" }}>NetShield<span className="text-cyan"> AI</span></div>
            <div className="t-eyebrow" style={{ fontSize: 9.5, letterSpacing: "0.22em" }}>SECURE SOC ACCESS · v4.2.1</div>
          </div>
        </div>

        <div style={{ maxWidth: 540 }}>
          <div className="t-eyebrow" style={{ color: "oklch(0.82 0.14 220)" }}>NetShield AI Secure SOC Access</div>
          <h1 className="font-display" style={{ fontSize: 44, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.05, margin: "16px 0 18px" }}>
            Defend the perimeter at <span style={{ background: "linear-gradient(90deg, oklch(0.85 0.16 220), oklch(0.78 0.18 295))", WebkitBackgroundClip: "text", color: "transparent" }}>machine speed.</span>
          </h1>
          <p className="muted" style={{ fontSize: 14.5, lineHeight: 1.55, maxWidth: 480 }}>
            Real-time anomaly detection across L4–L7 traffic. Ensemble ML classifies threats in under 25&nbsp;ms with SHAP-grade explainability for every flagged flow.
          </p>

          <div style={{ display: "flex", gap: 28, marginTop: 36 }}>
            {[
              { k: "98.47%", v: "Model Accuracy" },
              { k: "0.41%", v: "False-Positive Rate" },
              { k: "23ms", v: "p95 Inference" },
            ].map(s => (
              <div key={s.v}>
                <div className="font-mono" style={{ fontSize: 22, fontWeight: 500, color: "var(--text-0)" }}>{s.k}</div>
                <div className="t-eyebrow" style={{ marginTop: 4 }}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, fontSize: 11, color: "var(--text-2)" }}>
          <span>SOC 2 Type II</span><span>·</span>
          <span>ISO 27001</span><span>·</span>
          <span>FedRAMP Moderate</span><span>·</span>
          <span>HIPAA</span>
        </div>
      </div>

      {/* Right: login card */}
      <div style={{ display: "grid", placeItems: "center", padding: 36, position: "relative" }}>
        <div className="glass corner" style={{ position: "relative", width: "100%", maxWidth: 400, padding: 32, borderRadius: 16,
                                               boxShadow: "0 0 0 1px oklch(0.78 0.15 220 / 0.15), 0 20px 60px rgba(0,0,0,0.5), 0 0 40px oklch(0.78 0.15 220 / 0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            <Icons.Lock size={16} className="text-cyan"/>
            <div>
              <div className="font-display" style={{ fontWeight: 500, fontSize: 16 }}>Operator Sign-in</div>
              <div className="dim" style={{ fontSize: 11 }}>Secured by hardware-bound session keys</div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            <Field label="Operator Email">
              <input className="input" style={{ width: "100%" }} value={email} onChange={e => setEmail(e.target.value)}/>
            </Field>
            <Field label="Passphrase" hint="40+ chars, FIDO2 enforced">
              <input className="input" type="password" style={{ width: "100%" }} value={pwd} onChange={e => setPwd(e.target.value)}/>
            </Field>

            <div>
              <div className="t-eyebrow" style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>MFA · TOTP</span>
                <span style={{ display: "flex", gap: 5, alignItems: "center", color: "oklch(0.85 0.18 145)", letterSpacing: "0.06em", fontSize: 9.5 }}>
                  <span className="dot" style={{ color: "currentColor" }}/> AUTHENTICATOR PAIRED
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6 }}>
                {mfa.map((d, i) => (
                  <div key={i} style={{
                    height: 40, borderRadius: 8, display: "grid", placeItems: "center",
                    border: "1px solid oklch(0.78 0.15 220 / 0.3)",
                    background: "rgba(8,12,26,0.7)",
                    boxShadow: i === 5 ? "0 0 0 2px oklch(0.78 0.15 220 / 0.2), 0 0 12px oklch(0.78 0.15 220 / 0.3)" : "none",
                    fontFamily: "JetBrains Mono", fontSize: 16, fontWeight: 500,
                    color: "oklch(0.92 0.08 220)",
                  }}>{d}</div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8,
                          background: "oklch(0.5 0.18 295 / 0.08)", border: "1px solid oklch(0.7 0.20 295 / 0.25)" }}>
              <Icons.Fingerprint size={16} style={{ color: "oklch(0.82 0.14 295)" }}/>
              <div style={{ flex: 1, fontSize: 11.5 }}>
                <div style={{ color: "var(--text-0)" }}>Biometric step-up ready</div>
                <div className="dim" style={{ fontSize: 10.5 }}>YubiKey 5C · Touch when prompted</div>
              </div>
              <span className="dot" style={{ color: "oklch(0.82 0.14 295)" }}/>
            </div>

            <button className="btn btn-primary" onClick={onLogin}
              style={{ height: 40, width: "100%", justifyContent: "center", fontSize: 12.5, marginTop: 4 }}>
              <Icons.ShieldCheck size={14}/> Authenticate &amp; Enter SOC
            </button>

            <div className="dim" style={{ fontSize: 10.5, textAlign: "center", letterSpacing: "0.04em" }}>
              Session geo-locked to <span style={{ color: "var(--text-1)" }}>198.51.100.42</span> · Austin, TX
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, hint, children }) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
      <span className="t-eyebrow">{label}</span>
      {hint && <span className="dim" style={{ fontSize: 10 }}>{hint}</span>}
    </div>
    {children}
  </div>
);

// Animated SVG network grid
const NetworkBackdrop = ({ tick }) => {
  const nodes = useMemo(() => {
    const rng = mulberry32(7);
    return Array.from({ length: 38 }).map((_, i) => ({
      id: i, x: rng() * 100, y: rng() * 100, r: 1 + rng() * 2.5,
      phase: rng() * Math.PI * 2,
    }));
  }, []);
  const edges = useMemo(() => {
    const e = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d < 22) e.push({ a: i, b: j, d });
      }
    }
    return e;
  }, [nodes]);
  const t = tick * 0.05;
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity: 0.6 }}
         viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="nodeg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="oklch(0.92 0.10 220)"/>
          <stop offset="100%" stopColor="oklch(0.55 0.14 220)" stopOpacity="0"/>
        </radialGradient>
      </defs>
      {edges.map((e, i) => (
        <line key={i} x1={nodes[e.a].x} y1={nodes[e.a].y} x2={nodes[e.b].x} y2={nodes[e.b].y}
              stroke="oklch(0.78 0.15 220)" strokeWidth="0.08"
              opacity={Math.max(0.05, 0.4 - e.d / 60)}/>
      ))}
      {nodes.map(n => {
        const pulse = 0.6 + 0.4 * Math.sin(t + n.phase);
        return <g key={n.id}>
          <circle cx={n.x} cy={n.y} r={n.r * (1 + pulse * 0.3)} fill="url(#nodeg)" opacity={pulse * 0.7}/>
          <circle cx={n.x} cy={n.y} r={n.r * 0.5} fill="oklch(0.92 0.10 220)" opacity={pulse}/>
        </g>;
      })}
    </svg>
  );
};

window.LoginScreen = LoginScreen;
window.NetworkBackdrop = NetworkBackdrop;
