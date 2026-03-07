import { Circle, Group, Image, Text } from "react-konva";
import { useHover } from "../../hooks/useHover";
import { HOVER_STROKE, SELECTED_STROKE } from "../../styles/style_consts";
import useImage from "use-image";

const DEFAULT_ASPECT = 1
const DEFAULT_SIZE = 80

interface TokenProps {
    id: string;
    x: number;
    y: number;
    imageSrc?: string;
    text?: string;
    selected?: boolean;
    hovered?: boolean;
    onDragEnd?: (id: string, x: number, y: number) => void;
}

export function Token({ id, x, y, imageSrc, text = "Token", selected, hovered: hoveredOverride, onDragEnd }: TokenProps) {
    const { hovered: internalHovered, hoverProps } = useHover();
    const hovered = hoveredOverride ?? internalHovered;
    const [image] = useImage(imageSrc ?? "");

    return <Group
        id={id}
        name="token"
        x={x}
        y={y}
        draggable
        {...hoverProps}
        onDragEnd={(e) => {
            onDragEnd?.(id, e.target.x(), e.target.y());
        }}
    >
        <Circle
            width={DEFAULT_SIZE}
            height={DEFAULT_SIZE * DEFAULT_ASPECT}
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
            {...(selected ? SELECTED_STROKE : hovered ? HOVER_STROKE : {})}
        />
        <Text
            x={-DEFAULT_SIZE / 2}
            y={-(DEFAULT_SIZE * DEFAULT_ASPECT) / 2}
            width={DEFAULT_SIZE}
            height={DEFAULT_SIZE * DEFAULT_ASPECT}
            text={text}
            fontSize={18}
            fontFamily="Calibri"
            fill="white"
            align="center"
            verticalAlign="middle"
            padding={6}
        />

    </Group>
}
