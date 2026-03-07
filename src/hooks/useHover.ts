import { useState } from "react";

export function useHover() {
    const [hovered, setHovered] = useState(false);
    return {
        hovered,
        hoverProps: {
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => setHovered(false),
        },
    };
}
