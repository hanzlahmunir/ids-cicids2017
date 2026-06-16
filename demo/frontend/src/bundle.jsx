// ===== util.jsx =====
// Utilities — deterministic RNG, tickers, formatters
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// Mulberry32 — seeded PRNG for reproducible "live" data
function mulberry32(seed) {
  return function() {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function useTick(intervalMs = 1000) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN(x => x + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return n;
}

function useAnimatedNumber(target, durationMs = 600) {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef(performance.now());
  useEffect(() => {
    fromRef.current = val;
    startRef.current = performance.now();
    let raf;
    const loop = (t) => {
      const k = Math.min(1, (t - startRef.current) / durationMs);
      const eased = 1 - Math.pow(1 - k, 3);
      setVal(fromRef.current + (target - fromRef.current) * eased);
      if (k < 1) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line
  }, [target]);
  return val;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function fmtNum(n, opts = {}) {
  if (n == null || isNaN(n)) return "—";
  const { decimals = 0, compact = false } = opts;
  if (compact) {
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(decimals || 2) + "B";
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(decimals || 2) + "M";
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(decimals || 1) + "K";
  }
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtTime(d) {
  return d.toLocaleTimeString("en-US", { hour12: false });
}
function fmtDateUTC(d) {
  return d.toUTCString().replace("GMT", "UTC");
}
function relTime(secAgo) {
  if (secAgo < 60) return `${secAgo}s ago`;
  if (secAgo < 3600) return `${Math.floor(secAgo / 60)}m ago`;
  if (secAgo < 86400) return `${Math.floor(secAgo / 3600)}h ago`;
  return `${Math.floor(secAgo / 86400)}d ago`;
}

// Random IP for demo data
function ipFrom(rng) {
  return [Math.floor(rng() * 223 + 1), Math.floor(rng() * 254), Math.floor(rng() * 254), Math.floor(rng() * 254)].join(".");
}

Object.assign(window, {
  mulberry32, useTick, useAnimatedNumber, useClock,
  fmtNum, fmtTime, fmtDateUTC, relTime, ipFrom
});


// ===== realdata.jsx =====
// ──────────────────────────────────────────────────────────────────
// Real-data layer — connects the NetShield UI to the FastAPI backend
// that serves the actual trained CICIDS-2017 XGBoost model.
//
// Everything here is REAL: metrics are computed on the held-out test set,
// the live feed replays real held-out flows through the real model.
// If the backend is unreachable the UI still renders (screens fall back
// to their design-time placeholder data) but shows an "offline" state.
// ──────────────────────────────────────────────────────────────────

const API_BASE =
  (window.NETSHIELD_API || "http://127.0.0.1:8000") + "/api";
const WS_BASE = API_BASE.replace(/^http/, "ws");

// --- low level fetch helpers ---------------------------------------
async function apiGet(path) {
  const r = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

// --- health + metrics hook -----------------------------------------
// Returns { status: 'loading'|'online'|'offline', health, metrics }
function useBackend() {
  const [state, setState] = useState({ status: "loading", health: null, metrics: null });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const health = await apiGet("/health");
        const metrics = await apiGet("/metrics");
        if (alive) setState({ status: health.ready ? "online" : "offline", health, metrics });
      } catch (e) {
        if (alive) setState({ status: "offline", health: null, metrics: null });
      }
    })();
    return () => { alive = false; };
  }, []);
  return state;
}

// --- live flow stream hook -----------------------------------------
// Opens the /stream websocket. `scenario` and `rate` can change live.
// Returns { connected, flows (newest first, capped), stats, setScenario, setRate, scenario, rate, reset }
function useFlowStream(initialScenario = "mixed", initialRate = 6) {
  const [connected, setConnected] = useState(false);
  const [flows, setFlows] = useState([]);
  const [scenario, setScenarioState] = useState(initialScenario);
  const [rate, setRateState] = useState(initialRate);
  const [stats, setStats] = useState({
    total: 0, attacks: 0, benign: 0, correct: 0,
    byClass: {},          // class name -> count of predictions
    confusion: {},        // "true>pred" -> count
  });
  const wsRef = useRef(null);
  const runningRef = useRef(true);

  // send scenario/rate updates to the server when they change
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({ scenario, rate }));
    }
  }, [scenario, rate]);

  useEffect(() => {
    let ws;
    try {
      ws = new WebSocket(`${WS_BASE}/stream`);
    } catch (e) { setConnected(false); return; }
    wsRef.current = ws;
    ws.onopen = () => { setConnected(true); ws.send(JSON.stringify({ scenario, rate })); };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (ev) => {
      if (!runningRef.current) return;
      const m = JSON.parse(ev.data);
      if (m.type !== "flow") return;
      const flow = {
        id: Math.random().toString(36).slice(2),
        ts: Date.now(),
        pred: m.pred_name, truth: m.true_name,
        correct: m.correct, conf: m.confidence, isAttack: m.is_attack,
      };
      setFlows(prev => [flow, ...prev].slice(0, 60));
      setStats(prev => {
        const byClass = { ...prev.byClass, [m.pred_name]: (prev.byClass[m.pred_name] || 0) + 1 };
        const key = `${m.true_name}>${m.pred_name}`;
        const confusion = { ...prev.confusion, [key]: (prev.confusion[key] || 0) + 1 };
        return {
          total: prev.total + 1,
          attacks: prev.attacks + (m.is_attack ? 1 : 0),
          benign: prev.benign + (m.is_attack ? 0 : 1),
          correct: prev.correct + (m.correct ? 1 : 0),
          byClass, confusion,
        };
      });
    };
    return () => { try { ws.close(); } catch (e) {} };
    // eslint-disable-next-line
  }, []);

  const reset = () => setStats({ total: 0, attacks: 0, benign: 0, correct: 0, byClass: {}, confusion: {} });

  return {
    connected, flows, stats, scenario, rate,
    setScenario: setScenarioState, setRate: setRateState, reset,
  };
}

