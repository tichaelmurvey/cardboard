import { Modal, Stack, TextInput, Button } from '@mantine/core';

export interface ProtoDraft {
    text: string;
    scale: string;
    imageSrc: string;
}

interface ProtoEditorModalProps {
    opened: boolean;
    onClose: () => void;
    draft: ProtoDraft;
    onDraftChange: (draft: ProtoDraft) => void;
    onSave: () => void;
}

export function ProtoEditorModal({ opened, onClose, draft, onDraftChange, onSave }: ProtoEditorModalProps) {
    return (
        <Modal opened={opened} onClose={onClose} title="Edit Prototype" zIndex={3000}>
            {opened && (
                <Stack>
                    <TextInput
                        label="Name"
                        value={draft.text}
                        onChange={e => { const v = e.currentTarget.value; onDraftChange({ ...draft, text: v }); }}
                    />
                    <TextInput
                        label="Scale"
                        type="number"
                        step={0.1}
                        min={0.1}
                        value={draft.scale}
                        onChange={e => { const v = e.currentTarget.value; onDraftChange({ ...draft, scale: v }); }}
                    />
                    <TextInput
                        label="Image Source (URL)"
                        value={draft.imageSrc}
                        onChange={e => { const v = e.currentTarget.value; onDraftChange({ ...draft, imageSrc: v }); }}
                    />
                    <Button onClick={onSave}>Save</Button>
                </Stack>
            )}
        </Modal>
    );
}
