import type Konva from 'konva';
import type { CanvasState, Instance, Prototype } from './types';
import { getInstanceType } from './types';
import { rectsOverlap50 } from '../utils/geometry';
import { isLocked } from './instanceOps';
import { removeFromSelection } from './instanceOps';

type SetState = React.Dispatch<React.SetStateAction<CanvasState>>;
type SetIds = React.Dispatch<React.SetStateAction<Set<string>>>;

function instType(inst: Instance, prototypeMap: Map<string, Prototype>): string | undefined {
    return getInstanceType(inst, inst.prototypeId ? prototypeMap.get(inst.prototypeId) : undefined);
}

export function findMergeTarget(
    draggedId: string,
    state: CanvasState,
    prototypeMap: Map<string, Prototype>,
    layerRef: React.RefObject<Konva.Layer | null>,
    stageRef: React.RefObject<Konva.Stage | null>,
): string | null {
    if (!layerRef.current || !stageRef.current) return null;
    const draggedInst = state.instances.get(draggedId);
    if (!draggedInst) return null;
    if (isLocked(state.instances, draggedId)) return null;
    const draggedType = instType(draggedInst, prototypeMap);
    if (!draggedType || draggedType === "board") return null;
    const draggedNode = stageRef.current.findOne(`#${draggedId}`);
    if (!draggedNode) return null;
    const draggedRect = draggedNode.getClientRect();

    for (const targetNode of layerRef.current.getChildren()) {
        const targetId = targetNode.id();
        if (!targetId || targetId === draggedId) continue;
        const targetInst = state.instances.get(targetId);
        if (!targetInst) continue;
        if (isLocked(state.instances, targetId)) continue;
        const targetType = instType(targetInst, prototypeMap);
        if (!targetType) continue;
        if (draggedType === "card" && targetType !== "card" && targetType !== "deck" && targetType !== "stack") continue;
        if (draggedType === "deck" && targetType !== "deck") continue;
        if (draggedType === "token" && targetType !== "token" && targetType !== "stack") continue;
        if (draggedType === "stack" && targetType !== "stack") continue;
        if (rectsOverlap50(draggedRect, targetNode.getClientRect())) return targetId;
    }
    return null;
}

export function tryMerge(
    draggedId: string,
    state: CanvasState,
    prototypeMap: Map<string, Prototype>,
    setState: SetState,
    setSelectedIds: SetIds,
    layerRef: React.RefObject<Konva.Layer | null>,
    stageRef: React.RefObject<Konva.Stage | null>,
) {
    const targetId = findMergeTarget(draggedId, state, prototypeMap, layerRef, stageRef);
    if (!targetId) return;

    const draggedInst = state.instances.get(draggedId)!;
    const targetInst = state.instances.get(targetId)!;
    const draggedType = instType(draggedInst, prototypeMap)!;
    const targetType = instType(targetInst, prototypeMap)!;

    // Card → Deck
    if (draggedType === "card" && targetType === "deck") {
        const cardEntry = { prototypeId: draggedInst.prototypeId, props: draggedInst.props };
        setState(prev => {
            const next = new Map(prev.instances);
            next.delete(draggedId);
            const target = next.get(targetId)!;
            next.set(targetId, { ...target, props: { ...target.props, cards: [...((target.props?.cards as unknown[]) ?? []), cardEntry] } });
            return { ...prev, instances: next };
        });
        removeFromSelection(setSelectedIds, [draggedId]);
        return;
    }

    // Card → Card = new Deck
    if (draggedType === "card" && targetType === "card") {
        const bottomCard = { prototypeId: targetInst.prototypeId, props: targetInst.props };
        const topCard = { prototypeId: draggedInst.prototypeId, props: draggedInst.props };
        setState(prev => {
            const next = new Map(prev.instances);
            next.delete(draggedId);
            next.delete(targetId);
            const newId = crypto.randomUUID();
            next.set(newId, { id: newId, x: targetInst.x, y: targetInst.y, props: { type: 'deck', cards: [bottomCard, topCard] } });
            return { ...prev, instances: next };
        });
        removeFromSelection(setSelectedIds, [draggedId, targetId]);
        return;
    }

    // Deck → Deck
    if (draggedType === "deck" && targetType === "deck") {
        const draggedCards = (draggedInst.props?.cards as unknown[]) ?? [];
        setState(prev => {
            const next = new Map(prev.instances);
            next.delete(draggedId);
            const target = next.get(targetId)!;
            next.set(targetId, { ...target, props: { ...target.props, cards: [...((target.props?.cards as unknown[]) ?? []), ...draggedCards] } });
            return { ...prev, instances: next };
        });
        removeFromSelection(setSelectedIds, [draggedId]);
        return;
    }

    // Any non-container → Stack
    if (draggedType !== "deck" && draggedType !== "stack" && targetType === "stack") {
        const itemEntry = { prototypeId: draggedInst.prototypeId, props: draggedInst.props };
        setState(prev => {
            const next = new Map(prev.instances);
            next.delete(draggedId);
            const target = next.get(targetId)!;
            next.set(targetId, { ...target, props: { ...target.props, items: [...((target.props?.items as unknown[]) ?? []), itemEntry] } });
            return { ...prev, instances: next };
        });
        removeFromSelection(setSelectedIds, [draggedId]);
        return;
    }

    // Non-container → Non-container = new Stack
    if (draggedType !== "deck" && draggedType !== "stack" && draggedType !== "board"
        && targetType !== "deck" && targetType !== "stack" && targetType !== "board") {
        const bottomItem = { prototypeId: targetInst.prototypeId, props: targetInst.props };
        const topItem = { prototypeId: draggedInst.prototypeId, props: draggedInst.props };
        setState(prev => {
            const next = new Map(prev.instances);
            next.delete(draggedId);
            next.delete(targetId);
            const newId = crypto.randomUUID();
            next.set(newId, { id: newId, x: targetInst.x, y: targetInst.y, props: { type: 'stack', items: [bottomItem, topItem] } });
            return { ...prev, instances: next };
        });
        removeFromSelection(setSelectedIds, [draggedId, targetId]);
        return;
    }

    // Stack → Stack
    if (draggedType === "stack" && targetType === "stack") {
        const draggedItems = (draggedInst.props?.items as unknown[]) ?? [];
        setState(prev => {
            const next = new Map(prev.instances);
            next.delete(draggedId);
            const target = next.get(targetId)!;
            next.set(targetId, { ...target, props: { ...target.props, items: [...((target.props?.items as unknown[]) ?? []), ...draggedItems] } });
            return { ...prev, instances: next };
        });
        removeFromSelection(setSelectedIds, [draggedId]);
        return;
    }
}
