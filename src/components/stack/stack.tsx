import { memo } from "react";
import { Rect } from "react-konva";
import useImage from "use-image";
import { GameComponent } from "../game_component/game_component";
import type { GridCrop } from "../../canvas/gridCrop";
import { gridCropEqual } from "../../canvas/gridCrop";

const DEFAULT_SIZE = 80;
const STACK_OFFSET = 2;
const MAX_STACK_LINES = 4;

interface StackProps {
    id: string;
    x: number;
    y: number;
    itemCount: number;
    imageSrc?: string;
    text?: string;
    gridCrop?: GridCrop;
    selected?: boolean;
    hovered?: boolean;
    targeted?: boolean;
    scale?: number;
    onDragEnd?: (id: string, x: number, y: number) => void;
}

export const Stack = memo(function Stack({ id, x, y, itemCount, imageSrc, text, gridCrop, selected, hovered, targeted, scale = 1, onDragEnd }: StackProps) {
    const [image] = useImage(imageSrc ?? "");

    const stackLines = Math.min(itemCount, MAX_STACK_LINES);
    let w = DEFAULT_SIZE;
    let h = DEFAULT_SIZE;
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
                w = DEFAULT_SIZE;
                h = DEFAULT_SIZE / aspect;
            } else {
                h = DEFAULT_SIZE;
                w = DEFAULT_SIZE * aspect;
            }
        }
    }

    return <GameComponent
        id={id} name="stack" x={x} y={y}
        width={w} height={h}
        offsetX={w / 2} offsetY={h / 2}
        scaleX={scale} scaleY={scale}
        imageSrc={imageSrc}
        gridCrop={gridCrop}
        text={text}
        selected={selected} hovered={hovered} targeted={targeted}
        onDragEnd={onDragEnd}
        fillColor="white" textColor="black"
        textAlign="center" textVerticalAlign="middle"
    >
        {Array.from({ length: stackLines }, (_, i) => (
            <Rect
                key={`stack-${i}`}
                x={(stackLines - i) * STACK_OFFSET}
                y={(stackLines - i) * STACK_OFFSET}
                width={w}
                height={h}
                fill={image ? "#ccc" : "white"}
                stroke="#aaa"
                strokeWidth={0.5}
            />
        ))}
    </GameComponent>;
}, (prev, next) =>
    prev.id === next.id && prev.x === next.x && prev.y === next.y &&
    prev.itemCount === next.itemCount && prev.imageSrc === next.imageSrc &&
    prev.text === next.text && prev.selected === next.selected &&
    prev.hovered === next.hovered && prev.targeted === next.targeted &&
    prev.scale === next.scale && prev.onDragEnd === next.onDragEnd &&
    gridCropEqual(prev.gridCrop, next.gridCrop)
);
