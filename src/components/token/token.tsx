import { memo } from "react";
import useImage from "use-image";
import { GameComponent } from "../game_component/game_component";
import { computeComponentSize } from '../../utils/sizing';

const DEFAULT_SIZE = 80;

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
    sizeX?: number;
    sizeY?: number;
    onDragEnd?: (id: string, x: number, y: number) => void;
}

export const Token = memo(function Token({ id, x, y, imageSrc, text, flipped, backImageSrc, backText, selected, hovered, scale = 1, sizeX, sizeY, onDragEnd }: TokenProps) {
    const [frontImage] = useImage(imageSrc ?? "");
    const [backImage] = useImage(backImageSrc ?? "");
    const sizingImage = frontImage ?? backImage;
    const { width: w, height: h } = computeComponentSize(DEFAULT_SIZE, DEFAULT_SIZE, sizingImage, undefined, sizeX, sizeY);

    return <GameComponent
        id={id} name="token" x={x} y={y}
        width={w} height={h}
        scaleX={scale} scaleY={scale}
        imageSrc={imageSrc} backImageSrc={backImageSrc} flipped={flipped}
        text={text} backText={backText}
        selected={selected} hovered={hovered}
        onDragEnd={onDragEnd}
        circular fillColor="white" textColor="black" showTextAlways
        textAlign="center" textVerticalAlign="middle"
    />;
}, (prev, next) =>
    prev.id === next.id && prev.x === next.x && prev.y === next.y &&
    prev.imageSrc === next.imageSrc && prev.text === next.text &&
    prev.flipped === next.flipped && prev.backImageSrc === next.backImageSrc &&
    prev.backText === next.backText && prev.selected === next.selected &&
    prev.hovered === next.hovered && prev.scale === next.scale &&
    prev.sizeX === next.sizeX && prev.sizeY === next.sizeY &&
    prev.onDragEnd === next.onDragEnd
);
