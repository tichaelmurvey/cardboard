import { useState, useMemo, useRef, useEffect } from 'react';
import { Stage, Layer, Rect } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Drawer, Button, Stack, Divider, Text as MantineText, Badge, UnstyledButton, Modal, TextInput, Group as MantineGroup } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import Konva from 'konva';
import { Card } from './components/card/card';
import { Token } from './components/token/token';
import { Board } from './components/board/board';
import { Deck } from './components/deck/deck';
import { DEFAULT_STATE } from './state_management/defaults';
import { downloadJson, uploadJson } from './state_management/persistence';
import type { CanvasState, Instance, Prototype } from './state_management/types';
import { resolveProps } from './state_management/types';

export default function App() {
    const [opened, { open, close }] = useDisclosure(false);
    const [state, setState] = useState<CanvasState>(DEFAULT_STATE);
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
    const [protoDraft, setProtoDraft] = useState<{ text: string; scale: string; imageSrc: string }>({ text: '', scale: '1', imageSrc: '' });
    const [editingInstId, setEditingInstId] = useState<string | null>(null);
    const [instDraft, setInstDraft] = useState<{ text: string; scale: string; imageSrc: string }>({ text: '', scale: '', imageSrc: '' });
    const [stageScale, setStageScale] = useState(1);
    const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
    const isPanning = useRef(false);
    const panStart = useRef({ x: 0, y: 0 });
    const stageRef = useRef<Konva.Stage>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const [clipboard, setClipboard] = useState<Instance[]>([]);
    const [targetedId, setTargetedId] = useState<string | null>(null);

    const prototypeMap = useMemo(() => {
        const map = new Map<string, Prototype>();
        for (const p of state.prototypes) map.set(p.id, p);
        return map;
    }, [state.prototypes]);

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

    function deleteInstances(ids: Set<string>) {
        if (ids.size === 0) return;
        setState(prev => ({
            ...prev,
            instances: prev.instances.filter(inst => !ids.has(inst.id)),
        }));
        setSelectedIds(prev => {
            const next = new Set(prev);
            for (const id of ids) next.delete(id);
            return next;
        });
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

    function deleteSelected() {
        deleteInstances(getFocusedIds());
    }

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

    // Continuous keyboard actions (pan + scale/zoom) — stable effect with rAF loop
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
            if (!animRef.current) {
                animRef.current = requestAnimationFrame(tick);
            }
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
            if (![...heldKeys.current].some(k => HELD_KEYS_SET.has(k))) {
                stopLoop();
            }
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
                // Only 1 card left — replace deck with that card, plus draw the top card
                const lastCard = remaining[0];
                instances = [
                    ...prev.instances.filter(i => i.id !== deckInst.id),
                    {
                        id: crypto.randomUUID(),
                        prototypeId: lastCard.prototypeId,
                        x: deckInst.x,
                        y: deckInst.y,
                        props: lastCard.props,
                    },
                    {
                        id: newId,
                        prototypeId: topCard.prototypeId,
                        x: deckInst.x,
                        y: deckInst.y,
                        props: topCard.props,
                    },
                ];
            } else {
                instances = [
                    ...prev.instances.map(inst =>
                        inst.id === deckInst.id
                            ? { ...inst, props: { ...inst.props, cards: remaining } }
                            : inst
                    ),
                    {
                        id: newId,
                        prototypeId: topCard.prototypeId,
                        x: deckInst.x,
                        y: deckInst.y,
                        props: topCard.props,
                    },
                ];
            }
            return { ...prev, instances };
        });

        pendingDragId.current = newId;
    }

    // One-shot keyboard shortcuts (delete, copy, paste)
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                deleteSelected();
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
            if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
                if (clipboard.length === 0) return;
                const pointer = stageRef.current?.getPointerPosition();
                const { stageScale: sc, stagePos: sp } = stateRef.current;
                const mouse = pointer
                    ? { x: (pointer.x - sp.x) / sc, y: (pointer.y - sp.y) / sc }
                    : null;
                // Center the pasted group around the mouse position
                const copied = clipboard;
                const cx = copied.reduce((s, i) => s + i.x, 0) / copied.length;
                const cy = copied.reduce((s, i) => s + i.y, 0) / copied.length;
                const dx = mouse ? mouse.x - cx : 20;
                const dy = mouse ? mouse.y - cy : 20;
                const newInstances = copied.map(inst => ({
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
        }
        const el = canvasRef.current;
        if (!el) return;
        el.addEventListener('keydown', handleKeyDown);
        return () => el.removeEventListener('keydown', handleKeyDown);
    });

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
            instances: [...prev.instances, {
                id,
                prototypeId,
                x: stageCoords.x,
                y: stageCoords.y,
            }],
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
        if (isPanning.current) {
            e.target.stopDrag();
            return;
        }
        const draggedId = e.target.id();
        if (isLocked(draggedId)) {
            e.target.stopDrag();
            return;
        }
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

    function rectsOverlap50(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
        const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
        const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        const overlapArea = overlapX * overlapY;
        const smallerArea = Math.min(a.width * a.height, b.width * b.height);
        return smallerArea > 0 && overlapArea >= smallerArea * 0.5;
    }

    function findMergeTarget(draggedId: string): string | null {
        const draggedInst = state.instances.find(i => i.id === draggedId);
        if (!draggedInst) return null;
        const draggedProto = prototypeMap.get(draggedInst.prototypeId);
        if (!draggedProto || (draggedProto.type !== "card" && draggedProto.type !== "deck")) return null;
        if (!layerRef.current) return null;
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

    function handleDragMove(e: KonvaEventObject<DragEvent>) {
        const draggedId = e.target.id();

        // Update merge target highlight
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

        // Check for card/deck merge interactions
        tryAbsorbIntoDeck(draggedId);

        const layer = e.target.getLayer();
        if (!layer) return;

        const sorted = [...layer.getChildren()].sort(
            (a, b) => getZOrder(a.name()) - getZOrder(b.name())
        );
        for (const node of sorted) {
            node.moveToTop();
        }
    }

    function tryAbsorbIntoDeck(draggedId: string) {
        const draggedInst = state.instances.find(i => i.id === draggedId);
        if (!draggedInst) return;
        const draggedProto = prototypeMap.get(draggedInst.prototypeId);
        if (!draggedProto || (draggedProto.type !== "card" && draggedProto.type !== "deck")) return;

        if (!layerRef.current) return;
        const draggedNode = layerRef.current.findOne(`#${draggedId}`);
        if (!draggedNode) return;
        const draggedRect = draggedNode.getClientRect();

        for (const targetInst of state.instances) {
            if (targetInst.id === draggedId) continue;
            const targetProto = prototypeMap.get(targetInst.prototypeId);
            if (!targetProto) continue;

            const targetNode = layerRef.current!.findOne(`#${targetInst.id}`);
            if (!targetNode) continue;
            if (!rectsOverlap50(draggedRect, targetNode.getClientRect())) continue;

            // Card onto deck
            if (draggedProto.type === "card" && targetProto.type === "deck") {
                const cardEntry = { prototypeId: draggedInst.prototypeId, props: draggedInst.props };
                setState(prev => ({
                    ...prev,
                    instances: prev.instances
                        .filter(i => i.id !== draggedId)
                        .map(i => i.id === targetInst.id
                            ? { ...i, props: { ...i.props, cards: [...((i.props?.cards as unknown[]) ?? []), cardEntry] } }
                            : i
                        ),
                }));
                setSelectedIds(prev => { const next = new Set(prev); next.delete(draggedId); return next; });
                return;
            }

            // Card onto card — create a new deck
            if (draggedProto.type === "card" && targetProto.type === "card") {
                const deckProtoId = getOrCreateDeckPrototype();
                const bottomCard = { prototypeId: targetInst.prototypeId, props: targetInst.props };
                const topCard = { prototypeId: draggedInst.prototypeId, props: draggedInst.props };
                const deckId = crypto.randomUUID();
                setState(prev => ({
                    ...prev,
                    instances: [
                        ...prev.instances.filter(i => i.id !== draggedId && i.id !== targetInst.id),
                        {
                            id: deckId,
                            prototypeId: deckProtoId,
                            x: targetInst.x,
                            y: targetInst.y,
                            props: { cards: [bottomCard, topCard] },
                        },
                    ],
                }));
                setSelectedIds(prev => {
                    const next = new Set(prev);
                    next.delete(draggedId);
                    next.delete(targetInst.id);
                    return next;
                });
                return;
            }

            // Deck onto deck — merge all cards into the target
            if (draggedProto.type === "deck" && targetProto.type === "deck") {
                const draggedCards = (draggedInst.props?.cards as unknown[]) ?? [];
                setState(prev => ({
                    ...prev,
                    instances: prev.instances
                        .filter(i => i.id !== draggedId)
                        .map(i => i.id === targetInst.id
                            ? { ...i, props: { ...i.props, cards: [...((i.props?.cards as unknown[]) ?? []), ...draggedCards] } }
                            : i
                        ),
                }));
                setSelectedIds(prev => { const next = new Set(prev); next.delete(draggedId); return next; });
                return;
            }
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

    function computeMarqueeHits(box: { x1: number; y1: number; x2: number; y2: number }) {
        if (!layerRef.current) return new Set<string>();
        const x = Math.min(box.x1, box.x2);
        const y = Math.min(box.y1, box.y2);
        const w = Math.abs(box.x2 - box.x1);
        const h = Math.abs(box.y2 - box.y1);
        if (w < 5 && h < 5) return new Set<string>();
        const boxRect = { x, y, width: w, height: h };
        const hits = new Set<string>();
        for (const child of layerRef.current.getChildren()) {
            const id = child.id();
            if (!id || isLocked(id)) continue;
            const cr = child.getClientRect();
            if (
                cr.x < boxRect.x + boxRect.width &&
                cr.x + cr.width > boxRect.x &&
                cr.y < boxRect.y + boxRect.height &&
                cr.y + cr.height > boxRect.y
            ) {
                hits.add(id);
            }
        }
        return hits;
    }

    function handleStageMouseDown(e: KonvaEventObject<MouseEvent>) {
        const evt = e.evt as MouseEvent;
        // Middle mouse button → pan
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
        if (!evt.shiftKey) {
            setSelectedIds(new Set());
        }
    }

    function handleStageMouseMove(e: KonvaEventObject<MouseEvent>) {
        const evt = e.evt as MouseEvent;
        if (isPanning.current) {
            setStagePos({
                x: evt.clientX - panStart.current.x,
                y: evt.clientY - panStart.current.y,
            });
            return;
        }
        if (!isSelecting.current) return;
        const pos = e.target.getStage()!.getPointerPosition()!;
        const newBox = selBox ? { ...selBox, x2: pos.x, y2: pos.y } : null;
        setSelBox(newBox);
        if (newBox) {
            setMarqueeHitIds(computeMarqueeHits(newBox));
        }
    }

    function handleStageMouseUp() {
        if (isPanning.current) {
            isPanning.current = false;
            return;
        }
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

    // Close context menu on any click or scroll
    useEffect(() => {
        if (!contextMenu) return;
        const close = () => setContextMenu(null);
        window.addEventListener('mousedown', close);
        window.addEventListener('wheel', close);
        return () => {
            window.removeEventListener('mousedown', close);
            window.removeEventListener('wheel', close);
        };
    }, [contextMenu]);

    function updatePrototype(id: string, updates: Partial<Prototype['props']>) {
        setState(prev => ({
            ...prev,
            prototypes: prev.prototypes.map(p =>
                p.id === id ? { ...p, props: { ...p.props, ...updates } } : p
            ),
        }));
    }

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
        updatePrototype(editingProto.id, updates);
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

    async function handleLoad() {
        try {
            const loaded = await uploadJson();
            setState(loaded);
        } catch {
            // user cancelled or invalid file
        }
    }

    return (
        <>
            <Drawer position='right' opened={opened} onClose={close} trapFocus={false} closeOnClickOutside={false} withOverlay={false}>
                <h2 style={{
                    fontFamily: 'Sheandy',
                    fontWeight: 'normal',
                    margin: 0,
                    textAlign: "center",
                    fontSize: "5rem",
                    color: "sienna"
                }}>Cardboard</h2>
                <Stack>
                    <Button onClick={() => downloadJson(state)}>Save</Button>
                    <Button onClick={handleLoad}>Load</Button>
                    <Divider label="Prototypes" />
                    {state.prototypes.map(proto => (
                        <MantineGroup key={proto.id} gap="xs" wrap="nowrap">
                            <UnstyledButton
                                onClick={(e) => spawnInstance(proto.id, e)}
                                style={{
                                    flex: 1,
                                    padding: '8px',
                                    border: '1px solid var(--mantine-color-default-border)',
                                    borderRadius: 'var(--mantine-radius-sm)',
                                    cursor: 'grab',
                                }}
                            >
                                <Stack gap="xs">
                                    <Badge variant="light">{proto.type}</Badge>
                                    {typeof proto.props.text === 'string' && <MantineText size="sm">{proto.props.text}</MantineText>}
                                </Stack>
                            </UnstyledButton>
                            <Button size="xs" variant="subtle" onClick={() => openProtoEditor(proto.id)}>Edit</Button>
                        </MantineGroup>
                    ))}
                </Stack>
            </Drawer>
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
                        const group = e.target.findAncestor('Group') ?? e.target;
                        const id = group.id() || null;
                        setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, instanceId: id });
                    }}
                >
                    <Layer ref={layerRef} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}
                        onMouseEnter={(e) => {
                            const group = e.target.findAncestor('Group') ?? e.target;
                            const id = group.id();
                            if (id && !isLocked(id)) setHoveredId(id);
                        }}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={(e) => {
                            const group = e.target.findAncestor('Group') ?? e.target;
                            const id = group.id();
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
                            const proto = prototypeMap.get(inst.prototypeId);
                            if (!proto) return null;
                            const locked = !!(inst.props?.locked);
                            const hovered = locked ? false : marqueeHitIds ? marqueeHitIds.has(inst.id) : undefined;
                            return renderInstance(inst, proto, updatePosition, locked ? false : selectedIds.has(inst.id), hovered, targetedId === inst.id);
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
            {contextMenu && (
                <div
                    onMouseDown={e => e.stopPropagation()}
                    style={{
                        position: 'absolute',
                        left: contextMenu.x,
                        top: contextMenu.y,
                        zIndex: 2000,
                        background: '#f3b963',
                        color: '#130101',
                        border: '2px double #ffe600',
                        borderRadius: 6,
                        padding: 4,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                    }}
                >
                    {(contextMenu.instanceId ? [
                        { label: isLocked(contextMenu.instanceId) ? 'Unlock' : 'Lock', action: () => toggleLock(contextMenu.instanceId!) },
                        { label: 'Grow', action: () => scaleInstances(new Set([contextMenu.instanceId!]), 1.2) },
                        { label: 'Shrink', action: () => scaleInstances(new Set([contextMenu.instanceId!]), 1 / 1.2) },
                        { label: 'Copy', action: () => {
                            const inst = state.instances.find(i => i.id === contextMenu.instanceId);
                            if (inst) setClipboard([inst]);
                            setContextMenu(null);
                        }},
                        { label: 'Edit', action: () => { openInstEditor(contextMenu.instanceId!); setContextMenu(null); } },
                        { label: 'Edit Prototype', action: () => {
                            const inst = state.instances.find(i => i.id === contextMenu.instanceId);
                            if (inst) openProtoEditor(inst.prototypeId);
                            setContextMenu(null);
                        }},
                        { label: 'Delete', action: () => { deleteInstances(new Set([contextMenu.instanceId!])); setContextMenu(null); } },
                    ] : [
                        ...(clipboard.length > 0 ? [{ label: 'Paste', action: () => {
                            const stageCoords = screenToStage(contextMenu.x, contextMenu.y);
                            const copied = clipboard;
                            const cx = copied.reduce((s, i) => s + i.x, 0) / copied.length;
                            const cy = copied.reduce((s, i) => s + i.y, 0) / copied.length;
                            const newInstances = copied.map(inst => ({
                                ...inst,
                                id: crypto.randomUUID(),
                                x: inst.x + (stageCoords.x - cx),
                                y: inst.y + (stageCoords.y - cy),
                                props: inst.props ? { ...inst.props, locked: undefined } : undefined,
                            }));
                            setState(prev => ({
                                ...prev,
                                instances: [...prev.instances, ...newInstances],
                            }));
                            setSelectedIds(new Set(newInstances.map(i => i.id)));
                            setClipboard(newInstances);
                            setContextMenu(null);
                        }}] : []),
                    ]).map(item => (
                        <button
                            key={item.label}
                            onClick={item.action}
                            style={{
                                padding: '4px 12px',
                                background: 'transparent',
                                border: 'none',
                                color: '#130101',
                                cursor: 'pointer',
                                textAlign: 'left',
                                fontSize: 13,
                                borderRadius: 4,
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#e0a040')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
            <Modal opened={!!editingProto} onClose={() => setEditingProtoId(null)} title="Edit Prototype" zIndex={3000}>
                {editingProto && (
                    <Stack>
                        <TextInput
                            label="Name"
                            value={protoDraft.text}
                            onChange={e => { const v = e.currentTarget.value; setProtoDraft(d => ({ ...d, text: v })); }}
                        />
                        <TextInput
                            label="Scale"
                            type="number"
                            step={0.1}
                            min={0.1}
                            value={protoDraft.scale}
                            onChange={e => { const v = e.currentTarget.value; setProtoDraft(d => ({ ...d, scale: v })); }}
                        />
                        <TextInput
                            label="Image Source (URL)"
                            value={protoDraft.imageSrc}
                            onChange={e => { const v = e.currentTarget.value; setProtoDraft(d => ({ ...d, imageSrc: v })); }}
                        />
                        <Button onClick={saveProtoEdits}>Save</Button>
                    </Stack>
                )}
            </Modal>
            <Modal opened={!!editingInst} onClose={() => setEditingInstId(null)} title="Edit Instance" zIndex={3000}>
                {editingInst && (
                    <Stack>
                        <TextInput
                            label="Name (override)"
                            placeholder={(() => { const p = prototypeMap.get(editingInst.prototypeId); return (p?.props.text as string) ?? ''; })()}
                            value={instDraft.text}
                            onChange={e => { const v = e.currentTarget.value; setInstDraft(d => ({ ...d, text: v })); }}
                        />
                        <TextInput
                            label="Scale (override)"
                            type="number"
                            step={0.1}
                            min={0.1}
                            placeholder={(() => { const p = prototypeMap.get(editingInst.prototypeId); return String((p?.props.scale as number) ?? 1); })()}
                            value={instDraft.scale}
                            onChange={e => { const v = e.currentTarget.value; setInstDraft(d => ({ ...d, scale: v })); }}
                        />
                        <TextInput
                            label="Image Source (override)"
                            placeholder={(() => { const p = prototypeMap.get(editingInst.prototypeId); return (p?.props.src as string) ?? (p?.props.imageSrc as string) ?? ''; })()}
                            value={instDraft.imageSrc}
                            onChange={e => { const v = e.currentTarget.value; setInstDraft(d => ({ ...d, imageSrc: v })); }}
                        />
                        <Button onClick={saveInstEdits}>Save</Button>
                    </Stack>
                )}
            </Modal>
        </>
    );
}

function renderInstance(
    instance: Instance,
    prototype: Prototype,
    onDragEnd: (id: string, x: number, y: number) => void,
    selected: boolean,
    hovered?: boolean,
    targeted?: boolean,
) {
    const props = resolveProps(prototype, instance);
    const scale = (props.scale as number) ?? 1;

    switch (prototype.type) {
        case "board":
            return <Board key={instance.id} id={instance.id} x={instance.x} y={instance.y} src={props.src as string} scale={scale} onDragEnd={onDragEnd} selected={selected} hovered={hovered} />;
        case "card":
            return <Card key={instance.id} id={instance.id} x={instance.x} y={instance.y} text={props.text as string | undefined} imageSrc={(props.src as string) ?? (props.imageSrc as string | undefined)} scale={scale} onDragEnd={onDragEnd} selected={selected} hovered={hovered} targeted={targeted} />;
        case "token":
            return <Token key={instance.id} id={instance.id} x={instance.x} y={instance.y} imageSrc={props.imageSrc as string | undefined} text={props.text as string | undefined} scale={scale} onDragEnd={onDragEnd} selected={selected} hovered={hovered} />;
        case "deck":
            return <Deck key={instance.id} id={instance.id} x={instance.x} y={instance.y} cardCount={((props.cards as unknown[]) ?? []).length} text={props.text as string | undefined} scale={scale} onDragEnd={onDragEnd} selected={selected} hovered={hovered} targeted={targeted} />;
    }
}

const Z_ORDER: Record<string, number> = {
    token: 2,
    card: 1,
    deck: 1,
};

function getZOrder(type: string) {
    return Z_ORDER[type] ?? 0;
}
