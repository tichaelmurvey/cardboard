import { Drawer, Button, Stack, Divider, Text as MantineText, Badge, UnstyledButton, Group as MantineGroup, ActionIcon } from '@mantine/core';
import type { Prototype, CanvasState, Player } from '../../state_management/types';

interface SidebarProps {
    opened: boolean;
    onClose: () => void;
    state: CanvasState;
    onSave: () => void;
    onLoad: () => void;
    onSpawn: (prototypeId: string, e: React.MouseEvent) => void;
    onEditPrototype: (protoId: string) => void;
    onAddPlayer: () => void;
    onDeletePlayer: (id: string) => void;
    isHost: boolean;
}

export function Sidebar({ opened, onClose, state, onSave, onLoad, onSpawn, onEditPrototype, onAddPlayer, onDeletePlayer, isHost }: SidebarProps) {
    return (
        <Drawer position='right' opened={opened} onClose={onClose} trapFocus={false} closeOnClickOutside={false} withOverlay={false}>
            <h2 style={{
                fontFamily: 'Sheandy',
                fontWeight: 'normal',
                margin: 0,
                textAlign: "center",
                fontSize: "5rem",
                color: "sienna"
            }}>Cardboard</h2>
            <Stack>
                <Button onClick={onSave}>Save</Button>
                <Button onClick={onLoad}>Load</Button>
                <Divider label="Prototypes" />
                {state.prototypes.map(proto => (
                    <PrototypeEntry key={proto.id} proto={proto} onSpawn={onSpawn} onEdit={onEditPrototype} />
                ))}
                <Divider label="Players" />
                {state.players.map(player => (
                    <PlayerEntry key={player.id} player={player} onDelete={onDeletePlayer} />
                ))}
                <Button variant="light" size="xs" onClick={onAddPlayer}>+ Add Player</Button>
                {isHost && (
                    <>
                        <Divider />
                        <MantineText size="xs" c="dimmed" ta="center">You are the host</MantineText>
                    </>
                )}
            </Stack>
        </Drawer>
    );
}

function PrototypeEntry({ proto, onSpawn, onEdit }: { proto: Prototype; onSpawn: (id: string, e: React.MouseEvent) => void; onEdit: (id: string) => void }) {
    return (
        <MantineGroup gap="xs" wrap="nowrap">
            <UnstyledButton
                onClick={(e) => onSpawn(proto.id, e)}
                style={{
                    flex: 1,
                    padding: '8px',
                    border: '1px solid var(--mantine-color-default-border)',
                    borderRadius: 'var(--mantine-radius-sm)',
                    cursor: 'grab',
                }}
            >
                <Stack gap="xs">
                    <Badge variant="light">{proto.type}</Badge>
                    {typeof proto.props.text === 'string' && <MantineText size="sm">{proto.props.text}</MantineText>}
                </Stack>
            </UnstyledButton>
            <Button size="xs" variant="subtle" onClick={() => onEdit(proto.id)}>Edit</Button>
        </MantineGroup>
    );
}

function PlayerEntry({ player, onDelete }: { player: Player; onDelete: (id: string) => void }) {
    return (
        <MantineGroup gap="sm" wrap="nowrap">
            <div style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                backgroundColor: player.color,
                flexShrink: 0,
            }} />
            <MantineText size="sm" style={{ flex: 1 }}>{player.name}</MantineText>
            <ActionIcon variant="subtle" color="red" size="sm" onClick={() => onDelete(player.id)}>
                ✕
            </ActionIcon>
        </MantineGroup>
    );
}
