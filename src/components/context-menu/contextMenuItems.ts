import type { ContextMenuItem } from './ContextMenu';
import type { CanvasState, Instance, Prototype } from '../../state_management/types';
import { resolveProps, getInstanceType } from '../../state_management/types';

type SetState = React.Dispatch<React.SetStateAction<CanvasState>>;

interface ContextMenuDeps {
    state: CanvasState;
    prototypeMap: Map<string, Prototype>;
    setState: SetState;
    setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    setContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; instanceId: string | null } | null>>;
    setClipboard: React.Dispatch<React.SetStateAction<Instance[]>>;
    editMode: boolean;
    openInstEditor: (id: string) => void;
    openProtoEditor: (id: string) => void;
    flipInstances: (ids: Set<string>) => void;
    scaleInstances: (ids: Set<string>, factor: number) => void;
    deleteInstances: (ids: Set<string>) => void;
    deleteRegion: (id: string) => void;
    toggleLock: (id: string) => void;
    isLocked: (id: string) => boolean;
    pasteAt: (stageX: number, stageY: number) => void;
    pastePosition: { x: number; y: number };
    clipboard: Instance[];
}

export function getContextMenuNames(
    contextMenu: { x: number; y: number; instanceId: string | null } | null,
    state: CanvasState,
    prototypeMap: Map<string, Prototype>,
): { heading?: string; subheading?: string } {
    if (!contextMenu?.instanceId) return {};
    const inst = state.instances.get(contextMenu.instanceId);
    if (!inst) return {};
    const proto = inst.prototypeId ? prototypeMap.get(inst.prototypeId) : undefined;
    const instName = (inst.props?.name as string) || undefined;
    const protoName = proto ? ((proto.props.name as string) || undefined) : undefined;
    const type = getInstanceType(inst, proto);
    const heading = instName ?? protoName ?? type ?? 'Unknown';
    const subheading = instName && protoName && instName !== protoName ? protoName : undefined;
    return { heading, subheading };
}

export function getContextMenuItems(
    contextMenu: { x: number; y: number; instanceId: string | null },
    deps: ContextMenuDeps,
): ContextMenuItem[] {
    if (!deps.editMode) return [];
    const instId = contextMenu.instanceId;
    const isRegion = instId && (deps.state.hiddenRegions ?? []).some(r => r.id === instId);
    if (instId && isRegion) {
        return [
            { label: 'Delete Region', action: () => { deps.deleteRegion(instId); deps.setContextMenu(null); } },
        ];
    }
    if (instId) {
        const inst = deps.state.instances.get(instId);
        const instProto = inst?.prototypeId ? deps.prototypeMap.get(inst.prototypeId) : undefined;
        const instType = inst ? getInstanceType(inst, instProto) : undefined;
        const canFlip = !!(inst && (resolveProps(instProto, inst).hasBack || instType === 'deck' || instType === 'stack'));
        const items: ContextMenuItem[] = [
            { label: 'Edit', action: () => { deps.openInstEditor(instId); deps.setContextMenu(null); } },
        ];
        if (inst?.prototypeId) {
            items.push({
                label: 'Edit Prototype', action: () => {
                    const inst = deps.state.instances.get(instId);
                    if (inst?.prototypeId) deps.openProtoEditor(inst.prototypeId);
                    deps.setContextMenu(null);
                }
            });
        }
        items.push(
            { label: deps.isLocked(instId) ? 'Unlock' : 'Lock', action: () => deps.toggleLock(instId) },
        );
        if (canFlip) {
            items.push({
                label: 'Flip', action: () => {
                    deps.flipInstances(new Set([instId]));
                    deps.setContextMenu(null);
                }
            });
        }
        items.push(
            { label: 'Grow', action: () => deps.scaleInstances(new Set([instId]), 1.2) },
            { label: 'Shrink', action: () => deps.scaleInstances(new Set([instId]), 1 / 1.2) },
            {
                label: 'Copy', action: () => {
                    const inst = deps.state.instances.get(instId);
                    if (inst) deps.setClipboard([inst]);
                    deps.setContextMenu(null);
                }
            },
            {
                label: 'Make Prototype', action: () => {
                    const inst = deps.state.instances.get(instId);
                    if (!inst) return;
                    const proto = inst.prototypeId ? deps.prototypeMap.get(inst.prototypeId) : undefined;
                    const type = getInstanceType(inst, proto);
                    if (!type) return;
                    const newProtoId = crypto.randomUUID();
                    const merged = resolveProps(proto, inst);
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { locked, type: _type, cards, items, ...protoProps } = merged as Record<string, unknown> & { locked?: unknown; type?: unknown; cards?: unknown; items?: unknown };
                    // Container contents go on both prototype (as defaults for new instances) and instance (as current state)
                    if (cards) protoProps.cards = cards;
                    if (items) protoProps.items = items;
                    const instProps: Record<string, unknown> = {};
                    if (cards) instProps.cards = cards;
                    if (items) instProps.items = items;
                    deps.setState(prev => {
                        const next = new Map(prev.instances);
                        next.set(instId, { ...inst, prototypeId: newProtoId, props: Object.keys(instProps).length > 0 ? instProps : undefined });
                        return {
                            ...prev,
                            prototypes: [...prev.prototypes, { id: newProtoId, type: type as import('../../state_management/types').ObjectType, props: protoProps }],
                            instances: next,
                        };
                    });
                    deps.setContextMenu(null);
                }
            },
            { label: 'Delete', action: () => { deps.deleteInstances(new Set([instId])); deps.setContextMenu(null); } },
        );
        return items;
    }
    if (deps.clipboard.length > 0) {
        return [{
            label: 'Paste', action: () => {
                deps.pasteAt(deps.pastePosition.x, deps.pastePosition.y);
                deps.setContextMenu(null);
            }
        }];
    }
    return [];
}
