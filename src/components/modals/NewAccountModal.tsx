'use client';

import React, { useState } from 'react';
import { useTrading } from '../../context/TradingContext';
import { AccountType } from '../../lib/types/financial';
import { X, Shield, Plus, Building } from 'lucide-react';

interface NewAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewAccountModal: React.FC<NewAccountModalProps> = ({ isOpen, onClose }) => {
  const { addAccount } = useTrading();

  const [name, setName] = useState('');
  const [brokerOrFirm, setBrokerOrFirm] = useState('Apex Trader Funding');
  const [accountType, setAccountType] = useState<AccountType>('prop_evaluation');
  const [accountSize, setAccountSize] = useState('100000');
  const [currency, setCurrency] = useState('USD');
  const [challengePhase, setChallengePhase] = useState('Phase 1');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const size = parseFloat(accountSize) || 100000;
    addAccount({
      name: name || `${brokerOrFirm} $${(size / 1000).toFixed(0)}k`,
      brokerOrFirm,
      accountType,
      accountSize: size,
      currency,
      challengePhase,
      notes,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg rounded-lg border border-edge-border bg-edge-surface shadow-terminal text-xs">
        <div className="flex items-center justify-between p-4 border-b border-edge-border bg-edge-surface-secondary/50">
          <div className="flex items-center space-x-2">
            <Building size={16} className="text-edge-accent" />
            <h2 className="font-mono text-sm font-bold tracking-wider text-white uppercase">
              PROVISION TRADING DESK ACCOUNT
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-edge-text-secondary hover:text-white p-1 rounded hover:bg-edge-surface-secondary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block font-mono text-[10px] text-edge-text-muted uppercase mb-1">
              Account Label
            </label>
            <input
              type="text"
              placeholder="e.g. Apex 100K Funded Live #1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded bg-edge-surface-secondary border border-edge-border text-white font-mono focus:border-edge-accent outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-[10px] text-edge-text-muted uppercase mb-1">
                Broker / Prop Firm
              </label>
              <input
                type="text"
                placeholder="e.g. FTMO, Apex, Topstep, IC Markets"
                value={brokerOrFirm}
                onChange={(e) => setBrokerOrFirm(e.target.value)}
                className="w-full px-3 py-2 rounded bg-edge-surface-secondary border border-edge-border text-white font-mono focus:border-edge-accent outline-none"
                required
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] text-edge-text-muted uppercase mb-1">
                Account Category
              </label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as AccountType)}
                className="w-full px-3 py-2 rounded bg-edge-surface-secondary border border-edge-border text-white font-mono focus:border-edge-accent outline-none"
              >
                <option value="prop_evaluation">Prop Evaluation (Challenge)</option>
                <option value="prop_verification">Prop Verification (Phase 2)</option>
                <option value="funded">Funded Account (Live / Sim)</option>
                <option value="instant_funding">Instant Funding</option>
                <option value="personal">Personal Capital / ECN</option>
                <option value="demo">Demo / Practice</option>
                <option value="custom">Custom Portfolio</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block font-mono text-[10px] text-edge-text-muted uppercase mb-1">
                Account Capital Size ($)
              </label>
              <input
                type="number"
                step="1000"
                value={accountSize}
                onChange={(e) => setAccountSize(e.target.value)}
                className="w-full px-3 py-2 rounded bg-edge-surface-secondary border border-edge-border text-white font-mono focus:border-edge-accent outline-none tabular-nums"
                required
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] text-edge-text-muted uppercase mb-1">
                Base Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 rounded bg-edge-surface-secondary border border-edge-border text-white font-mono focus:border-edge-accent outline-none"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="AUD">AUD ($)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-mono text-[10px] text-edge-text-muted uppercase mb-1">
              Phase or Status Label
            </label>
            <input
              type="text"
              placeholder="e.g. Phase 1, Phase 2, Funded, Live Master"
              value={challengePhase}
              onChange={(e) => setChallengePhase(e.target.value)}
              className="w-full px-3 py-2 rounded bg-edge-surface-secondary border border-edge-border text-white font-mono focus:border-edge-accent outline-none"
            />
          </div>

          <div>
            <label className="block font-mono text-[10px] text-edge-text-muted uppercase mb-1">
              Account Strategy & Rules Notes
            </label>
            <textarea
              rows={2}
              placeholder="e.g. 5% trailing drawdown, 5% daily loss limit, $4,000 target"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded bg-edge-surface-secondary border border-edge-border text-white text-xs outline-none focus:border-edge-accent"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-2 border-t border-edge-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded text-edge-text-secondary hover:text-white font-mono transition-colors"
            >
              CANCEL
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded bg-edge-accent text-edge-bg font-mono font-bold tracking-wider hover:bg-edge-accent-light transition-colors shadow-subtle"
            >
              CREATE ACCOUNT
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
