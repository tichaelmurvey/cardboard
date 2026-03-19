import type Konva from 'konva';
import type { CanvasState, Prototype } from './types';
import { flattenPrototypes } from './prototypeUtils';
import { rectsOverlap50 } from '../utils/geometry';
import { isLocked } from './instanceOps';
import { removeFromSelection } from './instanceOps';

type SetState = React.Dispatch<React.SetStateAction<CanvasState>>;
type SetIds = React.Dispatch<React.SetStateAction<Set<string>>>;

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
    const draggedProto = prototypeMap.get(draggedInst.prototypeId);
    if (!draggedProto || draggedProto.type === "board") return null;
    const draggedNode = stageRef.current.findOne(`#${draggedId}`);
    if (!draggedNode) return null;
    const draggedRect = draggedNode.getClientRect();

    for (const targetNode of layerRef.current.getChildren()) {
        const targetId = targetNode.id();
        if (!targetId || targetId === draggedId) continue;
        const targetInst = state.instances.get(targetId);
        if (!targetInst) continue;
        if (isLocked(state.instances, targetId)) continue;
        const targetProto = prototypeMap.get(targetInst.prototypeId);
        if (!targetProto) continue;
        if (draggedProto.type === "card" && targetProto.type !== "card" && targetProto.type !== "deck" && targetProto.type !== "stack") continue;
        if (draggedProto.type === "deck" && targetProto.type !== "deck") continue;
        if (draggedProto.type === "token" && targetProto.type !== "token" && targetProto.type !== "stack") continue;
        if (draggedProto.type === "stack" && targetProto.type !== "stack") continue;
        if (rectsOverlap50(draggedRect, targetNode.getClientRect())) return targetId;
    }
    return null;
}

function getOrCreateContainerPrototype(
    state: CanvasState,
    setState: SetState,
    type: "deck" | "stack",
): string {
    const existing = flattenPrototypes(state.prototypes).find(p => p.type === type);
    if (existing) return existing.id;
    const id = crypto.randomUUID();
    const text = type === "deck" ? "Deck" : "Stack";
    setState(prev => ({
        ...prev,
        prototypes: [...prev.prototypes, { id, type, props: { text } }],
    }));
    return id;
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
    const draggedProto = prototypeMap.get(draggedInst.prototypeId)!;
    const targetInst = state.instances.get(targetId)!;
    const targetProto = prototypeMap.get(targetInst.prototypeId)!;

    // Card → Deck
    if (draggedProto.type === "card" && targetProto.type === "deck") {
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
    if (draggedProto.type === "card" && targetProto.type === "card") {
        const deckProtoId = getOrCreateContainerPrototype(state, setState, "deck");
        const bottomCard = { prototypeId: targetInst.prototypeId, props: targetInst.props };
        const topCard = { prototypeId: draggedInst.prototypeId, props: draggedInst.props };
        setState(prev => {
            const next = new Map(prev.instances);
            next.delete(draggedId);
            next.delete(targetId);
            const newId = crypto.randomUUID();
            next.set(newId, { id: newId, prototypeId: deckProtoId, x: targetInst.x, y: targetInst.y, props: { cards: [bottomCard, topCard] } });
            return { ...prev, instances: next };
        });
        removeFromSelection(setSelectedIds, [draggedId, targetId]);
        return;
    }

    // Deck → Deck
    if (draggedProto.type === "deck" && targetProto.type === "deck") {
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
    if (draggedProto.type !== "deck" && draggedProto.type !== "stack" && targetProto.type === "stack") {
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

    // Token → Token = new Stack
    if (draggedProto.type !== "deck" && draggedProto.type !== "stack" && draggedProto.type !== "board"
        && targetProto.type !== "deck" && targetProto.type !== "stack" && targetProto.type !== "board") {
        const stackProtoId = getOrCreateContainerPrototype(state, setState, "stack");
        const bottomItem = { prototypeId: targetInst.prototypeId, props: targetInst.props };
        const topItem = { prototypeId: draggedInst.prototypeId, props: draggedInst.props };
        setState(prev => {
            const next = new Map(prev.instances);
            next.delete(draggedId);
            next.delete(targetId);
            const newId = crypto.randomUUID();
            next.set(newId, { id: newId, prototypeId: stackProtoId, x: targetInst.x, y: targetInst.y, props: { items: [bottomItem, topItem] } });
            return { ...prev, instances: next };
        });
        removeFromSelection(setSelectedIds, [draggedId, targetId]);
        return;
    }

    // Stack → Stack
    if (draggedProto.type === "stack" && targetProto.type === "stack") {
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
