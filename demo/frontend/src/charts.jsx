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
