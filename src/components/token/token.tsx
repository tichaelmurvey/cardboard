import { memo } from "react";
import { GameComponent } from "../game_component/game_component";

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
    onDragEnd?: (id: string, x: number, y: number) => void;
}

export const Token = memo(function Token({ id, x, y, imageSrc, text, flipped, backImageSrc, backText, selected, hovered, scale = 1, onDragEnd }: TokenProps) {
    return <GameComponent
        id={id} name="token" x={x} y={y}
        width={DEFAULT_SIZE} height={DEFAULT_SIZE}
        scaleX={scale} scaleY={scale}
        imageSrc={imageSrc} backImageSrc={backImageSrc} flipped={flipped}
        text={text} backText={backText}
        selected={selected} hovered={hovered}
        onDragEnd={onDragEnd}
        circular fillColor="white" textColor="black" showTextAlways
        textAlign="center" textVerticalAlign="middle"
    />;
});
