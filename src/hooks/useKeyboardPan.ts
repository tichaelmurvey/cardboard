import { useEffect, useRef, useMemo } from 'react';
import type Konva from 'konva';
import { clampPosition, PAN_SPEED, MIN_SCALE, MAX_SCALE } from '../canvas/camera';

interface KeyboardPanRefs {
    stageRef: React.RefObject<Konva.Stage | null>;
    layerRef: React.RefObject<Konva.Layer | null>;
    canvasRef: React.RefObject<HTMLDivElement | null>;
    marqueeHitIdsRef: React.MutableRefObject<Set<string> | null>;
    stateRef: React.MutableRefObject<{
        stageScale: number;
        stagePos: { x: number; y: number };
        selectedIds: Set<string>;
        hoveredId: string | null;
    }>;
    syncStageTransform: () => void;
    scaleInstances: (ids: Set<string>, factor: number) => void;
}

export function useKeyboardPan(refs: KeyboardPanRefs) {
    const heldKeys = useRef<Set<string>>(new Set());
    const animRef = useRef<number>(0);
    const HELD_KEYS_SET = useMemo(() => new Set([
        'w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        '+', '=', '-', '_',
    ]), []);

    useEffect(() => {
        const SCALE_SPEED = 1.02;

        function tick() {
            const stage = refs.stageRef.current;
            if (!stage) { animRef.current = requestAnimationFrame(tick); return; }
            const keys = heldKeys.current;
            let dx = 0, dy = 0;
            if (keys.has('w') || keys.has('ArrowUp')) dy += PAN_SPEED;
            if (keys.has('s') || keys.has('ArrowDown')) dy -= PAN_SPEED;
            if (keys.has('a') || keys.has('ArrowLeft')) dx += PAN_SPEED;
            if (keys.has('d') || keys.has('ArrowRight')) dx -= PAN_SPEED;
            if (dx !== 0 || dy !== 0) {
                const pos = stage.position();
                stage.position(clampPosition(pos.x + dx, pos.y + dy, stage.scaleX()));
            }

            const scaleUp = keys.has('+') || keys.has('=');
            const scaleDown = keys.has('-') || keys.has('_');
            if (scaleUp || scaleDown) {
                const factor = scaleUp ? SCALE_SPEED : 1 / SCALE_SPEED;
                const { selectedIds: sel, hoveredId: hov } = refs.stateRef.current;
                const focused = new Set(sel);
                const mh = refs.marqueeHitIdsRef.current;
                if (mh) for (const id of mh) focused.add(id);
                if (hov) focused.add(hov);

                if (focused.size > 0) {
                    refs.scaleInstances(focused, factor);
                } else {
                    const prev = stage.scaleX();
                    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev * factor));
                    const cx = window.innerWidth / 2;
                    const cy = window.innerHeight / 2;
                    const pos = stage.position();
                    const mx = (cx - pos.x) / prev;
                    const my = (cy - pos.y) / prev;
                    stage.scale({ x: newScale, y: newScale });
                    stage.position(clampPosition(cx - mx * newScale, cy - my * newScale, newScale));
                }
            }

            animRef.current = requestAnimationFrame(tick);
        }

        function startLoop() {
            if (!animRef.current) {
                if (refs.layerRef.current) refs.layerRef.current.hitGraphEnabled(false);
                animRef.current = requestAnimationFrame(tick);
            }
        }

        function stopLoop() {
            if (animRef.current) {
                cancelAnimationFrame(animRef.current);
                animRef.current = 0;
                if (refs.layerRef.current) refs.layerRef.current.hitGraphEnabled(true);
                refs.syncStageTransform();
            }
        }

        function handleKeyDown(e: KeyboardEvent) {
            if (HELD_KEYS_SET.has(e.key)) {
                e.preventDefault();
                heldKeys.current.add(e.key);
                startLoop();
            }
        }

        function handleKeyUp(e: KeyboardEvent) {
            heldKeys.current.delete(e.key);
            if (![...heldKeys.current].some(k => HELD_KEYS_SET.has(k))) stopLoop();
        }

        const el = refs.canvasRef.current;
        if (!el) return;
        el.addEventListener('keydown', handleKeyDown);
        el.addEventListener('keyup', handleKeyUp);
        return () => {
            el.removeEventListener('keydown', handleKeyDown);
            el.removeEventListener('keyup', handleKeyUp);
            stopLoop();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [HELD_KEYS_SET]);
}
