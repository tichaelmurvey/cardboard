import type { CanvasState, Prototype, Instance, ObjectType } from './types';

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
    BackUrl?: string;
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

            const faceUrl = cleanUrl(deckEntry.FaceUrl ?? '');
            if (!faceUrl) continue;
            const backUrl = cleanUrl(deckEntry.BackUrl ?? '');
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
        const isBoard = !!obj.CustomImage?.CustomTile;
        const type: ObjectType = isBoard ? 'board' : obj.CardID != null ? 'card' : 'token';

        if (!protoMap.has(key)) {
            const protoId = crypto.randomUUID();
            const props: Record<string, unknown> = {};
            if (isBoard) {
                props.src = imageUrl;
                props.name = name;
                props.customSizing = true;
            } else {
                props.imageSrc = imageUrl;
                props.name = name;
                if (backUrl) {
                    props.hasBack = true;
                    props.backImageSrc = backUrl;
                }
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
        const scaleZ = obj.Transform?.scaleZ ?? 1;
        const imgSize = sizeMap.get(imageUrl) ?? { width: 1, height: 1 };
        const imgW = imgSize.width || 1;
        const imgH = imgSize.height || 1;

        if (obj.CustomImage?.CustomTile) {
            const aspect = imgW / imgH;
            instanceProps.customSizing = true;
            instanceProps.sizeX = Math.round(CB_UNIT * aspect * scaleX);
            instanceProps.sizeY = Math.round(CB_UNIT * scaleZ);
        } else {
            const ttsHeight = 2 * imgH / Math.sqrt(imgW * imgH) * scaleX;
            const renderBase = BASE_RENDER[entry.proto.type] ?? 80;
            const scale = CB_UNIT * ttsHeight / renderBase;
            if (Math.abs(scale - 1) > 0.01) {
                instanceProps.scale = Math.round(scale * 100) / 100;
            }
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

    return {
        version: 1,
        prototypes: dedupedPrototypes,
        instances: allInstances,
        players: [],
        hiddenRegions: [],
    };
}
