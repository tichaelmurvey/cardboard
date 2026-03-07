import { Group, Rect, Image } from "react-konva";
import { useHover } from "../../hooks/useHover";
import { HOVER_STROKE } from "../../styles/style_consts";
import useImage from "use-image";

const DEFAULT_SIZE = 800;

interface BoardProps {
    id: string;
    x: number;
    y: number;
    src: string;
    onDragEnd?: (id: string, x: number, y: number) => void;
}

export function Board({ id, x, y, src, onDragEnd }: BoardProps) {
    const { hovered, hoverProps } = useHover();
    const [image] = useImage(src);

    const aspect = image ? image.height / image.width : 1;
    const width = DEFAULT_SIZE;
    const height = DEFAULT_SIZE * aspect;

    return <Group
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
            fill="brown"
            shadowBlur={10}
            {...(hovered ? HOVER_STROKE : {})}
        />
        <Image
            image={image}
            width={width}
            height={height}
        />
    </Group>;
}
