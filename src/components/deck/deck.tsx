import { memo } from "react";
import { Rect } from "react-konva";
import useImage from "use-image";
import { GameComponent } from "../game_component/game_component";
import type { GridCrop } from "../../canvas/gridCrop";
import { gridCropEqual } from "../../canvas/gridCrop";
import { computeComponentSize, DEFAULT_SIZES } from '../../utils/sizing';

const STACK_OFFSET = 2;
const MAX_STACK_LINES = 4;
const FALLBACK = DEFAULT_SIZES['card'];

interface DeckProps {
    id: string;
    x: number;
    y: number;
    cardCount: number;
    imageSrc?: string;
    text?: string;
    gridCrop?: GridCrop;
    topItemType?: string;
    topItemScale?: number;
    topItemSizeX?: number;
    topItemSizeY?: number;
    selected?: boolean;
    hovered?: boolean;
    targeted?: boolean;
    scale?: number;
    sizeX?: number;
    sizeY?: number;
    onDragEnd?: (id: string, x: number, y: number) => void;
}

export const Deck = memo(function Deck({ id, x, y, cardCount, imageSrc, text, gridCrop, topItemType, topItemScale, topItemSizeX, topItemSizeY, selected, hovered, targeted, scale = 1, sizeX, sizeY, onDragEnd }: DeckProps) {
    const [image] = useImage(imageSrc ?? "");

    const stackLines = Math.min(cardCount, MAX_STACK_LINES);
    const defaults = (topItemType && DEFAULT_SIZES[topItemType]) || FALLBACK;
    const itemScale = topItemScale ?? 1;
    const { width: baseW, height: baseH } = computeComponentSize(defaults.width, defaults.height, image, gridCrop, topItemSizeX ?? sizeX, topItemSizeY ?? sizeY);
    const w = baseW * itemScale;
    const h = baseH * itemScale;

    return <GameComponent
        id={id} name="deck" x={x} y={y}
        width={w} height={h}
        offsetX={w / 2} offsetY={h / 2}
        scaleX={scale} scaleY={scale}
        imageSrc={imageSrc}
        gridCrop={gridCrop}
        text={text}
        selected={selected} hovered={hovered} targeted={targeted}
        onDragEnd={onDragEnd}
        fillColor="brown" fillAlways textColor="white"
    >
        {Array.from({ length: stackLines }, (_, i) => (
            <Rect
                key={`stack-${i}`}
                x={(stackLines - i) * STACK_OFFSET}
                y={(stackLines - i) * STACK_OFFSET}
                width={w}
                height={h}
                fill={image ? undefined : "brown"}
                stroke="#fcdbc6"
                strokeWidth={1.5}
            />
        ))}
    </GameComponent>;
}, (prev, next) =>
    prev.id === next.id && prev.x === next.x && prev.y === next.y &&
    prev.cardCount === next.cardCount && prev.imageSrc === next.imageSrc &&
    prev.text === next.text && prev.topItemType === next.topItemType &&
    prev.topItemScale === next.topItemScale &&
    prev.topItemSizeX === next.topItemSizeX && prev.topItemSizeY === next.topItemSizeY &&
    prev.selected === next.selected &&
    prev.hovered === next.hovered && prev.targeted === next.targeted &&
    prev.scale === next.scale && prev.sizeX === next.sizeX && prev.sizeY === next.sizeY &&
    prev.onDragEnd === next.onDragEnd &&
    gridCropEqual(prev.gridCrop, next.gridCrop)
);
