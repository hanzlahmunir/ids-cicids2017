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
