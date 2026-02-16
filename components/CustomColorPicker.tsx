import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './Icon';

interface CustomColorPickerProps {
    color: string;
    onChange: (color: string) => void;
}

export const CustomColorPicker: React.FC<CustomColorPickerProps> = ({ color, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Initial HSV conversion
    const [hsv, setHsv] = useState(() => hexToHsv(color));

    useEffect(() => {
        setHsv(hexToHsv(color));
    }, [color]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const handleHsvChange = (newHsv: { h: number, s: number, v: number }) => {
        setHsv(newHsv);
        onChange(hsvToHex(newHsv.h, newHsv.s, newHsv.v));
    };

    return (
        <div className="relative" ref={containerRef}>
            {/* Color Preview / Trigger */}
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="w-10 h-10 rounded-full cursor-pointer ring-1 ring-border-light border-2 border-bg-surface overflow-hidden relative transition-transform active:scale-95 hover:scale-105"
                style={{ backgroundColor: color }}
            >
                {/* Rainbow sheen for visual interest if wanted, otherwise just pure color */}
                <div className="absolute inset-0 ring-inset ring-1 ring-black/10 dark:ring-white/10 rounded-full" />
            </div>

            {/* Popover */}
            {isOpen && (
                <div
                    className="absolute top-12 left-0 z-[60] p-3 bg-bg-surface border border-border-light rounded-xl shadow-2xl animate-fade-in w-[240px]"
                    style={{
                        // Ensure it's above everything
                        // Use a portal if necessary, but fixed z-index is requested
                    }}
                >
                    <SaturationPicker
                        hsv={hsv}
                        onChange={handleHsvChange}
                    />
                    <HueSlider
                        h={hsv.h}
                        onChange={(h) => handleHsvChange({ ...hsv, h })}
                    />
                    {/* Arrow */}
                    <div className="absolute -top-2 left-4 w-4 h-4 bg-bg-surface border-t border-l border-border-light transform rotate-45" />
                </div>
            )}
        </div>
    );
};

// --- Sub-components ---

const SaturationPicker: React.FC<{ hsv: { h: number, s: number, v: number }, onChange: (hsv: { h: number, s: number, v: number }) => void }> = ({ hsv, onChange }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);

    const handleMove = (e: MouseEvent | React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();

        let x = (e.clientX - rect.left) / rect.width;
        let y = (e.clientY - rect.top) / rect.height;

        x = Math.max(0, Math.min(1, x));
        y = Math.max(0, Math.min(1, y));

        // x is Saturation, y is Value (inverted)
        const s = Math.round(x * 100);
        const v = Math.round((1 - y) * 100);

        onChange({ ...hsv, s, v });
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        isDragging.current = true;
        handleMove(e);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (isDragging.current) handleMove(e);
    };

    const handleMouseUp = () => {
        isDragging.current = false;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };

    return (
        <div
            className="w-full h-32 rounded-lg cursor-crosshair relative mb-3 overflow-hidden select-none"
            style={{ backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }}
            ref={containerRef}
            onMouseDown={handleMouseDown}
        >
            <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />

            <div
                className="absolute w-4 h-4 border-2 border-white rounded-full shadow-sm -ml-2 -mt-2 pointer-events-none transform transition-transform will-change-transform"
                style={{
                    left: `${hsv.s}%`,
                    top: `${100 - hsv.v}%`,
                    backgroundColor: hsvToHex(hsv.h, hsv.s, hsv.v)
                }}
            />
        </div>
    );
};

const HueSlider: React.FC<{ h: number, onChange: (h: number) => void }> = ({ h, onChange }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);

    const handleMove = (e: MouseEvent | React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();

        let x = (e.clientX - rect.left) / rect.width;
        x = Math.max(0, Math.min(1, x));

        const newHue = Math.round(x * 360);
        onChange(newHue);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        isDragging.current = true;
        handleMove(e);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (isDragging.current) handleMove(e);
    };

    const handleMouseUp = () => {
        isDragging.current = false;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };

    return (
        <div
            className="w-full h-4 rounded-full cursor-pointer relative select-none"
            style={{
                background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)'
            }}
            ref={containerRef}
            onMouseDown={handleMouseDown}
        >
            <div
                className="absolute w-4 h-4 bg-white border border-black/20 rounded-full shadow-sm -ml-2 top-0 pointer-events-none"
                style={{ left: `${(h / 360) * 100}%` }}
            />
        </div>
    );
};


// --- Helpers ---

function hexToHsv(hex: string) {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
        r = parseInt("0x" + hex[1] + hex[1]);
        g = parseInt("0x" + hex[2] + hex[2]);
        b = parseInt("0x" + hex[3] + hex[3]);
    } else if (hex.length === 7) {
        r = parseInt("0x" + hex[1] + hex[2]);
        g = parseInt("0x" + hex[3] + hex[4]);
        b = parseInt("0x" + hex[5] + hex[6]);
    }
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max === min) {
        h = 0; // achromatic
    } else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), v: Math.round(v * 100) };
}

function hsvToHex(h: number, s: number, v: number): string {
    let r, g, b, i, f, p, q, t;
    h = h / 360;
    s = s / 100;
    v = v / 100;
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
        default: r = 0; g = 0; b = 0;
    }

    // Safety check for NaN or undefined
    if (isNaN(r!)) r = 0;
    if (isNaN(g!)) g = 0;
    if (isNaN(b!)) b = 0;

    const toHex = (x: number) => {
        const val = Math.round(x * 255).toString(16);
        return val.length === 1 ? '0' + val : val;
    };
    return `#${toHex(r!)}${toHex(g!)}${toHex(b!)}`;
}
