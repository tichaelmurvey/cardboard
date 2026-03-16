import { useState } from 'react';
import { Modal, Stack, TextInput, Button, Select } from '@mantine/core';
import type { ObjectType } from '../../state_management/types';

const TYPE_OPTIONS: { value: ObjectType; label: string }[] = [
    { value: 'card', label: 'Card' },
    { value: 'token', label: 'Token' },
    { value: 'board', label: 'Board' },
];

interface NewProtoModalProps {
    opened: boolean;
    onClose: () => void;
    onCreate: (type: ObjectType, text: string, scale: number, imageSrc: string) => void;
}

export function NewProtoModal({ opened, onClose, onCreate }: NewProtoModalProps) {
    const [type, setType] = useState<ObjectType>('card');
    const [text, setText] = useState('');
    const [scale, setScale] = useState('1');
    const [imageSrc, setImageSrc] = useState('');

    function handleCreate() {
        const scaleVal = parseFloat(scale);
        onCreate(type, text.trim() || 'Untitled', isNaN(scaleVal) || scaleVal <= 0 ? 1 : scaleVal, imageSrc);
        setText('');
        setScale('1');
        setImageSrc('');
        setType('card');
        onClose();
    }

    return (
        <Modal opened={opened} onClose={onClose} title="New Prototype" zIndex={3000}>
            {opened && (
                <Stack>
                    <Select
                        label="Type"
                        data={TYPE_OPTIONS}
                        value={type}
                        onChange={v => { if (v) setType(v as ObjectType); }}
                        comboboxProps={{ zIndex: 4000 }}
                    />
                    <TextInput
                        label="Name"
                        value={text}
                        onChange={e => setText(e.currentTarget.value)}
                        data-autofocus
                    />
                    <TextInput
                        label="Scale"
                        type="number"
                        step={0.1}
                        min={0.1}
                        value={scale}
                        onChange={e => setScale(e.currentTarget.value)}
                    />
                    <TextInput
                        label="Image Source (URL)"
                        value={imageSrc}
                        onChange={e => setImageSrc(e.currentTarget.value)}
                    />
                    <Button onClick={handleCreate}>Create</Button>
                </Stack>
            )}
        </Modal>
    );
}
