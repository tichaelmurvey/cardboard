import { memo } from "react";
import useImage from "use-image";
import { GameComponent } from "../game_component/game_component";
import type { GridCrop } from '../../canvas/gridCrop';
import { gridCropEqual } from '../../canvas/gridCrop';

const DEFAULT_WIDTH = 100;
const DEFAULT_HEIGHT = 150;
const MAX_SIDE = Math.max(DEFAULT_WIDTH, DEFAULT_HEIGHT);

interface CardProps {
    id: string;
    x: number;
    y: number;
    text?: string;
    imageSrc?: string;
    flipped?: boolean;
    backImageSrc?: string;
    backText?: string;
    selected?: boolean;
    hovered?: boolean;
    targeted?: boolean;
    scale?: number;
    gridCrop?: GridCrop;
    backGridCrop?: GridCrop;
    onDragEnd?: (id: string, x: number, y: number) => void;
}

export const Card = memo(function Card({ id, x, y, text, imageSrc, flipped, backImageSrc, backText, selected, hovered, targeted, scale = 1, gridCrop, backGridCrop, onDragEnd }: CardProps) {
    const [frontImage] = useImage(imageSrc ?? "");
    const [backImage] = useImage(backImageSrc ?? "");

    // Derive card size from front image (or back if no front), falling back to defaults
    const sizingImage = frontImage ?? backImage;
    const sizingCrop = frontImage ? gridCrop : backGridCrop;
    let cardW = DEFAULT_WIDTH;
    let cardH = DEFAULT_HEIGHT;
    if (sizingImage) {
        let imgW = sizingImage.naturalWidth;
        let imgH = sizingImage.naturalHeight;
        if (sizingCrop) {
            imgW /= sizingCrop.gridNumWidth;
            imgH /= sizingCrop.gridNumHeight;
        }
        if (imgW > 0 && imgH > 0) {
            const aspect = imgW / imgH;
            if (imgW >= imgH) {
                cardW = MAX_SIDE;
                cardH = MAX_SIDE / aspect;
            } else {
                cardH = MAX_SIDE;
                cardW = MAX_SIDE * aspect;
            }
        }
    }

    return <GameComponent
        id={id} name="card" x={x} y={y}
        width={cardW} height={cardH}
        offsetX={cardW / 2} offsetY={cardH / 2}
        scaleX={scale} scaleY={scale}
        imageSrc={imageSrc} backImageSrc={backImageSrc} flipped={flipped}
        gridCrop={gridCrop} backGridCrop={backGridCrop}
        text={text} backText={backText}
        selected={selected} hovered={hovered} targeted={targeted}
        onDragEnd={onDragEnd}
        fillColor="brown" fillAlways textColor="white" showTextAlways
    />;
}, (prev, next) =>
    prev.id === next.id && prev.x === next.x && prev.y === next.y &&
    prev.text === next.text && prev.imageSrc === next.imageSrc &&
    prev.flipped === next.flipped && prev.backImageSrc === next.backImageSrc &&
    prev.backText === next.backText && prev.selected === next.selected &&
    prev.hovered === next.hovered && prev.targeted === next.targeted &&
    prev.scale === next.scale && prev.onDragEnd === next.onDragEnd &&
    gridCropEqual(prev.gridCrop, next.gridCrop) &&
    gridCropEqual(prev.backGridCrop, next.backGridCrop)
);
