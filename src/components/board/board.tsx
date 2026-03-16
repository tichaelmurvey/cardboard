import { memo, useCallback } from "react";
import { Group, Rect, Image } from "react-konva";
import { useHover } from "../../hooks/useHover";
import { HOVER_STROKE, SELECTED_STROKE, NO_STROKE } from "../../styles/style_consts";
import useImage from "use-image";

const DEFAULT_SIZE = 800;

interface BoardProps {
    id: string;
    x: number;
    y: number;
    src: string;
    selected?: boolean;
    hovered?: boolean;
    scale?: number;
    customSizing?: boolean;
    sizeX?: number;
    sizeY?: number;
    onDragEnd?: (id: string, x: number, y: number) => void;
}

export const Board = memo(function Board({ id, x, y, src, selected, hovered: hoveredOverride, scale = 1, customSizing, sizeX, sizeY, onDragEnd }: BoardProps) {
    const { hovered: internalHovered, hoverProps } = useHover();
    const hovered = hoveredOverride ?? internalHovered;
    const [image] = useImage(src);

    const aspect = image ? image.height / image.width : 1;
    const width = customSizing && sizeX ? sizeX : DEFAULT_SIZE;
    const height = customSizing && sizeY ? sizeY : DEFAULT_SIZE * aspect;

    return <Group
        id={id}
        name="board"
        x={x}
        y={y}
        offsetX={width / 2}
        offsetY={height / 2}
        scaleX={customSizing ? 1 : scale}
        scaleY={customSizing ? 1 : scale}
        draggable
        {...hoverProps}
        onDragEnd={useCallback((e: import('konva/lib/Node').KonvaEventObject<DragEvent>) => {
            onDragEnd?.(id, e.target.x(), e.target.y());
        }, [onDragEnd, id])}
    >
        <Rect
            width={width}
            height={height}
            fill={!image ? '#dfb37b' : undefined}
            shadowBlur={10}
        />
        <Image
            image={image}
            width={width}
            height={height}
        />
        <Rect
            width={width}
            height={height}
            listening={false}
            {...(selected ? SELECTED_STROKE : hovered ? HOVER_STROKE : NO_STROKE)}
        />
    </Group>;
});
