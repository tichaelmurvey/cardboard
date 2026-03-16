import { memo, useCallback } from "react";
import { Group, Rect, Image, Text } from "react-konva";
import { useHover } from "../../hooks/useHover";
import { HOVER_STROKE, SELECTED_STROKE, TARGETED_STROKE, NO_STROKE } from "../../styles/style_consts";
import type { GridCrop } from "../../canvas/gridCrop";
import { useCropProps, gridCropEqual } from "../../canvas/gridCrop";
import useImage from "use-image";

const DEFAULT_SIZE = 100;
const DEFAULT_ASPECT = 1.5;
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

export const Deck = memo(function Deck({ id, x, y, cardCount, imageSrc, text, gridCrop, selected, hovered: hoveredOverride, targeted, scale = 1, onDragEnd }: DeckProps) {
    const { hovered: internalHovered, hoverProps } = useHover();
    const hovered = hoveredOverride ?? internalHovered;
    const [image] = useImage(imageSrc ?? "");
    const cropProps = useCropProps(image, gridCrop);

    const stackLines = Math.min(cardCount, MAX_STACK_LINES);
    const w = DEFAULT_SIZE;
    const h = DEFAULT_SIZE * DEFAULT_ASPECT;

    return <Group
        id={id}
        name="deck"
        x={x}
        y={y}
        offsetX={w / 2}
        offsetY={h / 2}
        scaleX={scale}
        scaleY={scale}
        draggable
        {...hoverProps}
        onDragEnd={useCallback((e: import('konva/lib/Node').KonvaEventObject<DragEvent>) => {
            onDragEnd?.(id, e.target.x(), e.target.y());
        }, [onDragEnd, id])}
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
        <Rect
            width={w}
            height={h}
            fill="brown"
            shadowBlur={10}
        />
        {image && <Image image={image} width={w} height={h} {...cropProps} />}
        {!image && text && (
            <Text
                width={w}
                height={h}
                text={text}
                fontSize={18}
                fontFamily="Calibri"
                fill="white"
                padding={6}
            />
        )}
        <Rect
            width={w}
            height={h}
            listening={false}
            {...(targeted ? TARGETED_STROKE : selected ? SELECTED_STROKE : hovered ? HOVER_STROKE : NO_STROKE)}
        />
    </Group>;
}, (prev, next) =>
    prev.id === next.id && prev.x === next.x && prev.y === next.y &&
    prev.cardCount === next.cardCount && prev.imageSrc === next.imageSrc &&
    prev.text === next.text && prev.selected === next.selected &&
    prev.hovered === next.hovered && prev.targeted === next.targeted &&
    prev.scale === next.scale && prev.onDragEnd === next.onDragEnd &&
    gridCropEqual(prev.gridCrop, next.gridCrop)
);
