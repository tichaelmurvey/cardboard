import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Rect } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Button } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import Konva from 'konva';
import { DEFAULT_STATE } from './state_management/defaults';
import { downloadJson, uploadJson } from './state_management/persistence';
import { convertTTSSave } from './state_management/importTTS';
import type { CanvasState, Instance, Prototype } from './state_management/types';
import { resolveProps, instancesToMap } from './state_management/types';
import { rectsOverlap50, rectsIntersect } from './utils/geometry';
import type { Rect2D } from './utils/geometry';
import { renderInstance, getZOrder, getGroupId } from './canvas/renderInstance';
import { Sidebar } from './components/sidebar/Sidebar';
import { ContextMenu } from './components/context-menu/ContextMenu';
import type { ContextMenuItem } from './components/context-menu/ContextMenu';
import { EditorModal, EMPTY_DRAFT } from './components/editor/EditorModal';
import type { EditorDraft } from './components/editor/EditorModal';
import { useMultiplayer } from './multiplayer/useMultiplayer';
import { useRoom } from './multiplayer/useRoom';
import { JoinModal } from './components/editor/JoinModal';
import { NewProtoModal } from './components/editor/NewProtoModal';
import { HiddenRegion } from './components/hidden-region/HiddenRegion';
import useImage from 'use-image';
import { PLAYER_COLORS, MARQUEE_STROKE, TOOLTIP_BG, TOOLTIP_FG } from './styles/style_consts';

// Size the background to cover the viewport at maximum zoom-out (MIN_SCALE = 0.1)
const BG_SIZE = Math.max(window.innerWidth, window.innerHeight) / 0.1;

