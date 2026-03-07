import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import './CustomSelect.css';

export interface SelectOption {
    value: string;
    label: string;
    subtitle?: string;
}

interface CustomSelectProps {
    value: string;
    options: SelectOption[];
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    menuClassName?: string;
}

export function CustomSelect({
    value,
    options,
    onChange,
    placeholder = 'Select...',
    disabled = false,
    className = '',
    menuClassName = ''
}: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.value === value);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (optionValue: string) => {
        onChange(optionValue);
        setIsOpen(false);
    };

    return (
        <div
            className={`custom-select-container ${disabled ? 'disabled' : ''} ${className}`}
            ref={containerRef}
            onClick={() => !disabled && setIsOpen(!isOpen)}
        >
            <div className={`custom-select-trigger ${isOpen ? 'open' : ''}`}>
                <div className="custom-select-content">
                    {selectedOption ? (
                        <span className="custom-select-value">{selectedOption.label}</span>
                    ) : (
                        <span className="custom-select-placeholder">{placeholder}</span>
                    )}
                </div>
                <ChevronDown size={14} className={`custom-select-icon ${isOpen ? 'rotated' : ''}`} />
            </div>

            {isOpen && !disabled && (
                <div className={`custom-select-menu ${menuClassName}`}>
                    {options.length === 0 ? (
                        <div className="custom-select-empty">No options available</div>
                    ) : (
                        options.map((option) => (
                            <div
                                key={option.value}
                                className={`custom-select-option ${value === option.value ? 'selected' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelect(option.value);
                                }}
                            >
                                <div className="custom-select-option-text">
                                    <span className="custom-select-option-label">{option.label}</span>
                                    {option.subtitle && <span className="custom-select-option-subtitle">{option.subtitle}</span>}
                                </div>
                                {value === option.value && <Check size={14} className="custom-select-check" />}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
