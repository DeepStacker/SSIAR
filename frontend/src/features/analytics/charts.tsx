import { useState, useRef, useCallback, type ReactNode } from 'react';

const GRID_COLOR = 'var(--color-border)';
const TEXT_MUTED = 'var(--text-muted)';
const TEXT_PRIMARY = 'var(--text-primary)';
const BG_SECONDARY = 'var(--bg-secondary)';
const ACCENT_VIOLET = 'var(--accent-violet)';
const ACCENT_CYAN = 'var(--accent-cyan)';
const ACCENT_EMERALD = 'var(--accent-emerald)';
const ACCENT_ROSE = 'var(--accent-rose)';
const ACCENT_AMBER = 'var(--accent-amber)';

function useTooltip() {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: ReactNode } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const show = useCallback((x: number, y: number, content: ReactNode) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setTooltip({ x, y, content });
  }, []);

  const hide = useCallback(() => {
    hideTimer.current = setTimeout(() => setTooltip(null), 150);
  }, []);

  return { tooltip, show, hide };
}

function TooltipOverlay({ tooltip }: { tooltip: { x: number; y: number; content: ReactNode } | null }) {
  if (!tooltip) return null;
  return (
    <foreignObject x={tooltip.x} y={tooltip.y} width={200} height={80}
      style={{ overflow: 'visible', pointerEvents: 'none' }}>
      <div style={{
        background: BG_SECONDARY, border: `1px solid ${GRID_COLOR}`, color: '#fff',
        borderRadius: 6, padding: '6px 10px', fontSize: 12, whiteSpace: 'nowrap',
        display: 'inline-block', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}>
        {tooltip.content}
      </div>
    </foreignObject>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

// ── VerticalBarChart ──
export function VerticalBarChart({
  data, dataKey, nameKey, height = 250, domain,
  barRadius = 4, barColor = ACCENT_VIOLET, colorMap,
  xFormatter, yFormatter, tooltipFormatter,
  title, xLabel, yLabel,
}: {
  data: Record<string, any>[];
  dataKey: string;
  nameKey: string;
  height?: number;
  domain?: [number, number];
  barRadius?: number;
  barColor?: string;
  colorMap?: (d: Record<string, any>, i: number) => string;
  xFormatter?: (v: any) => string;
  yFormatter?: (v: number) => string;
  tooltipFormatter?: (v: any) => string;
  title?: string;
  xLabel?: string;
  yLabel?: string;
}) {
  const { tooltip, show, hide } = useTooltip();
  const pad = { top: title ? 36 : 20, right: 30, bottom: xLabel ? 52 : 40, left: yLabel ? 62 : 50 };
  const chartW = 800;
  const chartH = 300;
  const barW = Math.max(8, (chartW - pad.left - pad.right) / data.length * 0.5);
  const gap = (chartW - pad.left - pad.right) / data.length;

  const vals = data.map(d => Number(d[dataKey]) || 0);
  const maxVal = domain ? domain[1] : Math.ceil(Math.max(...vals, 1) * 1.1);
  const minVal = domain ? domain[0] : 0;
  const range = maxVal - minVal || 1;

  const yTicks = 5;
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) => minVal + (range / yTicks) * i);

  return (
    <svg viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height }}>
      {title && (
        <text x={chartW / 2} y={18} textAnchor="middle" fill={TEXT_PRIMARY} fontSize={13} fontWeight="bold">
          {title}
        </text>
      )}
      {/* Grid */}
      {tickVals.map((t, i) => (
        <line key={i} x1={pad.left} x2={chartW - pad.right} y1={chartH - pad.bottom - ((t - minVal) / range) * (chartH - pad.top - pad.bottom)} y2={chartH - pad.bottom - ((t - minVal) / range) * (chartH - pad.top - pad.bottom)}
          stroke={GRID_COLOR} strokeDasharray="3 3" opacity={0.5} />
      ))}
      {/* Y axis labels */}
      {tickVals.map((t, i) => (
        <text key={i} x={pad.left - 8} y={chartH - pad.bottom - ((t - minVal) / range) * (chartH - pad.top - pad.bottom) + 4}
          textAnchor="end" fill={TEXT_MUTED} fontSize={11}>
          {yFormatter ? yFormatter(t) : formatNumber(t)}
        </text>
      ))}
      {/* Bars */}
      {data.map((d, i) => {
        const val = Number(d[dataKey]) || 0;
        const barH = ((val - minVal) / range) * (chartH - pad.top - pad.bottom);
        const x = pad.left + i * gap + (gap - barW) / 2;
        const y = chartH - pad.bottom - barH;
        const fill = colorMap ? colorMap(d, i) : barColor;
        return (
          <g key={i} className="animate-chart-enter" style={{ animationDelay: `${i * 50}ms` }}>
            <rect x={x} y={y} width={barW} height={Math.max(1, barH)} fill={fill} rx={barRadius}
              onMouseEnter={e => show(e.clientX, e.clientY - 20, <span>{String(d[nameKey])}: <b>{tooltipFormatter ? tooltipFormatter(val) : formatNumber(val)}</b></span>)}
              onMouseMove={e => show(e.clientX, e.clientY - 20, <span>{String(d[nameKey])}: <b>{tooltipFormatter ? tooltipFormatter(val) : formatNumber(val)}</b></span>)}
              onMouseLeave={hide}
              style={{ cursor: 'pointer', transition: 'transform 0.15s, filter 0.15s', transformOrigin: `${x + barW / 2}px ${chartH - pad.bottom}px` }}
              onMouseOver={e => { e.currentTarget.style.transform = 'scaleY(1.03)'; e.currentTarget.style.filter = 'brightness(1.15)'; }}
              onMouseOut={e => { e.currentTarget.style.transform = 'scaleY(1)'; e.currentTarget.style.filter = 'brightness(1)'; }}
            />
            <text x={pad.left + i * gap + gap / 2} y={chartH - (xLabel ? 38 : 4)} textAnchor="middle" fill={TEXT_MUTED} fontSize={10}>
              {xFormatter ? xFormatter(d[nameKey]) : String(d[nameKey])}
            </text>
          </g>
        );
      })}
      {/* Axis lines */}
      <line x1={pad.left} x2={pad.left} y1={pad.top} y2={chartH - pad.bottom} stroke={GRID_COLOR} />
      <line x1={pad.left} x2={chartW - pad.right} y1={chartH - pad.bottom} y2={chartH - pad.bottom} stroke={GRID_COLOR} />
      {/* Axis Labels */}
      {yLabel && (
        <text x={14} y={chartH / 2} textAnchor="middle" fill={TEXT_MUTED} fontSize={11} transform={`rotate(-90, 14, ${chartH / 2})`}>
          {yLabel}
        </text>
      )}
      {xLabel && (
        <text x={chartW / 2} y={chartH - 8} textAnchor="middle" fill={TEXT_MUTED} fontSize={11}>
          {xLabel}
        </text>
      )}
      <TooltipOverlay tooltip={tooltip} />
    </svg>
  );
}

