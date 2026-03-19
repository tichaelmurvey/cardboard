export type ObjectId = string;

export type ObjectType = "card" | "token" | "board" | "deck" | "stack";

export interface Prototype {
    id: ObjectId;
    type: ObjectType;
    props: Record<string, unknown>;
}

export interface PrototypeGroup {
    id: ObjectId;
    name: string;
    contents: PrototypeItem[];
}

export type PrototypeItem = Prototype | PrototypeGroup;

export function isPrototypeGroup(item: PrototypeItem): item is PrototypeGroup {
    return 'contents' in item;
}

export interface Instance {
    id: ObjectId;
    prototypeId?: ObjectId;
    x: number;
    y: number;
    props?: Record<string, unknown>;
}

export interface Player {
    id: ObjectId;
    color: string;
    name: string;
    claimedBy?: string;
}

export interface HiddenRegion {
    id: ObjectId;
    playerId: ObjectId;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface CanvasState {
    version: 1;
    prototypes: PrototypeItem[];
    instances: Map<string, Instance>;
    players: Player[];
    hiddenRegions: HiddenRegion[];
    hostClientId?: string;
}

/** Convert an Instance array to a Map keyed by id. */
export function instancesToMap(instances: Instance[]): Map<string, Instance> {
    const map = new Map<string, Instance>();
    for (const inst of instances) map.set(inst.id, inst);
    return map;
}

/** Convert an Instance Map back to an array (for serialization). */
export function instancesToArray(instances: Map<string, Instance>): Instance[] {
    return [...instances.values()];
}

/** Resolve an instance's effective props by merging prototype defaults with instance overrides. */
export function resolveProps(prototype: Prototype | undefined, instance: Instance): Record<string, unknown> {
    return { ...prototype?.props, ...instance.props };
}

/** Get the effective type for an instance (instance prop override > prototype type). */
export function getInstanceType(instance: Instance, prototype?: Prototype): string | undefined {
    return (instance.props?.type as string) ?? prototype?.type;
}
