import type { CanvasState, Instance, Prototype } from './types';
import { resolveProps } from './types';

type SetState = React.Dispatch<React.SetStateAction<CanvasState>>;
type SetIds = React.Dispatch<React.SetStateAction<Set<string>>>;

export function isLocked(instances: Map<string, Instance>, id: string): boolean {
    const inst = instances.get(id);
    return !!(inst?.props?.locked);
}

export function toggleLock(setState: SetState, id: string) {
    setState(prev => {
        const inst = prev.instances.get(id);
        if (!inst) return prev;
        const next = new Map(prev.instances);
        next.set(id, { ...inst, props: { ...inst.props, locked: !inst.props?.locked } });
        return { ...prev, instances: next };
    });
}

export function removeFromSelection(setSelectedIds: SetIds, ids: Iterable<string>) {
    setSelectedIds(prev => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
    });
}

export function deleteInstances(setState: SetState, setSelectedIds: SetIds, ids: Set<string>) {
    if (ids.size === 0) return;
    setState(prev => {
        const next = new Map(prev.instances);
        for (const id of ids) next.delete(id);
        return { ...prev, instances: next };
    });
    removeFromSelection(setSelectedIds, ids);
}

export function deleteSelected(setState: SetState, setSelectedIds: SetIds, ids: Set<string>) {
    if (ids.size === 0) return;
    setState(prev => {
        const next = new Map(prev.instances);
        for (const id of ids) next.delete(id);
        return { ...prev, instances: next, hiddenRegions: (prev.hiddenRegions ?? []).filter(r => !ids.has(r.id)) };
    });
    removeFromSelection(setSelectedIds, ids);
}

export function flipInstances(setState: SetState, prototypeMap: Map<string, Prototype>, ids: Set<string>) {
    if (ids.size === 0) return;
    setState(prev => {
        const next = new Map(prev.instances);
        for (const id of ids) {
            const inst = next.get(id);
            if (!inst) continue;
            const proto = prototypeMap.get(inst.prototypeId);
            if (!proto || !resolveProps(proto, inst).hasBack) continue;
            next.set(id, { ...inst, props: { ...inst.props, flipped: !inst.props?.flipped } });
        }
        return { ...prev, instances: next };
    });
}

export function scaleInstances(setState: SetState, ids: Set<string>, factor: number) {
    if (ids.size === 0) return;
    setState(prev => {
        const next = new Map(prev.instances);
        for (const id of ids) {
            const inst = next.get(id);
            if (!inst) continue;
            const current = (inst.props?.scale as number) ?? 1;
            next.set(id, { ...inst, props: { ...inst.props, scale: current * factor } });
        }
        return { ...prev, instances: next };
    });
}

export function pasteAt(
    setState: SetState,
    setSelectedIds: SetIds,
    setClipboard: React.Dispatch<React.SetStateAction<Instance[]>>,
    clipboard: Instance[],
    stageX: number,
    stageY: number,
) {
    if (clipboard.length === 0) return;
    const cx = clipboard.reduce((s, i) => s + i.x, 0) / clipboard.length;
    const cy = clipboard.reduce((s, i) => s + i.y, 0) / clipboard.length;
    const dx = stageX - cx;
    const dy = stageY - cy;
    const newInstances = clipboard.map(inst => ({
        ...inst,
        id: crypto.randomUUID(),
        x: inst.x + dx,
        y: inst.y + dy,
        props: inst.props ? { ...inst.props, locked: undefined } : undefined,
    }));
    setState(prev => {
        const next = new Map(prev.instances);
        for (const inst of newInstances) next.set(inst.id, inst);
        return { ...prev, instances: next };
    });
    setSelectedIds(new Set(newInstances.map(i => i.id)));
    setClipboard(newInstances);
}
