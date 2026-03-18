import type { EditorDraft } from '../components/editor/EditorModal';

export function draftFromProps(props: Record<string, unknown>, defaultScale: string = '1'): EditorDraft {
    return {
        name: (props.name as string) ?? '',
        text: (props.text as string) ?? '',
        scale: props.scale != null ? String(props.scale) : defaultScale,
        imageSrc: (props.src as string) ?? (props.imageSrc as string) ?? '',
        gridNumWidth: props.gridNumWidth != null ? String(props.gridNumWidth) : '',
        gridNumHeight: props.gridNumHeight != null ? String(props.gridNumHeight) : '',
        gridCol: props.gridCol != null ? String(props.gridCol) : '',
        gridRow: props.gridRow != null ? String(props.gridRow) : '',
        hasBack: !!(props.hasBack),
        backImageSrc: (props.backImageSrc as string) ?? '',
        backText: (props.backText as string) ?? '',
        backGridNumWidth: props.backGridNumWidth != null ? String(props.backGridNumWidth) : '',
        backGridNumHeight: props.backGridNumHeight != null ? String(props.backGridNumHeight) : '',
        backGridCol: props.backGridCol != null ? String(props.backGridCol) : '',
        backGridRow: props.backGridRow != null ? String(props.backGridRow) : '',
        flipped: !!(props.flipped),
        customSizing: !!(props.customSizing),
        sizeX: props.sizeX != null ? String(props.sizeX) : '',
        sizeY: props.sizeY != null ? String(props.sizeY) : '',
    };
}

export function draftToUpdates(draft: EditorDraft, existingProps?: Record<string, unknown>): Record<string, unknown> {
    const updates: Record<string, unknown> = {};
    if (draft.name) updates.name = draft.name;
    if (draft.text) updates.text = draft.text;
    const scaleVal = parseFloat(draft.scale);
    if (!isNaN(scaleVal) && scaleVal > 0) updates.scale = scaleVal;
    if (draft.imageSrc) {
        const imageKey = existingProps && 'src' in existingProps ? 'src' : 'imageSrc';
        updates[imageKey] = draft.imageSrc;
    }
    const gnw = parseInt(draft.gridNumWidth);
    const gnh = parseInt(draft.gridNumHeight);
    if (!isNaN(gnw) && gnw > 0 && !isNaN(gnh) && gnh > 0) {
        updates.gridNumWidth = gnw;
        updates.gridNumHeight = gnh;
        const gc = parseInt(draft.gridCol);
        const gr = parseInt(draft.gridRow);
        updates.gridCol = !isNaN(gc) ? gc : 0;
        updates.gridRow = !isNaN(gr) ? gr : 0;
    } else {
        updates.gridNumWidth = undefined;
        updates.gridNumHeight = undefined;
        updates.gridCol = undefined;
        updates.gridRow = undefined;
    }
    updates.hasBack = draft.hasBack;
    updates.backImageSrc = draft.hasBack ? draft.backImageSrc : '';
    updates.backText = draft.hasBack ? draft.backText : '';
    if (draft.hasBack) {
        const bgnw = parseInt(draft.backGridNumWidth);
        const bgnh = parseInt(draft.backGridNumHeight);
        if (!isNaN(bgnw) && bgnw > 0 && !isNaN(bgnh) && bgnh > 0) {
            updates.backGridNumWidth = bgnw;
            updates.backGridNumHeight = bgnh;
            const bgc = parseInt(draft.backGridCol);
            const bgr = parseInt(draft.backGridRow);
            updates.backGridCol = !isNaN(bgc) ? bgc : 0;
            updates.backGridRow = !isNaN(bgr) ? bgr : 0;
        } else {
            updates.backGridNumWidth = undefined;
            updates.backGridNumHeight = undefined;
            updates.backGridCol = undefined;
            updates.backGridRow = undefined;
        }
    } else {
        updates.backGridNumWidth = undefined;
        updates.backGridNumHeight = undefined;
        updates.backGridCol = undefined;
        updates.backGridRow = undefined;
    }
    updates.flipped = draft.flipped;
    updates.customSizing = draft.customSizing;
    if (draft.customSizing) {
        const x = parseFloat(draft.sizeX);
        const y = parseFloat(draft.sizeY);
        if (!isNaN(x) && x > 0) updates.sizeX = x;
        if (!isNaN(y) && y > 0) updates.sizeY = y;
    }
    return updates;
}
