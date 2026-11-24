'use client';

import React from 'react';
import { useTrading } from '../../context/TradingContext';
import { X, ShieldAlert, CheckCircle, AlertTriangle, Info, BellOff } from 'lucide-react';

interface RiskAlertsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RiskAlertsDrawer: React.FC<RiskAlertsDrawerProps> = ({ isOpen, onClose }) => {
  const { riskAlerts, dismissAlert } = useTrading();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-md h-full bg-edge-surface border-l border-edge-border shadow-terminal flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-edge-border bg-edge-surface-secondary/50">
          <div className="flex items-center space-x-2">
            <ShieldAlert size={18} className="text-edge-accent" />
            <h2 className="font-mono text-xs font-bold tracking-wider text-white uppercase">
              RISK ENGINE & COMPLIANCE ALERTS ({riskAlerts.length})
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-edge-text-secondary hover:text-white p-1 rounded hover:bg-edge-surface-secondary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {riskAlerts.length === 0 ? (
            <div className="text-center py-16 text-edge-text-muted font-mono">
              <CheckCircle size={32} className="mx-auto mb-2 text-edge-profit/60" />
              <p className="text-xs">No active risk violations or warnings.</p>
              <p className="text-[10px] mt-1">All accounts are operating within approved parameters.</p>
            </div>
          ) : (
            riskAlerts.map((alert) => {
              const isCrit = alert.severity === 'critical';
              const isWarn = alert.severity === 'warning';

              return (
                <div
                  key={alert.id}
                  className={`p-3.5 rounded border text-xs font-mono space-y-2 transition-all ${
                    isCrit
                      ? 'bg-edge-loss/10 border-edge-loss/50 text-white'
                      : isWarn
                      ? 'bg-edge-warning/10 border-edge-warning/50 text-white'
                      : 'bg-edge-surface-secondary/60 border-edge-border text-edge-text-secondary'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      {isCrit ? (
                        <AlertTriangle size={15} className="text-edge-loss shrink-0" />
                      ) : isWarn ? (
                        <AlertTriangle size={15} className="text-edge-warning shrink-0" />
                      ) : (
                        <Info size={15} className="text-edge-accent shrink-0" />
                      )}
                      <span className="font-bold tracking-wide uppercase text-[11px]">
                        {alert.title}
                      </span>
                    </div>

                    <button
                      onClick={() => dismissAlert(alert.id)}
                      className="text-edge-text-muted hover:text-white p-0.5 rounded transition-colors"
                      title="Acknowledge Alert"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <p className="text-[11px] text-edge-text-secondary leading-relaxed font-sans">
                    {alert.description}
                  </p>

                  <div className="flex items-center justify-between pt-1 border-t border-edge-border/40 text-[10px] text-edge-text-muted">
                    <span>{alert.accountName}</span>
                    <span>{new Date(alert.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-edge-border bg-edge-surface-secondary/30 text-[10px] font-mono text-edge-text-muted flex justify-between items-center">
          <span>Continuous risk recalculation active</span>
          <button
            onClick={() => riskAlerts.forEach((a) => dismissAlert(a.id))}
            className="text-edge-accent hover:underline flex items-center space-x-1"
          >
            <BellOff size={11} />
            <span>Clear All</span>
          </button>
        </div>
      </div>
    </div>
  );
};
