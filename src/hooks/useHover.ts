import { useState, useCallback, useMemo } from "react";

export function useHover() {
    const [hovered, setHovered] = useState(false);
    const onMouseEnter = useCallback(() => setHovered(true), []);
    const onMouseLeave = useCallback(() => setHovered(false), []);
    const hoverProps = useMemo(() => ({ onMouseEnter, onMouseLeave }), [onMouseEnter, onMouseLeave]);
    return { hovered, hoverProps };
}
