import { Modal, Stack, TextInput, Button } from '@mantine/core';

export interface InstDraft {
    text: string;
    scale: string;
    imageSrc: string;
}

interface InstEditorModalProps {
    opened: boolean;
    onClose: () => void;
    draft: InstDraft;
    onDraftChange: (draft: InstDraft) => void;
    onSave: () => void;
    placeholders: { text: string; scale: string; imageSrc: string };
}

export function InstEditorModal({ opened, onClose, draft, onDraftChange, onSave, placeholders }: InstEditorModalProps) {
    return (
        <Modal opened={opened} onClose={onClose} title="Edit Instance" zIndex={3000}>
            {opened && (
                <Stack>
                    <TextInput
                        label="Name (override)"
                        placeholder={placeholders.text}
                        value={draft.text}
                        onChange={e => { const v = e.currentTarget.value; onDraftChange({ ...draft, text: v }); }}
                    />
                    <TextInput
                        label="Scale (override)"
                        type="number"
                        step={0.1}
                        min={0.1}
                        placeholder={placeholders.scale}
                        value={draft.scale}
                        onChange={e => { const v = e.currentTarget.value; onDraftChange({ ...draft, scale: v }); }}
                    />
                    <TextInput
                        label="Image Source (override)"
                        placeholder={placeholders.imageSrc}
                        value={draft.imageSrc}
                        onChange={e => { const v = e.currentTarget.value; onDraftChange({ ...draft, imageSrc: v }); }}
                    />
                    <Button onClick={onSave}>Save</Button>
                </Stack>
            )}
        </Modal>
    );
}
