import { Group, Rect, Transformer } from "react-konva";
import { useRef, useEffect } from "react";
import Konva from "konva";

const MIN_SIZE = 50;

interface HiddenRegionProps {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    selected?: boolean;
    draggable?: boolean;
    onDragEnd?: (id: string, x: number, y: number) => void;
    onResize?: (id: string, width: number, height: number) => void;
}

export function HiddenRegion({ id, x, y, width, height, color, selected, draggable = true, onDragEnd, onResize }: HiddenRegionProps) {
    const groupRef = useRef<Konva.Group>(null);
    const trRef = useRef<Konva.Transformer>(null);

    useEffect(() => {
        if (selected && trRef.current && groupRef.current) {
            trRef.current.nodes([groupRef.current]);
            trRef.current.getLayer()?.batchDraw();
        }
    }, [selected, width, height]);

    return (
        <>
            <Group
                ref={groupRef}
                id={id}
                name="hidden-region"
                x={x}
                y={y}
                draggable={draggable}
                onDragEnd={(e) => onDragEnd?.(id, e.target.x(), e.target.y())}
                onTransformEnd={() => {
                    const node = groupRef.current;
                    if (!node) return;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    node.scaleX(1);
                    node.scaleY(1);
                    const newWidth = Math.max(MIN_SIZE, width * scaleX);
                    const newHeight = Math.max(MIN_SIZE, height * scaleY);
                    onResize?.(id, newWidth, newHeight);
                    onDragEnd?.(id, node.x(), node.y());
                }}
            >
                <Rect
                    width={width}
                    height={height}
                    stroke={color}
                    strokeWidth={2}
                    dash={[8, 4]}
                    listening={true}
                />
            </Group>
            {selected && (
                <Transformer
                    ref={trRef}
                    rotateEnabled={false}
                    keepRatio={false}
                    boundBoxFunc={(_oldBox, newBox) => ({
                        ...newBox,
                        width: Math.max(MIN_SIZE, newBox.width),
                        height: Math.max(MIN_SIZE, newBox.height),
                    })}
                />
            )}
        </>
    );
}
