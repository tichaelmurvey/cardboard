import { memo, useCallback } from "react";
import { Group, Rect, Image, Text } from "react-konva";
import { useHover } from "../../hooks/useHover";
import { HOVER_STROKE, SELECTED_STROKE, TARGETED_STROKE, NO_STROKE } from "../../styles/style_consts";
import type { GridCrop } from "../../canvas/gridCrop";
import { useCropProps, gridCropEqual } from "../../canvas/gridCrop";
import useImage from "use-image";

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

export const Stack = memo(function Stack({ id, x, y, itemCount, imageSrc, text, gridCrop, selected, hovered: hoveredOverride, targeted, scale = 1, onDragEnd }: StackProps) {
    const { hovered: internalHovered, hoverProps } = useHover();
    const hovered = hoveredOverride ?? internalHovered;
    const [image] = useImage(imageSrc ?? "");
    const cropProps = useCropProps(image, gridCrop);

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

    return <Group
        id={id}
        name="stack"
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
                fill={image ? "#ccc" : "white"}
                stroke="#aaa"
                strokeWidth={0.5}
            />
        ))}
        <Rect
            width={w}
            height={h}
            fill={!image ? "white" : undefined}
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
                fill="black"
                align="center"
                verticalAlign="middle"
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
    prev.itemCount === next.itemCount && prev.imageSrc === next.imageSrc &&
    prev.text === next.text && prev.selected === next.selected &&
    prev.hovered === next.hovered && prev.targeted === next.targeted &&
    prev.scale === next.scale && prev.onDragEnd === next.onDragEnd &&
    gridCropEqual(prev.gridCrop, next.gridCrop)
);
