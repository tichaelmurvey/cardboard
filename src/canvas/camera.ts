export const BG_SIZE = Math.max(window.innerWidth, window.innerHeight) / 0.1;
export const ZOOM_FACTOR = 1.1;
export const PAN_SPEED = 8;
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 10;

export function clampPosition(x: number, y: number, scale: number) {
    const half = BG_SIZE / 2;
    const minX = -(half * scale - window.innerWidth);
    const maxX = half * scale;
    const minY = -(half * scale - window.innerHeight);
    const maxY = half * scale;
    return {
        x: Math.min(maxX, Math.max(minX, x)),
        y: Math.min(maxY, Math.max(minY, y)),
    };
}
