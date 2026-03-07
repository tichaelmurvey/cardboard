import { Group, Rect, Image } from "react-konva";
import { useHover } from "../../hooks/useHover";
import { HOVER_STROKE, SELECTED_STROKE } from "../../styles/style_consts";
import useImage from "use-image";

const DEFAULT_SIZE = 800;

interface BoardProps {
    id: string;
    x: number;
    y: number;
    src: string;
    selected?: boolean;
    hovered?: boolean;
    onDragEnd?: (id: string, x: number, y: number) => void;
}

export function Board({ id, x, y, src, selected, hovered: hoveredOverride, onDragEnd }: BoardProps) {
    const { hovered: internalHovered, hoverProps } = useHover();
    const hovered = hoveredOverride ?? internalHovered;
    const [image] = useImage(src);

    const aspect = image ? image.height / image.width : 1;
    const width = DEFAULT_SIZE;
    const height = DEFAULT_SIZE * aspect;

    return <Group
        id={id}
        name="board"
        x={x}
        y={y}
        draggable
        {...hoverProps}
        onDragEnd={(e) => {
            onDragEnd?.(id, e.target.x(), e.target.y());
        }}
    >
        <Rect
            width={width}
            height={height}
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
            {...(selected ? SELECTED_STROKE : hovered ? HOVER_STROKE : {})}
        />
    </Group>;
}
