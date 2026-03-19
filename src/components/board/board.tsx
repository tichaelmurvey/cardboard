import { memo } from "react";
import useImage from "use-image";
import { GameComponent } from "../game_component/game_component";
import { computeComponentSize } from '../../utils/sizing';

const DEFAULT_SIZE = 800;

interface BoardProps {
    id: string;
    x: number;
    y: number;
    src: string;
    selected?: boolean;
    hovered?: boolean;
    scale?: number;
    sizeX?: number;
    sizeY?: number;
    onDragEnd?: (id: string, x: number, y: number) => void;
}

export const Board = memo(function Board({ id, x, y, src, selected, hovered, scale = 1, sizeX, sizeY, onDragEnd }: BoardProps) {
    const [image] = useImage(src);
    const { width, height } = computeComponentSize(DEFAULT_SIZE, DEFAULT_SIZE, image, undefined, sizeX, sizeY);

    return <GameComponent
        id={id} name="board" x={x} y={y}
        width={width} height={height}
        offsetX={width / 2} offsetY={height / 2}
        scaleX={scale} scaleY={scale}
        imageSrc={src}
        selected={selected} hovered={hovered}
        onDragEnd={onDragEnd}
        fillColor="#dfb37b"
    />;
}, (prev, next) =>
    prev.id === next.id && prev.x === next.x && prev.y === next.y &&
    prev.src === next.src && prev.selected === next.selected &&
    prev.hovered === next.hovered && prev.scale === next.scale &&
    prev.sizeX === next.sizeX && prev.sizeY === next.sizeY &&
    prev.onDragEnd === next.onDragEnd
);