// ── HorizontalBarChart ──
export function HorizontalBarChart({
  data, dataKey, nameKey, height = 300, domain = [0, 100],
  barColor = ACCENT_VIOLET, marginLeft = 100,
  tooltipFormatter, xFormatter,
  title, xLabel,
}: {
  data: Record<string, any>[];
  dataKey: string;
  nameKey: string;
  height?: number;
  domain?: [number, number];
  barColor?: string;
  marginLeft?: number;
  tooltipFormatter?: (v: any) => string;
  xFormatter?: (v: number) => string;
  title?: string;
  xLabel?: string;
}) {
  const { tooltip, show, hide } = useTooltip();
  const mLeft = Math.max(marginLeft, 80);
  const pad = { top: title ? 32 : 10, right: 20, bottom: xLabel ? 30 : 10, left: mLeft };
  const chartW = 800;
  const chartH = Math.max(200, data.length * 40 + 20);
  const barH = Math.min(24, Math.max(10, (chartH - pad.top - pad.bottom) / data.length - 8));
  const gap = (chartH - pad.top - pad.bottom) / data.length;

  const maxVal = domain[1];

  const xTicks = 5;
  const tickVals = Array.from({ length: xTicks + 1 }, (_, i) => (maxVal / xTicks) * i);

  return (
    <svg viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height }}>
      {title && (
        <text x={chartW / 2} y={16} textAnchor="middle" fill={TEXT_PRIMARY} fontSize={13} fontWeight="bold">
          {title}
        </text>
      )}
      {tickVals.map((t, i) => (
        <g key={i}>
          <line x1={pad.left + (t / maxVal) * (chartW - pad.left - pad.right)}
            y1={pad.top} y2={chartH - pad.bottom}
            stroke={GRID_COLOR} strokeDasharray="3 3" opacity={0.5} />
          <text x={pad.left + (t / maxVal) * (chartW - pad.left - pad.right)}
            y={chartH - (xLabel ? 18 : 2)} textAnchor="middle" fill={TEXT_MUTED} fontSize={10}>
            {xFormatter ? xFormatter(t) : formatNumber(t)}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const val = Number(d[dataKey]) || 0;
        const barW = (val / maxVal) * (chartW - pad.left - pad.right);
        const y = pad.top + i * gap + (gap - barH) / 2;
        return (
          <g key={i} className="animate-chart-enter" style={{ animationDelay: `${i * 60}ms` }}>
            <rect x={pad.left} y={y} width={Math.max(1, barW)} height={barH} fill={barColor} rx={1}
              onMouseEnter={e => show(e.clientX, e.clientY - 20, <span>{String(d[nameKey])}: <b>{tooltipFormatter ? tooltipFormatter(val) : `${val}%`}</b></span>)}
              onMouseMove={e => show(e.clientX, e.clientY - 20, <span>{String(d[nameKey])}: <b>{tooltipFormatter ? tooltipFormatter(val) : `${val}%`}</b></span>)}
              onMouseLeave={hide}
              style={{ cursor: 'pointer', transition: 'filter 0.15s' }}
              onMouseOver={e => { e.currentTarget.style.filter = 'brightness(1.2)'; }}
              onMouseOut={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
            />
            <text x={pad.left - 8} y={pad.top + i * gap + gap / 2 + 4} textAnchor="end" fill={TEXT_MUTED} fontSize={11}>
              {String(d[nameKey])}
            </text>
          </g>
        );
      })}
      <line x1={pad.left} x2={chartW - pad.right} y1={chartH - pad.bottom} y2={chartH - pad.bottom} stroke={GRID_COLOR} />
      <line x1={pad.left} x2={pad.left} y1={pad.top} y2={chartH - pad.bottom} stroke={GRID_COLOR} />
      {xLabel && (
        <text x={chartW / 2} y={chartH - 4} textAnchor="middle" fill={TEXT_MUTED} fontSize={11}>
          {xLabel}
        </text>
      )}
      <TooltipOverlay tooltip={tooltip} />
    </svg>
  );
}

