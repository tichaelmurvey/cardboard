export interface GridCrop {
    gridCol: number;
    gridRow: number;
    gridNumWidth: number;
    gridNumHeight: number;
}

export function useCropProps(image: HTMLImageElement | undefined, crop?: GridCrop) {
    if (!image || !crop) return undefined;
    const cellW = image.naturalWidth / crop.gridNumWidth;
    const cellH = image.naturalHeight / crop.gridNumHeight;
    return {
        cropX: crop.gridCol * cellW,
        cropY: crop.gridRow * cellH,
        cropWidth: cellW,
        cropHeight: cellH,
    };
}

export function gridCropEqual(a?: GridCrop, b?: GridCrop): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return a.gridCol === b.gridCol && a.gridRow === b.gridRow
        && a.gridNumWidth === b.gridNumWidth && a.gridNumHeight === b.gridNumHeight;
}

export function buildGridCrop(props: Record<string, unknown>, prefix = ''): GridCrop | undefined {
    const col = props[prefix + 'gridCol'] ?? props[prefix + 'GridCol'];
    if (col == null) return undefined;
    return {
        gridCol: col as number,
        gridRow: (props[prefix + 'gridRow'] ?? props[prefix + 'GridRow']) as number,
        gridNumWidth: (props[prefix + 'gridNumWidth'] ?? props[prefix + 'GridNumWidth']) as number,
        gridNumHeight: (props[prefix + 'gridNumHeight'] ?? props[prefix + 'GridNumHeight']) as number,
    };
}
