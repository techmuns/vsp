import { useState } from 'react';
import { useElementWidth, useTip, ChartFrame } from './ChartBase';
import { arcPath } from '../../lib/chartMath';

export interface DonutDatum {
  key: string;
  label: string;
  value: number;
  color: string;
  note?: string;
}

interface Props {
  data: DonutDatum[];
  format: (n: number) => string;
  height?: number;
  centerTitle?: string;
  centerValue?: string;
  thickness?: number;
  pie?: boolean;
}

export function Donut({ data, format, height = 240, centerTitle, centerValue, thickness = 34, pie = false }: Props) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const [active, setActive] = useState<string | null>(null);

  const size = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const rOuter = size / 2 - 6;
  const rInner = pie ? 0 : rOuter - thickness;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;

  let angle = -Math.PI / 2;
  const slices = data.map((d) => {
    const frac = d.value / total;
    const start = angle;
    const end = angle + frac * Math.PI * 2;
    angle = end;
    const mid = (start + end) / 2;
    return { ...d, start, end, mid, frac };
  });

  const moveTip = (e: React.MouseEvent, s: (typeof slices)[number]) => {
    const rect = ref.current?.getBoundingClientRect();
    show(rect ? e.clientX - rect.left : 0, rect ? e.clientY - rect.top : 0, {
      title: s.label,
      color: s.color,
      rows: [
        { label: 'Amount', value: format(s.value) },
        { label: 'Share', value: `${(s.frac * 100).toFixed(1)}%` },
      ],
      note: s.note,
    });
  };

  return (
    <ChartFrame innerRef={ref} tip={tip} width={width}>
      <svg width={width} height={height} role="img">
        <g className="anim-pop" style={{ transformOrigin: `${cx}px ${cy}px` }}>
          {slices.map((s) => {
            const isActive = active === s.key;
            const grow = isActive ? 4 : 0;
            return (
              <path
                key={s.key}
                d={arcPath(cx, cy, rOuter + grow, rInner, s.start, s.end)}
                fill={s.color}
                stroke="#fff"
                strokeWidth={2}
                style={{ transition: 'all 0.15s ease', cursor: 'default' }}
                onMouseMove={(e) => moveTip(e, s)}
                onMouseEnter={() => setActive(s.key)}
                onMouseLeave={() => {
                  setActive(null);
                  hide();
                }}
              />
            );
          })}
          {!pie && (centerTitle || centerValue) && (
            <>
              <text x={cx} y={cy - 5} textAnchor="middle" fontSize={11} fill="#94A3B8" fontWeight={600}>
                {centerTitle}
              </text>
              <text x={cx} y={cy + 16} textAnchor="middle" className="tnum" fontSize={19} fontWeight={800} fill="#0F172A">
                {centerValue}
              </text>
            </>
          )}
        </g>
      </svg>
    </ChartFrame>
  );
}
