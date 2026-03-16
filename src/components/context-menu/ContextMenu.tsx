export interface ContextMenuItem {
    label: string;
    action: () => void;
}

interface ContextMenuProps {
    x: number;
    y: number;
    heading?: string;
    subheading?: string;
    items: ContextMenuItem[];
}

export function ContextMenu({ x, y, heading, subheading, items }: ContextMenuProps) {
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
                padding: 4,
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
            }}
        >
            {(heading || subheading) && (
                <div style={{
                    padding: '2px 12px 4px',
                    borderBottom: '1px solid #c08030',
                }}>
                    {heading && <div style={{ fontSize: 13, fontWeight: 'bold' }}>{heading}</div>}
                    {subheading && <div style={{ fontSize: 11, opacity: 0.7 }}>{subheading}</div>}
                </div>
            )}
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
