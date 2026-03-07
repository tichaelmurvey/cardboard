import { useState, useMemo, useRef, useEffect } from 'react';
import { Stage, Layer, Rect } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Drawer, Button, Stack, Divider, Text as MantineText, Badge, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import Konva from 'konva';
import { Card } from './components/card/card';
import { Token } from './components/token/token';
import { Board } from './components/board/board';
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
    const [stageScale, setStageScale] = useState(1);
    const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
    const isPanning = useRef(false);
    const panStart = useRef({ x: 0, y: 0 });
    const stageRef = useRef<Konva.Stage>(null);

    const prototypeMap = useMemo(() => {
        const map = new Map<string, Prototype>();
        for (const p of state.prototypes) map.set(p.id, p);
        return map;
    }, [state.prototypes]);

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

    function deleteSelected() {
        const toDelete = new Set(selectedIds);
        if (marqueeHitIds) for (const id of marqueeHitIds) toDelete.add(id);
        if (hoveredId) toDelete.add(hoveredId);
        deleteInstances(toDelete);
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

    // Keyboard pan loop — runs entirely via refs so it's stable across renders
    const heldKeys = useRef<Set<string>>(new Set());
    const panAnimRef = useRef<number>(0);
    const PAN_KEYS = useMemo(() => new Set(['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']), []);

    useEffect(() => {
        function panTick() {
            const keys = heldKeys.current;
            let dx = 0, dy = 0;
            if (keys.has('w') || keys.has('ArrowUp')) dy += PAN_SPEED;
            if (keys.has('s') || keys.has('ArrowDown')) dy -= PAN_SPEED;
            if (keys.has('a') || keys.has('ArrowLeft')) dx += PAN_SPEED;
            if (keys.has('d') || keys.has('ArrowRight')) dx -= PAN_SPEED;
            if (dx !== 0 || dy !== 0) {
                setStagePos(p => ({ x: p.x + dx, y: p.y + dy }));
            }
            panAnimRef.current = requestAnimationFrame(panTick);
        }

        function startPanLoop() {
            if (!panAnimRef.current) {
                panAnimRef.current = requestAnimationFrame(panTick);
            }
        }

        function stopPanLoop() {
            if (panAnimRef.current) {
                cancelAnimationFrame(panAnimRef.current);
                panAnimRef.current = 0;
            }
        }

        function handleKeyDown(e: KeyboardEvent) {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (PAN_KEYS.has(e.key)) {
                e.preventDefault();
                heldKeys.current.add(e.key);
                startPanLoop();
            }
        }

        function handleKeyUp(e: KeyboardEvent) {
            heldKeys.current.delete(e.key);
            if (![...heldKeys.current].some(k => PAN_KEYS.has(k))) {
                stopPanLoop();
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            stopPanLoop();
        };
    }, [PAN_KEYS]);

    // Non-pan keyboard shortcuts (delete, zoom)
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            switch (e.key) {
                case 'Delete':
                case 'Backspace':
                    e.preventDefault();
                    deleteSelected();
                    break;
                case '+':
                case '=':
                    e.preventDefault();
                    zoomAtPoint(stageScale * ZOOM_FACTOR, window.innerWidth / 2, window.innerHeight / 2);
                    break;
                case '-':
                case '_':
                    e.preventDefault();
                    zoomAtPoint(stageScale / ZOOM_FACTOR, window.innerWidth / 2, window.innerHeight / 2);
                    break;
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
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
        const draggedId = e.target.id();
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
        if (dragStartPos.current.size <= 1 || !layerRef.current) return;
        const draggedId = e.target.id();
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

        const layer = e.target.getLayer();
        if (!layer) return;

        const sorted = [...layer.getChildren()].sort(
            (a, b) => getZOrder(a.name()) - getZOrder(b.name())
        );
        for (const node of sorted) {
            node.moveToTop();
        }
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
            if (!id) continue;
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
            <Drawer position='right' opened={opened} onClose={close} title="Cardboard" trapFocus={false} closeOnClickOutside={false} withOverlay={false}>
                <Stack>
                    <Button onClick={() => downloadJson(state)}>Save</Button>
                    <Button onClick={handleLoad}>Load</Button>
                    <Divider label="Prototypes" />
                    {state.prototypes.map(proto => (
                        <UnstyledButton
                            key={proto.id}
                            onClick={(e) => spawnInstance(proto.id, e)}
                            style={{
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
            <div style={{ position: 'absolute', inset: 0 }}>
                <Stage ref={stageRef} width={window.innerWidth} height={window.innerHeight}
                    scaleX={stageScale} scaleY={stageScale}
                    x={stagePos.x} y={stagePos.y}
                    onWheel={handleWheel}
                    onMouseDown={handleStageMouseDown}
                    onMouseMove={handleStageMouseMove}
                    onMouseUp={handleStageMouseUp}
                >
                    <Layer ref={layerRef} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}
                        onMouseEnter={(e) => {
                            const group = e.target.findAncestor('Group') ?? e.target;
                            const id = group.id();
                            if (id) setHoveredId(id);
                        }}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={(e) => {
                            const group = e.target.findAncestor('Group') ?? e.target;
                            const id = group.id();
                            if (!id) return;
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
                            const hovered = marqueeHitIds ? marqueeHitIds.has(inst.id) : undefined;
                            return renderInstance(inst, proto, updatePosition, selectedIds.has(inst.id), hovered);
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
        </>
    );
}

function renderInstance(
    instance: Instance,
    prototype: Prototype,
    onDragEnd: (id: string, x: number, y: number) => void,
    selected: boolean,
    hovered?: boolean,
) {
    const props = resolveProps(prototype, instance);

    switch (prototype.type) {
        case "board":
            return <Board key={instance.id} id={instance.id} x={instance.x} y={instance.y} src={props.src as string} onDragEnd={onDragEnd} selected={selected} hovered={hovered} />;
        case "card":
            return <Card key={instance.id} id={instance.id} x={instance.x} y={instance.y} text={props.text as string | undefined} onDragEnd={onDragEnd} selected={selected} hovered={hovered} />;
        case "token":
            return <Token key={instance.id} id={instance.id} x={instance.x} y={instance.y} imageSrc={props.imageSrc as string | undefined} text={props.text as string | undefined} onDragEnd={onDragEnd} selected={selected} hovered={hovered} />;
    }
}

const Z_ORDER: Record<string, number> = {
    token: 2,
    card: 1,
};

function getZOrder(type: string) {
    return Z_ORDER[type] ?? 0;
}
