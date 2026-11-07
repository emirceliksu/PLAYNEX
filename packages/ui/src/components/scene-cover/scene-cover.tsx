import { cn } from '../../lib/cn';

export interface SceneShape {
  // Outline in world units with y pointing up, already placed and rotated.
  points: [number, number][];
  fill: string;
}

export interface SceneCoverProps {
  width: number;
  height: number;
  background: string;
  shapes: SceneShape[];
  title: string;
  className?: string;
}

// Covers for player-made games are drawn from the scene itself: the same flat
// shapes, ink outline and offset shadow as the hand-drawn catalog covers.
export function SceneCover({
  width,
  height,
  background,
  shapes,
  title,
  className,
}: SceneCoverProps) {
  const aspect = 16 / 10;
  const viewWidth = Math.max(width, height * aspect);
  const viewHeight = viewWidth / aspect;
  const stroke = viewWidth / 160;
  const path = (points: [number, number][]) => points.map(([x, y]) => `${x},${-y}`).join(' ');

  return (
    <svg
      role="img"
      aria-label={title}
      viewBox={`${-viewWidth / 2} ${-viewHeight / 2} ${viewWidth} ${viewHeight}`}
      preserveAspectRatio="xMidYMid slice"
      className={cn('block aspect-[16/10] w-full', className)}
    >
      <rect
        x={-viewWidth / 2}
        y={-viewHeight / 2}
        width={viewWidth}
        height={viewHeight}
        fill={background}
      />
      <g transform={`translate(${stroke * 1.5} ${stroke * 1.5})`} className="fill-surface-canvas">
        {shapes.map((shape, index) => (
          <polygon key={index} points={path(shape.points)} />
        ))}
      </g>
      {shapes.map((shape, index) => (
        <polygon
          key={index}
          points={path(shape.points)}
          fill={shape.fill}
          className="stroke-surface-canvas"
          strokeWidth={stroke}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