// ── DonutPieChart ──
export function DonutPieChart({
  data, dataKey = 'count', nameKey, innerRadius = 50, outerRadius = 70,
  colors = [ACCENT_VIOLET, ACCENT_CYAN, ACCENT_ROSE, ACCENT_EMERALD, ACCENT_AMBER],
  title,
}: {
  data: Record<string, any>[];
  dataKey?: string;
  nameKey: string;
  innerRadius?: number;
  outerRadius?: number;
  colors?: string[];
  title?: string;
}) {
  const { tooltip, show, hide } = useTooltip();
  const size = 300;
  const cx = size / 2;
  const cy = size / 2;
  const total = data.reduce((s, d) => s + (Number(d[dataKey]) || 0), 0) || 1;

  let angle = -90;
  const arcs: (Record<string, any> & { sliceAngle: number; startAngle: number; endAngle: number; i: number })[] = [];
  data.forEach((d, i) => {
    const val = Number(d[dataKey]) || 0;
    const sliceAngle = (val / total) * 360;
    const startAngle = angle;
    angle += sliceAngle;
    arcs.push({ ...d, sliceAngle, startAngle, endAngle: angle, i });
  });

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const arcPath = (start: number, end: number, r: number) => {
    const x1 = cx + r * Math.cos(toRad(start));
    const y1 = cy + r * Math.sin(toRad(start));
    const x2 = cx + r * Math.cos(toRad(end));
    const y2 = cy + r * Math.sin(toRad(end));
    const large = end - start > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };

  const donutPath = (start: number, end: number) => {
    const outerStart = arcPath(start, end, outerRadius);
    const innerEnd = arcPath(end, start, innerRadius);
    return `${outerStart} L ${cx + innerRadius * Math.cos(toRad(end))} ${cy + innerRadius * Math.sin(toRad(end))} ${innerEnd} Z`;
  };

  const getLabelPos = (start: number, end: number) => {
    const mid = (start + end) / 2;
    const labelR = (innerRadius + outerRadius) / 2;
    return { x: cx + labelR * Math.cos(toRad(mid)), y: cy + labelR * Math.sin(toRad(mid)) };
  };

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      {title && (
        <text x={cx} y={20} textAnchor="middle" fill={TEXT_PRIMARY} fontSize={12} fontWeight="bold">
          {title}
        </text>
      )}
      {arcs.map((d, i) => {
        if (d.sliceAngle < 0.1) return null;
        const pct = ((Number(d[dataKey]) / total) * 100).toFixed(0);
        const labelPos = getLabelPos(d.startAngle, d.endAngle);
        const showPctLabel = Number(pct) >= 5;
        return (
          <g key={i} className="animate-chart-enter" style={{ animationDelay: `${i * 80}ms` }}>
            <path d={donutPath(d.startAngle, d.endAngle)} fill={colors[i % colors.length]}
              onMouseEnter={e => show(e.clientX, e.clientY - 20, <span><b>{String(d[nameKey])}</b>: {formatNumber(Number(d[dataKey]))} ({pct}%)</span>)}
              onMouseMove={e => show(e.clientX, e.clientY - 20, <span><b>{String(d[nameKey])}</b>: {formatNumber(Number(d[dataKey]))} ({pct}%)</span>)}
              onMouseLeave={hide}
              style={{ cursor: 'pointer', transition: 'opacity 0.15s, filter 0.15s', transformOrigin: `${cx}px ${cy}px` }}
              onMouseOver={e => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.filter = 'drop-shadow(0 0 6px rgba(0,0,0,0.4))'; }}
              onMouseOut={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.filter = 'none'; }}
            />
            {showPctLabel && (
              <text x={labelPos.x} y={labelPos.y} textAnchor="middle" dominantBaseline="central"
                fill="#fff" fontSize={10} fontWeight="bold" style={{ pointerEvents: 'none' }}>
                {pct}%
              </text>
            )}
          </g>
        );
      })}
      {/* Center label showing total */}
      <text x={cx} y={cy - 6} textAnchor="middle" fill={TEXT_MUTED} fontSize={10} fontWeight="normal">
        Total
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill={TEXT_PRIMARY} fontSize={16} fontWeight="bold">
        {formatNumber(total)}
      </text>
      <TooltipOverlay tooltip={tooltip} />
    </svg>
  );
}

