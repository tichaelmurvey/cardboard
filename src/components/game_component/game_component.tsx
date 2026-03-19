import { useCallback, useEffect, useRef, useState } from "react";
import { Group, Rect, Circle, Image, Text } from "react-konva";
import { useHover } from "../../hooks/useHover";
import { HOVER_STROKE, SELECTED_STROKE, TARGETED_STROKE, NO_STROKE } from "../../styles/style_consts";
import useImage from "use-image";
import type { GridCrop } from '../../canvas/gridCrop';
import { useCropProps } from '../../canvas/gridCrop';
import Konva from 'konva';

const FLIP_DURATION = 0.15;

interface GameComponentProps {
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    offsetX?: number;
    offsetY?: number;
    scaleX?: number;
    scaleY?: number;

    // Flip & images
    imageSrc?: string;
    backImageSrc?: string;
    flipped?: boolean;
    gridCrop?: GridCrop;
    backGridCrop?: GridCrop;

    // Text
    text?: string;
    backText?: string;
    showTextAlways?: boolean;
    textColor?: string;
    textAlign?: string;
    textVerticalAlign?: string;

    // Interaction
    selected?: boolean;
    hovered?: boolean;
    targeted?: boolean;
    onDragEnd?: (id: string, x: number, y: number) => void;

    // Visual
    fillColor?: string;
    fillAlways?: boolean;
    circular?: boolean;

    // Extra content rendered before background (e.g., stack layers)
    children?: React.ReactNode;
}

export function GameComponent({
    id, name, x, y, width, height,
    offsetX, offsetY,
    scaleX = 1, scaleY = 1,
    imageSrc, backImageSrc, flipped,
    gridCrop, backGridCrop,
    text = "", backText,
    showTextAlways = false, textColor = "white",
    textAlign, textVerticalAlign,
    selected, hovered: hoveredOverride, targeted,
    onDragEnd,
    fillColor = "brown", fillAlways = false, circular = false,
    children,
}: GameComponentProps) {
    const { hovered: internalHovered, hoverProps } = useHover();
    const hovered = hoveredOverride ?? internalHovered;
    const groupRef = useRef<Konva.Group>(null);
    const prevFlipped = useRef(flipped);
    const [animFlipped, setAnimFlipped] = useState(flipped);
    const [animating, setAnimating] = useState(false);
    const tweenRef = useRef<Konva.Tween | null>(null);

    // Buffer visual props so container content doesn't update until the midpoint
    const bufferedProps = useRef({ imageSrc, text, gridCrop, backGridCrop });
    if (!animating) {
        bufferedProps.current = { imageSrc, text, gridCrop, backGridCrop };
    }

    useEffect(() => {
        if (prevFlipped.current === flipped) return;
        prevFlipped.current = flipped;
        const node = groupRef.current;
        if (!node) { setAnimFlipped(flipped); return; }

        tweenRef.current?.destroy();
        setAnimating(true);

        // Phase 1: squish to 0
        const tween1 = new Konva.Tween({
            node,
            scaleX: 0,
            duration: FLIP_DURATION,
            easing: Konva.Easings.EaseIn,
            onFinish: () => {
                setAnimFlipped(flipped);
                bufferedProps.current = { imageSrc, text, gridCrop, backGridCrop };
                // Phase 2: expand back out
                const tween2 = new Konva.Tween({
                    node,
                    scaleX: scaleX,
                    duration: FLIP_DURATION,
                    easing: Konva.Easings.EaseOut,
                    onFinish: () => { tweenRef.current = null; setAnimating(false); },
                });
                tweenRef.current = tween2;
                tween2.play();
            },
        });
        tweenRef.current = tween1;
        tween1.play();
    }, [flipped, scaleX, imageSrc, text, gridCrop, backGridCrop]);

    // Clean up tweens on unmount
    useEffect(() => () => { tweenRef.current?.destroy(); }, []);

    const visImageSrc = bufferedProps.current.imageSrc;
    const visText = bufferedProps.current.text ?? "";
    const visGridCrop = bufferedProps.current.gridCrop;
    const visBackGridCrop = bufferedProps.current.backGridCrop;

    const [frontImage] = useImage(visImageSrc ?? "");
    const [backImage] = useImage(backImageSrc ?? "");
    const hasBack = !!(backImageSrc || backText);
    const showFlipped = hasBack && animFlipped;
    const renderImage = showFlipped ? backImage : frontImage;

    const activeCrop = showFlipped ? visBackGridCrop : visGridCrop;
    const cropProps = useCropProps(renderImage, activeCrop);

    const displayText = showFlipped ? (backText ?? "") : visText;

    const strokeProps = targeted ? TARGETED_STROKE : selected ? SELECTED_STROKE : hovered ? HOVER_STROKE : NO_STROKE;

    const handleDragEnd = useCallback((e: import('konva/lib/Node').KonvaEventObject<DragEvent>) => {
        onDragEnd?.(id, e.target.x(), e.target.y());
    }, [onDragEnd, id]);

    const handleMouseDown = useCallback((e: import('konva/lib/Node').KonvaEventObject<MouseEvent>) => {
        if ((e.evt as MouseEvent).button !== 0) {
            e.target.stopDrag();
        }
    }, []);

    const Shape = circular ? Circle : Rect;
    const imageX = circular ? -width / 2 : undefined;
    const imageY = circular ? -height / 2 : undefined;
    const fill = fillAlways || !renderImage ? fillColor : undefined;

    return (
        <Group
            ref={groupRef}
            id={id}
            name={name}
            x={x}
            y={y}
            offsetX={offsetX}
            offsetY={offsetY}
            scaleX={scaleX}
            scaleY={scaleY}
            draggable
            {...hoverProps}
            onMouseDown={handleMouseDown}
            onDragEnd={handleDragEnd}
        >
            {children}
            <Shape
                width={width}
                height={height}
                fill={fill}
            />
            {renderImage && (
                <Image
                    image={renderImage}
                    x={imageX}
                    y={imageY}
                    width={width}
                    height={height}
                    {...cropProps}
                />
            )}
            <Shape
                name="stroke"
                width={width}
                height={height}
                listening={false}
                {...strokeProps}
            />
            {(showTextAlways || !renderImage) && displayText && (
                <Text
                    x={imageX}
                    y={imageY}
                    width={width}
                    height={height}
                    text={displayText}
                    fontSize={18}
                    fontFamily="Calibri"
                    fill={textColor}
                    align={textAlign}
                    verticalAlign={textVerticalAlign}
                    padding={6}
                />
            )}
        </Group>
    );
}
