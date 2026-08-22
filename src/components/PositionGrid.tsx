import React from 'react';
import { WatermarkPosition } from '../types';
import {
  ArrowUpLeft,
  ArrowUp,
  ArrowUpRight,
  ArrowLeft,
  Circle,
  ArrowRight,
  ArrowDownLeft,
  ArrowDown,
  ArrowDownRight,
} from 'lucide-react';

interface PositionGridProps {
  value: WatermarkPosition;
  onChange: (pos: WatermarkPosition) => void;
}

interface PositionOption {
  key: WatermarkPosition;
  label: string;
  icon: React.ReactNode;
}

const positions: PositionOption[] = [
  { key: 'top-left', label: 'Top Left', icon: <ArrowUpLeft className="w-4 h-4" /> },
  { key: 'top-center', label: 'Top Center', icon: <ArrowUp className="w-4 h-4" /> },
  { key: 'top-right', label: 'Top Right', icon: <ArrowUpRight className="w-4 h-4" /> },
  { key: 'center-left', label: 'Center Left', icon: <ArrowLeft className="w-4 h-4" /> },
  { key: 'center', label: 'Center', icon: <Circle className="w-3.5 h-3.5 fill-current" /> },
  { key: 'center-right', label: 'Center Right', icon: <ArrowRight className="w-4 h-4" /> },
  { key: 'bottom-left', label: 'Bottom Left', icon: <ArrowDownLeft className="w-4 h-4" /> },
  { key: 'bottom-center', label: 'Bottom Center', icon: <ArrowDown className="w-4 h-4" /> },
  { key: 'bottom-right', label: 'Bottom Right', icon: <ArrowDownRight className="w-4 h-4" /> },
];

export const PositionGrid: React.FC<PositionGridProps> = ({ value, onChange }) => {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Watermark Position</span>
        <span className="capitalize text-blue-600 font-mono font-semibold text-xs">{value.replace('-', ' ')}</span>
      </div>
      <div
        id="watermark-position-grid"
        className="grid grid-cols-3 gap-1 p-1.5 bg-slate-100 border border-slate-200 rounded-lg max-w-[180px]"
      >
        {positions.map((pos) => {
          const isSelected = value === pos.key;
          return (
            <button
              key={pos.key}
              id={`pos-btn-${pos.key}`}
              type="button"
              onClick={() => onChange(pos.key)}
              title={pos.label}
              className={`flex items-center justify-center h-8 rounded transition-all border ${
                isSelected
                  ? 'bg-blue-600 border-blue-600 text-white shadow-xs font-bold'
                  : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {pos.icon}
            </button>
          );
        })}
      </div>
    </div>
  );
};

