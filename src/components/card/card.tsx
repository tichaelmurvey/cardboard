import { Group, Rect, Text } from "react-konva";
import { useHover } from "../../hooks/useHover";
import { HOVER_STROKE, SELECTED_STROKE } from "../../styles/style_consts";

const DEFAULT_ASPECT = 1.5
const DEFAULT_SIZE = 100

interface CardProps {
    id: string;
    x: number;
    y: number;
    text?: string;
    selected?: boolean;
    hovered?: boolean;
    scale?: number;
    onDragEnd?: (id: string, x: number, y: number) => void;
}

export function Card({ id, x, y, text = "Card", selected, hovered: hoveredOverride, scale = 1, onDragEnd }: CardProps) {
    const { hovered: internalHovered, hoverProps } = useHover();
    const hovered = hoveredOverride ?? internalHovered;

    return <Group
        id={id}
        name="card"
        x={x}
        y={y}
        scaleX={scale}
        scaleY={scale}
        draggable
        {...hoverProps}
        onDragEnd={(e) => {
            onDragEnd?.(id, e.target.x(), e.target.y());
        }}
    >
        <Rect
            width={DEFAULT_SIZE}
            height={DEFAULT_SIZE * DEFAULT_ASPECT}
            fill={"brown"}
            shadowBlur={10}
            {...(selected ? SELECTED_STROKE : hovered ? HOVER_STROKE : {})}
        />
        <Text
            width={DEFAULT_SIZE}
            height={DEFAULT_SIZE * DEFAULT_ASPECT}
            text={text}
            fontSize={18}
            fontFamily="Calibri"
            fill="white"
            padding={6}
        />

    </Group>
}
