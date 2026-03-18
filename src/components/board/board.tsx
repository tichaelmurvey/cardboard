import { memo } from "react";
import useImage from "use-image";
import { GameComponent } from "../game_component/game_component";

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

export const Board = memo(function Board({ id, x, y, src, selected, hovered, scale = 1, customSizing, sizeX, sizeY, onDragEnd }: BoardProps) {
    const [image] = useImage(src);

    const aspect = image ? image.height / image.width : 1;
    const width = customSizing && sizeX ? sizeX : DEFAULT_SIZE;
    const height = customSizing && sizeY ? sizeY : DEFAULT_SIZE * aspect;

    return <GameComponent
        id={id} name="board" x={x} y={y}
        width={width} height={height}
        offsetX={width / 2} offsetY={height / 2}
        scaleX={customSizing ? 1 : scale} scaleY={customSizing ? 1 : scale}
        imageSrc={src}
        selected={selected} hovered={hovered}
        onDragEnd={onDragEnd}
        fillColor="#dfb37b"
    />;
});
