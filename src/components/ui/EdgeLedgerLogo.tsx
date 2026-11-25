import React, { useId } from 'react';

interface EdgeLedgerLogoProps {
  className?: string;
  size?: number;
  title?: string;
}

/**
 * Geometric slanted "EL" monogram logo matching the EdgeLedger brand mark
 * with transparent background and theme-aware faceted shading.
 */
export const EdgeLedgerLogo: React.FC<EdgeLedgerLogoProps> = ({
  className = '',
  size = 28,
  title = 'EdgeLedger',
}) => {
  const uid = useId().replace(/:/g, '');
  const topGradId = `${uid}-top`;
  const bodyGradId = `${uid}-body`;
  const lGradId = `${uid}-l`;
  const height = Math.round((size * 76) / 128);

  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 128 76"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`el-logo ${className}`.trim()}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={topGradId} x1="48" y1="8" x2="96" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" style={{ stopColor: 'var(--el-top-start, currentColor)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--el-top-end, currentColor)' }} />
        </linearGradient>
        <linearGradient id={bodyGradId} x1="40" y1="26" x2="12" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0%" style={{ stopColor: 'var(--el-body-start, currentColor)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--el-body-end, currentColor)' }} />
        </linearGradient>
        <linearGradient id={lGradId} x1="88" y1="22" x2="112" y2="68" gradientUnits="userSpaceOnUse">
          <stop offset="0%" style={{ stopColor: 'var(--el-l-start, currentColor)' }} />
          <stop offset="65%" style={{ stopColor: 'var(--el-l-end, currentColor)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--el-top-start, currentColor)' }} />
        </linearGradient>
      </defs>
      {/* Top slanted bar of E */}
      <polygon points="50,8 98,8 86,20 38,20" fill={`url(#${topGradId})`} />
      {/* Lower connected body of E */}
      <polygon
        points="42,29 78,29 66,41 47,41 32,56 72,56 72,68 4,68"
        fill={`url(#${bodyGradId})`}
      />
      {/* Slanted L */}
      <polygon
        points="92,22 92,56 124,56 112,68 80,68 80,34"
        fill={`url(#${lGradId})`}
      />
      {/* Subtle diagonal miter bevel on L corner */}
      <polygon
        points="80,68 92,56 124,56 112,68"
        fill="var(--el-top-start, currentColor)"
        fillOpacity="0.28"
      />
    </svg>
  );
};
