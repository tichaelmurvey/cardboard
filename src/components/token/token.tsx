import { Circle, Group, Image, Text } from "react-konva";
import { useHover } from "../../hooks/useHover";
import { HOVER_STROKE } from "../../styles/style_consts";
import useImage from "use-image";

const DEFAULT_ASPECT = 1
const DEFAULT_SIZE = 80

interface TokenProps {
    id: string;
    x: number;
    y: number;
    imageSrc?: string;
    text?: string;
    onDragEnd?: (id: string, x: number, y: number) => void;
}

export function Token({ id, x, y, imageSrc, text = "Token", onDragEnd }: TokenProps) {
    const { hovered, hoverProps } = useHover();
    const [image] = useImage(imageSrc ?? "");

    return <Group
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
            fill="brown"
            shadowBlur={10}
            {...(hovered ? HOVER_STROKE : {})}
        />
        <Image
            image={image}
            x={-DEFAULT_SIZE / 2}
            y={-(DEFAULT_SIZE * DEFAULT_ASPECT) / 2}
            width={DEFAULT_SIZE}
            height={DEFAULT_SIZE * DEFAULT_ASPECT}
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
