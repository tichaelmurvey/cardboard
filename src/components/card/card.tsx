import { memo, useCallback } from "react";
import { Group, Rect, Text, Image } from "react-konva";
import { useHover } from "../../hooks/useHover";
import { HOVER_STROKE, SELECTED_STROKE, TARGETED_STROKE, NO_STROKE } from "../../styles/style_consts";
import useImage from "use-image";

const DEFAULT_WIDTH = 100;
const DEFAULT_HEIGHT = 150;
const MAX_SIDE = Math.max(DEFAULT_WIDTH, DEFAULT_HEIGHT);

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
    const displayText = flipped ? (backText ?? "") : text;
    const activeCrop = flipped ? backGridCrop : gridCrop;

    const [frontImage] = useImage(imageSrc ?? "");
    const [backImage] = useImage(backImageSrc ?? "");
    const renderImage = flipped ? backImage : frontImage;
    const cropProps = useCropProps(renderImage, activeCrop);

    // Derive card size from front image (or back if no front), falling back to defaults
    const sizingImage = frontImage ?? backImage;
    const sizingCrop = frontImage ? gridCrop : backGridCrop;
    let cardW = DEFAULT_WIDTH;
    let cardH = DEFAULT_HEIGHT;
    if (sizingImage) {
        let imgW = sizingImage.naturalWidth;
        let imgH = sizingImage.naturalHeight;
        if (sizingCrop) {
            imgW /= sizingCrop.gridNumWidth;
            imgH /= sizingCrop.gridNumHeight;
        }
        if (imgW > 0 && imgH > 0) {
            const aspect = imgW / imgH;
            if (imgW >= imgH) {
                cardW = MAX_SIDE;
                cardH = MAX_SIDE / aspect;
            } else {
                cardH = MAX_SIDE;
                cardW = MAX_SIDE * aspect;
            }
        }
    }

    return <Group
        id={id}
        name="card"
        x={x}
        y={y}
        offsetX={cardW / 2}
        offsetY={cardH / 2}
        scaleX={scale}
        scaleY={scale}
        draggable
        {...hoverProps}
        onDragEnd={useCallback((e: import('konva/lib/Node').KonvaEventObject<DragEvent>) => {
            onDragEnd?.(id, e.target.x(), e.target.y());
        }, [onDragEnd, id])}
    >
        <Rect
            width={cardW}
            height={cardH}
            fill={"brown"}
            shadowBlur={10}
        />
        {renderImage && (
            <Image
                image={renderImage}
                width={cardW}
                height={cardH}
                {...cropProps}
            />
        )}
        <Rect
            width={cardW}
            height={cardH}
            listening={false}
            {...(targeted ? TARGETED_STROKE : selected ? SELECTED_STROKE : hovered ? HOVER_STROKE : NO_STROKE)}
        />
        <Text
            width={cardW}
            height={cardH}
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
