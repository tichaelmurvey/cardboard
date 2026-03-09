import { useState, useMemo, useRef, useEffect } from 'react';
import { Stage, Layer, Rect } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Button } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import Konva from 'konva';
import { DEFAULT_STATE } from './state_management/defaults';
import { downloadJson, uploadJson } from './state_management/persistence';
import type { CanvasState, Instance, Prototype } from './state_management/types';
import { resolveProps } from './state_management/types';
import { rectsOverlap50, rectsIntersect } from './utils/geometry';
import type { Rect2D } from './utils/geometry';
import { renderInstance, getZOrder, getGroupId } from './canvas/renderInstance';
import { Sidebar } from './components/sidebar/Sidebar';
import { ContextMenu } from './components/context-menu/ContextMenu';
import type { ContextMenuItem } from './components/context-menu/ContextMenu';
import { ProtoEditorModal } from './components/editor/ProtoEditorModal';
import type { ProtoDraft } from './components/editor/ProtoEditorModal';
import { InstEditorModal } from './components/editor/InstEditorModal';
import type { InstDraft } from './components/editor/InstEditorModal';
import { useMultiplayer } from './multiplayer/useMultiplayer';
import { useRoom } from './multiplayer/useRoom';
import { JoinModal } from './components/editor/JoinModal';
import { NewProtoModal } from './components/editor/NewProtoModal';
import { HiddenRegion } from './components/hidden-region/HiddenRegion';

