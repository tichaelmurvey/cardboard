export interface ContextMenuItem {
    label: string;
    action: () => void;
}

interface ContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
}

export function ContextMenu({ x, y, items }: ContextMenuProps) {
    if (items.length === 0) return null;

    return (
        <div
            onMouseDown={e => e.stopPropagation()}
            style={{
                position: 'absolute',
                left: x,
                top: y,
                zIndex: 2000,
                background: '#f3b963',
                color: '#130101',
                border: '2px double #ffe600',
                borderRadius: 6,
                padding: 4,
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
            }}
        >
            {items.map(item => (
                <button
                    key={item.label}
                    onClick={item.action}
                    style={{
                        padding: '4px 12px',
                        background: 'transparent',
                        border: 'none',
                        color: '#130101',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: 13,
                        borderRadius: 4,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#e0a040')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                    {item.label}
                </button>
            ))}
        </div>
    );
}
