export type Rect2D = { x: number; y: number; width: number; height: number };

export function rectsOverlap50(a: Rect2D, b: Rect2D) {
    const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    const overlapArea = overlapX * overlapY;
    const smallerArea = Math.min(a.width * a.height, b.width * b.height);
    return smallerArea > 0 && overlapArea >= smallerArea * 0.5;
}

export function rectsIntersect(a: Rect2D, b: Rect2D) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