export default function App() {
    const roomCode = useRoom();
    const [opened, { open, close }] = useDisclosure(false);
    const [state, setState] = useState<CanvasState>(DEFAULT_STATE);
    const { isHost, assignedPlayerId, claimPlayer } = useMultiplayer(roomCode ?? '', state, setState);
    const hostPlayerId = useMemo(() => state.players.find(p => p.claimedBy === state.hostClientId)?.id ?? null, [state.players, state.hostClientId]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const layerRef = useRef<Konva.Layer>(null);
    const dragLayerRef = useRef<Konva.Layer>(null);
    const pendingDragId = useRef<string | null>(null);
    const selBoxRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
    const marqueeRectRef = useRef<Konva.Rect | null>(null);
    const marqueeLayerRef = useRef<Konva.Layer | null>(null);
    const [marqueeHitIds, setMarqueeHitIds] = useState<Set<string> | null>(null);
    const isSelecting = useRef(false);
    const dragStartPos = useRef<Map<string, { x: number; y: number }>>(new Map());
    const dragNodeRefs = useRef<Map<string, Konva.Node>>(new Map());
    const hoveredId = useRef<string | null>(null);
    const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; instanceId: string | null } | null>(null);
    const [editingProtoId, setEditingProtoId] = useState<string | null>(null);
    const [protoDraft, setProtoDraft] = useState<EditorDraft>({ ...EMPTY_DRAFT, scale: '1' });
    const [editingInstId, setEditingInstId] = useState<string | null>(null);
    const [instDraft, setInstDraft] = useState<EditorDraft>(EMPTY_DRAFT);
    const [stageScale, setStageScale] = useState(1);
    const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
    const isPanning = useRef(false);
    const panStart = useRef({ x: 0, y: 0 });
    const stageRef = useRef<Konva.Stage>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const [clipboard, setClipboard] = useState<Instance[]>([]);
    const [targetedId, setTargetedId] = useState<string | null>(null);
    const targetedIdRef = useRef<string | null>(null);
    const mergeCheckCounter = useRef(0);
    const [newProtoOpen, setNewProtoOpen] = useState(false);
    const [editMode, setEditMode] = useState(false);

    const [bgImage] = useImage(new URL('./assets/background.jpg', import.meta.url).href);

    const prototypeMap = useMemo(() => {
        const map = new Map<string, Prototype>();
        for (const p of state.prototypes) map.set(p.id, p);
        return map;
    }, [state.prototypes]);

    // --- Instance helpers ---

    function isLocked(id: string): boolean {
        const inst = state.instances.get(id);
        return !!(inst?.props?.locked);
    }

    function toggleLock(id: string) {
        setState(prev => {
            const inst = prev.instances.get(id);
            if (!inst) return prev;
            const next = new Map(prev.instances);
            next.set(id, { ...inst, props: { ...inst.props, locked: !inst.props?.locked } });
            return { ...prev, instances: next };
        });
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
        setState(prev => {
            const next = new Map(prev.instances);
            for (const id of ids) next.delete(id);
            return { ...prev, instances: next };
        });
        removeFromSelection(ids);
    }

    function deleteSelected(ids: Set<string>) {
        if (ids.size === 0) return;
        setState(prev => {
            const next = new Map(prev.instances);
            for (const id of ids) next.delete(id);
            return { ...prev, instances: next, hiddenRegions: (prev.hiddenRegions ?? []).filter(r => !ids.has(r.id)) };
        });
        removeFromSelection(ids);
    }

    function getFocusedIds(): Set<string> {
        const ids = new Set(selectedIds);
        if (marqueeHitIds) for (const id of marqueeHitIds) ids.add(id);
        if (hoveredId.current) ids.add(hoveredId.current);
        return ids;
    }

    function flipInstances(ids: Set<string>) {
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

    function scaleInstances(ids: Set<string>, factor: number) {
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

    // --- Camera ---

    const ZOOM_FACTOR = 1.1;
    const PAN_SPEED = 8;
    const MIN_SCALE = 0.1;
    const MAX_SCALE = 10;

    const zoomSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    function clampPosition(x: number, y: number, scale: number) {
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

    function syncStageTransform() {
        const stage = stageRef.current;
        if (!stage) return;
        setStageScale(stage.scaleX());
        setStagePos(stage.position());
    }

    function zoomAtPoint(newScale: number, pointX: number, pointY: number) {
        const stage = stageRef.current!;
        const oldScale = stage.scaleX();
        newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
        const mousePointTo = {
            x: (pointX - stage.x()) / oldScale,
            y: (pointY - stage.y()) / oldScale,
        };
        stage.scale({ x: newScale, y: newScale });
        stage.position(clampPosition(
            pointX - mousePointTo.x * newScale,
            pointY - mousePointTo.y * newScale,
            newScale,
        ));
    }

    function handleWheel(e: KonvaEventObject<WheelEvent>) {
        e.evt.preventDefault();
        const stage = e.target.getStage()!;
        const pointer = stage.getPointerPosition()!;
        const direction = e.evt.deltaY > 0 ? -1 : 1;
        const oldScale = stage.scaleX();
        const newScale = direction > 0 ? oldScale * ZOOM_FACTOR : oldScale / ZOOM_FACTOR;
        zoomAtPoint(newScale, pointer.x, pointer.y);
        if (zoomSyncTimer.current) clearTimeout(zoomSyncTimer.current);
        zoomSyncTimer.current = setTimeout(syncStageTransform, 150);
    }

    const screenToStage = useCallback((screenX: number, screenY: number) => {
        const stage = stageRef.current!;
        const scale = stage.scaleX();
        const pos = stage.position();
        return {
            x: (screenX - pos.x) / scale,
            y: (screenY - pos.y) / scale,
        };
    }, []);

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
        setState(prev => {
            const next = new Map(prev.instances);
            for (const inst of newInstances) next.set(inst.id, inst);
            return { ...prev, instances: next };
        });
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
    const stateRef = useRef({ stageScale, stagePos, selectedIds, marqueeHitIds, hoveredId: hoveredId.current, state, prototypeMap });
    useEffect(() => {
        stateRef.current = { stageScale, stagePos, selectedIds, marqueeHitIds, hoveredId: hoveredId.current, state, prototypeMap };
    });

    useEffect(() => {
        const SCALE_SPEED = 1.02;

        function tick() {
            const stage = stageRef.current;
            if (!stage) { animRef.current = requestAnimationFrame(tick); return; }
            const keys = heldKeys.current;
            let dx = 0, dy = 0;
            if (keys.has('w') || keys.has('ArrowUp')) dy += PAN_SPEED;
            if (keys.has('s') || keys.has('ArrowDown')) dy -= PAN_SPEED;
            if (keys.has('a') || keys.has('ArrowLeft')) dx += PAN_SPEED;
            if (keys.has('d') || keys.has('ArrowRight')) dx -= PAN_SPEED;
            if (dx !== 0 || dy !== 0) {
                const pos = stage.position();
                stage.position(clampPosition(pos.x + dx, pos.y + dy, stage.scaleX()));
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
                    const prev = stage.scaleX();
                    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev * factor));
                    const cx = window.innerWidth / 2;
                    const cy = window.innerHeight / 2;
                    const pos = stage.position();
                    const mx = (cx - pos.x) / prev;
                    const my = (cy - pos.y) / prev;
                    stage.scale({ x: newScale, y: newScale });
                    stage.position(clampPosition(cx - mx * newScale, cy - my * newScale, newScale));
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
                syncStageTransform();
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
        let containerInst: Instance | undefined;
        for (const id of focusedIds) {
            const inst = state.instances.get(id);
            if (!inst) continue;
            const proto = prototypeMap.get(inst.prototypeId);
            if (proto?.type === "deck" || proto?.type === "stack") { containerInst = inst; break; }
        }
        if (!containerInst) return;

        const containerProto = prototypeMap.get(containerInst.prototypeId);
        const isStack = containerProto?.type === "stack";
        const itemsKey = isStack ? "items" : "cards";
        const entries = (containerInst.props?.[itemsKey] as { prototypeId: string; props?: Record<string, unknown> }[]) ?? [];
        if (entries.length === 0) return;

        const topItem = entries[entries.length - 1];
        const newId = crypto.randomUUID();
        const remaining = entries.slice(0, -1);

        setState(prev => {
            const next = new Map(prev.instances);
            if (remaining.length === 1) {
                const lastItem = remaining[0];
                next.delete(containerInst.id);
                const lastId = crypto.randomUUID();
                next.set(lastId, { id: lastId, prototypeId: lastItem.prototypeId, x: containerInst.x, y: containerInst.y, props: lastItem.props });
                next.set(newId, { id: newId, prototypeId: topItem.prototypeId, x: containerInst.x, y: containerInst.y, props: topItem.props });
            } else {
                const existing = next.get(containerInst.id)!;
                next.set(containerInst.id, { ...existing, props: { ...existing.props, [itemsKey]: remaining } });
                next.set(newId, { id: newId, prototypeId: topItem.prototypeId, x: containerInst.x, y: containerInst.y, props: topItem.props });
            }
            return { ...prev, instances: next };
        });

        pendingDragId.current = newId;
    }

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.key === 'Delete' || e.key === 'Backspace') && editMode) {
                e.preventDefault();
                deleteSelected(getFocusedIds());
            }
            if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
                const ids = getFocusedIds();
                if (ids.size === 0) return;
                setClipboard([...ids].map(id => state.instances.get(id)!).filter(Boolean));
            }
            if (e.key === 'f') {
                flipInstances(getFocusedIds());
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

    const updatePosition = useCallback((id: string, x: number, y: number) => {
        setState(prev => {
            const inst = prev.instances.get(id);
            if (!inst) return prev;
            const next = new Map(prev.instances);
            next.set(id, { ...inst, x, y });
            return { ...prev, instances: next };
        });
    }, []);

    const spawnInstance = useCallback((prototypeId: string, e: React.MouseEvent) => {
        const id = crypto.randomUUID();
        const stage = layerRef.current?.getStage();
        const pointer = stage?.getPointerPosition() ?? { x: e.clientX, y: e.clientY };
        const stageCoords = screenToStage(pointer.x, pointer.y);

        setState(prev => {
            const next = new Map(prev.instances);
            next.set(id, { id, prototypeId, x: stageCoords.x, y: stageCoords.y });
            return { ...prev, instances: next };
        });

        pendingDragId.current = id;
    }, [screenToStage]);

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
        e.target.opacity(0.7);

        // Move dragged node to the drag layer so main layer doesn't redraw each frame
        if (dragLayerRef.current) {
            e.target.moveTo(dragLayerRef.current);
            e.target.moveToTop();
        }

        if (selectedIds.has(draggedId) && layerRef.current) {
            const starts = new Map<string, { x: number; y: number }>();
            const refs = new Map<string, Konva.Node>();
            starts.set(draggedId, { x: e.target.x(), y: e.target.y() });
            refs.set(draggedId, e.target);
            for (const id of selectedIds) {
                if (id === draggedId) continue;
                const node = layerRef.current.findOne(`#${id}`);
                if (node) {
                    node.opacity(0.7);
                    starts.set(id, { x: node.x(), y: node.y() });
                    refs.set(id, node);
                    // Move selected nodes to drag layer too
                    if (dragLayerRef.current) node.moveTo(dragLayerRef.current);
                }
            }
            dragStartPos.current = starts;
            dragNodeRefs.current = refs;
        } else {
            dragStartPos.current = new Map();
            dragNodeRefs.current = new Map();
        }
    }

    function handleDragMove(e: KonvaEventObject<DragEvent>) {
        const draggedId = e.target.id();
        mergeCheckCounter.current++;
        if (mergeCheckCounter.current % 6 === 0) {
            const newTarget = findMergeTarget(draggedId);
            if (newTarget !== targetedIdRef.current) {
                targetedIdRef.current = newTarget;
                setTargetedId(newTarget);
            }
        }

        if (dragStartPos.current.size <= 1) return;
        const startPos = dragStartPos.current.get(draggedId);
        if (!startPos) return;
        const dx = e.target.x() - startPos.x;
        const dy = e.target.y() - startPos.y;
        for (const [id, pos] of dragStartPos.current) {
            if (id === draggedId) continue;
            const node = dragNodeRefs.current.get(id);
            if (node) {
                node.x(pos.x + dx);
                node.y(pos.y + dy);
            }
        }
    }

    function handleDragEnd(e: KonvaEventObject<DragEvent>) {
        e.target.opacity(1);
        targetedIdRef.current = null;
        setTargetedId(null);
        const draggedId = e.target.id();

        if (dragStartPos.current.size > 1) {
            const startPos = dragStartPos.current.get(draggedId);
            if (startPos) {
                const dx = e.target.x() - startPos.x;
                const dy = e.target.y() - startPos.y;
                setState(prev => {
                    const next = new Map(prev.instances);
                    for (const [id, sp] of dragStartPos.current) {
                        if (id === draggedId) continue;
                        const inst = next.get(id);
                        if (inst) next.set(id, { ...inst, x: sp.x + dx, y: sp.y + dy });
                    }
                    return { ...prev, instances: next };
                });
                // Restore opacity on secondary nodes (still on drag layer)
                for (const [id] of dragStartPos.current) {
                    if (id === draggedId) continue;
                    const node = dragNodeRefs.current.get(id);
                    if (node) node.opacity(1);
                }
            }
        }
        dragStartPos.current = new Map();
        dragNodeRefs.current = new Map();

        tryMerge(draggedId);

        // Move all nodes back from drag layer to main layer
        if (dragLayerRef.current && layerRef.current) {
            const dragChildren = [...dragLayerRef.current.getChildren()];
            for (const node of dragChildren) node.moveTo(layerRef.current);
        }

        // Re-sort z-order on main layer
        if (layerRef.current) {
            const sorted = [...layerRef.current.getChildren()].sort((a, b) => getZOrder(a.name()) - getZOrder(b.name()));
            for (const node of sorted) node.moveToTop();
        }
    }

    // --- Card/Deck/Stack merge ---

    function findMergeTarget(draggedId: string): string | null {
        if (!layerRef.current || !stageRef.current) return null;
        const draggedInst = state.instances.get(draggedId);
        if (!draggedInst) return null;
        const draggedProto = prototypeMap.get(draggedInst.prototypeId);
        if (!draggedProto || draggedProto.type === "board") return null;
        // Dragged node may be on the drag layer, so search the whole stage
        const draggedNode = stageRef.current.findOne(`#${draggedId}`);
        if (!draggedNode) return null;
        const draggedRect = draggedNode.getClientRect();

        // Iterate layer children directly instead of per-instance findOne() lookups
        for (const targetNode of layerRef.current.getChildren()) {
            const targetId = targetNode.id();
            if (!targetId || targetId === draggedId) continue;
            const targetInst = state.instances.get(targetId);
            if (!targetInst) continue;
            const targetProto = prototypeMap.get(targetInst.prototypeId);
            if (!targetProto) continue;
            // Card merges: card→card, card→deck
            if (draggedProto.type === "card" && targetProto.type !== "card" && targetProto.type !== "deck" && targetProto.type !== "stack") continue;
            // Deck merges: deck→deck only
            if (draggedProto.type === "deck" && targetProto.type !== "deck") continue;
            // Token merges: token→token, token→stack
            if (draggedProto.type === "token" && targetProto.type !== "token" && targetProto.type !== "stack") continue;
            // Stack merges: stack→stack only
            if (draggedProto.type === "stack" && targetProto.type !== "stack") continue;
            if (rectsOverlap50(draggedRect, targetNode.getClientRect())) return targetId;
        }
        return null;
    }

    function tryMerge(draggedId: string) {
        const targetId = findMergeTarget(draggedId);
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
            removeFromSelection([draggedId]);
            return;
        }

        // Card → Card = new Deck
        if (draggedProto.type === "card" && targetProto.type === "card") {
            const deckProtoId = getOrCreateDeckPrototype();
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
            removeFromSelection([draggedId, targetId]);
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
            removeFromSelection([draggedId]);
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
            removeFromSelection([draggedId]);
            return;
        }

        // Token → Token = new Stack
        if (draggedProto.type !== "deck" && draggedProto.type !== "stack" && draggedProto.type !== "board"
            && targetProto.type !== "deck" && targetProto.type !== "stack" && targetProto.type !== "board") {
            const stackProtoId = getOrCreateStackPrototype();
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
            removeFromSelection([draggedId, targetId]);
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
            removeFromSelection([draggedId]);
            return;
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

    function getOrCreateStackPrototype(): string {
        const existing = state.prototypes.find(p => p.type === "stack");
        if (existing) return existing.id;
        const id = crypto.randomUUID();
        setState(prev => ({
            ...prev,
            prototypes: [...prev.prototypes, { id, type: "stack", props: { text: "Stack" } }],
        }));
        return id;
    }

    // --- Marquee selection ---

    const lastMarqueeCheck = useRef(0);

    function updateMarqueeRect() {
        const box = selBoxRef.current;
        const rect = marqueeRectRef.current;
        const layer = marqueeLayerRef.current;
        const stage = stageRef.current;
        if (!rect || !layer || !stage) return;
        if (box) {
            const scale = stage.scaleX();
            const pos = stage.position();
            layer.scaleX(1 / scale);
            layer.scaleY(1 / scale);
            layer.x(-pos.x / scale);
            layer.y(-pos.y / scale);
            rect.x(Math.min(box.x1, box.x2));
            rect.y(Math.min(box.y1, box.y2));
            rect.width(Math.abs(box.x2 - box.x1));
            rect.height(Math.abs(box.y2 - box.y1));
            rect.visible(true);
        } else {
            rect.visible(false);
        }
        layer.batchDraw();
    }

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
        if (evt.button !== 0) return;
        if (e.target !== e.target.getStage()) {
            const groupId = getGroupId(e);
            if (!isLocked(groupId)) return;
        }
        const pos = e.target.getStage()!.getPointerPosition()!;
        isSelecting.current = true;
        selBoxRef.current = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y };
        updateMarqueeRect();
        setMarqueeHitIds(null);
        if (!evt.shiftKey) setSelectedIds(new Set());
    }

    function handleStageMouseMove(e: KonvaEventObject<MouseEvent>) {
        const evt = e.evt as MouseEvent;
        if (isPanning.current) {
            const stage = stageRef.current!;
            stage.position(clampPosition(
                evt.clientX - panStart.current.x,
                evt.clientY - panStart.current.y,
                stage.scaleX(),
            ));
            return;
        }
        if (!isSelecting.current || !selBoxRef.current) return;
        const pos = e.target.getStage()!.getPointerPosition()!;
        selBoxRef.current = { ...selBoxRef.current, x2: pos.x, y2: pos.y };
        updateMarqueeRect();
        const now = performance.now();
        if (now - lastMarqueeCheck.current >= 50) {
            lastMarqueeCheck.current = now;
            const newHits = computeMarqueeHits(selBoxRef.current);
            setMarqueeHitIds(prev => {
                if (newHits.size !== (prev?.size ?? 0)) return newHits;
                for (const id of newHits) { if (!prev?.has(id)) return newHits; }
                return prev;
            });
        }
    }

    function handleStageMouseUp() {
        if (isPanning.current) { isPanning.current = false; syncStageTransform(); return; }
        if (!isSelecting.current || !selBoxRef.current) {
            isSelecting.current = false;
            selBoxRef.current = null;
            updateMarqueeRect();
            setMarqueeHitIds(null);
            return;
        }
        isSelecting.current = false;
        const hits = computeMarqueeHits(selBoxRef.current);
        if (hits.size > 0) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                for (const id of hits) next.add(id);
                return next;
            });
        }
        selBoxRef.current = null;
        updateMarqueeRect();
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



    function getContextMenuNames(): { heading?: string; subheading?: string } {
        if (!contextMenu?.instanceId) return {};
        const inst = state.instances.get(contextMenu.instanceId);
        if (!inst) return {};
        const proto = prototypeMap.get(inst.prototypeId);
        if (!proto) return {};
        const instName = (inst.props?.name as string) || undefined;
        const protoName = (proto.props.name as string) || undefined;
        const heading = instName ?? protoName ?? proto.type;
        const subheading = instName && protoName && instName !== protoName ? protoName : undefined;
        return { heading, subheading };
    }

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
            const inst = state.instances.get(instId);
            const instProto = inst ? prototypeMap.get(inst.prototypeId) : null;
            const canFlip = !!(inst && instProto && resolveProps(instProto, inst).hasBack);
            const items: ContextMenuItem[] = [
                { label: 'Edit', action: () => { openInstEditor(instId); setContextMenu(null); } },
                {
                    label: 'Edit Prototype', action: () => {
                        const inst = state.instances.get(instId);
                        if (inst) openProtoEditor(inst.prototypeId);
                        setContextMenu(null);
                    }
                },
                { label: isLocked(instId) ? 'Unlock' : 'Lock', action: () => toggleLock(instId) },
            ];
            if (canFlip) {
                items.push({
                    label: 'Flip', action: () => {
                        flipInstances(new Set([instId]));
                        setContextMenu(null);
                    }
                });
            }
            items.push(
                { label: 'Grow', action: () => scaleInstances(new Set([instId]), 1.2) },
                { label: 'Shrink', action: () => scaleInstances(new Set([instId]), 1 / 1.2) },
                {
                    label: 'Copy', action: () => {
                        const inst = state.instances.get(instId);
                        if (inst) setClipboard([inst]);
                        setContextMenu(null);
                    }
                },

                {
                    label: 'Make Prototype', action: () => {
                        const inst = state.instances.get(instId);
                        if (!inst) return;
                        const proto = prototypeMap.get(inst.prototypeId);
                        if (!proto) return;
                        const newProtoId = crypto.randomUUID();
                        const merged = resolveProps(proto, inst);
                        const { locked, ...protoProps } = merged as Record<string, unknown> & { locked?: unknown };
                        setState(prev => {
                            const next = new Map(prev.instances);
                            next.set(instId, { ...inst, prototypeId: newProtoId, props: undefined });
                            return {
                                ...prev,
                                prototypes: [...prev.prototypes, { id: newProtoId, type: proto.type, props: protoProps }],
                                instances: next,
                            };
                        });
                        setContextMenu(null);
                    }
                },
                { label: 'Delete', action: () => { deleteInstances(new Set([instId])); setContextMenu(null); } },
            );
            return items;
        }
        if (clipboard.length > 0) {
            return [{
                label: 'Paste', action: () => {
                    const stageCoords = screenToStage(contextMenu.x, contextMenu.y);
                    pasteAt(stageCoords.x, stageCoords.y);
                    setContextMenu(null);
                }
            }];
        }
        return [];
    }

    // --- Editors ---

    const editingProto = editingProtoId ? prototypeMap.get(editingProtoId) ?? null : null;

    function draftFromProps(props: Record<string, unknown>, defaultScale: string = '1'): EditorDraft {
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

    function draftToUpdates(draft: EditorDraft, existingProps?: Record<string, unknown>): Record<string, unknown> {
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

    const openProtoEditor = useCallback((protoId: string) => {
        const proto = stateRef.current.prototypeMap.get(protoId);
        if (!proto) return;
        setProtoDraft({ ...draftFromProps(proto.props), type: proto.type });
        setEditingProtoId(protoId);
    }, []);

    function saveProtoEdits() {
        if (!editingProto) return;
        const updates = draftToUpdates(protoDraft, editingProto.props);
        // Proto always saves text even if empty
        updates.text = protoDraft.text;
        const newType = protoDraft.type ?? editingProto.type;
        setState(prev => ({
            ...prev,
            prototypes: prev.prototypes.map(p =>
                p.id === editingProto.id ? { ...p, type: newType, props: { ...p.props, ...updates } } : p
            ),
        }));
        setEditingProtoId(null);
    }

    const editingInst = editingInstId ? state.instances.get(editingInstId) ?? null : null;

    function openInstEditor(instanceId: string) {
        const inst = state.instances.get(instanceId);
        if (!inst) return;
        const proto = prototypeMap.get(inst.prototypeId);
        setInstDraft(draftFromProps(inst.props ?? {}, ''));
        // Carry hasBack and type from prototype
        if (proto) {
            setInstDraft(prev => ({ ...prev, hasBack: !!(proto.props.hasBack), type: proto.type }));
        }
        setEditingInstId(instanceId);
    }

    function saveInstEdits() {
        if (!editingInst) return;
        const proto = prototypeMap.get(editingInst.prototypeId);
        const updates = draftToUpdates(instDraft, proto?.props);
        const newType = instDraft.type;
        setState(prev => {
            const next = new Map(prev.instances);
            const inst = next.get(editingInstId!);
            if (inst) next.set(editingInstId!, { ...inst, props: { ...inst.props, ...updates } });
            return {
                ...prev,
                prototypes: newType && proto ? prev.prototypes.map(p =>
                    p.id === proto.id ? { ...p, type: newType } : p
                ) : prev.prototypes,
                instances: next,
            };
        });
        setEditingInstId(null);
    }

    function getInstPlaceholders() {
        if (!editingInst) return { name: '', text: '', scale: '', imageSrc: '' };
        const p = prototypeMap.get(editingInst.prototypeId);
        return {
            name: (p?.props.name as string) ?? '',
            text: (p?.props.text as string) ?? '',
            scale: String((p?.props.scale as number) ?? 1),
            imageSrc: (p?.props.src as string) ?? (p?.props.imageSrc as string) ?? '',
        };
    }

    // --- Players ---


    const addPlayer = useCallback(() => {
        setState(prev => {
            const usedColors = new Set(prev.players.map(p => p.color));
            const color = PLAYER_COLORS.find(c => !usedColors.has(c)) ?? `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`;
            const name = `Player ${prev.players.length + 1}`;
            return {
                ...prev,
                players: [...prev.players, { id: crypto.randomUUID(), color, name }],
            };
        });
    }, []);

    function createPrototype(type: import('./state_management/types').ObjectType, text: string, scale: number, imageSrc: string) {
        const props: Record<string, unknown> = { text };
        if (scale !== 1) props.scale = scale;
        if (imageSrc) props.src = imageSrc;
        setState(prev => ({
            ...prev,
            prototypes: [...prev.prototypes, { id: crypto.randomUUID(), type, props }],
        }));
    }

    const deletePrototype = useCallback((id: string) => {
        setState(prev => {
            const next = new Map(prev.instances);
            for (const [instId, inst] of next) {
                if (inst.prototypeId === id) next.delete(instId);
            }
            return { ...prev, prototypes: prev.prototypes.filter(p => p.id !== id), instances: next };
        });
    }, []);

    const deletePlayer = useCallback((id: string) => {
        setState(prev => ({
            ...prev,
            players: prev.players.filter(p => p.id !== id),
        }));
    }, []);

    // --- Hidden Regions ---

    const addHiddenRegion = useCallback((playerId: string) => {
        const { stagePos: sp, stageScale: sc } = stateRef.current;
        const region = {
            id: crypto.randomUUID(),
            playerId,
            x: -sp.x / sc + 100,
            y: -sp.y / sc + 100,
            width: 200,
            height: 200,
        };
        setState(prev => ({
            ...prev,
            hiddenRegions: [...(prev.hiddenRegions ?? []), region],
        }));
    }, []);

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
        if (editMode) return hidden;
        if (!assignedPlayerId) return hidden;
        const otherRegions = (state.hiddenRegions ?? []).filter(r => r.playerId !== assignedPlayerId);
        if (otherRegions.length === 0) return hidden;
        for (const inst of state.instances.values()) {
            const proto = prototypeMap.get(inst.prototypeId);
            if (!proto) continue;
            const resolved = resolveProps(proto, inst);
            const scale = (resolved.scale as number) ?? 1;
            // Approximate instance bounds — cards/tokens/decks use ~100×150 base, boards vary
            let w = 100 * scale;
            let h = 150 * scale;
            if (proto.type === 'token') { w = 50 * scale; h = 50 * scale; }
            if (proto.type === 'board') { w = 200 * scale; h = 200 * scale; }
            const instRect: Rect2D = { x: inst.x - w / 2, y: inst.y - h / 2, width: w, height: h };
            for (const region of otherRegions) {
                const regionRect: Rect2D = { x: region.x, y: region.y, width: region.width, height: region.height };
                if (rectsIntersect(instRect, regionRect)) {
                    hidden.add(inst.id);
                    break;
                }
            }
        }
        return hidden;
    }, [state.instances, state.hiddenRegions, assignedPlayerId, prototypeMap, editMode]);

    const playerMap = useMemo(() => {
        const map = new Map<string, import('./state_management/types').Player>();
        for (const p of state.players) map.set(p.id, p);
        return map;
    }, [state.players]);

    // --- Persistence ---

    const handleSave = useCallback(() => downloadJson(stateRef.current.state), []);
    const handleNewPrototype = useCallback(() => setNewProtoOpen(true), []);

    const handleLoad = useCallback(async () => {
        try {
            const loaded = await uploadJson();
            setState(loaded);
        } catch {
            // user cancelled or invalid file
        }
    }, []);

    function pickTTSFile(onResult: (imported: CanvasState) => void) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const raw = JSON.parse(text);
                const imported = await convertTTSSave(raw);
                onResult(imported);
            } catch {
                // user cancelled or invalid file
            }
        };
        input.click();
    }

    const handleLoadTTS = useCallback(() => {
        pickTTSFile((imported) => setState(imported));
    }, []);

    const handleImportTTS = useCallback(() => {
        pickTTSFile((imported) => {
            setState(prev => {
                const next = new Map(prev.instances);
                for (const [id, inst] of imported.instances) next.set(id, inst);
                return { ...prev, prototypes: [...prev.prototypes, ...imported.prototypes], instances: next };
            });
        });
    }, []);

    const handleLayerMouseEnter = useCallback((e: import('konva/lib/Node').KonvaEventObject<MouseEvent>) => {
        if (isPanning.current || isSelecting.current) return;
        const id = getGroupId(e);
        const { state: s, prototypeMap: pm } = stateRef.current;
        const inst = s.instances.get(id);
        const locked = !!(inst?.props?.locked);
        if (id && !locked) hoveredId.current = id;
        if (!id || !inst) { setTooltip(null); return; }
        const proto = pm.get(inst.prototypeId);
        if (!proto) { setTooltip(null); return; }
        if (proto.type === 'deck') {
            const count = ((inst.props?.cards as unknown[]) ?? []).length;
            setTooltip({ x: e.evt.clientX, y: e.evt.clientY, text: `[${count}]\n[space] to draw` });
        } else if (proto.type === 'stack') {
            const count = ((inst.props?.items as unknown[]) ?? []).length;
            setTooltip({ x: e.evt.clientX, y: e.evt.clientY, text: `[${count}]\n[space] to draw` });
        } else {
            setTooltip(null);
        }
    }, []);

    const handleLayerMouseLeave = useCallback(() => {
        if (isPanning.current || isSelecting.current) return;
        hoveredId.current = null;
        setTooltip(null);
    }, []);

    const handleLayerClick = useCallback((e: import('konva/lib/Node').KonvaEventObject<MouseEvent>) => {
        const id = getGroupId(e);
        const { state: s } = stateRef.current;
        const inst = s.instances.get(id);
        const locked = !!(inst?.props?.locked);
        if (!id || locked) return;
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
    }, []);

    // --- Render ---

    return (
        <>
            <Sidebar
                opened={opened}
                onClose={close}
                prototypes={state.prototypes}
                players={state.players}
                onSave={handleSave}
                onLoad={handleLoad}
                onSpawn={spawnInstance}
                onEditPrototype={openProtoEditor}
                onDeletePrototype={deletePrototype}
                onNewPrototype={handleNewPrototype}
                onAddPlayer={addPlayer}
                onDeletePlayer={deletePlayer}
                onAddHiddenRegion={addHiddenRegion}
                onLoadTTS={handleLoadTTS}
                onImportTTS={handleImportTTS}
                isHost={isHost}
                hostPlayerId={hostPlayerId}
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
                    <Layer listening={false}>
                        {bgImage && <Rect
                            x={-BG_SIZE / 2}
                            y={-BG_SIZE / 2}
                            width={BG_SIZE}
                            height={BG_SIZE}
                            fillPatternImage={bgImage}
                            fillPatternRepeat="repeat"
                            fillPatternScaleX={BG_SIZE / (bgImage.naturalWidth * 10)}
                            fillPatternScaleY={BG_SIZE / (bgImage.naturalWidth * 10)}
                        />}
                    </Layer>
                    <Layer ref={layerRef} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}
                        onMouseEnter={handleLayerMouseEnter}
                        onMouseLeave={handleLayerMouseLeave}
                        onClick={handleLayerClick}>
                        {[...state.instances.values()].map(inst => {
                            if (hiddenInstanceIds.has(inst.id)) return null;
                            const proto = prototypeMap.get(inst.prototypeId);
                            if (!proto) return null;
                            const locked = !!(inst.props?.locked);
                            const hovered = locked ? false : marqueeHitIds ? marqueeHitIds.has(inst.id) : undefined;
                            return renderInstance(inst, proto, updatePosition, locked ? false : selectedIds.has(inst.id), hovered, targetedId === inst.id, prototypeMap);
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
                    <Layer ref={dragLayerRef}
                        onDragMove={handleDragMove}
                        onDragEnd={handleDragEnd} />
                    <Layer ref={marqueeLayerRef} listening={false}>
                        <Rect
                            ref={marqueeRectRef}
                            visible={false}
                            stroke={MARQUEE_STROKE}
                            strokeWidth={1}
                            dash={[6, 3]}
                            listening={false}
                        />
                    </Layer>
                </Stage>
            </div>
            {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} {...getContextMenuNames()} items={getContextMenuItems()} />}
            {tooltip && !contextMenu && (
                <div style={{
                    position: 'absolute',
                    left: tooltip.x + 12,
                    top: tooltip.y + 12,
                    background: TOOLTIP_BG,
                    color: TOOLTIP_FG,
                    padding: '4px 8px',
                    borderRadius: 4,
                    fontSize: 12,
                    pointerEvents: 'none',
                    zIndex: 1000,
                    whiteSpace: 'pre',
                }}><span>{tooltip.text}</span></div>
            )}
            {editingProto && <EditorModal
                opened
                onClose={() => setEditingProtoId(null)}
                title="Edit Prototype"
                draft={protoDraft}
                onDraftChange={setProtoDraft}
                onSave={saveProtoEdits}
                protoType={editingProto.type}
            />}
            {editingInst && <EditorModal
                opened
                onClose={() => setEditingInstId(null)}
                title="Edit Instance"
                draft={instDraft}
                onDraftChange={setInstDraft}
                onSave={saveInstEdits}
                placeholders={getInstPlaceholders()}
                protoType={prototypeMap.get(editingInst.prototypeId)?.type}
                isInstance
                onEditPrototype={() => {
                    const protoId = editingInst.prototypeId;
                    setEditingInstId(null);
                    openProtoEditor(protoId);
                }}
                onResetToPrototype={() => {
                    setState(prev => {
                        const next = new Map(prev.instances);
                        const inst = next.get(editingInstId!);
                        if (inst) next.set(editingInstId!, { ...inst, props: undefined });
                        return { ...prev, instances: next };
                    });
                    setEditingInstId(null);
                }}
            />}
            <JoinModal opened={!assignedPlayerId} onJoin={claimPlayer} />
            {newProtoOpen && <NewProtoModal opened onClose={() => setNewProtoOpen(false)} onCreate={createPrototype} />}
        </>
    );
}
