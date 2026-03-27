// src/renderer/src/components/QualitySelect.tsx

import React from 'react';
import './QualitySelect.css';

interface QualityOption {
  value: number;
  label: string;
}

interface QualitySelectProps {
  value: number;
  onChange: (value: number) => void;
  options: QualityOption[];
}

export default function QualitySelect({ value, onChange, options }: QualitySelectProps) {
  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className="quality-select">
      <select
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="quality-dropdown"
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="select-arrow">▼</div>
    </div>
  );
}
