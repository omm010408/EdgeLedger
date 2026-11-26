'use client';

import React from 'react';
import { Download, Table2, BarChart3, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { serializeTableToCsv } from '@/lib/analytics/analyticsEngine';

export function formatCurrencySigned(value: number, signed = true): string {
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  if (value < 0) return `−$${formatted}`;
  if (signed && value > 0) return `+$${formatted}`;
  return `$${formatted}`;
}

export function formatPercentSigned(value: number, signed = true, decimals = 2): string {
  const abs = Math.abs(value).toFixed(decimals);
  if (value < 0) return `−${abs}%`;
  if (signed && value > 0) return `+${abs}%`;
  return `${abs}%`;
}

export function formatRSigned(value: number, signed = true): string {
  const abs = Math.abs(value).toFixed(2);
  if (value < 0) return `−${abs}R`;
  if (signed && value > 0) return `+${abs}R`;
  return `${abs}R`;
}

export function CurrencyText({
  amount,
  isPnlHidden,
  signed = true,
  className = '',
}: {
  amount: number;
  isPnlHidden: boolean;
  signed?: boolean;
  className?: string;
}) {
  return (
    <span className={`${className} ${isPnlHidden ? 'tw-pnl-blur' : ''}`.trim()}>
      {formatCurrencySigned(amount, signed)}
    </span>
  );
}

export function SampleStatusPill({
  n,
  insufficientLabel,
}: {
  n: number;
  insufficientLabel?: string;
}) {
  return (
    <span className="tw-ana-sample-row">
      <span className="tw-ana-n-chip">n = {n}</span>
      {insufficientLabel ? (
        <span className="tw-ana-badge warn">
          <AlertTriangle size={12} aria-hidden="true" />
          <span>{insufficientLabel}</span>
        </span>
      ) : n > 0 && n < 30 ? (
        <span className="tw-ana-badge warn">
          <AlertTriangle size={12} aria-hidden="true" />
          <span>Low sample (&lt; 30)</span>
        </span>
      ) : n >= 30 ? (
        <span className="tw-ana-badge ok">
          <CheckCircle2 size={12} aria-hidden="true" />
          <span>Sufficient sample</span>
        </span>
      ) : null}
    </span>
  );
}

export function downloadCsvFile(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number>>
): void {
  if (typeof window === 'undefined') return;
  const csv = serializeTableToCsv(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function resolveCssVariables(rawText: string, rootStyles: CSSStyleDeclaration): string {
  return rawText.replace(/var\((--[a-zA-Z0-9-_]+)(?:,\s*([^)]+))?\)/g, (_m, varName, fallback) => {
    const val = rootStyles.getPropertyValue(varName).trim();
    return val || fallback || '#888888';
  });
}

export function downloadSvgElementAsPng(svgEl: SVGSVGElement | null, filename: string): void {
  if (typeof window === 'undefined' || !svgEl) return;
  const rootStyles = window.getComputedStyle(document.documentElement);
  const tileBg = rootStyles.getPropertyValue('--tw-tile').trim() || '#0B1415';
  const clone = svgEl.cloneNode(true) as SVGSVGElement;

  const viewBox = svgEl.viewBox.baseVal;
  const width = viewBox && viewBox.width > 0 ? viewBox.width : svgEl.clientWidth || 800;
  const height = viewBox && viewBox.height > 0 ? viewBox.height : svgEl.clientHeight || 300;
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  const serialized = resolveCssVariables(new XMLSerializer().serializeToString(clone), rootStyles);
  const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = tileBg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) return;
        const pngUrl = URL.createObjectURL(pngBlob);
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(pngUrl);
      }, 'image/png');
    }
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

export function ChartHeaderBar({
  title,
  subtitle,
  unitLabel,
  n,
  insufficientLabel,
  viewMode,
  onToggleViewMode,
  onExportPng,
  onExportCsv,
  extraControls,
}: {
  title: string;
  subtitle?: string;
  unitLabel: string;
  n: number;
  insufficientLabel?: string;
  viewMode: 'chart' | 'table';
  onToggleViewMode: (next: 'chart' | 'table') => void;
  onExportPng?: () => void;
  onExportCsv?: () => void;
  extraControls?: React.ReactNode;
}) {
  return (
    <div className="tw-ana-mod-head">
      <div className="tw-ana-mod-titles">
        <div className="tw-ana-mod-toprow">
          <h2 className="tw-h">{title}</h2>
          <span className="tw-ana-unit-tag">{unitLabel}</span>
          <SampleStatusPill n={n} insufficientLabel={insufficientLabel} />
        </div>
        {subtitle && <p className="tw-ana-mod-sub">{subtitle}</p>}
      </div>
      <div className="tw-ana-mod-actions">
        {extraControls}
        <div className="tw-seg tw-ana-mini-seg" role="group" aria-label={`${title} display mode`}>
          <button
            type="button"
            className={viewMode === 'chart' ? 'on' : ''}
            aria-pressed={viewMode === 'chart'}
            onClick={() => onToggleViewMode('chart')}
          >
            <BarChart3 size={13} aria-hidden="true" />
            <span>Chart</span>
          </button>
          <button
            type="button"
            className={viewMode === 'table' ? 'on' : ''}
            aria-pressed={viewMode === 'table'}
            onClick={() => onToggleViewMode('table')}
          >
            <Table2 size={13} aria-hidden="true" />
            <span>Table</span>
          </button>
        </div>
        {onExportPng && viewMode === 'chart' && (
          <button
            type="button"
            className="tw-ana-icon-btn"
            onClick={onExportPng}
            aria-label={`Export ${title} chart as PNG`}
          >
            <Download size={13} aria-hidden="true" />
            <span>PNG</span>
          </button>
        )}
        {onExportCsv && (
          <button
            type="button"
            className="tw-ana-icon-btn"
            onClick={onExportCsv}
            aria-label={`Export ${title} data as CSV`}
          >
            <Download size={13} aria-hidden="true" />
            <span>CSV</span>
          </button>
        )}
      </div>
    </div>
  );
}
