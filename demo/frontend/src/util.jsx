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