export default function App() {
    const roomCode = useRoom();
    const [opened, { open, close }] = useDisclosure(false);
    const [state, setState] = useState<CanvasState>(DEFAULT_STATE);
    const { isHost, assignedPlayerId, claimPlayer } = useMultiplayer(roomCode ?? '', state, setState);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const layerRef = useRef<Konva.Layer>(null);
    const pendingDragId = useRef<string | null>(null);
    const [selBox, setSelBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
    const [marqueeHitIds, setMarqueeHitIds] = useState<Set<string> | null>(null);
    const isSelecting = useRef(false);
    const dragStartPos = useRef<Map<string, { x: number; y: number }>>(new Map());
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; instanceId: string | null } | null>(null);
    const [editingProtoId, setEditingProtoId] = useState<string | null>(null);
    const [protoDraft, setProtoDraft] = useState<ProtoDraft>({ text: '', scale: '1', imageSrc: '' });
    const [editingInstId, setEditingInstId] = useState<string | null>(null);
    const [instDraft, setInstDraft] = useState<InstDraft>({ text: '', scale: '', imageSrc: '' });
    const [stageScale, setStageScale] = useState(1);
    const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
    const isPanning = useRef(false);
    const panStart = useRef({ x: 0, y: 0 });
    const stageRef = useRef<Konva.Stage>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const [clipboard, setClipboard] = useState<Instance[]>([]);
    const [targetedId, setTargetedId] = useState<string | null>(null);
    const [newProtoOpen, setNewProtoOpen] = useState(false);
    const [editMode, setEditMode] = useState(true);

    const prototypeMap = useMemo(() => {
        const map = new Map<string, Prototype>();
        for (const p of state.prototypes) map.set(p.id, p);
        return map;
    }, [state.prototypes]);

    // --- Instance helpers ---

    function isLocked(id: string): boolean {
        const inst = state.instances.find(i => i.id === id);
        return !!(inst?.props?.locked);
    }

    function toggleLock(id: string) {
        setState(prev => ({
            ...prev,
            instances: prev.instances.map(inst =>
                inst.id === id ? { ...inst, props: { ...inst.props, locked: !inst.props?.locked } } : inst
            ),
        }));
    }

    function removeFromSelection(ids: Iterable<string>) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            for (const id of ids) next.delete(id);
            return next;
        });
    }

    function deleteInstances(ids: Set<string>) {
        if (ids.size === 0) return;
        setState(prev => ({
            ...prev,
            instances: prev.instances.filter(inst => !ids.has(inst.id)),
        }));
        removeFromSelection(ids);
    }

    function getFocusedIds(): Set<string> {
        const ids = new Set(selectedIds);
        if (marqueeHitIds) for (const id of marqueeHitIds) ids.add(id);
        if (hoveredId) ids.add(hoveredId);
        return ids;
    }

    function scaleInstances(ids: Set<string>, factor: number) {
        if (ids.size === 0) return;
        setState(prev => ({
            ...prev,
            instances: prev.instances.map(inst => {
                if (!ids.has(inst.id)) return inst;
                const current = (inst.props?.scale as number) ?? 1;
                return { ...inst, props: { ...inst.props, scale: current * factor } };
            }),
        }));
    }

    // --- Camera ---

    const ZOOM_FACTOR = 1.1;
    const PAN_SPEED = 8;
    const MIN_SCALE = 0.1;
    const MAX_SCALE = 10;

    function zoomAtPoint(newScale: number, pointX: number, pointY: number) {
        newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
        const mousePointTo = {
            x: (pointX - stagePos.x) / stageScale,
            y: (pointY - stagePos.y) / stageScale,
        };
        setStageScale(newScale);
        setStagePos({
            x: pointX - mousePointTo.x * newScale,
            y: pointY - mousePointTo.y * newScale,
        });
    }

    function handleWheel(e: KonvaEventObject<WheelEvent>) {
        e.evt.preventDefault();
        const stage = e.target.getStage()!;
        const pointer = stage.getPointerPosition()!;
        const direction = e.evt.deltaY > 0 ? -1 : 1;
        const newScale = direction > 0 ? stageScale * ZOOM_FACTOR : stageScale / ZOOM_FACTOR;
        zoomAtPoint(newScale, pointer.x, pointer.y);
    }

    function screenToStage(screenX: number, screenY: number) {
        return {
            x: (screenX - stagePos.x) / stageScale,
            y: (screenY - stagePos.y) / stageScale,
        };
    }

    // --- Clipboard ---

    function pasteAt(stageX: number, stageY: number) {
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
        setState(prev => ({
            ...prev,
            instances: [...prev.instances, ...newInstances],
        }));
        setSelectedIds(new Set(newInstances.map(i => i.id)));
        setClipboard(newInstances);
    }

    // --- Keyboard input ---

    const heldKeys = useRef<Set<string>>(new Set());
    const animRef = useRef<number>(0);
    const HELD_KEYS_SET = useMemo(() => new Set([
        'w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        '+', '=', '-', '_',
    ]), []);
    const stateRef = useRef({ stageScale, stagePos, selectedIds, marqueeHitIds, hoveredId, state });
    useEffect(() => {
        stateRef.current = { stageScale, stagePos, selectedIds, marqueeHitIds, hoveredId, state };
    });

    useEffect(() => {
        const SCALE_SPEED = 1.02;

        function tick() {
            const keys = heldKeys.current;
            let dx = 0, dy = 0;
            if (keys.has('w') || keys.has('ArrowUp')) dy += PAN_SPEED;
            if (keys.has('s') || keys.has('ArrowDown')) dy -= PAN_SPEED;
            if (keys.has('a') || keys.has('ArrowLeft')) dx += PAN_SPEED;
            if (keys.has('d') || keys.has('ArrowRight')) dx -= PAN_SPEED;
            if (dx !== 0 || dy !== 0) {
                setStagePos(p => ({ x: p.x + dx, y: p.y + dy }));
            }

            const scaleUp = keys.has('+') || keys.has('=');
            const scaleDown = keys.has('-') || keys.has('_');
            if (scaleUp || scaleDown) {
                const factor = scaleUp ? SCALE_SPEED : 1 / SCALE_SPEED;
                const { selectedIds: sel, marqueeHitIds: mh, hoveredId: hov } = stateRef.current;
                const focused = new Set(sel);
                if (mh) for (const id of mh) focused.add(id);
                if (hov) focused.add(hov);

                if (focused.size > 0) {
                    scaleInstances(focused, factor);
                } else {
                    setStageScale(prev => {
                        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev * factor));
                        const cx = window.innerWidth / 2;
                        const cy = window.innerHeight / 2;
                        setStagePos(p => {
                            const mx = (cx - p.x) / prev;
                            const my = (cy - p.y) / prev;
                            return { x: cx - mx * newScale, y: cy - my * newScale };
                        });
                        return newScale;
                    });
                }
            }

            animRef.current = requestAnimationFrame(tick);
        }

        function startLoop() {
            if (!animRef.current) animRef.current = requestAnimationFrame(tick);
        }

        function stopLoop() {
            if (animRef.current) {
                cancelAnimationFrame(animRef.current);
                animRef.current = 0;
            }
        }

        function handleKeyDown(e: KeyboardEvent) {
            if (HELD_KEYS_SET.has(e.key)) {
                e.preventDefault();
                heldKeys.current.add(e.key);
                startLoop();
            }
        }

        function handleKeyUp(e: KeyboardEvent) {
            heldKeys.current.delete(e.key);
            if (![...heldKeys.current].some(k => HELD_KEYS_SET.has(k))) stopLoop();
        }

        const el = canvasRef.current;
        if (!el) return;
        el.addEventListener('keydown', handleKeyDown);
        el.addEventListener('keyup', handleKeyUp);
        return () => {
            el.removeEventListener('keydown', handleKeyDown);
            el.removeEventListener('keyup', handleKeyUp);
            stopLoop();
        };
    }, [HELD_KEYS_SET]);

    function drawFromDeck() {
        const focusedIds = getFocusedIds();
        const deckInst = state.instances.find(inst => {
            if (!focusedIds.has(inst.id)) return false;
            const proto = prototypeMap.get(inst.prototypeId);
            return proto?.type === "deck";
        });
        if (!deckInst) return;

        const cards = (deckInst.props?.cards as { prototypeId: string; props?: Record<string, unknown> }[]) ?? [];
        if (cards.length === 0) return;

        const topCard = cards[cards.length - 1];
        const newId = crypto.randomUUID();
        const remaining = cards.slice(0, -1);

        setState(prev => {
            let instances: Instance[];
            if (remaining.length === 1) {
                const lastCard = remaining[0];
                instances = [
                    ...prev.instances.filter(i => i.id !== deckInst.id),
                    { id: crypto.randomUUID(), prototypeId: lastCard.prototypeId, x: deckInst.x, y: deckInst.y, props: lastCard.props },
                    { id: newId, prototypeId: topCard.prototypeId, x: deckInst.x, y: deckInst.y, props: topCard.props },
                ];
            } else {
                instances = [
                    ...prev.instances.map(inst =>
                        inst.id === deckInst.id
                            ? { ...inst, props: { ...inst.props, cards: remaining } }
                            : inst
                    ),
                    { id: newId, prototypeId: topCard.prototypeId, x: deckInst.x, y: deckInst.y, props: topCard.props },
                ];
            }
            return { ...prev, instances };
        });

        pendingDragId.current = newId;
    }

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.key === 'Delete' || e.key === 'Backspace') && editMode) {
                e.preventDefault();
                deleteInstances(getFocusedIds());
            }
            if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
                const ids = getFocusedIds();
                if (ids.size === 0) return;
                setClipboard(state.instances.filter(inst => ids.has(inst.id)));
            }
            if (e.key === ' ') {
                e.preventDefault();
                drawFromDeck();
            }
            if (e.key === 'v' && (e.ctrlKey || e.metaKey) && editMode) {
                const pointer = stageRef.current?.getPointerPosition();
                const { stageScale: sc, stagePos: sp } = stateRef.current;
                const mouse = pointer
                    ? { x: (pointer.x - sp.x) / sc, y: (pointer.y - sp.y) / sc }
                    : { x: 20, y: 20 };
                pasteAt(mouse.x, mouse.y);
            }
        }
        const el = canvasRef.current;
        if (!el) return;
        el.addEventListener('keydown', handleKeyDown);
        return () => el.removeEventListener('keydown', handleKeyDown);
    });

    // --- Drag & drop ---

    function updatePosition(id: string, x: number, y: number) {
        setState(prev => ({
            ...prev,
            instances: prev.instances.map(inst =>
                inst.id === id ? { ...inst, x, y } : inst
            ),
        }));
    }

    function spawnInstance(prototypeId: string, e: React.MouseEvent) {
        const id = crypto.randomUUID();
        const stage = layerRef.current?.getStage();
        const pointer = stage?.getPointerPosition() ?? { x: e.clientX, y: e.clientY };
        const stageCoords = screenToStage(pointer.x, pointer.y);

        setState(prev => ({
            ...prev,
            instances: [...prev.instances, { id, prototypeId, x: stageCoords.x, y: stageCoords.y }],
        }));

        pendingDragId.current = id;
    }

    useEffect(() => {
        if (!pendingDragId.current || !layerRef.current) return;
        const id = pendingDragId.current;
        pendingDragId.current = null;
        const node = layerRef.current.findOne(`#${id}`);
        if (node) {
            node.moveToTop();
            node.startDrag();
        }
    });

    function handleDragStart(e: KonvaEventObject<DragEvent>) {
        if (isPanning.current) { e.target.stopDrag(); return; }
        const draggedId = e.target.id();
        if (isLocked(draggedId)) { e.target.stopDrag(); return; }
        e.target.moveToTop();
        e.target.opacity(0.7);

        if (selectedIds.has(draggedId) && layerRef.current) {
            const starts = new Map<string, { x: number; y: number }>();
            starts.set(draggedId, { x: e.target.x(), y: e.target.y() });
            for (const id of selectedIds) {
                if (id === draggedId) continue;
                const node = layerRef.current.findOne(`#${id}`);
                if (node) {
                    node.opacity(0.7);
                    starts.set(id, { x: node.x(), y: node.y() });
                }
            }
            dragStartPos.current = starts;
        } else {
            dragStartPos.current = new Map();
        }
    }

    function handleDragMove(e: KonvaEventObject<DragEvent>) {
        const draggedId = e.target.id();
        setTargetedId(findMergeTarget(draggedId));

        if (dragStartPos.current.size <= 1 || !layerRef.current) return;
        const startPos = dragStartPos.current.get(draggedId);
        if (!startPos) return;
        const dx = e.target.x() - startPos.x;
        const dy = e.target.y() - startPos.y;
        for (const [id, pos] of dragStartPos.current) {
            if (id === draggedId) continue;
            const node = layerRef.current.findOne(`#${id}`);
            if (node) {
                node.x(pos.x + dx);
                node.y(pos.y + dy);
            }
        }
    }

    function handleDragEnd(e: KonvaEventObject<DragEvent>) {
        e.target.opacity(1);
        setTargetedId(null);
        const draggedId = e.target.id();

        if (dragStartPos.current.size > 1 && layerRef.current) {
            const startPos = dragStartPos.current.get(draggedId);
            if (startPos) {
                const dx = e.target.x() - startPos.x;
                const dy = e.target.y() - startPos.y;
                setState(prev => ({
                    ...prev,
                    instances: prev.instances.map(inst => {
                        const sp = dragStartPos.current.get(inst.id);
                        if (!sp || inst.id === draggedId) return inst;
                        return { ...inst, x: sp.x + dx, y: sp.y + dy };
                    }),
                }));
                for (const [id] of dragStartPos.current) {
                    if (id === draggedId) continue;
                    const node = layerRef.current.findOne(`#${id}`);
                    if (node) node.opacity(1);
                }
            }
        }
        dragStartPos.current = new Map();

        tryMerge(draggedId);

        const layer = e.target.getLayer();
        if (!layer) return;
        const sorted = [...layer.getChildren()].sort((a, b) => getZOrder(a.name()) - getZOrder(b.name()));
        for (const node of sorted) node.moveToTop();
    }

    // --- Card/Deck merge ---

    function findMergeTarget(draggedId: string): string | null {
        if (!layerRef.current) return null;
        const draggedInst = state.instances.find(i => i.id === draggedId);
        if (!draggedInst) return null;
        const draggedProto = prototypeMap.get(draggedInst.prototypeId);
        if (!draggedProto || (draggedProto.type !== "card" && draggedProto.type !== "deck")) return null;
        const draggedNode = layerRef.current.findOne(`#${draggedId}`);
        if (!draggedNode) return null;
        const draggedRect = draggedNode.getClientRect();

        for (const targetInst of state.instances) {
            if (targetInst.id === draggedId) continue;
            const targetProto = prototypeMap.get(targetInst.prototypeId);
            if (!targetProto) continue;
            if (draggedProto.type === "card" && targetProto.type !== "card" && targetProto.type !== "deck") continue;
            if (draggedProto.type === "deck" && targetProto.type !== "deck") continue;
            const targetNode = layerRef.current!.findOne(`#${targetInst.id}`);
            if (!targetNode) continue;
            if (rectsOverlap50(draggedRect, targetNode.getClientRect())) return targetInst.id;
        }
        return null;
    }

    function tryMerge(draggedId: string) {
        const targetId = findMergeTarget(draggedId);
        if (!targetId) return;

        const draggedInst = state.instances.find(i => i.id === draggedId)!;
        const draggedProto = prototypeMap.get(draggedInst.prototypeId)!;
        const targetInst = state.instances.find(i => i.id === targetId)!;
        const targetProto = prototypeMap.get(targetInst.prototypeId)!;

        if (draggedProto.type === "card" && targetProto.type === "deck") {
            const cardEntry = { prototypeId: draggedInst.prototypeId, props: draggedInst.props };
            setState(prev => ({
                ...prev,
                instances: prev.instances
                    .filter(i => i.id !== draggedId)
                    .map(i => i.id === targetId
                        ? { ...i, props: { ...i.props, cards: [...((i.props?.cards as unknown[]) ?? []), cardEntry] } }
                        : i
                    ),
            }));
            removeFromSelection([draggedId]);
            return;
        }

        if (draggedProto.type === "card" && targetProto.type === "card") {
            const deckProtoId = getOrCreateDeckPrototype();
            const bottomCard = { prototypeId: targetInst.prototypeId, props: targetInst.props };
            const topCard = { prototypeId: draggedInst.prototypeId, props: draggedInst.props };
            setState(prev => ({
                ...prev,
                instances: [
                    ...prev.instances.filter(i => i.id !== draggedId && i.id !== targetId),
                    { id: crypto.randomUUID(), prototypeId: deckProtoId, x: targetInst.x, y: targetInst.y, props: { cards: [bottomCard, topCard] } },
                ],
            }));
            removeFromSelection([draggedId, targetId]);
            return;
        }

        if (draggedProto.type === "deck" && targetProto.type === "deck") {
            const draggedCards = (draggedInst.props?.cards as unknown[]) ?? [];
            setState(prev => ({
                ...prev,
                instances: prev.instances
                    .filter(i => i.id !== draggedId)
                    .map(i => i.id === targetId
                        ? { ...i, props: { ...i.props, cards: [...((i.props?.cards as unknown[]) ?? []), ...draggedCards] } }
                        : i
                    ),
            }));
            removeFromSelection([draggedId]);
        }
    }

    function getOrCreateDeckPrototype(): string {
        const existing = state.prototypes.find(p => p.type === "deck");
        if (existing) return existing.id;
        const id = crypto.randomUUID();
        setState(prev => ({
            ...prev,
            prototypes: [...prev.prototypes, { id, type: "deck", props: { text: "Deck" } }],
        }));
        return id;
    }

    // --- Marquee selection ---

    function computeMarqueeHits(box: { x1: number; y1: number; x2: number; y2: number }) {
        if (!layerRef.current) return new Set<string>();
        const x = Math.min(box.x1, box.x2);
        const y = Math.min(box.y1, box.y2);
        const w = Math.abs(box.x2 - box.x1);
        const h = Math.abs(box.y2 - box.y1);
        if (w < 5 && h < 5) return new Set<string>();
        const boxRect: Rect2D = { x, y, width: w, height: h };
        const hits = new Set<string>();
        for (const child of layerRef.current.getChildren()) {
            const id = child.id();
            if (!id || isLocked(id)) continue;
            if (rectsIntersect(boxRect, child.getClientRect())) hits.add(id);
        }
        return hits;
    }

    function handleStageMouseDown(e: KonvaEventObject<MouseEvent>) {
        const evt = e.evt as MouseEvent;
        if (evt.button === 1) {
            evt.preventDefault();
            isPanning.current = true;
            panStart.current = { x: evt.clientX - stagePos.x, y: evt.clientY - stagePos.y };
            return;
        }
        if (e.target !== e.target.getStage()) return;
        const pos = e.target.getStage()!.getPointerPosition()!;
        isSelecting.current = true;
        setSelBox({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y });
        setMarqueeHitIds(null);
        if (!evt.shiftKey) setSelectedIds(new Set());
    }

    function handleStageMouseMove(e: KonvaEventObject<MouseEvent>) {
        const evt = e.evt as MouseEvent;
        if (isPanning.current) {
            setStagePos({ x: evt.clientX - panStart.current.x, y: evt.clientY - panStart.current.y });
            return;
        }
        if (!isSelecting.current) return;
        const pos = e.target.getStage()!.getPointerPosition()!;
        const newBox = selBox ? { ...selBox, x2: pos.x, y2: pos.y } : null;
        setSelBox(newBox);
        if (newBox) setMarqueeHitIds(computeMarqueeHits(newBox));
    }

    function handleStageMouseUp() {
        if (isPanning.current) { isPanning.current = false; return; }
        if (!isSelecting.current || !selBox) {
            isSelecting.current = false;
            setSelBox(null);
            setMarqueeHitIds(null);
            return;
        }
        isSelecting.current = false;
        const hits = computeMarqueeHits(selBox);
        if (hits.size > 0) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                for (const id of hits) next.add(id);
                return next;
            });
        }
        setSelBox(null);
        setMarqueeHitIds(null);
    }

    // --- Context menu ---

    useEffect(() => {
        if (!contextMenu) return;
        const dismiss = () => setContextMenu(null);
        window.addEventListener('mousedown', dismiss);
        window.addEventListener('wheel', dismiss);
        return () => {
            window.removeEventListener('mousedown', dismiss);
            window.removeEventListener('wheel', dismiss);
        };
    }, [contextMenu]);

    function getContextMenuItems(): ContextMenuItem[] {
        if (!contextMenu) return [];
        if (!editMode) return [];
        const instId = contextMenu.instanceId;
        // Check if it's a hidden region
        const isRegion = instId && (state.hiddenRegions ?? []).some(r => r.id === instId);
        if (instId && isRegion) {
            return [
                { label: 'Delete Region', action: () => { deleteRegion(instId); setContextMenu(null); } },
            ];
        }
        if (instId) {
            return [
                { label: isLocked(instId) ? 'Unlock' : 'Lock', action: () => toggleLock(instId) },
                { label: 'Grow', action: () => scaleInstances(new Set([instId]), 1.2) },
                { label: 'Shrink', action: () => scaleInstances(new Set([instId]), 1 / 1.2) },
                { label: 'Copy', action: () => {
                    const inst = state.instances.find(i => i.id === instId);
                    if (inst) setClipboard([inst]);
                    setContextMenu(null);
                }},
                { label: 'Edit', action: () => { openInstEditor(instId); setContextMenu(null); } },
                { label: 'Edit Prototype', action: () => {
                    const inst = state.instances.find(i => i.id === instId);
                    if (inst) openProtoEditor(inst.prototypeId);
                    setContextMenu(null);
                }},
                { label: 'Make Prototype', action: () => {
                    const inst = state.instances.find(i => i.id === instId);
                    if (!inst) return;
                    const proto = prototypeMap.get(inst.prototypeId);
                    if (!proto) return;
                    const newProtoId = crypto.randomUUID();
                    const merged = resolveProps(proto, inst);
                    const { locked, ...protoProps } = merged as Record<string, unknown> & { locked?: unknown };
                    setState(prev => ({
                        ...prev,
                        prototypes: [...prev.prototypes, { id: newProtoId, type: proto.type, props: protoProps }],
                        instances: prev.instances.map(i =>
                            i.id === instId ? { ...i, prototypeId: newProtoId, props: undefined } : i
                        ),
                    }));
                    setContextMenu(null);
                }},
                { label: 'Delete', action: () => { deleteInstances(new Set([instId])); setContextMenu(null); } },
            ];
        }
        if (clipboard.length > 0) {
            return [{ label: 'Paste', action: () => {
                const stageCoords = screenToStage(contextMenu.x, contextMenu.y);
                pasteAt(stageCoords.x, stageCoords.y);
                setContextMenu(null);
            }}];
        }
        return [];
    }

    // --- Editors ---

    const editingProto = editingProtoId ? prototypeMap.get(editingProtoId) ?? null : null;

    function openProtoEditor(protoId: string) {
        const proto = prototypeMap.get(protoId);
        if (!proto) return;
        setProtoDraft({
            text: (proto.props.text as string) ?? '',
            scale: String((proto.props.scale as number) ?? 1),
            imageSrc: (proto.props.src as string) ?? (proto.props.imageSrc as string) ?? '',
        });
        setEditingProtoId(protoId);
    }

    function saveProtoEdits() {
        if (!editingProto) return;
        const updates: Record<string, unknown> = { text: protoDraft.text };
        const scaleVal = parseFloat(protoDraft.scale);
        if (!isNaN(scaleVal) && scaleVal > 0) updates.scale = scaleVal;
        const imageKey = 'src' in editingProto.props ? 'src' : 'imageSrc';
        updates[imageKey] = protoDraft.imageSrc;
        setState(prev => ({
            ...prev,
            prototypes: prev.prototypes.map(p =>
                p.id === editingProto.id ? { ...p, props: { ...p.props, ...updates } } : p
            ),
        }));
        setEditingProtoId(null);
    }

    const editingInst = editingInstId ? state.instances.find(i => i.id === editingInstId) ?? null : null;

    function openInstEditor(instanceId: string) {
        const inst = state.instances.find(i => i.id === instanceId);
        if (!inst) return;
        setInstDraft({
            text: (inst.props?.text as string) ?? '',
            scale: inst.props?.scale != null ? String(inst.props.scale) : '',
            imageSrc: (inst.props?.src as string) ?? (inst.props?.imageSrc as string) ?? '',
        });
        setEditingInstId(instanceId);
    }

    function saveInstEdits() {
        if (!editingInst) return;
        const proto = prototypeMap.get(editingInst.prototypeId);
        const updates: Record<string, unknown> = {};
        if (instDraft.text) updates.text = instDraft.text;
        const scaleVal = parseFloat(instDraft.scale);
        if (!isNaN(scaleVal) && scaleVal > 0) updates.scale = scaleVal;
        if (instDraft.imageSrc) {
            const imageKey = proto && 'src' in proto.props ? 'src' : 'imageSrc';
            updates[imageKey] = instDraft.imageSrc;
        }
        setState(prev => ({
            ...prev,
            instances: prev.instances.map(inst =>
                inst.id === editingInstId ? { ...inst, props: { ...inst.props, ...updates } } : inst
            ),
        }));
        setEditingInstId(null);
    }

    function getInstPlaceholders() {
        if (!editingInst) return { text: '', scale: '', imageSrc: '' };
        const p = prototypeMap.get(editingInst.prototypeId);
        return {
            text: (p?.props.text as string) ?? '',
            scale: String((p?.props.scale as number) ?? 1),
            imageSrc: (p?.props.src as string) ?? (p?.props.imageSrc as string) ?? '',
        };
    }

    // --- Players ---

    const PLAYER_COLORS = ['#e03131', '#1971c2', '#2f9e44', '#f08c00', '#9c36b5', '#e8590c', '#0ca678', '#3bc9db'];

    function addPlayer() {
        const usedColors = new Set(state.players.map(p => p.color));
        const color = PLAYER_COLORS.find(c => !usedColors.has(c)) ?? `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`;
        const name = `Player ${state.players.length + 1}`;
        setState(prev => ({
            ...prev,
            players: [...prev.players, { id: crypto.randomUUID(), color, name }],
        }));
    }

    function createPrototype(type: import('./state_management/types').ObjectType, text: string, scale: number, imageSrc: string) {
        const props: Record<string, unknown> = { text };
        if (scale !== 1) props.scale = scale;
        if (imageSrc) props.src = imageSrc;
        setState(prev => ({
            ...prev,
            prototypes: [...prev.prototypes, { id: crypto.randomUUID(), type, props }],
        }));
    }

    function deletePrototype(id: string) {
        setState(prev => ({
            ...prev,
            prototypes: prev.prototypes.filter(p => p.id !== id),
            instances: prev.instances.filter(i => i.prototypeId !== id),
        }));
    }

    function deletePlayer(id: string) {
        setState(prev => ({
            ...prev,
            players: prev.players.filter(p => p.id !== id),
        }));
    }

    // --- Hidden Regions ---

    function addHiddenRegion(playerId: string) {
        const region = {
            id: crypto.randomUUID(),
            playerId,
            x: -stagePos.x / stageScale + 100,
            y: -stagePos.y / stageScale + 100,
            width: 200,
            height: 200,
        };
        setState(prev => ({
            ...prev,
            hiddenRegions: [...(prev.hiddenRegions ?? []), region],
        }));
    }

    function updateRegionPosition(id: string, x: number, y: number) {
        setState(prev => ({
            ...prev,
            hiddenRegions: (prev.hiddenRegions ?? []).map(r =>
                r.id === id ? { ...r, x, y } : r
            ),
        }));
    }

    function resizeRegion(id: string, width: number, height: number) {
        setState(prev => ({
            ...prev,
            hiddenRegions: (prev.hiddenRegions ?? []).map(r =>
                r.id === id ? { ...r, width, height } : r
            ),
        }));
    }

    function deleteRegion(id: string) {
        setState(prev => ({
            ...prev,
            hiddenRegions: (prev.hiddenRegions ?? []).filter(r => r.id !== id),
        }));
        removeFromSelection(new Set([id]));
    }

    // Build a set of instance IDs hidden from the current player
    const hiddenInstanceIds = useMemo(() => {
        const hidden = new Set<string>();
        if (!assignedPlayerId) return hidden;
        const otherRegions = (state.hiddenRegions ?? []).filter(r => r.playerId !== assignedPlayerId);
        if (otherRegions.length === 0) return hidden;
        for (const inst of state.instances) {
            const proto = prototypeMap.get(inst.prototypeId);
            if (!proto) continue;
            const resolved = resolveProps(proto, inst);
            const scale = (resolved.scale as number) ?? 1;
            // Approximate instance bounds — cards/tokens/decks use ~100×150 base, boards vary
            let w = 100 * scale;
            let h = 150 * scale;
            if (proto.type === 'token') { w = 50 * scale; h = 50 * scale; }
            if (proto.type === 'board') { w = 200 * scale; h = 200 * scale; }
            const instRect: Rect2D = { x: inst.x, y: inst.y, width: w, height: h };
            for (const region of otherRegions) {
                const regionRect: Rect2D = { x: region.x, y: region.y, width: region.width, height: region.height };
                if (rectsIntersect(instRect, regionRect)) {
                    hidden.add(inst.id);
                    break;
                }
            }
        }
        return hidden;
    }, [state.instances, state.hiddenRegions, assignedPlayerId, prototypeMap]);

    const playerMap = useMemo(() => {
        const map = new Map<string, import('./state_management/types').Player>();
        for (const p of state.players) map.set(p.id, p);
        return map;
    }, [state.players]);

    // --- Persistence ---

    async function handleLoad() {
        try {
            const loaded = await uploadJson();
            setState(loaded);
        } catch {
            // user cancelled or invalid file
        }
    }

    // --- Render ---

    return (
        <>
            <Sidebar
                opened={opened}
                onClose={close}
                state={state}
                onSave={() => downloadJson(state)}
                onLoad={handleLoad}
                onSpawn={spawnInstance}
                onEditPrototype={openProtoEditor}
                onDeletePrototype={deletePrototype}
                onNewPrototype={() => setNewProtoOpen(true)}
                onAddPlayer={addPlayer}
                onDeletePlayer={deletePlayer}
                onAddHiddenRegion={addHiddenRegion}
                isHost={isHost}
                editMode={editMode}
                onEditModeChange={setEditMode}
            />
            <Button
                variant="default"
                onClick={opened ? close : open}
                style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000 }}
            >
                {opened ? 'Close' : 'Menu'}
            </Button>
            <div ref={canvasRef} tabIndex={0} style={{ position: 'absolute', inset: 0, outline: 'none' }} onContextMenu={e => e.preventDefault()} onMouseDown={() => canvasRef.current?.focus()}>
                <Stage ref={stageRef} width={window.innerWidth} height={window.innerHeight}
                    scaleX={stageScale} scaleY={stageScale}
                    x={stagePos.x} y={stagePos.y}
                    onWheel={handleWheel}
                    onMouseDown={handleStageMouseDown}
                    onMouseMove={handleStageMouseMove}
                    onMouseUp={handleStageMouseUp}
                    onContextMenu={(e) => {
                        e.evt.preventDefault();
                        const id = getGroupId(e) || null;
                        setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, instanceId: id });
                    }}
                >
                    <Layer ref={layerRef} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}
                        onMouseEnter={(e) => {
                            const id = getGroupId(e);
                            if (id && !isLocked(id)) setHoveredId(id);
                        }}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={(e) => {
                            const id = getGroupId(e);
                            if (!id || isLocked(id)) return;
                            const evt = e.evt as MouseEvent;
                            if (evt.shiftKey) {
                                setSelectedIds(prev => {
                                    const next = new Set(prev);
                                    if (next.has(id)) next.delete(id);
                                    else next.add(id);
                                    return next;
                                });
                            } else {
                                setSelectedIds(new Set([id]));
                            }
                        }}>
                        {state.instances.map(inst => {
                            if (hiddenInstanceIds.has(inst.id)) return null;
                            const proto = prototypeMap.get(inst.prototypeId);
                            if (!proto) return null;
                            const locked = !!(inst.props?.locked);
                            const hovered = locked ? false : marqueeHitIds ? marqueeHitIds.has(inst.id) : undefined;
                            return renderInstance(inst, proto, updatePosition, locked ? false : selectedIds.has(inst.id), hovered, targetedId === inst.id);
                        })}
                        {(state.hiddenRegions ?? []).map(region => {
                            const player = playerMap.get(region.playerId);
                            if (!player) return null;
                            return (
                                <HiddenRegion
                                    key={region.id}
                                    id={region.id}
                                    x={region.x}
                                    y={region.y}
                                    width={region.width}
                                    height={region.height}
                                    color={player.color}
                                    selected={isHost && editMode && selectedIds.has(region.id)}
                                    onDragEnd={isHost && editMode ? updateRegionPosition : undefined}
                                    onResize={isHost && editMode ? resizeRegion : undefined}
                                    draggable={isHost && editMode}
                                />
                            );
                        })}
                    </Layer>
                    {selBox && (
                        <Layer scaleX={1 / stageScale} scaleY={1 / stageScale} x={-stagePos.x / stageScale} y={-stagePos.y / stageScale}>
                            <Rect
                                x={Math.min(selBox.x1, selBox.x2)}
                                y={Math.min(selBox.y1, selBox.y2)}
                                width={Math.abs(selBox.x2 - selBox.x1)}
                                height={Math.abs(selBox.y2 - selBox.y1)}
                                stroke="white"
                                strokeWidth={1}
                                dash={[6, 3]}
                                listening={false}
                            />
                        </Layer>
                    )}
                </Stage>
            </div>
            {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={getContextMenuItems()} />}
            <ProtoEditorModal
                opened={!!editingProto}
                onClose={() => setEditingProtoId(null)}
                draft={protoDraft}
                onDraftChange={setProtoDraft}
                onSave={saveProtoEdits}
            />
            <InstEditorModal
                opened={!!editingInst}
                onClose={() => setEditingInstId(null)}
                draft={instDraft}
                onDraftChange={setInstDraft}
                onSave={saveInstEdits}
                placeholders={getInstPlaceholders()}
            />
            <JoinModal opened={!assignedPlayerId} onJoin={claimPlayer} />
            <NewProtoModal opened={newProtoOpen} onClose={() => setNewProtoOpen(false)} onCreate={createPrototype} />
        </>
    );
}
