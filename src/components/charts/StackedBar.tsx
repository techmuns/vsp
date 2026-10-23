import { useState } from 'react';
import { useElementWidth, useTip, ChartFrame } from './ChartBase';

export interface StackSegment {
  key: string;
  label: string;
  value: number;
  color: string;
  note?: string;
}

interface Props {
  segments: StackSegment[];
  format: (n: number) => string;
  height?: number;
  showShareLabels?: boolean;
  rounded?: boolean;
}

/** A single horizontal 100%-stacked bar — great for share-of-spend. */
export function StackedBar({ segments, format, height = 46, showShareLabels = true, rounded = true }: Props) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const [active, setActive] = useState<string | null>(null);

  const total = segments.reduce((s, d) => s + d.value, 0) || 1;
  const barH = height;
  const w = width;
  let xcur = 0;

  const moveTip = (e: React.MouseEvent, seg: StackSegment, frac: number) => {
    const rect = ref.current?.getBoundingClientRect();
    show(rect ? e.clientX - rect.left : 0, barH / 2, {
      title: seg.label,
      color: seg.color,
      rows: [
        { label: 'Amount', value: format(seg.value) },
        { label: 'Share', value: `${(frac * 100).toFixed(1)}%` },
      ],
      note: seg.note,
    });
  };

  return (
    <ChartFrame innerRef={ref} tip={tip} width={width}>
      <svg width={w} height={barH} role="img">
        {segments.map((seg, i) => {
          const frac = seg.value / total;
          const segW = Math.max(0, frac * w);
          const x = xcur;
          xcur += segW;
          const isFirst = i === 0;
          const isLast = i === segments.length - 1;
          const r = rounded ? 6 : 0;
          const showLabel = showShareLabels && segW > 42;
          return (
            <g
              key={seg.key}
              onMouseMove={(e) => moveTip(e, seg, frac)}
              onMouseEnter={() => setActive(seg.key)}
              onMouseLeave={() => {
                setActive(null);
                hide();
              }}
              style={{ cursor: 'default' }}
            >
              <path
                className="anim-bar-h"
                style={{ animationDelay: `${i * 60}ms`, transformOrigin: 'left center' }}
                d={roundedSeg(x, 0, segW, barH, isFirst ? r : 0, isLast ? r : 0)}
                fill={seg.color}
                opacity={active && active !== seg.key ? 0.72 : 1}
                stroke="#fff"
                strokeWidth={1}
              />
              {showLabel && (
                <text x={x + segW / 2} y={barH / 2 + 4} textAnchor="middle" className="tnum" fontSize={11.5} fontWeight={700} fill="#fff">
                  {(frac * 100).toFixed(0)}%
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </ChartFrame>
  );
}

function roundedSeg(x: number, y: number, w: number, h: number, rl: number, rr: number): string {
  if (w <= 0) return '';
  rl = Math.min(rl, w / 2, h / 2);
  rr = Math.min(rr, w / 2, h / 2);
  return [
    `M ${x + rl} ${y}`,
    `H ${x + w - rr}`,
    rr ? `Q ${x + w} ${y} ${x + w} ${y + rr}` : '',
    `V ${y + h - rr}`,
    rr ? `Q ${x + w} ${y + h} ${x + w - rr} ${y + h}` : '',
    `H ${x + rl}`,
    rl ? `Q ${x} ${y + h} ${x} ${y + h - rl}` : '',
    `V ${y + rl}`,
    rl ? `Q ${x} ${y} ${x + rl} ${y}` : '',
    'Z',
  ].join(' ');
}
