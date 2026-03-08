import { Group, Rect, Text } from "react-konva";
import { useHover } from "../../hooks/useHover";
import { HOVER_STROKE, SELECTED_STROKE, TARGETED_STROKE } from "../../styles/style_consts";

const DEFAULT_SIZE = 100;
const DEFAULT_ASPECT = 1.5;
const STACK_OFFSET = 2;
const MAX_STACK_LINES = 4;

interface DeckProps {
    id: string;
    x: number;
    y: number;
    cardCount: number;
    text?: string;
    selected?: boolean;
    hovered?: boolean;
    targeted?: boolean;
    scale?: number;
    onDragEnd?: (id: string, x: number, y: number) => void;
}

export function Deck({ id, x, y, cardCount, text = "Deck", selected, hovered: hoveredOverride, targeted, scale = 1, onDragEnd }: DeckProps) {
    const { hovered: internalHovered, hoverProps } = useHover();
    const hovered = hoveredOverride ?? internalHovered;

    const stackLines = Math.min(cardCount, MAX_STACK_LINES);

    return <Group
        id={id}
        name="deck"
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
        {/* Stack offset rects behind the main card */}
        {Array.from({ length: stackLines }, (_, i) => (
            <Rect
                key={`stack-${i}`}
                x={(stackLines - i) * STACK_OFFSET}
                y={(stackLines - i) * STACK_OFFSET}
                width={DEFAULT_SIZE}
                height={DEFAULT_SIZE * DEFAULT_ASPECT}
                fill="#5a3a1a"
                stroke="#3a2210"
                strokeWidth={0.5}
            />
        ))}
        {/* Main deck face */}
        <Rect
            width={DEFAULT_SIZE}
            height={DEFAULT_SIZE * DEFAULT_ASPECT}
            fill={cardCount > 0 ? "#8b5e3c" : "#4a3520"}
            shadowBlur={10}
        />
        <Rect
            width={DEFAULT_SIZE}
            height={DEFAULT_SIZE * DEFAULT_ASPECT}
            listening={false}
            {...(targeted ? TARGETED_STROKE : selected ? SELECTED_STROKE : hovered ? HOVER_STROKE : {})}
        />
        <Text
            width={DEFAULT_SIZE}
            height={DEFAULT_SIZE * DEFAULT_ASPECT}
            text={`${text}\n(${cardCount})`}
            fontSize={16}
            fontFamily="Calibri"
            fill="white"
            align="center"
            verticalAlign="middle"
            padding={6}
        />
    </Group>;
}
