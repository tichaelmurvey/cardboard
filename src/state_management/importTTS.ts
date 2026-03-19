import type { CanvasState, Prototype, PrototypeGroup, PrototypeItem, Instance, ObjectType } from './types';
import { instancesToMap } from './types';

const POS_SCALE = 30;
// Cardboard pixels per TTS_BASE unit. Single tuning constant for all sizing.
const CB_UNIT = 60;
// Base render heights for each Cardboard component type (pixels at scale=1)
const BASE_RENDER: Record<string, number> = { token: 80, card: 150 };

function cleanUrl(url: string): string {
    return url.replace(/^\{[^}]*\}/, '');
}

function getImageSize(url: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = url;
    });
}

interface TTSTransform {
    posX?: number;
    posY?: number;
    posZ?: number;
    scaleX?: number;
    scaleZ?: number;
}

interface TTSCustomImage {
    ImageURL?: string;
    ImageSecondaryURL?: string;
    CustomTile?: unknown;
}

interface TTSCustomDeckEntry {
    FaceUrl?: string;
    FaceURL?: string;
    BackUrl?: string;
    BackURL?: string;
    NumWidth?: number;
    NumHeight?: number;
    BackIsHidden?: boolean;
    UniqueBack?: boolean;
}

interface TTSObject {
    GUID?: string;
    Name?: string;
    Nickname?: string;
    Transform?: TTSTransform;
    Locked?: boolean;
    CardID?: number;
    CustomImage?: TTSCustomImage;
    DeckIDs?: number[];
    ContainedObjects?: TTSObject[];
    CustomDeck?: Record<string, TTSCustomDeckEntry>;
}

interface TTSSave {
    ObjectStates?: TTSObject[];
}

/** Build crop props for a card at (col, row) in a grid of numWidth × numHeight */
function gridCropProps(col: number, row: number, numWidth: number, numHeight: number) {
    return { gridCol: col, gridRow: row, gridNumWidth: numWidth, gridNumHeight: numHeight };
}

