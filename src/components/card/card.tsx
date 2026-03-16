import { memo, useCallback } from "react";
import { Group, Rect, Text, Image } from "react-konva";
import { useHover } from "../../hooks/useHover";
import { HOVER_STROKE, SELECTED_STROKE, TARGETED_STROKE, NO_STROKE } from "../../styles/style_consts";
import useImage from "use-image";

const DEFAULT_ASPECT = 1.5
const DEFAULT_SIZE = 100

import type { GridCrop } from '../../canvas/gridCrop';
import { useCropProps, gridCropEqual } from '../../canvas/gridCrop';

interface CardProps {
    id: string;
    x: number;
    y: number;
    text?: string;
    imageSrc?: string;
    flipped?: boolean;
    backImageSrc?: string;
    backText?: string;
    selected?: boolean;
    hovered?: boolean;
    targeted?: boolean;
    scale?: number;
    gridCrop?: GridCrop;
    backGridCrop?: GridCrop;
    onDragEnd?: (id: string, x: number, y: number) => void;
}

export const Card = memo(function Card({ id, x, y, text = "", imageSrc, flipped, backImageSrc, backText, selected, hovered: hoveredOverride, targeted, scale = 1, gridCrop, backGridCrop, onDragEnd }: CardProps) {
    const { hovered: internalHovered, hoverProps } = useHover();
    const hovered = hoveredOverride ?? internalHovered;
    const displayImage = flipped ? backImageSrc : imageSrc;
    const displayText = flipped ? (backText ?? "") : text;
    const activeCrop = flipped ? backGridCrop : gridCrop;
    const [image] = useImage(displayImage ?? "");
    const cropProps = useCropProps(image, activeCrop);

    return <Group
        id={id}
        name="card"
        x={x}
        y={y}
        offsetX={DEFAULT_SIZE / 2}
        offsetY={DEFAULT_SIZE * DEFAULT_ASPECT / 2}
        scaleX={scale}
        scaleY={scale}
        draggable
        {...hoverProps}
        onDragEnd={useCallback((e: import('konva/lib/Node').KonvaEventObject<DragEvent>) => {
            onDragEnd?.(id, e.target.x(), e.target.y());
        }, [onDragEnd, id])}
    >
        <Rect
            width={DEFAULT_SIZE}
            height={DEFAULT_SIZE * DEFAULT_ASPECT}
            fill={"brown"}
            shadowBlur={10}
        />
        {image && (
            <Image
                image={image}
                width={DEFAULT_SIZE}
                height={DEFAULT_SIZE * DEFAULT_ASPECT}
                {...cropProps}
            />
        )}
        <Rect
            width={DEFAULT_SIZE}
            height={DEFAULT_SIZE * DEFAULT_ASPECT}
            listening={false}
            {...(targeted ? TARGETED_STROKE : selected ? SELECTED_STROKE : hovered ? HOVER_STROKE : NO_STROKE)}
        />
        <Text
            width={DEFAULT_SIZE}
            height={DEFAULT_SIZE * DEFAULT_ASPECT}
            text={displayText}
            fontSize={18}
            fontFamily="Calibri"
            fill="white"
            padding={6}
        />

    </Group>
}, (prev, next) =>
    prev.id === next.id && prev.x === next.x && prev.y === next.y &&
    prev.text === next.text && prev.imageSrc === next.imageSrc &&
    prev.flipped === next.flipped && prev.backImageSrc === next.backImageSrc &&
    prev.backText === next.backText && prev.selected === next.selected &&
    prev.hovered === next.hovered && prev.targeted === next.targeted &&
    prev.scale === next.scale && prev.onDragEnd === next.onDragEnd &&
    gridCropEqual(prev.gridCrop, next.gridCrop) &&
    gridCropEqual(prev.backGridCrop, next.backGridCrop)
);
