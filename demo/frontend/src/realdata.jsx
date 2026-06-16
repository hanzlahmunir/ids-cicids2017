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
