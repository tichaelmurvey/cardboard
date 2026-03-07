import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
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
    const isSelecting = useRef(false);

    const prototypeMap = useMemo(() => {
        const map = new Map<string, Prototype>();
        for (const p of state.prototypes) map.set(p.id, p);
        return map;
    }, [state.prototypes]);

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

        setState(prev => ({
            ...prev,
            instances: [...prev.instances, {
                id,
                prototypeId,
                x: pointer.x,
                y: pointer.y,
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

    const handleDragStart = useCallback((e: KonvaEventObject<DragEvent>) => {
        e.target.moveToTop();
        e.target.opacity(0.7);
    }, []);

    const handleDragEnd = useCallback((e: KonvaEventObject<DragEvent>) => {
        e.target.opacity(1);

        const layer = e.target.getLayer();
        if (!layer) return;

        const sorted = [...layer.getChildren()].sort(
            (a, b) => getZOrder(a.name()) - getZOrder(b.name())
        );
        for (const node of sorted) {
            node.moveToTop();
        }
    }, []);

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
        if (e.target !== e.target.getStage()) return;
        const pos = e.target.getStage()!.getPointerPosition()!;
        isSelecting.current = true;
        setSelBox({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y });
        setMarqueeHitIds(null);
        if (!(e.evt as MouseEvent).shiftKey) {
            setSelectedIds(new Set());
        }
    }

    function handleStageMouseMove(e: KonvaEventObject<MouseEvent>) {
        if (!isSelecting.current) return;
        const pos = e.target.getStage()!.getPointerPosition()!;
        const newBox = selBox ? { ...selBox, x2: pos.x, y2: pos.y } : null;
        setSelBox(newBox);
        if (newBox) {
            setMarqueeHitIds(computeMarqueeHits(newBox));
        }
    }

    function handleStageMouseUp() {
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

    const [marqueeHitIds, setMarqueeHitIds] = useState<Set<string> | null>(null);

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
                <Stage width={window.innerWidth} height={window.innerHeight}
                    onMouseDown={handleStageMouseDown}
                    onMouseMove={handleStageMouseMove}
                    onMouseUp={handleStageMouseUp}
                >
                    <Layer ref={layerRef} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onClick={(e) => {
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
                        <Layer>
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
