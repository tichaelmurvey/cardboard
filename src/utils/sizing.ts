import type { GridCrop } from '../canvas/gridCrop';

/** Default dimensions per component type (pixels at scale=1). */
export const DEFAULT_SIZES: Record<string, { width: number; height: number }> = {
    card: { width: 100, height: 150 },
    token: { width: 80, height: 80 },
    board: { width: 800, height: 800 },
    deck: { width: 100, height: 150 },
    stack: { width: 80, height: 80 },
};

/**
 * Compute the display size for a game component.
 *
 * - If sizeX/sizeY are provided, they override the defaults.
 * - If an image is present, scale its longest side to match the longest
 *   of the (possibly overridden) target dimensions, preserving aspect ratio.
 * - If no image, return the target dimensions directly.
 */
export function computeComponentSize(
    defaultWidth: number,
    defaultHeight: number,
    image: HTMLImageElement | undefined,
    gridCrop?: GridCrop,
    sizeX?: number,
    sizeY?: number,
): { width: number; height: number } {
    const targetW = sizeX ?? defaultWidth;
    const targetH = sizeY ?? defaultHeight;

    if (!image) return { width: targetW, height: targetH };

    let imgW = image.naturalWidth;
    let imgH = image.naturalHeight;
    if (gridCrop) {
        imgW /= gridCrop.gridNumWidth;
        imgH /= gridCrop.gridNumHeight;
    }
    if (imgW <= 0 || imgH <= 0) return { width: targetW, height: targetH };

    const maxSide = Math.max(targetW, targetH);
    const aspect = imgW / imgH;
    if (imgW >= imgH) {
        return { width: maxSide, height: maxSide / aspect };
    } else {
        return { width: maxSide * aspect, height: maxSide };
    }
}
