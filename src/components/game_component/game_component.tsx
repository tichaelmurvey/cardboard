import { useCallback } from "react";
import { Group, Rect, Circle, Image, Text } from "react-konva";
import { useHover } from "../../hooks/useHover";
import { HOVER_STROKE, SELECTED_STROKE, TARGETED_STROKE, NO_STROKE } from "../../styles/style_consts";
import useImage from "use-image";
import type { GridCrop } from '../../canvas/gridCrop';
import { useCropProps } from '../../canvas/gridCrop';

interface GameComponentProps {
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    offsetX?: number;
    offsetY?: number;
    scaleX?: number;
    scaleY?: number;

    // Flip & images
    imageSrc?: string;
    backImageSrc?: string;
    flipped?: boolean;
    gridCrop?: GridCrop;
    backGridCrop?: GridCrop;

    // Text
    text?: string;
    backText?: string;
    showTextAlways?: boolean;
    textColor?: string;
    textAlign?: string;
    textVerticalAlign?: string;

    // Interaction
    selected?: boolean;
    hovered?: boolean;
    targeted?: boolean;
    onDragEnd?: (id: string, x: number, y: number) => void;

    // Visual
    fillColor?: string;
    fillAlways?: boolean;
    circular?: boolean;

    // Extra content rendered before background (e.g., stack layers)
    children?: React.ReactNode;
}

export function GameComponent({
    id, name, x, y, width, height,
    offsetX, offsetY,
    scaleX = 1, scaleY = 1,
    imageSrc, backImageSrc, flipped,
    gridCrop, backGridCrop,
    text = "", backText,
    showTextAlways = false, textColor = "white",
    textAlign, textVerticalAlign,
    selected, hovered: hoveredOverride, targeted,
    onDragEnd,
    fillColor = "brown", fillAlways = false, circular = false,
    children,
}: GameComponentProps) {
    const { hovered: internalHovered, hoverProps } = useHover();
    const hovered = hoveredOverride ?? internalHovered;

    const [frontImage] = useImage(imageSrc ?? "");
    const [backImage] = useImage(backImageSrc ?? "");
    const renderImage = flipped ? backImage : frontImage;

    const activeCrop = flipped ? backGridCrop : gridCrop;
    const cropProps = useCropProps(renderImage, activeCrop);

    const displayText = flipped ? (backText ?? "") : text;

    const strokeProps = targeted ? TARGETED_STROKE : selected ? SELECTED_STROKE : hovered ? HOVER_STROKE : NO_STROKE;

    const handleDragEnd = useCallback((e: import('konva/lib/Node').KonvaEventObject<DragEvent>) => {
        onDragEnd?.(id, e.target.x(), e.target.y());
    }, [onDragEnd, id]);

    const Shape = circular ? Circle : Rect;
    const imageX = circular ? -width / 2 : undefined;
    const imageY = circular ? -height / 2 : undefined;
    const fill = fillAlways || !renderImage ? fillColor : undefined;

    return (
        <Group
            id={id}
            name={name}
            x={x}
            y={y}
            offsetX={offsetX}
            offsetY={offsetY}
            scaleX={scaleX}
            scaleY={scaleY}
            draggable
            {...hoverProps}
            onDragEnd={handleDragEnd}
        >
            {children}
            <Shape
                width={width}
                height={height}
                fill={fill}
            />
            {renderImage && (
                <Image
                    image={renderImage}
                    x={imageX}
                    y={imageY}
                    width={width}
                    height={height}
                    {...cropProps}
                />
            )}
            <Shape
                name="stroke"
                width={width}
                height={height}
                listening={false}
                {...strokeProps}
            />
            {(showTextAlways || !renderImage) && displayText && (
                <Text
                    x={imageX}
                    y={imageY}
                    width={width}
                    height={height}
                    text={displayText}
                    fontSize={18}
                    fontFamily="Calibri"
                    fill={textColor}
                    align={textAlign}
                    verticalAlign={textVerticalAlign}
                    padding={6}
                />
            )}
        </Group>
    );
}
