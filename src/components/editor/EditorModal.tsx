import { Modal, Stack, TextInput, Button, Checkbox, Select } from '@mantine/core';
import type { ObjectType } from '../../state_management/types';

const TYPE_OPTIONS: { value: ObjectType; label: string }[] = [
    { value: 'token', label: 'Token' },
    { value: 'card', label: 'Card' },
    { value: 'board', label: 'Board' },
    { value: 'deck', label: 'Deck' },
    { value: 'stack', label: 'Stack' },
];

export interface EditorDraft {
    name: string;
    text: string;
    scale: string;
    imageSrc: string;
    hasBack: boolean;
    backImageSrc: string;
    backText: string;
    flipped: boolean;
    customSizing: boolean;
    sizeX: string;
    sizeY: string;
    type?: ObjectType;
}

export const EMPTY_DRAFT: EditorDraft = {
    name: '', text: '', scale: '', imageSrc: '',
    hasBack: false, backImageSrc: '', backText: '',
    flipped: false,
    customSizing: false, sizeX: '', sizeY: '',
};

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
}

export function EditorModal({ opened, onClose, title, draft, onDraftChange, onSave, placeholders, protoType, isInstance, onEditPrototype, onResetToPrototype }: EditorModalProps) {
    const ov = (field?: string) => placeholders && field ? ' (override)' : '';
    const effectiveType = draft.type ?? protoType;

    return (
        <Modal opened={opened} onClose={onClose} title={title} zIndex={3000}>
            {opened && (
                <Stack>
                    {draft.type && (
                        <Select
                            label="Type"
                            data={TYPE_OPTIONS}
                            value={draft.type}
                            onChange={v => { if (v) onDraftChange({ ...draft, type: v as ObjectType }); }}
                            allowDeselect={false}
                            comboboxProps={{ zIndex: 3100 }}
                        />
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
                    {effectiveType === 'board' && (
                        <>
                            <Checkbox
                                label="Custom sizing"
                                checked={draft.customSizing}
                                onChange={e => onDraftChange({ ...draft, customSizing: e.currentTarget.checked })}
                            />
                            {draft.customSizing && (
                                <>
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
                                </>
                            )}
                        </>
                    )}
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