export async function convertTTSSave(ttsJson: unknown): Promise<CanvasState> {
    const save = ttsJson as TTSSave;
    const objects = save.ObjectStates;
    if (!Array.isArray(objects)) {
        throw new Error('Invalid TTS save: missing ObjectStates array');
    }

    const allPrototypes: Prototype[] = [];
    const allInstances: Instance[] = [];

    // Track which group each prototype belongs to (protoId → groupKey)
    const protoToGroup = new Map<string, string>();
    // Group metadata (groupKey → display name)
    const groupMeta = new Map<string, string>();

    // --- Categorise top-level objects ---
    const deckObjects = objects.filter(o => o.CustomDeck && o.ContainedObjects);
    const stackContainers = objects.filter(o => !o.CustomDeck && o.ContainedObjects &&
        o.ContainedObjects.some(c => c.CustomImage));
    const nonContainerObjects = objects.filter(o =>
        (!o.CustomDeck || !o.ContainedObjects) &&
        (!o.ContainedObjects || !o.ContainedObjects.some(c => c.CustomImage)));

    for (const deckObj of deckObjects) {
        const customDeck = deckObj.CustomDeck!;
        const contained = deckObj.ContainedObjects!;

        const cardProtoMap = new Map<string, Prototype>();
        const cardEntries: { prototypeId: string; props?: Record<string, unknown> }[] = [];
        const deckX = (deckObj.Transform?.posX ?? 0) * POS_SCALE;
        const deckY = -(deckObj.Transform?.posZ ?? 0) * POS_SCALE;

        for (const card of contained) {
            const cardId = card.CardID;
            if (cardId == null) continue;

            const deckKey = String(Math.floor(cardId / 100));
            const cardIndex = cardId % 100;
            const deckEntry = customDeck[deckKey];
            if (!deckEntry) continue;

            const faceUrl = cleanUrl(deckEntry.FaceURL ?? deckEntry.FaceUrl ?? '');
            if (!faceUrl) continue;
            const backUrl = cleanUrl(deckEntry.BackURL ?? deckEntry.BackUrl ?? '');
            const numW = deckEntry.NumWidth ?? 1;
            const numH = deckEntry.NumHeight ?? 1;
            const col = cardIndex % numW;
            const row = Math.floor(cardIndex / numW);
            const crop = gridCropProps(col, row, numW, numH);

            // Prototype keyed by grid position (cards at same position share prototype)
            const protoKey = `deck-${deckKey}-${cardIndex}`;
            if (!cardProtoMap.has(protoKey)) {
                const props: Record<string, unknown> = { imageSrc: faceUrl, ...crop };

                if (backUrl) {
                    props.hasBack = true;
                    props.backImageSrc = backUrl;
                    if (deckEntry.UniqueBack) {
                        props.backGridCol = col;
                        props.backGridRow = row;
                        props.backGridNumWidth = numW;
                        props.backGridNumHeight = numH;
                    }
                }

                const name = card.Nickname?.trim() || '';
                if (name) props.name = name;

                cardProtoMap.set(protoKey, {
                    id: crypto.randomUUID(),
                    type: 'card',
                    props,
                });
            }

            const proto = cardProtoMap.get(protoKey)!;
            const entryProps: Record<string, unknown> = {};
            const name = card.Nickname?.trim() || '';
            if (name && name !== (proto.props.name as string)) {
                entryProps.name = name;
            }

            cardEntries.push({
                prototypeId: proto.id,
                ...(Object.keys(entryProps).length > 0 ? { props: entryProps } : {}),
            });
        }

        allPrototypes.push(...cardProtoMap.values());

        // Create deck prototype + instance
        const deckProtoId = crypto.randomUUID();
        const deckName = deckObj.Nickname?.trim() || deckObj.Name || 'Deck';
        allPrototypes.push({
            id: deckProtoId,
            type: 'deck',
            props: { name: deckName },
        });
        allInstances.push({
            id: crypto.randomUUID(),
            prototypeId: deckProtoId,
            x: deckX,
            y: deckY,
            props: { cards: cardEntries },
        });

        // Assign all card protos + deck proto to a group
        const deckGroupKey = `deck-${deckObj.GUID ?? deckProtoId}`;
        groupMeta.set(deckGroupKey, deckName);
        for (const proto of cardProtoMap.values()) {
            protoToGroup.set(proto.id, deckGroupKey);
        }
        protoToGroup.set(deckProtoId, deckGroupKey);
    }

    // --- Process stack containers (Bags etc. with CustomTile/CustomToken children) ---
    for (const containerObj of stackContainers) {
        const contained = containerObj.ContainedObjects!;
        const containerX = (containerObj.Transform?.posX ?? 0) * POS_SCALE;
        const containerY = -(containerObj.Transform?.posZ ?? 0) * POS_SCALE;

        // Collect unique image URLs from children for sizing
        const childUrls = new Set<string>();
        for (const child of contained) {
            const url = cleanUrl(child.CustomImage?.ImageURL ?? '');
            if (url) childUrls.add(url);
        }
        const childUrlList = [...childUrls];
        const childSizes = await Promise.all(childUrlList.map(getImageSize));
        const childSizeMap = new Map<string, { width: number; height: number }>();
        for (let i = 0; i < childUrlList.length; i++) {
            childSizeMap.set(childUrlList[i], childSizes[i]);
        }

        const tokenProtoMap = new Map<string, Prototype>();
        const itemEntries: { prototypeId: string; props?: Record<string, unknown> }[] = [];

        for (const child of contained) {
            const imageUrl = cleanUrl(child.CustomImage?.ImageURL ?? '');
            if (!imageUrl) continue;

            const backUrl = cleanUrl(child.CustomImage?.ImageSecondaryURL ?? '');
            const key = imageUrl + '|' + backUrl;
            const name = child.Nickname?.trim() || child.Name || '';

            if (!tokenProtoMap.has(key)) {
                const props: Record<string, unknown> = { imageSrc: imageUrl };
                if (name) props.name = name;
                if (backUrl) {
                    props.hasBack = true;
                    props.backImageSrc = backUrl;
                }
                tokenProtoMap.set(key, {
                    id: crypto.randomUUID(),
                    type: 'token',
                    props,
                });
            }

            const proto = tokenProtoMap.get(key)!;
            const entryProps: Record<string, unknown> = {};
            if (name && name !== (proto.props.name as string)) {
                entryProps.name = name;
            }

            // Compute scale for this child
            const scaleX = child.Transform?.scaleX ?? 1;
            const imgSize = childSizeMap.get(imageUrl) ?? { width: 1, height: 1 };
            const imgW = imgSize.width || 1;
            const imgH = imgSize.height || 1;
            const ttsHeight = 2 * imgH / Math.sqrt(imgW * imgH) * scaleX;
            const scale = CB_UNIT * ttsHeight / (BASE_RENDER['token'] ?? 80);
            if (Math.abs(scale - 1) > 0.01) {
                entryProps.scale = Math.round(scale * 100) / 100;
            }

            itemEntries.push({
                prototypeId: proto.id,
                ...(Object.keys(entryProps).length > 0 ? { props: entryProps } : {}),
            });
        }

        allPrototypes.push(...tokenProtoMap.values());

        // Create stack prototype + instance
        const stackProtoId = crypto.randomUUID();
        const stackName = containerObj.Nickname?.trim() || containerObj.Name || 'Stack';
        allPrototypes.push({
            id: stackProtoId,
            type: 'stack',
            props: { name: stackName },
        });
        allInstances.push({
            id: crypto.randomUUID(),
            prototypeId: stackProtoId,
            x: containerX,
            y: containerY,
            props: { items: itemEntries },
        });

        // Assign all token protos + stack proto to a group
        const stackGroupKey = `stack-${containerObj.GUID ?? stackProtoId}`;
        groupMeta.set(stackGroupKey, stackName);
        for (const proto of tokenProtoMap.values()) {
            protoToGroup.set(proto.id, stackGroupKey);
        }
        protoToGroup.set(stackProtoId, stackGroupKey);
    }

    // --- Process non-container objects (existing CustomImage logic) ---
    const uniqueUrls = new Set<string>();
    for (const obj of nonContainerObjects) {
        const url = cleanUrl(obj.CustomImage?.ImageURL ?? '');
        if (url) uniqueUrls.add(url);
    }
    const urlList = [...uniqueUrls];
    const sizes = await Promise.all(urlList.map(getImageSize));
    const sizeMap = new Map<string, { width: number; height: number }>();
    for (let i = 0; i < urlList.length; i++) {
        sizeMap.set(urlList[i], sizes[i]);
    }

    const protoMap = new Map<string, { proto: Prototype; firstName: string }>();
    const pendingInstances: { obj: TTSObject; imageUrl: string; entry: { proto: Prototype; firstName: string } }[] = [];

    for (const obj of nonContainerObjects) {
        const imageUrl = cleanUrl(obj.CustomImage?.ImageURL ?? '');
        if (!imageUrl) continue;

        const backUrl = cleanUrl(obj.CustomImage?.ImageSecondaryURL ?? '');
        const key = imageUrl + '|' + backUrl;
        const name = obj.Nickname?.trim() || obj.Name || 'Token';
        const type: ObjectType = obj.CardID != null ? 'card' : 'token';

        if (!protoMap.has(key)) {
            const protoId = crypto.randomUUID();
            const props: Record<string, unknown> = { imageSrc: imageUrl, name };
            if (backUrl) {
                props.hasBack = true;
                props.backImageSrc = backUrl;
            }
            protoMap.set(key, {
                proto: { id: protoId, type, props },
                firstName: name,
            });
        }

        pendingInstances.push({ obj, imageUrl, entry: protoMap.get(key)! });
    }

    for (const { obj, imageUrl, entry } of pendingInstances) {
        const name = obj.Nickname?.trim() || obj.Name || 'Token';
        const instanceProps: Record<string, unknown> = {};
        if (name !== entry.firstName) {
            instanceProps.name = name;
        }
        if (obj.Locked) {
            instanceProps.locked = true;
        }

        const scaleX = obj.Transform?.scaleX ?? 1;
        const imgSize = sizeMap.get(imageUrl) ?? { width: 1, height: 1 };
        const imgW = imgSize.width || 1;
        const imgH = imgSize.height || 1;

        const ttsHeight = 2 * imgH / Math.sqrt(imgW * imgH) * scaleX;
        const renderBase = BASE_RENDER[entry.proto.type] ?? 80;
        const cbScale = CB_UNIT * ttsHeight / renderBase;
        if (Math.abs(cbScale - 1) > 0.01) {
            instanceProps.scale = Math.round(cbScale * 100) / 100;
        }

        allInstances.push({
            id: crypto.randomUUID(),
            prototypeId: entry.proto.id,
            x: (obj.Transform?.posX ?? 0) * POS_SCALE,
            y: -(obj.Transform?.posZ ?? 0) * POS_SCALE,
            props: Object.keys(instanceProps).length > 0 ? instanceProps : undefined,
        });
    }

    allPrototypes.push(...[...protoMap.values()].map(e => e.proto));

    // --- Deduplicate non-container prototypes with identical type + props ---
    const containerTypes = new Set(['deck', 'stack']);
    const propsKeyMap = new Map<string, string>(); // propsKey → canonical prototype id
    const idRemap = new Map<string, string>();      // duplicate id → canonical id
    const dedupedPrototypes: Prototype[] = [];

    for (const proto of allPrototypes) {
        if (containerTypes.has(proto.type)) {
            dedupedPrototypes.push(proto);
            continue;
        }
        const key = proto.type + '|' + JSON.stringify(proto.props, Object.keys(proto.props).sort());
        const existing = propsKeyMap.get(key);
        if (existing) {
            idRemap.set(proto.id, existing);
        } else {
            propsKeyMap.set(key, proto.id);
            dedupedPrototypes.push(proto);
        }
    }

    if (idRemap.size > 0) {
        // Transfer group assignments from duplicate IDs to canonical IDs
        for (const [oldId, canonicalId] of idRemap) {
            if (!protoToGroup.has(canonicalId) && protoToGroup.has(oldId)) {
                protoToGroup.set(canonicalId, protoToGroup.get(oldId)!);
            }
            protoToGroup.delete(oldId);
        }

        for (const inst of allInstances) {
            inst.prototypeId = idRemap.get(inst.prototypeId) ?? inst.prototypeId;
            // Remap references inside container entries (deck cards / stack items)
            const cards = inst.props?.cards as { prototypeId: string }[] | undefined;
            if (cards) {
                for (const entry of cards) {
                    entry.prototypeId = idRemap.get(entry.prototypeId) ?? entry.prototypeId;
                }
            }
            const items = inst.props?.items as { prototypeId: string }[] | undefined;
            if (items) {
                for (const entry of items) {
                    entry.prototypeId = idRemap.get(entry.prototypeId) ?? entry.prototypeId;
                }
            }
        }
    }

    // --- Build grouped prototype structure ---
    const groupContents = new Map<string, Prototype[]>();
    const topLevel: PrototypeItem[] = [];

    for (const proto of dedupedPrototypes) {
        const groupKey = protoToGroup.get(proto.id);
        if (groupKey) {
            if (!groupContents.has(groupKey)) groupContents.set(groupKey, []);
            groupContents.get(groupKey)!.push(proto);
        } else {
            topLevel.push(proto);
        }
    }

    for (const [groupKey, contents] of groupContents) {
        // Skip grouping when the container holds only one unique child prototype
        // (contents = child protos + the container proto itself)
        const childProtos = contents.filter(p => p.type !== 'deck' && p.type !== 'stack');
        if (childProtos.length <= 1) {
            topLevel.push(...contents);
        } else {
            const name = groupMeta.get(groupKey) ?? 'Group';
            const group: PrototypeGroup = { id: crypto.randomUUID(), name, contents };
            topLevel.push(group);
        }
    }

    return {
        version: 1,
        prototypes: topLevel,
        instances: instancesToMap(allInstances),
        players: [],
        hiddenRegions: [],
    };
}
