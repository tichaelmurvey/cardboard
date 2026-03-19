import { Modal, Stack, TextInput, Button, Checkbox, Select, Image as MantineImage, Accordion, Text as MantineText, Group as MantineGroup } from '@mantine/core';
import type { ObjectType } from '../../state_management/types';
import type { GridCrop } from '../../canvas/gridCrop';

const TYPE_OPTIONS: { value: ObjectType; label: string }[] = [
    { value: 'token', label: 'Token' },
    { value: 'card', label: 'Card' },
    { value: 'board', label: 'Board' },
];

export interface EditorDraft {
    name: string;
    text: string;
    scale: string;
    imageSrc: string;
    gridNumWidth: string;
    gridNumHeight: string;
    gridCol: string;
    gridRow: string;
    hasBack: boolean;
    backImageSrc: string;
    backText: string;
    backGridNumWidth: string;
    backGridNumHeight: string;
    backGridCol: string;
    backGridRow: string;
    flipped: boolean;
    sizeX: string;
    sizeY: string;
    type?: ObjectType;
}

export const EMPTY_DRAFT: EditorDraft = {
    name: '', text: '', scale: '', imageSrc: '',
    gridNumWidth: '', gridNumHeight: '', gridCol: '', gridRow: '',
    hasBack: false, backImageSrc: '', backText: '',
    backGridNumWidth: '', backGridNumHeight: '', backGridCol: '', backGridRow: '',
    flipped: false,
    sizeX: '', sizeY: '',
};

import { useState, useEffect } from 'react';

const PREVIEW_MAX = 150;

function ImagePreview({ src, gridCrop }: { src: string; gridCrop?: GridCrop }) {
    const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);

    useEffect(() => {
        setNaturalSize(null);
        if (!src) return;
        const img = new Image();
        img.onload = () => setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
        img.src = src;
    }, [src]);

    if (gridCrop && naturalSize) {
        const { gridCol, gridRow, gridNumWidth, gridNumHeight } = gridCrop;
        const cellW = naturalSize.w / gridNumWidth;
        const cellH = naturalSize.h / gridNumHeight;
        const scale = Math.min(PREVIEW_MAX / cellW, PREVIEW_MAX / cellH, 1);
        const dispW = Math.round(cellW * scale);
        const dispH = Math.round(cellH * scale);
        const posX = gridNumWidth <= 1 ? 0 : (gridCol / (gridNumWidth - 1)) * 100;
        const posY = gridNumHeight <= 1 ? 0 : (gridRow / (gridNumHeight - 1)) * 100;
        return (
            <div style={{
                width: dispW,
                height: dispH,
                borderRadius: 4,
                backgroundImage: `url(${src})`,
                backgroundSize: `${naturalSize.w * scale}px ${naturalSize.h * scale}px`,
                backgroundPosition: `${posX}% ${posY}%`,
            }} />
        );
    }
    return <MantineImage src={src} mah={PREVIEW_MAX} maw={PREVIEW_MAX} w="auto" fit="contain" radius="sm" />;
}

interface EditorModalProps {
    opened: boolean;
    onClose: () => void;
    title: string;
    draft: EditorDraft;
    onDraftChange: (draft: EditorDraft) => void;
    onSave: () => void;
    /** When set, fields show placeholder text and labels say "(override)". */
    placeholders?: { name: string; text: string; scale: string; imageSrc: string };
    /** The prototype type (card, token, board, deck). Controls which fields appear. */
    protoType?: string;
    /** Whether this is an instance editor (shows flipped instead of hasBack). */
    isInstance?: boolean;
    /** Callback to open the prototype editor (instance editor only). */
    onEditPrototype?: () => void;
    /** Callback to reset instance props to prototype defaults. */
    onResetToPrototype?: () => void;
    /** The name of the group this prototype belongs to (prototype editor only). */
    groupName?: string;
    /** All available groups for the move-to-group dropdown. */
    allGroups?: { id: string; name: string; path: string[] }[];
    /** Callback to move the prototype to a different group. */
    onMoveToGroup?: (targetPath: string[]) => void;
}

