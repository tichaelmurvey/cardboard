import { TOOLTIP_BG, TOOLTIP_FG } from '../styles/style_consts';

interface TooltipProps {
    x: number;
    y: number;
    text: string;
}

export function Tooltip({ x, y, text }: TooltipProps) {
    return (
        <div style={{
            position: 'absolute',
            left: x + 12,
            top: y + 12,
            background: TOOLTIP_BG,
            color: TOOLTIP_FG,
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 12,
            pointerEvents: 'none',
            zIndex: 1000,
            whiteSpace: 'pre',
        }}><span>{text}</span></div>
    );
}
