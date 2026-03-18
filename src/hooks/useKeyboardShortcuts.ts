import { useEffect } from 'react';
import type Konva from 'konva';

interface ShortcutDeps {
    canvasRef: React.RefObject<HTMLDivElement | null>;
    stageRef: React.RefObject<Konva.Stage | null>;
    editMode: boolean;
    stateRef: React.MutableRefObject<{
        stageScale: number;
        stagePos: { x: number; y: number };
        state: { instances: Map<string, import('../state_management/types').Instance> };
    }>;
    getFocusedIds: () => Set<string>;
    deleteSelected: (ids: Set<string>) => void;
    flipInstances: (ids: Set<string>) => void;
    drawFromDeck: () => void;
    setClipboard: React.Dispatch<React.SetStateAction<import('../state_management/types').Instance[]>>;
    pasteAt: (stageX: number, stageY: number) => void;
}

export function useKeyboardShortcuts(deps: ShortcutDeps) {
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.key === 'Delete' || e.key === 'Backspace') && deps.editMode) {
                e.preventDefault();
                deps.deleteSelected(deps.getFocusedIds());
            }
            if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
                const ids = deps.getFocusedIds();
                if (ids.size === 0) return;
                deps.setClipboard([...ids].map(id => deps.stateRef.current.state.instances.get(id)!).filter(Boolean));
            }
            if (e.key === 'f') {
                deps.flipInstances(deps.getFocusedIds());
            }
            if (e.key === ' ') {
                e.preventDefault();
                deps.drawFromDeck();
            }
            if (e.key === 'v' && (e.ctrlKey || e.metaKey) && deps.editMode) {
                const pointer = deps.stageRef.current?.getPointerPosition();
                const { stageScale: sc, stagePos: sp } = deps.stateRef.current;
                const mouse = pointer
                    ? { x: (pointer.x - sp.x) / sc, y: (pointer.y - sp.y) / sc }
                    : { x: 20, y: 20 };
                deps.pasteAt(mouse.x, mouse.y);
            }
        }
        const el = deps.canvasRef.current;
        if (!el) return;
        el.addEventListener('keydown', handleKeyDown);
        return () => el.removeEventListener('keydown', handleKeyDown);
    });
}
