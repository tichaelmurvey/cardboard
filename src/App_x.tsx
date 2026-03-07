import { useState, useMemo } from 'react';
import { Stage, Layer, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Drawer, Button, Stack } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Card } from './components/card/card';
import { Token } from './components/token/token';
import { Board } from './components/board/board';
import { DEFAULT_STATE } from './state_management/defaults';
import { downloadJson, uploadJson } from './state_management/persistence';
import type { CanvasState, Instance, Prototype } from './state_management/types';
import { resolveProps } from './state_management/types';

const Z_ORDER: Record<string, number> = {
    token: 2,
    card: 1,
};

function getZOrder(type: string) {
    return Z_ORDER[type] ?? 0;
}

function renderInstance(
    instance: Instance,
    prototype: Prototype,
    onDragEnd: (id: string, x: number, y: number) => void,
) {
    const props = resolveProps(prototype, instance);

    switch (prototype.type) {
        case "board":
            return <Board key={instance.id} id={instance.id} x={instance.x} y={instance.y} src={props.src as string} onDragEnd={onDragEnd} />;
        case "card":
            return <Card key={instance.id} id={instance.id} x={instance.x} y={instance.y} text={props.text as string | undefined} onDragEnd={onDragEnd} />;
        case "token":
            return <Token key={instance.id} id={instance.id} x={instance.x} y={instance.y} imageSrc={props.imageSrc as string | undefined} text={props.text as string | undefined} onDragEnd={onDragEnd} />;
    }
}

const App = () => {
    const [state, setState] = useState<CanvasState>(DEFAULT_STATE);
    const [opened, { open, close }] = useDisclosure(false);
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

    function handleDragStart(e: KonvaEventObject<DragEvent>) {
        e.target.moveToTop();
    }

    function handleDragEnd(e: KonvaEventObject<DragEvent>) {
        const layer = e.target.getLayer();
        if (!layer) return;

        const sorted = [...layer.getChildren()].sort(
            (a, b) => getZOrder(a.name()) - getZOrder(b.name())
        );
        for (const node of sorted) {
            node.moveToTop();
        }
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
        <div id="app_base2" style={{ position: 'relative', width: '100vw', height: '100vh' }}>
            {/* <div style={{ position: 'absolute', inset: 0 }}>
                <Stage width={window.innerWidth} height={window.innerHeight}>
                    <Layer>
                        <Text text="Try to drag shapes" fontSize={15} />
                    </Layer>
                    <Layer onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                        {state.instances.map(inst => {
                            const proto = prototypeMap.get(inst.prototypeId);
                            if (!proto) return null;
                            return renderInstance(inst, proto, updatePosition);
                        })}
                    </Layer>
                </Stage>
            </div> */}
            <div style={{ position: 'relative', zIndex: 1000 }}>
                <div>
                    <Drawer opened={opened} onClose={close} title="Authentication">
                        Drawer content
                    </Drawer>
                </div>
                <Button variant="default" onClick={open}>
                    Open Drawer
                </Button>
            </div>
        </div>
    );
};

export default App;
