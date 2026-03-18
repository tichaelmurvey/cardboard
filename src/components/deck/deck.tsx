import { memo } from "react";
import { Rect } from "react-konva";
import useImage from "use-image";
import { GameComponent } from "../game_component/game_component";
import type { GridCrop } from "../../canvas/gridCrop";
import { gridCropEqual } from "../../canvas/gridCrop";

const DEFAULT_WIDTH = 100;
const DEFAULT_HEIGHT = 150;
const MAX_SIDE = Math.max(DEFAULT_WIDTH, DEFAULT_HEIGHT);
const STACK_OFFSET = 2;
const MAX_STACK_LINES = 4;

interface DeckProps {
    id: string;
    x: number;
    y: number;
    cardCount: number;
    imageSrc?: string;
    text?: string;
    gridCrop?: GridCrop;
    selected?: boolean;
    hovered?: boolean;
    targeted?: boolean;
    scale?: number;
    onDragEnd?: (id: string, x: number, y: number) => void;
}

export const Deck = memo(function Deck({ id, x, y, cardCount, imageSrc, text, gridCrop, selected, hovered, targeted, scale = 1, onDragEnd }: DeckProps) {
    const [image] = useImage(imageSrc ?? "");

    const stackLines = Math.min(cardCount, MAX_STACK_LINES);
    let w = DEFAULT_WIDTH;
    let h = DEFAULT_HEIGHT;
    if (image) {
        let imgW = image.naturalWidth;
        let imgH = image.naturalHeight;
        if (gridCrop) {
            imgW /= gridCrop.gridNumWidth;
            imgH /= gridCrop.gridNumHeight;
        }
        if (imgW > 0 && imgH > 0) {
            const aspect = imgW / imgH;
            if (imgW >= imgH) {
                w = MAX_SIDE;
                h = MAX_SIDE / aspect;
            } else {
                h = MAX_SIDE;
                w = MAX_SIDE * aspect;
            }
        }
    }

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
                fill="brown"
                stroke="#5a2a0a"
                strokeWidth={0.5}
            />
        ))}
    </GameComponent>;
}, (prev, next) =>
    prev.id === next.id && prev.x === next.x && prev.y === next.y &&
    prev.cardCount === next.cardCount && prev.imageSrc === next.imageSrc &&
    prev.text === next.text && prev.selected === next.selected &&
    prev.hovered === next.hovered && prev.targeted === next.targeted &&
    prev.scale === next.scale && prev.onDragEnd === next.onDragEnd &&
    gridCropEqual(prev.gridCrop, next.gridCrop)
);
