import { memo, useCallback } from "react";
import { Circle, Group, Image, Text } from "react-konva";
import { useHover } from "../../hooks/useHover";
import { HOVER_STROKE, SELECTED_STROKE, NO_STROKE } from "../../styles/style_consts";
import useImage from "use-image";

const DEFAULT_ASPECT = 1
const DEFAULT_SIZE = 80

interface TokenProps {
    id: string;
    x: number;
    y: number;
    imageSrc?: string;
    text?: string;
    flipped?: boolean;
    backImageSrc?: string;
    backText?: string;
    selected?: boolean;
    hovered?: boolean;
    scale?: number;
    onDragEnd?: (id: string, x: number, y: number) => void;
}

export const Token = memo(function Token({ id, x, y, imageSrc, text = "", flipped, backImageSrc, backText, selected, hovered: hoveredOverride, scale = 1, onDragEnd }: TokenProps) {
    const { hovered: internalHovered, hoverProps } = useHover();
    const hovered = hoveredOverride ?? internalHovered;
    const displayImage = flipped ? backImageSrc : imageSrc;
    const displayText = flipped ? (backText ?? "") : text;
    const [image] = useImage(displayImage ?? "");

    return <Group
        id={id}
        name="token"
        x={x}
        y={y}
        scaleX={scale}
        scaleY={scale}
        draggable
        {...hoverProps}
        onDragEnd={useCallback((e: import('konva/lib/Node').KonvaEventObject<DragEvent>) => {
            onDragEnd?.(id, e.target.x(), e.target.y());
        }, [onDragEnd, id])}
    >
        <Circle
            width={DEFAULT_SIZE}
            height={DEFAULT_SIZE * DEFAULT_ASPECT}
            fill={!image ? "white" : undefined}
            shadowBlur={10}
        />
        <Image
            image={image}
            x={-DEFAULT_SIZE / 2}
            y={-(DEFAULT_SIZE * DEFAULT_ASPECT) / 2}
            width={DEFAULT_SIZE}
            height={DEFAULT_SIZE * DEFAULT_ASPECT}
        />
        <Circle
            width={DEFAULT_SIZE}
            height={DEFAULT_SIZE * DEFAULT_ASPECT}
            listening={false}
            {...(selected ? SELECTED_STROKE : hovered ? HOVER_STROKE : NO_STROKE)}
        />
        <Text
            x={-DEFAULT_SIZE / 2}
            y={-(DEFAULT_SIZE * DEFAULT_ASPECT) / 2}
            width={DEFAULT_SIZE}
            height={DEFAULT_SIZE * DEFAULT_ASPECT}
            text={displayText}
            fontSize={18}
            fontFamily="Calibri"
            fill="black"
            align="center"
            verticalAlign="middle"
            padding={6}
        />

    </Group>
});