// ── LineChart ──
export function LineChartComponent({
  data, dataKey, nameKey, height = 250,
  lineColor = ACCENT_VIOLET, dotRadius = 4,
  tooltipFormatter,
  title, yLabel, xLabel,
}: {
  data: Record<string, any>[];
  dataKey: string;
  nameKey: string;
  height?: number;
  lineColor?: string;
  dotRadius?: number;
  tooltipFormatter?: (v: any) => string;
  title?: string;
  yLabel?: string;
  xLabel?: string;
}) {
  const { tooltip, show, hide } = useTooltip();
  const pad = { top: title ? 36 : 20, right: 30, bottom: xLabel ? 52 : 40, left: yLabel ? 62 : 50 };
  const chartW = 800;
  const chartH = 300;
  const plotW = chartW - pad.left - pad.right;
  const plotH = chartH - pad.top - pad.bottom;

  const vals = data.map(d => Number(d[dataKey]) || 0);
  const maxVal = Math.ceil(Math.max(...vals, 1) * 1.1);
  const range = maxVal || 1;

  const points = data.map((d, i) => ({
    x: pad.left + (i / Math.max(data.length - 1, 1)) * plotW,
    y: chartH - pad.bottom - ((Number(d[dataKey]) || 0) / range) * plotH,
    label: String(d[nameKey]),
    value: Number(d[dataKey]),
  }));

  const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  const yTicks = 5;
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) => (range / yTicks) * i);

  return (
    <svg viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height }}>
      {title && (
        <text x={chartW / 2} y={18} textAnchor="middle" fill={TEXT_PRIMARY} fontSize={13} fontWeight="bold">
          {title}
        </text>
      )}
      {tickVals.map((t, i) => (
        <g key={i}>
          <line x1={pad.left} x2={chartW - pad.right} y1={chartH - pad.bottom - (t / range) * plotH}
            y2={chartH - pad.bottom - (t / range) * plotH}
            stroke={GRID_COLOR} strokeDasharray="3 3" opacity={0.5} />
          <text x={pad.left - 8} y={chartH - pad.bottom - (t / range) * plotH + 4}
            textAnchor="end" fill={TEXT_MUTED} fontSize={11}>{formatNumber(Math.round(t))}</text>
        </g>
      ))}
      <line x1={pad.left} x2={pad.left} y1={pad.top} y2={chartH - pad.bottom} stroke={GRID_COLOR} />
      <line x1={pad.left} x2={chartW - pad.right} y1={chartH - pad.bottom} y2={chartH - pad.bottom} stroke={GRID_COLOR} />
      {/* Line fill area */}
      {points.length > 1 && (() => {
        const areaD = `M ${points[0].x} ${chartH - pad.bottom} L ${points.map(p => `${p.x} ${p.y}`).join(' L ')} L ${points[points.length - 1].x} ${chartH - pad.bottom} Z`;
        return <path d={areaD} fill={lineColor} fillOpacity={0.08} />;
      })()}
      {/* Line */}
      <path d={lineD} fill="none" stroke={lineColor} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots */}
      {points.map((p, i) => (
        <g key={i} className="animate-chart-enter" style={{ animationDelay: `${i * 40}ms` }}>
          <circle cx={p.x} cy={p.y} r={dotRadius} fill={lineColor}
            onMouseEnter={() => show(p.x + 10, p.y - 20, <span>{p.label}: <b>{tooltipFormatter ? tooltipFormatter(p.value) : formatNumber(p.value)}</b></span>)}
            onMouseLeave={hide}
            style={{ cursor: 'pointer', transition: 'r 0.15s' }}
            onMouseOver={e => { e.currentTarget.setAttribute('r', String(dotRadius * 1.5)); }}
            onMouseOut={e => { e.currentTarget.setAttribute('r', String(dotRadius)); }}
          />
          <text x={p.x} y={chartH - (xLabel ? 36 : 4)} textAnchor="middle" fill={TEXT_MUTED} fontSize={9}>
            {p.label}
          </text>
        </g>
      ))}
      {yLabel && (
        <text x={14} y={chartH / 2} textAnchor="middle" fill={TEXT_MUTED} fontSize={11} transform={`rotate(-90, 14, ${chartH / 2})`}>
          {yLabel}
        </text>
      )}
      {xLabel && (
        <text x={chartW / 2} y={chartH - 8} textAnchor="middle" fill={TEXT_MUTED} fontSize={11}>
          {xLabel}
        </text>
      )}
      <TooltipOverlay tooltip={tooltip} />
    </svg>
  );
}

