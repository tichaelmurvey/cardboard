export type ObjectId = string;

export type ObjectType = "card" | "token" | "board" | "deck";

export interface Prototype {
    id: ObjectId;
    type: ObjectType;
    props: Record<string, unknown>;
}

export interface Instance {
    id: ObjectId;
    prototypeId: ObjectId;
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

export interface CanvasState {
    version: 1;
    prototypes: Prototype[];
    instances: Instance[];
    players: Player[];
}

/** Resolve an instance's effective props by merging prototype defaults with instance overrides. */
export function resolveProps(prototype: Prototype, instance: Instance): Record<string, unknown> {
    return { ...prototype.props, ...instance.props };
}
