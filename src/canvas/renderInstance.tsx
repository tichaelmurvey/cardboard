import { Card } from '../components/card/card';
import { Token } from '../components/token/token';
import { Board } from '../components/board/board';
import { Deck } from '../components/deck/deck';
import type { Instance, Prototype } from '../state_management/types';
import { resolveProps } from '../state_management/types';
import type { KonvaEventObject } from 'konva/lib/Node';

const Z_ORDER: Record<string, number> = {
    token: 2,
    card: 1,
    deck: 1,
};

export function getZOrder(type: string) {
    return Z_ORDER[type] ?? 0;
}

export function getGroupId(e: KonvaEventObject<unknown>): string {
    const group = e.target.findAncestor('Group') ?? e.target;
    return group.id();
}

export function renderInstance(
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