// ── RadarChart ──
export function RadarChartComponent({
  data, dataKey = 'score', nameKey, height = 300, domain = [0, 100],
  fillColor = ACCENT_VIOLET, strokeColor = ACCENT_VIOLET, fillOpacity = 0.3,
  title,
}: {
  data: Record<string, any>[];
  dataKey?: string;
  nameKey: string;
  height?: number;
  domain?: [number, number];
  fillColor?: string;
  strokeColor?: string;
  fillOpacity?: number;
  title?: string;
}) {
  const { tooltip, show, hide } = useTooltip();
  const size = 300;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.35;
  const levels = 5;
  const n = data.length;
  if (n < 3) return null;

  const minVal = domain[0];
  const maxVal = domain[1];
  const range = maxVal - minVal;

  const getPoint = (i: number, r: number) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', height, display: 'block' }}>
      {title && (
        <text x={cx} y={16} textAnchor="middle" fill={TEXT_PRIMARY} fontSize={12} fontWeight="bold">
          {title}
        </text>
      )}
      {/* Grid levels */}
      {Array.from({ length: levels }, (_, l) => {
        const r = maxR * ((l + 1) / levels);
        const pts = Array.from({ length: n }, (_, i) => getPoint(i, r));
        return (
          <polygon key={l} points={pts.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none" stroke={GRID_COLOR} strokeWidth={0.5} opacity={0.5} />
        );
      })}
      {/* Axis lines */}
      {Array.from({ length: n }, (_, i) => {
        const p = getPoint(i, maxR);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={GRID_COLOR} strokeWidth={0.5} opacity={0.5} />;
      })}
      {/* Data polygon */}
      {(() => {
        const pts = data.map((d, i) => getPoint(i, maxR * ((Number(d[dataKey]) - minVal) / range)));
        return (
          <g className="animate-chart-enter">
            <polygon points={pts.map(p => `${p.x},${p.y}`).join(' ')}
              fill={fillColor} fillOpacity={fillOpacity} stroke={strokeColor} strokeWidth={2} />
            {pts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={3} fill={strokeColor}
                onMouseEnter={e => show(e.clientX, e.clientY - 20,
                  <span>{String(data[i][nameKey])}: <b>{formatNumber(Number(data[i][dataKey]))}%</b></span>)}
                onMouseMove={e => show(e.clientX, e.clientY - 20,
                  <span>{String(data[i][nameKey])}: <b>{formatNumber(Number(data[i][dataKey]))}%</b></span>)}
                onMouseLeave={hide}
                style={{ cursor: 'pointer', transition: 'r 0.15s' }}
                onMouseOver={e => { e.currentTarget.setAttribute('r', '5'); }}
                onMouseOut={e => { e.currentTarget.setAttribute('r', '3'); }}
              />
            ))}
          </g>
        );
      })()}
      {/* Labels */}
      {data.map((d, i) => {
        const p = getPoint(i, maxR + 18);
        return (
          <text key={i} x={p.x} y={p.y + 4} textAnchor="middle" fill={TEXT_MUTED} fontSize={10}>
            {String(d[nameKey])}
          </text>
        );
      })}
      <TooltipOverlay tooltip={tooltip} />
    </svg>
  );
}
