import type { Prototype, PrototypeGroup, PrototypeItem } from './types';
import { isPrototypeGroup } from './types';

/** Recursively collect all Prototype nodes from a nested PrototypeItem tree. */
export function flattenPrototypes(items: PrototypeItem[]): Prototype[] {
    const result: Prototype[] = [];
    for (const item of items) {
        if (isPrototypeGroup(item)) {
            result.push(...flattenPrototypes(item.contents));
        } else {
            result.push(item);
        }
    }
    return result;
}

/** Get the items at a given group path. Empty path returns top-level items. */
export function getItemsAtPath(items: PrototypeItem[], path: string[]): PrototypeItem[] {
    let current = items;
    for (const groupId of path) {
        const group = current.find(i => i.id === groupId);
        if (!group || !isPrototypeGroup(group)) return [];
        current = group.contents;
    }
    return current;
}

/** Insert an item at a given group path. Empty path inserts at top level. */
export function insertAtPath(items: PrototypeItem[], path: string[], newItem: PrototypeItem): PrototypeItem[] {
    if (path.length === 0) return [...items, newItem];
    const [head, ...rest] = path;
    return items.map(item =>
        item.id === head && isPrototypeGroup(item)
            ? { ...item, contents: insertAtPath(item.contents, rest, newItem) }
            : item
    );
}

/** Recursively remove an item (Prototype or Group) by ID. */
export function removeById(items: PrototypeItem[], targetId: string): PrototypeItem[] {
    return items
        .filter(item => item.id !== targetId)
        .map(item =>
            isPrototypeGroup(item)
                ? { ...item, contents: removeById(item.contents, targetId) }
                : item
        );
}

/** Recursively find and update a Prototype by ID. */
export function updatePrototypeById(
    items: PrototypeItem[],
    id: string,
    updater: (p: Prototype) => Prototype,
): PrototypeItem[] {
    return items.map(item => {
        if (isPrototypeGroup(item)) {
            return { ...item, contents: updatePrototypeById(item.contents, id, updater) };
        }
        return item.id === id ? updater(item) : item;
    });
}

/** Recursively find and update a PrototypeGroup by ID. */
export function updateGroupById(
    items: PrototypeItem[],
    id: string,
    updater: (g: PrototypeGroup) => PrototypeGroup,
): PrototypeItem[] {
    return items.map(item => {
        if (!isPrototypeGroup(item)) return item;
        if (item.id === id) return updater(item);
        return { ...item, contents: updateGroupById(item.contents, id, updater) };
    });
}

/** Find the parent group ID for a given item. Returns null if at top level. */
export function findParentGroupId(items: PrototypeItem[], targetId: string): string | null {
    for (const item of items) {
        if (isPrototypeGroup(item)) {
            if (item.contents.some(c => c.id === targetId)) return item.id;
            const found = findParentGroupId(item.contents, targetId);
            if (found !== null) return found;
        }
    }
    return null;
}

/** Collect all Prototype IDs within an item tree (for cascade deletion). */
export function collectPrototypeIds(items: PrototypeItem[]): string[] {
    const ids: string[] = [];
    for (const item of items) {
        if (isPrototypeGroup(item)) {
            ids.push(...collectPrototypeIds(item.contents));
        } else {
            ids.push(item.id);
        }
    }
    return ids;
}

/** Find a specific item by ID anywhere in the tree. */
function findItemById(items: PrototypeItem[], id: string): PrototypeItem | null {
    for (const item of items) {
        if (item.id === id) return item;
        if (isPrototypeGroup(item)) {
            const found = findItemById(item.contents, id);
            if (found) return found;
        }
    }
    return null;
}

/** Remove an item from its current location and insert at targetPath. */
export function moveToGroup(items: PrototypeItem[], itemId: string, targetPath: string[]): PrototypeItem[] {
    const item = findItemById(items, itemId);
    if (!item) return items;
    const removed = removeById(items, itemId);
    return insertAtPath(removed, targetPath, item);
}

/** Collect all groups as a flat list with breadcrumb-style names. */
export function collectGroups(items: PrototypeItem[], parentPath: string[] = [], parentName: string = ''): { id: string; name: string; path: string[] }[] {
    const result: { id: string; name: string; path: string[] }[] = [];
    for (const item of items) {
        if (isPrototypeGroup(item)) {
            const displayName = parentName ? `${parentName} > ${item.name}` : item.name;
            const path = [...parentPath, item.id];
            result.push({ id: item.id, name: displayName, path });
            result.push(...collectGroups(item.contents, path, displayName));
        }
    }
    return result;
}