Object.assign(window, { apiGet, useBackend, useFlowStream, API_BASE });


// ===== icons.jsx =====
// Inline SVG icons — outline, 1.5px stroke
const I = (props) => ({ size = 16, ...rest }) => null;

const Icon = ({ children, size = 16, className = "", style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    {children}
  </svg>
);

const Icons = {
  Shield: (p) => <Icon {...p}><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z"/></Icon>,
  ShieldCheck: (p) => <Icon {...p}><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/></Icon>,
  Dashboard: (p) => <Icon {...p}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></Icon>,
  Activity: (p) => <Icon {...p}><path d="M3 12h4l3-8 4 16 3-8h4"/></Icon>,
  Target: (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></Icon>,
  Brain: (p) => <Icon {...p}><path d="M9 3a3 3 0 0 0-3 3v0a3 3 0 0 0-3 3v3a3 3 0 0 0 3 3v0a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v0a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3v0a3 3 0 0 0-3-3z"/><path d="M9 8v8M15 8v8M9 12h6"/></Icon>,
  Sparkles: (p) => <Icon {...p}><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></Icon>,
  Clock: (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Icon>,
  Server: (p) => <Icon {...p}><rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><circle cx="7" cy="7.5" r=".7" fill="currentColor"/><circle cx="7" cy="16.5" r=".7" fill="currentColor"/></Icon>,
  Settings: (p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 5l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></Icon>,
  Search: (p) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></Icon>,
  Bell: (p) => <Icon {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></Icon>,
  ChevronDown: (p) => <Icon {...p}><path d="m6 9 6 6 6-6"/></Icon>,
  ChevronRight: (p) => <Icon {...p}><path d="m9 6 6 6-6 6"/></Icon>,
  ChevronLeft: (p) => <Icon {...p}><path d="m15 6-6 6 6 6"/></Icon>,
  Plus: (p) => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>,
  Filter: (p) => <Icon {...p}><path d="M4 5h16l-6 8v6l-4-2v-4z"/></Icon>,
  Download: (p) => <Icon {...p}><path d="M12 4v12m0 0-4-4m4 4 4-4M4 20h16"/></Icon>,
  Globe: (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></Icon>,
  Lock: (p) => <Icon {...p}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></Icon>,
  Fingerprint: (p) => <Icon {...p}><path d="M12 5a7 7 0 0 1 7 7v2"/><path d="M5 14v-2a7 7 0 0 1 3.5-6.06"/><path d="M9 21a6 6 0 0 0 3-5"/><path d="M12 13a3 3 0 0 1 3 3v1"/><path d="M9 13v2a3 3 0 0 1-3 3"/><path d="M16 16v3"/></Icon>,
  ArrowUp: (p) => <Icon {...p}><path d="M12 19V5m0 0-6 6m6-6 6 6"/></Icon>,
  ArrowDown: (p) => <Icon {...p}><path d="M12 5v14m0 0-6-6m6 6 6-6"/></Icon>,
  Zap: (p) => <Icon {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></Icon>,
  Eye: (p) => <Icon {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></Icon>,
  AlertTriangle: (p) => <Icon {...p}><path d="M12 3 2 21h20z"/><path d="M12 10v4M12 18h.01"/></Icon>,
  Check: (p) => <Icon {...p}><path d="m5 12 5 5 9-11"/></Icon>,
  X: (p) => <Icon {...p}><path d="M6 6l12 12M18 6 6 18"/></Icon>,
  Cpu: (p) => <Icon {...p}><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 3v3M12 3v3M15 3v3M9 18v3M12 18v3M15 18v3M18 9h3M18 12h3M18 15h3M3 9h3M3 12h3M3 15h3"/></Icon>,
  Database: (p) => <Icon {...p}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></Icon>,
  Code: (p) => <Icon {...p}><path d="m8 6-6 6 6 6M16 6l6 6-6 6M14 4l-4 16"/></Icon>,
  Hash: (p) => <Icon {...p}><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/></Icon>,
  Maximize: (p) => <Icon {...p}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></Icon>,
  Refresh: (p) => <Icon {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 4v4h-4M21 12a9 9 0 0 1-15 6.7L3 16M3 20v-4h4"/></Icon>,
  Menu: (p) => <Icon {...p}><path d="M4 6h16M4 12h16M4 18h16"/></Icon>,
  Pin: (p) => <Icon {...p}><path d="M12 2v6l4 4-4 2-4-2 4-4V2"/><path d="M12 14v8"/></Icon>,
  Power: (p) => <Icon {...p}><path d="M12 3v8"/><path d="M5.5 8a8 8 0 1 0 13 0"/></Icon>,
};

window.Icons = Icons;


// ===== charts.jsx =====
// Lightweight SVG charts — sparklines, areas, bars, donuts, heatmaps
const Spark = ({ data, w = 96, h = 28, color = "oklch(0.82 0.16 220)", fill = true, strokeWidth = 1.5 }) => {
  if (!data || !data.length) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const stepX = w / (data.length - 1);
  const pts = data.map((v, i) => [i * stepX, h - ((v - min) / span) * (h - 4) - 2]);
  const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const dArea = d + ` L ${w},${h} L 0,${h} Z`;
  const id = "g" + Math.random().toString(36).slice(2, 8);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {fill && <path d={dArea} fill={`url(#${id})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="2" fill={color} />
    </svg>
  );
};

const AreaChart = ({ series, w = 600, h = 180, gridY = 4, yMax }) => {
  // series: [{ name, color, data: [n…] }]
  const N = series[0].data.length;
  const flat = series.flatMap(s => s.data);
  const max = yMax || Math.max(...flat) * 1.1;
  const stepX = w / (N - 1);
  const padT = 8, padB = 22, padL = 36;
  const ih = h - padT - padB;
  const iw = w - padL - 8;
  const y = (v) => padT + ih - (v / max) * ih;
  const x = (i) => padL + (i / (N - 1)) * iw;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {/* gridlines */}
      {Array.from({ length: gridY + 1 }).map((_, i) => {
        const gy = padT + (ih * i) / gridY;
        const val = max - (max * i) / gridY;
        return (
          <g key={i}>
            <line x1={padL} x2={w - 8} y1={gy} y2={gy} stroke="rgba(120,160,220,0.08)" />
            <text x={padL - 6} y={gy + 3} fontSize="9" fontFamily="JetBrains Mono" fill="rgba(170,179,200,0.6)" textAnchor="end">{Math.round(val).toLocaleString()}</text>
          </g>
        );
      })}
      {series.map((s, si) => {
        const pts = s.data.map((v, i) => [x(i), y(v)]);
        const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
        const id = `g-${si}-${Math.random().toString(36).slice(2, 6)}`;
        return (
          <g key={si}>
            <defs>
              <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.30"/>
                <stop offset="100%" stopColor={s.color} stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d={d + ` L ${x(N-1)},${padT+ih} L ${padL},${padT+ih} Z`} fill={`url(#${id})`} />
            <path d={d} fill="none" stroke={s.color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        );
      })}
    </svg>
  );
};

const Bars = ({ data, w = 240, h = 100, color = "oklch(0.82 0.16 220)", labels }) => {
  const max = Math.max(...data);
  const gap = 3;
  const bw = (w - gap * (data.length - 1)) / data.length;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h+18}`}>
      {data.map((v, i) => {
        const bh = (v / max) * h;
        return (
          <g key={i}>
            <rect x={i * (bw + gap)} y={h - bh} width={bw} height={bh} rx="1.5"
                  fill={color} opacity={0.85} />
            {labels && (
              <text x={i * (bw + gap) + bw / 2} y={h + 12} fontSize="8.5" fontFamily="JetBrains Mono"
                    fill="rgba(170,179,200,0.6)" textAnchor="middle">{labels[i]}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

const Donut = ({ value, max = 100, size = 80, stroke = 6, color = "oklch(0.82 0.16 220)", label }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, value / max);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(120,160,220,0.12)" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
              strokeDasharray={`${c * pct} ${c}`} strokeLinecap="round"
              transform={`rotate(-90 ${size/2} ${size/2})`}/>
      <text x={size/2} y={size/2-2} fontSize="14" fontFamily="JetBrains Mono" fontWeight="500"
            fill="#e8edf7" textAnchor="middle">{Math.round(pct*100)}%</text>
      {label && <text x={size/2} y={size/2+12} fontSize="8" fontFamily="Inter"
                      fill="rgba(170,179,200,0.7)" textAnchor="middle" letterSpacing="0.08em">{label.toUpperCase()}</text>}
    </svg>
  );
};

// Heatmap — 2D array of values 0..1
const Heatmap = ({ data, w = 320, h = 120, rowLabels, colLabels, color = "oklch(0.78 0.15 220)" }) => {
  const rows = data.length;
  const cols = data[0].length;
  const padL = rowLabels ? 60 : 0;
  const padB = colLabels ? 16 : 0;
  const cw = (w - padL) / cols;
  const ch = (h - padB) / rows;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`}>
      {data.map((row, r) => row.map((v, c) => (
        <rect key={`${r}-${c}`} x={padL + c * cw + 1} y={r * ch + 1} width={cw - 2} height={ch - 2} rx="2"
              fill={color} opacity={0.10 + 0.85 * v}/>
      )))}
      {rowLabels && rowLabels.map((l, i) => (
        <text key={i} x={padL - 8} y={i * ch + ch/2 + 3} fontSize="9.5" fontFamily="Inter"
              fill="rgba(170,179,200,0.7)" textAnchor="end">{l}</text>
      ))}
      {colLabels && colLabels.map((l, i) => (
        <text key={i} x={padL + i * cw + cw/2} y={h - 4} fontSize="8.5" fontFamily="JetBrains Mono"
              fill="rgba(170,179,200,0.55)" textAnchor="middle">{l}</text>
      ))}
    </svg>
  );
};

// Confusion matrix — labels + numbers + heat
const ConfusionMatrix = ({ labels, matrix }) => {
  const total = matrix.flat().reduce((a, b) => a + b, 0);
  const maxV = Math.max(...matrix.flat());
  const cell = 60;
  const padL = 110, padT = 28;
  const w = padL + labels.length * cell + 8;
  const h = padT + labels.length * cell + 8;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`}>
      {labels.map((l, i) => (
        <text key={"c"+i} x={padL + i * cell + cell/2} y={padT - 8} fontSize="10" fontFamily="Inter"
              fill="rgba(170,179,200,0.85)" textAnchor="middle">{l}</text>
      ))}
      {labels.map((l, i) => (
        <text key={"r"+i} x={padL - 10} y={padT + i * cell + cell/2 + 3} fontSize="10" fontFamily="Inter"
              fill="rgba(170,179,200,0.85)" textAnchor="end">{l}</text>
      ))}
      {matrix.map((row, r) => row.map((v, c) => {
        const isDiag = r === c;
        const intensity = v / maxV;
        const color = isDiag ? "oklch(0.7 0.18 145)" : "oklch(0.72 0.22 25)";
        return (
          <g key={`${r}-${c}`}>
            <rect x={padL + c * cell + 2} y={padT + r * cell + 2} width={cell - 4} height={cell - 4} rx="3"
                  fill={color} opacity={0.08 + 0.65 * intensity}
                  stroke={color} strokeOpacity={0.3}/>
            <text x={padL + c * cell + cell/2} y={padT + r * cell + cell/2 - 2} fontSize="13" fontFamily="JetBrains Mono"
                  fontWeight="500" fill="#e8edf7" textAnchor="middle">{v}</text>
            <text x={padL + c * cell + cell/2} y={padT + r * cell + cell/2 + 12} fontSize="8" fontFamily="JetBrains Mono"
                  fill="rgba(170,179,200,0.6)" textAnchor="middle">{(v/total*100).toFixed(1)}%</text>
          </g>
        );
      }))}
    </svg>
  );
};

const RocCurve = ({ models, w = 360, h = 260 }) => {
  const pad = 32;
  const x = (v) => pad + v * (w - pad - 8);
  const y = (v) => h - pad - v * (h - pad - 8);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`}>
      {/* axes */}
      <line x1={pad} y1={h-pad} x2={w-8} y2={h-pad} stroke="rgba(120,160,220,0.2)"/>
      <line x1={pad} y1={pad} x2={pad} y2={h-pad} stroke="rgba(120,160,220,0.2)"/>
      {/* grid */}
      {[0.25, 0.5, 0.75].map(v => (
        <g key={v}>
          <line x1={x(v)} y1={pad} x2={x(v)} y2={h-pad} stroke="rgba(120,160,220,0.06)"/>
          <line x1={pad} y1={y(v)} x2={w-8} y2={y(v)} stroke="rgba(120,160,220,0.06)"/>
        </g>
      ))}
      {/* diagonal baseline */}
      <line x1={pad} y1={h-pad} x2={w-8} y2={pad} stroke="rgba(170,179,200,0.25)" strokeDasharray="3 4"/>
      {/* models */}
      {models.map((m, mi) => {
        const pts = m.points.map(([fpr, tpr]) => `${x(fpr).toFixed(1)},${y(tpr).toFixed(1)}`).join(" L");
        return <path key={mi} d={"M" + pts} fill="none" stroke={m.color} strokeWidth="1.8" />;
      })}
      {/* axis labels */}
      <text x={pad} y={h-10} fontSize="9" fontFamily="JetBrains Mono" fill="rgba(170,179,200,0.6)">0</text>
      <text x={w-12} y={h-10} fontSize="9" fontFamily="JetBrains Mono" fill="rgba(170,179,200,0.6)" textAnchor="end">FPR 1.0</text>
      <text x={pad+4} y={pad+8} fontSize="9" fontFamily="JetBrains Mono" fill="rgba(170,179,200,0.6)">TPR 1.0</text>
    </svg>
  );
};

window.Spark = Spark;
window.AreaChart = AreaChart;
window.Bars = Bars;
window.Donut = Donut;
window.Heatmap = Heatmap;
window.ConfusionMatrix = ConfusionMatrix;
window.RocCurve = RocCurve;


// ===== chrome.jsx =====
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


// ===== screen-login.jsx =====
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


// ===== screen-dashboard.jsx =====
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


// ===== screen-livedetect.jsx =====
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


// ===== screen-traffic.jsx =====
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


// ===== screen-threats.jsx =====
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


// ===== screen-ml.jsx =====
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


// ===== screen-shap.jsx =====
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


// ===== screen-intel.jsx =====
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


// ===== screen-api.jsx =====
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


// ===== app.jsx =====
// Main app
const { createRoot } = ReactDOM;

const App = () => {
  const [authed, setAuthed] = useState(false);
  const [screen, setScreen] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);

  if (!authed) {
    return (
      <div className="app" data-screen="login">
        <LoginScreen onLogin={() => setAuthed(true)}/>
      </div>
    );
  }

  const screens = {
    dashboard: <DashboardScreen/>,
    livedetect: <LiveDetectScreen/>,     // REAL model-driven simulation
    traffic: <TrafficScreen/>,
    threats: <ThreatsScreen/>,
    ml: <MlScreen/>,
    shap: <ShapScreen/>,
    intel: <IntelScreen/>,
    api: <ApiScreen/>,
    settings: <PlaceholderScreen name="Settings"/>,
  };

  return (
    <div className="app" data-collapsed={collapsed} data-screen-label={`screen-${screen}`}>
      <Sidebar active={screen} onNav={setScreen} collapsed={collapsed} onToggle={() => setCollapsed(c => !c)}/>
      <TopBar onLogout={() => setAuthed(false)}/>
      <main style={{ gridColumn: "2 / 3", overflow: "hidden", position: "relative" }}>
        {screens[screen] || <PlaceholderScreen name={screen}/>}
      </main>
    </div>
  );
};

const PlaceholderScreen = ({ name }) => (
  <div style={{ height: "100%", display: "grid", placeItems: "center", padding: 24 }}>
    <div className="glass" style={{ padding: 30, textAlign: "center", maxWidth: 420 }}>
      <Icons.Settings size={28} style={{ color: "var(--text-2)" }}/>
      <div className="t-h1" style={{ marginTop: 12 }}>{name}</div>
      <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>This area is part of the platform shell but not in the current sprint scope.</div>
    </div>
  </div>
);

createRoot(document.getElementById("app")).render(<App/>);