function draftGridCrop(numW: string, numH: string, col: string, row: string): GridCrop | undefined {
    const nw = parseInt(numW);
    const nh = parseInt(numH);
    const c = parseInt(col);
    const r = parseInt(row);
    if (isNaN(nw) || isNaN(nh) || nw <= 0 || nh <= 0) return undefined;
    return { gridNumWidth: nw, gridNumHeight: nh, gridCol: isNaN(c) ? 0 : c, gridRow: isNaN(r) ? 0 : r };
}

export function EditorModal({ opened, onClose, title, draft, onDraftChange, onSave, placeholders, protoType, isInstance, onEditPrototype, onResetToPrototype, groupName, allGroups, onMoveToGroup }: EditorModalProps) {
    const ov = (field?: string) => placeholders && field ? ' (override)' : '';
    const effectiveType = draft.type ?? protoType;
    const frontCrop = draftGridCrop(draft.gridNumWidth, draft.gridNumHeight, draft.gridCol, draft.gridRow);
    const backCrop = draftGridCrop(draft.backGridNumWidth, draft.backGridNumHeight, draft.backGridCol, draft.backGridRow);

    return (
        <Modal opened={opened} onClose={onClose} title={title} zIndex={3000}>
            {opened && (
                <Stack>
                    {draft.type && draft.type !== 'deck' && draft.type !== 'stack' && (
                        <Select
                            label="Type"
                            data={TYPE_OPTIONS}
                            value={draft.type}
                            onChange={v => { if (v) onDraftChange({ ...draft, type: v as ObjectType }); }}
                            allowDeselect={false}
                            comboboxProps={{ zIndex: 3100 }}
                        />
                    )}
                    {onMoveToGroup && allGroups && (
                        <MantineGroup gap="xs" align="end">
                            <MantineText size="sm" c="dimmed">Group: {groupName ?? '(top level)'}</MantineText>
                            <Select
                                size="xs"
                                placeholder="Move to..."
                                data={[
                                    { value: '__top__', label: '(top level)' },
                                    ...allGroups.map(g => ({ value: g.id, label: g.name })),
                                ]}
                                onChange={v => {
                                    if (!v) return;
                                    if (v === '__top__') onMoveToGroup([]);
                                    else {
                                        const group = allGroups.find(g => g.id === v);
                                        if (group) onMoveToGroup(group.path);
                                    }
                                }}
                                clearable
                                comboboxProps={{ zIndex: 3100 }}
                                style={{ flex: 1 }}
                            />
                        </MantineGroup>
                    )}
                    <TextInput
                        label={`Name${ov(placeholders?.name)}`}
                        placeholder={placeholders?.name}
                        value={draft.name}
                        onChange={e => onDraftChange({ ...draft, name: e.currentTarget.value })}
                    />
                    <TextInput
                        label={`Text${ov(placeholders?.text)}`}
                        placeholder={placeholders?.text}
                        value={draft.text}
                        onChange={e => onDraftChange({ ...draft, text: e.currentTarget.value })}
                    />
                    <TextInput
                        label={`Scale${ov(placeholders?.scale)}`}
                        type="number"
                        step={0.1}
                        min={0.1}
                        placeholder={placeholders?.scale}
                        value={draft.scale}
                        onChange={e => onDraftChange({ ...draft, scale: e.currentTarget.value })}
                    />
                    <TextInput
                        label={`Image Source${ov(placeholders?.imageSrc)}`}
                        placeholder={placeholders?.imageSrc}
                        value={draft.imageSrc}
                        onChange={e => onDraftChange({ ...draft, imageSrc: e.currentTarget.value })}
                    />
                    {(draft.imageSrc || placeholders?.imageSrc) && (
                        <ImagePreview src={(draft.imageSrc || placeholders?.imageSrc)!} gridCrop={frontCrop} />
                    )}
                    <Accordion variant="contained">
                        <Accordion.Item value="grid">
                            <Accordion.Control>Grid Image</Accordion.Control>
                            <Accordion.Panel>
                                <Stack>
                                    <TextInput label="Total Columns" type="number" min={1} step={1} value={draft.gridNumWidth} onChange={e => onDraftChange({ ...draft, gridNumWidth: e.currentTarget.value })} />
                                    <TextInput label="Total Rows" type="number" min={1} step={1} value={draft.gridNumHeight} onChange={e => onDraftChange({ ...draft, gridNumHeight: e.currentTarget.value })} />
                                    <TextInput label="Column" type="number" min={0} step={1} value={draft.gridCol} onChange={e => onDraftChange({ ...draft, gridCol: e.currentTarget.value })} />
                                    <TextInput label="Row" type="number" min={0} step={1} value={draft.gridRow} onChange={e => onDraftChange({ ...draft, gridRow: e.currentTarget.value })} />
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>
                    </Accordion>
                    <Accordion variant="contained">
                        <Accordion.Item value="sizing">
                            <Accordion.Control>Custom Size</Accordion.Control>
                            <Accordion.Panel>
                                <Stack>
                                    <TextInput
                                        label="Width"
                                        type="number"
                                        step={1}
                                        min={1}
                                        value={draft.sizeX}
                                        onChange={e => onDraftChange({ ...draft, sizeX: e.currentTarget.value })}
                                    />
                                    <TextInput
                                        label="Height"
                                        type="number"
                                        step={1}
                                        min={1}
                                        value={draft.sizeY}
                                        onChange={e => onDraftChange({ ...draft, sizeY: e.currentTarget.value })}
                                    />
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>
                    </Accordion>
                    {(effectiveType === 'token' || effectiveType === 'card') && (
                        <>
                            <Checkbox
                                label="Has back"
                                checked={draft.hasBack}
                                onChange={e => onDraftChange({ ...draft, hasBack: e.currentTarget.checked })}
                            />
                            {draft.hasBack && (
                                <>
                                    {isInstance && (
                                        <Checkbox
                                            label="Flipped"
                                            checked={draft.flipped}
                                            onChange={e => onDraftChange({ ...draft, flipped: e.currentTarget.checked })}
                                        />
                                    )}
                                    <TextInput
                                        label="Back Image Source"
                                        value={draft.backImageSrc}
                                        onChange={e => onDraftChange({ ...draft, backImageSrc: e.currentTarget.value })}
                                    />
                                    {draft.backImageSrc && (
                                        <ImagePreview src={draft.backImageSrc} gridCrop={backCrop} />
                                    )}
                                    <Accordion variant="contained">
                                        <Accordion.Item value="backGrid">
                                            <Accordion.Control>Grid Image (Back)</Accordion.Control>
                                            <Accordion.Panel>
                                                <Stack>
                                                    <TextInput label="Total Columns" type="number" min={1} step={1} value={draft.backGridNumWidth} onChange={e => onDraftChange({ ...draft, backGridNumWidth: e.currentTarget.value })} />
                                                    <TextInput label="Total Rows" type="number" min={1} step={1} value={draft.backGridNumHeight} onChange={e => onDraftChange({ ...draft, backGridNumHeight: e.currentTarget.value })} />
                                                    <TextInput label="Column" type="number" min={0} step={1} value={draft.backGridCol} onChange={e => onDraftChange({ ...draft, backGridCol: e.currentTarget.value })} />
                                                    <TextInput label="Row" type="number" min={0} step={1} value={draft.backGridRow} onChange={e => onDraftChange({ ...draft, backGridRow: e.currentTarget.value })} />
                                                </Stack>
                                            </Accordion.Panel>
                                        </Accordion.Item>
                                    </Accordion>
                                    <TextInput
                                        label="Back Text"
                                        value={draft.backText}
                                        onChange={e => onDraftChange({ ...draft, backText: e.currentTarget.value })}
                                    />
                                </>
                            )}
                        </>
                    )}
                    <Button onClick={onSave}>Save</Button>
                    {onResetToPrototype && <Button variant="light" color="orange" onClick={onResetToPrototype}>Reset to Prototype</Button>}
                    {onEditPrototype && <Button variant="light" onClick={onEditPrototype}>Edit Prototype</Button>}
                </Stack>
            )}
        </Modal>
    );
}
