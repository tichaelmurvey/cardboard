import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Rect } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Button } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import Konva from 'konva';
import { DEFAULT_STATE } from './state_management/defaults';
import { downloadJson, uploadJson } from './state_management/persistence';
import { convertTTSSave } from './state_management/importTTS';
import type { CanvasState, Instance, ObjectType, Prototype, PrototypeGroup } from './state_management/types';
import { resolveProps, isPrototypeGroup } from './state_management/types';
import { flattenPrototypes, insertAtPath, removeById, updatePrototypeById, updateGroupById, collectPrototypeIds, collectGroups, moveToGroup, findParentGroupId } from './state_management/prototypeUtils';
import { rectsIntersect } from './utils/geometry';
import type { Rect2D } from './utils/geometry';
import { renderInstance, getZOrder, getGroupId } from './canvas/renderInstance';
import { BG_SIZE, ZOOM_FACTOR, MIN_SCALE, MAX_SCALE, clampPosition } from './canvas/camera';
import { Sidebar } from './components/sidebar/Sidebar';
import { ContextMenu } from './components/context-menu/ContextMenu';
import { getContextMenuNames, getContextMenuItems } from './components/context-menu/contextMenuItems';
import { EditorModal, EMPTY_DRAFT } from './components/editor/EditorModal';
import type { EditorDraft } from './components/editor/EditorModal';
import { useMultiplayer } from './multiplayer/useMultiplayer';
import { useRoom } from './multiplayer/useRoom';
import { JoinModal } from './components/editor/JoinModal';
import { HiddenRegion } from './components/hidden-region/HiddenRegion';
import { Tooltip } from './components/Tooltip';
import useImage from 'use-image';
import { PLAYER_COLORS, MARQUEE_STROKE, HOVER_STROKE } from './styles/style_consts';
import { draftFromProps, draftToUpdates } from './state_management/editorDraft';
import {
    isLocked as checkLocked,
    toggleLock as doToggleLock,
    removeFromSelection as doRemoveFromSelection,
    deleteInstances as doDeleteInstances,
    deleteSelected as doDeleteSelected,
    flipInstances as doFlipInstances,
    scaleInstances as doScaleInstances,
    pasteAt as doPasteAt,
} from './state_management/instanceOps';
import { findMergeTarget, tryMerge } from './state_management/mergeLogic';
import { useKeyboardPan } from './hooks/useKeyboardPan';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

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
    const marqueeHitIdsRef = useRef<Set<string> | null>(null);
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
    const [creatingProto, setCreatingProto] = useState(false);
    const [newProtoPath, setNewProtoPath] = useState<string[]>([]);
    const [editMode, setEditMode] = useState(false);

    const [bgImage] = useImage(new URL('./assets/background.jpg', import.meta.url).href);

    const prototypeMap = useMemo(() => {
        const map = new Map<string, Prototype>();
        for (const p of flattenPrototypes(state.prototypes)) map.set(p.id, p);
        return map;
    }, [state.prototypes]);

    // --- Instance helper wrappers ---

    function isLocked(id: string): boolean {
        return checkLocked(state.instances, id);
    }

    function toggleLock(id: string) {
        doToggleLock(setState, id);
    }

    function removeFromSelection(ids: Iterable<string>) {
        doRemoveFromSelection(setSelectedIds, ids);
    }

    function deleteInstances(ids: Set<string>) {
        doDeleteInstances(setState, setSelectedIds, ids);
    }

    function deleteSelected(ids: Set<string>) {
        doDeleteSelected(setState, setSelectedIds, ids);
    }

    function getFocusedIds(): Set<string> {
        const ids = new Set(selectedIds);
        if (marqueeHitIdsRef.current) for (const id of marqueeHitIdsRef.current) ids.add(id);
        if (hoveredId.current) ids.add(hoveredId.current);
        return ids;
    }

    function flipInstances(ids: Set<string>) {
        doFlipInstances(setState, prototypeMap, ids);
    }

    function scaleInstances(ids: Set<string>, factor: number) {
        doScaleInstances(setState, ids, factor);
    }

    function pasteAt(stageX: number, stageY: number) {
        doPasteAt(setState, setSelectedIds, setClipboard, clipboard, stageX, stageY);
    }

    // --- Camera ---

    const zoomSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    function disableHitGraph() {
        if (layerRef.current) layerRef.current.hitGraphEnabled(false);
    }

    function enableHitGraph() {
        if (layerRef.current) layerRef.current.hitGraphEnabled(true);
    }

    function syncStageTransform() {
        enableHitGraph();
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
        disableHitGraph();
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

    // --- Keyboard input ---

    const stateRef = useRef({ stageScale, stagePos, selectedIds, hoveredId: null as string | null, state, prototypeMap });
    useEffect(() => {
        stateRef.current = { stageScale, stagePos, selectedIds, hoveredId: hoveredId.current, state, prototypeMap };
    });

    useKeyboardPan({
        stageRef, layerRef, canvasRef, marqueeHitIdsRef, stateRef,
        syncStageTransform,
        scaleInstances,
    });

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

    useKeyboardShortcuts({
        canvasRef, stageRef, editMode, stateRef,
        getFocusedIds, deleteSelected, flipInstances, drawFromDeck,
        setClipboard, pasteAt,
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
        if (isPanning.current || (e.evt && (e.evt as MouseEvent).button !== 0)) { e.target.stopDrag(); return; }
        const draggedId = e.target.id();
        if (isLocked(draggedId)) { e.target.stopDrag(); return; }
        e.target.opacity(0.7);

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
            const newTarget = findMergeTarget(draggedId, state, prototypeMap, layerRef, stageRef);
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
                for (const [id] of dragStartPos.current) {
                    if (id === draggedId) continue;
                    const node = dragNodeRefs.current.get(id);
                    if (node) node.opacity(1);
                }
            }
        }
        dragStartPos.current = new Map();
        dragNodeRefs.current = new Map();

        tryMerge(draggedId, state, prototypeMap, setState, setSelectedIds, layerRef, stageRef);

        if (dragLayerRef.current && layerRef.current) {
            const dragChildren = [...dragLayerRef.current.getChildren()];
            for (const node of dragChildren) node.moveTo(layerRef.current);
        }

        if (layerRef.current) {
            const sorted = [...layerRef.current.getChildren()].sort((a, b) => getZOrder(a.name()) - getZOrder(b.name()));
            for (const node of sorted) node.moveToTop();
        }
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

    function applyMarqueeStrokes(oldHits: Set<string> | null, newHits: Set<string>) {
        const layer = layerRef.current;
        if (!layer) return;
        if (oldHits) {
            for (const id of oldHits) {
                if (newHits.has(id)) continue;
                const group = layer.findOne('#' + id);
                const strokeNode = group?.findOne('.stroke');
                if (strokeNode) { strokeNode.stroke(''); strokeNode.strokeWidth(0); }
            }
        }
        for (const id of newHits) {
            if (oldHits?.has(id) || selectedIds.has(id)) continue;
            const group = layer.findOne('#' + id);
            const strokeNode = group?.findOne('.stroke');
            if (strokeNode) { strokeNode.stroke(HOVER_STROKE.stroke); strokeNode.strokeWidth(HOVER_STROKE.strokeWidth); }
        }
        layer.batchDraw();
    }

    function handleStageMouseDown(e: KonvaEventObject<MouseEvent>) {
        const evt = e.evt as MouseEvent;
        if (evt.button === 1) {
            evt.preventDefault();
            isPanning.current = true;
            panStart.current = { x: evt.clientX - stagePos.x, y: evt.clientY - stagePos.y };
            disableHitGraph();
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
        applyMarqueeStrokes(marqueeHitIdsRef.current, new Set());
        marqueeHitIdsRef.current = null;
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
            applyMarqueeStrokes(marqueeHitIdsRef.current, newHits);
            marqueeHitIdsRef.current = newHits;
        }
    }

    function handleStageMouseUp() {
        if (isPanning.current) { isPanning.current = false; syncStageTransform(); return; }
        if (!isSelecting.current || !selBoxRef.current) {
            isSelecting.current = false;
            selBoxRef.current = null;
            updateMarqueeRect();
            applyMarqueeStrokes(marqueeHitIdsRef.current, new Set());
            marqueeHitIdsRef.current = null;
            return;
        }
        isSelecting.current = false;
        const hits = computeMarqueeHits(selBoxRef.current);
        applyMarqueeStrokes(marqueeHitIdsRef.current, new Set());
        marqueeHitIdsRef.current = null;
        if (hits.size > 0) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                for (const id of hits) next.add(id);
                return next;
            });
        }
        selBoxRef.current = null;
        updateMarqueeRect();
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

    // --- Editors ---

    const editingProto = editingProtoId ? prototypeMap.get(editingProtoId) ?? null : null;

    const openProtoEditor = useCallback((protoId: string) => {
        const proto = stateRef.current.prototypeMap.get(protoId);
        if (!proto) return;
        setProtoDraft({ ...draftFromProps(proto.props), type: proto.type });
        setEditingProtoId(protoId);
    }, []);

    function saveProtoEdits() {
        if (!editingProto) return;
        const updates = draftToUpdates(protoDraft, editingProto.props);
        updates.text = protoDraft.text;
        const newType = protoDraft.type ?? editingProto.type;
        setState(prev => ({
            ...prev,
            prototypes: updatePrototypeById(prev.prototypes, editingProto.id,
                p => ({ ...p, type: newType, props: { ...p.props, ...updates } })
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
        if (proto) {
            const instType = (inst.props?.type as ObjectType) ?? proto.type;
            setInstDraft(prev => ({ ...prev, hasBack: !!(proto.props.hasBack), type: instType }));
        }
        setEditingInstId(instanceId);
    }

    function saveInstEdits() {
        if (!editingInst) return;
        const proto = prototypeMap.get(editingInst.prototypeId);
        const updates = draftToUpdates(instDraft, proto?.props);
        if (instDraft.type && instDraft.type !== proto?.type) {
            updates.type = instDraft.type;
        } else {
            updates.type = undefined;
        }
        setState(prev => {
            const next = new Map(prev.instances);
            const inst = next.get(editingInstId!);
            if (inst) next.set(editingInstId!, { ...inst, props: { ...inst.props, ...updates } });
            return { ...prev, instances: next };
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

    function createProtoFromDraft() {
        const type = protoDraft.type ?? 'card';
        const props = draftToUpdates(protoDraft);
        setState(prev => ({
            ...prev,
            prototypes: insertAtPath(prev.prototypes, newProtoPath, { id: crypto.randomUUID(), type, props }),
        }));
        setCreatingProto(false);
    }

    const deletePrototype = useCallback((id: string) => {
        setState(prev => {
            const next = new Map(prev.instances);
            for (const [instId, inst] of next) {
                if (inst.prototypeId === id) next.delete(instId);
            }
            return { ...prev, prototypes: removeById(prev.prototypes, id), instances: next };
        });
    }, []);

    const handleNewGroup = useCallback((path: string[]) => {
        const group: PrototypeGroup = { id: crypto.randomUUID(), name: 'New Group', contents: [] };
        setState(prev => ({
            ...prev,
            prototypes: insertAtPath(prev.prototypes, path, group),
        }));
    }, []);

    const handleDeleteGroup = useCallback((id: string) => {
        setState(prev => {
            // Find the group and collect all prototype IDs inside it for cascade deletion
            const findGroup = (items: import('./state_management/types').PrototypeItem[]): PrototypeGroup | null => {
                for (const item of items) {
                    if (item.id === id && isPrototypeGroup(item)) return item;
                    if (isPrototypeGroup(item)) {
                        const found = findGroup(item.contents);
                        if (found) return found;
                    }
                }
                return null;
            };
            const group = findGroup(prev.prototypes);
            const protoIds = group ? new Set(collectPrototypeIds(group.contents)) : new Set<string>();
            const next = new Map(prev.instances);
            for (const [instId, inst] of next) {
                if (protoIds.has(inst.prototypeId)) next.delete(instId);
            }
            return { ...prev, prototypes: removeById(prev.prototypes, id), instances: next };
        });
    }, []);

    const handleRenameGroup = useCallback((id: string, newName: string) => {
        setState(prev => ({
            ...prev,
            prototypes: updateGroupById(prev.prototypes, id, g => ({ ...g, name: newName })),
        }));
    }, []);

    const handleMovePrototype = useCallback((protoId: string, targetPath: string[]) => {
        setState(prev => ({
            ...prev,
            prototypes: moveToGroup(prev.prototypes, protoId, targetPath),
        }));
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
    const handleNewPrototype = useCallback((path: string[] = []) => {
        setNewProtoPath(path);
        setProtoDraft({ ...EMPTY_DRAFT, type: 'card' });
        setCreatingProto(true);
    }, []);

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

    // --- Context menu (computed before JSX to allow eslint-disable) ---

    const contextMenuNames = contextMenu ? getContextMenuNames(contextMenu, state, prototypeMap) : {};
    // eslint-disable-next-line react-hooks/refs -- action callbacks only; no refs read during render
    const contextMenuItems = contextMenu ? getContextMenuItems(contextMenu, {
        state, prototypeMap, setState, setSelectedIds, setContextMenu, setClipboard,
        editMode, openInstEditor, openProtoEditor,
        flipInstances, scaleInstances, deleteInstances, deleteRegion, toggleLock, isLocked,
        pasteAt, clipboard,
        pastePosition: {
            x: (contextMenu.x - stagePos.x) / stageScale,
            y: (contextMenu.y - stagePos.y) / stageScale,
        },
    }) : [];

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
                onNewGroup={handleNewGroup}
                onDeleteGroup={handleDeleteGroup}
                onRenameGroup={handleRenameGroup}
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
                            return renderInstance(inst, proto, updatePosition, locked ? false : selectedIds.has(inst.id), locked ? false : undefined, targetedId === inst.id, prototypeMap);
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
            {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y}
                {...contextMenuNames}
                items={contextMenuItems}
            />}
            {tooltip && !contextMenu && <Tooltip x={tooltip.x} y={tooltip.y} text={tooltip.text} />}
            {editingProto && <EditorModal
                opened
                onClose={() => setEditingProtoId(null)}
                title="Edit Prototype"
                draft={protoDraft}
                onDraftChange={setProtoDraft}
                onSave={saveProtoEdits}
                protoType={editingProto.type}
                groupName={(() => {
                    const pid = findParentGroupId(state.prototypes, editingProto.id);
                    if (!pid) return undefined;
                    const groups = collectGroups(state.prototypes);
                    return groups.find(g => g.id === pid)?.name;
                })()}
                allGroups={collectGroups(state.prototypes)}
                onMoveToGroup={(targetPath) => handleMovePrototype(editingProto.id, targetPath)}
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
            {creatingProto && <EditorModal
                opened
                onClose={() => setCreatingProto(false)}
                title="New Prototype"
                draft={protoDraft}
                onDraftChange={setProtoDraft}
                onSave={createProtoFromDraft}
                protoType={protoDraft.type}
            />}
        </>
    );
}
