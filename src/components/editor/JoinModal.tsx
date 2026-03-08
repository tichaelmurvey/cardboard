import { useState } from 'react';
import { Modal, Stack, TextInput, Button } from '@mantine/core';

interface JoinModalProps {
    opened: boolean;
    onJoin: (name: string) => void;
}

export function JoinModal({ opened, onJoin }: JoinModalProps) {
    const [name, setName] = useState('');

    return (
        <Modal opened={opened} onClose={() => {}} title="Join Game" zIndex={4000} withCloseButton={false} closeOnClickOutside={false} closeOnEscape={false}>
            <Stack>
                <TextInput
                    label="Your name"
                    placeholder="Enter your name"
                    value={name}
                    onChange={e => { const v = e.currentTarget.value; setName(v); }}
                    onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onJoin(name.trim()); }}
                    data-autofocus
                />
                <Button onClick={() => { if (name.trim()) onJoin(name.trim()); }} disabled={!name.trim()}>
                    Join
                </Button>
            </Stack>
        </Modal>
    );
}
