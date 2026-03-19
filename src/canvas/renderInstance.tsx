import { Card } from '../components/card/card';
import { Token } from '../components/token/token';
import { Board } from '../components/board/board';
import { Deck } from '../components/deck/deck';
import { Stack } from '../components/stack/stack';
import type { Instance, Prototype } from '../state_management/types';
import { resolveProps } from '../state_management/types';
import { buildGridCrop } from './gridCrop';
import type { GridCrop } from './gridCrop';
import type { KonvaEventObject } from 'konva/lib/Node';

const Z_ORDER: Record<string, number> = {
    token: 2,
    card: 1,
    deck: 1,
    stack: 1,
};

export function getZOrder(type: string) {
    return Z_ORDER[type] ?? 0;
}

export function getGroupId(e: KonvaEventObject<unknown>): string {
    const group = e.target.findAncestor('Group') ?? e.target;
    return group.id();
}

interface ContainerEntry {
    prototypeId: string;
    props?: Record<string, unknown>;
}

interface TopItemVis {
    imageSrc?: string;
    text?: string;
    gridCrop?: GridCrop;
    topItemType?: string;
    topItemScale?: number;
    topItemSizeX?: number;
    topItemSizeY?: number;
}

function resolveTopItem(entries: unknown[], prototypeMap: Map<string, Prototype>): TopItemVis {
    if (entries.length === 0) return {};
    const top = entries[entries.length - 1] as ContainerEntry;
    const proto = prototypeMap.get(top.prototypeId);
    if (!proto) return {};
    const merged = { ...proto.props, ...top.props };
    const flipped = !!(merged.flipped);
    const frontImage = (merged.src as string) ?? (merged.imageSrc as string) ?? undefined;
    const backImage = (merged.backImageSrc as string) ?? undefined;
    const frontText = (merged.text as string) ?? undefined;
    const backText = (merged.backText as string) ?? undefined;
    const frontCrop = buildGridCrop(merged);
    const backCrop = buildGridCrop(merged, 'back');
    return {
        imageSrc: flipped ? backImage : frontImage,
        text: flipped ? (backText ?? "") : frontText,
        gridCrop: flipped ? backCrop : frontCrop,
        topItemType: proto.type,
        topItemScale: (merged.scale as number) ?? undefined,
        topItemSizeX: (merged.sizeX as number) ?? undefined,
        topItemSizeY: (merged.sizeY as number) ?? undefined,
    };
}

export function renderInstance(
    instance: Instance,
    prototype: Prototype,
    onDragEnd: (id: string, x: number, y: number) => void,
    selected: boolean,
    hovered?: boolean,
    targeted?: boolean,
    prototypeMap?: Map<string, Prototype>,
) {
    const props = resolveProps(prototype, instance);
    const scale = (props.scale as number) ?? 1;
    const sizeX = props.sizeX as number | undefined;
    const sizeY = props.sizeY as number | undefined;
    const effectiveType = (props.type as string) ?? prototype.type;

    switch (effectiveType) {
        case "board":
            return <Board key={instance.id} id={instance.id} x={instance.x} y={instance.y} src={(props.src as string) ?? (props.imageSrc as string)} scale={scale} sizeX={sizeX} sizeY={sizeY} onDragEnd={onDragEnd} selected={selected} hovered={hovered} />;
        case "card": {
            const gridCrop = buildGridCrop(props);
            const backGridCrop = buildGridCrop(props, 'back');
            return <Card key={instance.id} id={instance.id} x={instance.x} y={instance.y} text={props.text as string | undefined} imageSrc={(props.src as string) ?? (props.imageSrc as string | undefined)} flipped={props.flipped as boolean | undefined} backImageSrc={props.backImageSrc as string | undefined} backText={props.backText as string | undefined} scale={scale} sizeX={sizeX} sizeY={sizeY} gridCrop={gridCrop} backGridCrop={backGridCrop} onDragEnd={onDragEnd} selected={selected} hovered={hovered} targeted={targeted} />;
        }
        case "token":
            return <Token key={instance.id} id={instance.id} x={instance.x} y={instance.y} imageSrc={props.imageSrc as string | undefined} text={props.text as string | undefined} flipped={props.flipped as boolean | undefined} backImageSrc={props.backImageSrc as string | undefined} backText={props.backText as string | undefined} scale={scale} sizeX={sizeX} sizeY={sizeY} onDragEnd={onDragEnd} selected={selected} hovered={hovered} />;
        case "deck": {
            const cards = (props.cards as unknown[]) ?? [];
            const topVis = prototypeMap ? resolveTopItem(cards, prototypeMap) : {};
            return <Deck key={instance.id} id={instance.id} x={instance.x} y={instance.y} cardCount={cards.length} imageSrc={topVis.imageSrc} text={topVis.text} gridCrop={topVis.gridCrop} topItemType={topVis.topItemType} topItemScale={topVis.topItemScale} topItemSizeX={topVis.topItemSizeX} topItemSizeY={topVis.topItemSizeY} scale={scale} sizeX={sizeX} sizeY={sizeY} onDragEnd={onDragEnd} selected={selected} hovered={hovered} targeted={targeted} />;
        }
        case "stack": {
            const items = (props.items as unknown[]) ?? [];
            const topVis = prototypeMap ? resolveTopItem(items, prototypeMap) : {};
            return <Stack key={instance.id} id={instance.id} x={instance.x} y={instance.y} itemCount={items.length} imageSrc={topVis.imageSrc} text={topVis.text} gridCrop={topVis.gridCrop} topItemType={topVis.topItemType} topItemScale={topVis.topItemScale} topItemSizeX={topVis.topItemSizeX} topItemSizeY={topVis.topItemSizeY} scale={scale} sizeX={sizeX} sizeY={sizeY} onDragEnd={onDragEnd} selected={selected} hovered={hovered} targeted={targeted} />;
        }
    }
}
