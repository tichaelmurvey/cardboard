import { Drawer, Button, Stack, Divider, Text as MantineText, Badge, UnstyledButton, Group as MantineGroup, ActionIcon, SegmentedControl } from '@mantine/core';
import type { Prototype, CanvasState, Player } from '../../state_management/types';

interface SidebarProps {
    opened: boolean;
    onClose: () => void;
    state: CanvasState;
    onSave: () => void;
    onLoad: () => void;
    onSpawn: (prototypeId: string, e: React.MouseEvent) => void;
    onEditPrototype: (protoId: string) => void;
    onDeletePrototype: (protoId: string) => void;
    onNewPrototype: () => void;
    onAddPlayer: () => void;
    onDeletePlayer: (id: string) => void;
    onAddHiddenRegion: (playerId: string) => void;
    isHost: boolean;
    editMode: boolean;
    onEditModeChange: (editMode: boolean) => void;
}

export function Sidebar({ opened, onClose, state, onSave, onLoad, onSpawn, onEditPrototype, onDeletePrototype, onNewPrototype, onAddPlayer, onDeletePlayer, onAddHiddenRegion, isHost, editMode, onEditModeChange }: SidebarProps) {
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
                {editMode && (
                    <>
                        <Divider label="Prototypes" />
                        <Button variant="light" size="xs" onClick={onNewPrototype}>+ New Prototype</Button>
                        {state.prototypes.map(proto => (
                            <PrototypeEntry key={proto.id} proto={proto} onSpawn={onSpawn} onEdit={onEditPrototype} onDelete={onDeletePrototype} />
                        ))}
                    </>
                )}
                <Divider label="Players" />
                {state.players.map(player => (
                    <PlayerEntry key={player.id} player={player} onDelete={editMode ? onDeletePlayer : undefined} onAddHiddenRegion={isHost && editMode ? onAddHiddenRegion : undefined} />
                ))}
                {editMode && <Button variant="light" size="xs" onClick={onAddPlayer}>+ Add Player</Button>}
                {isHost && (
                    <>
                        <Divider />
                        <MantineText size="xs" c="dimmed" ta="center">You are the host</MantineText>
                        <SegmentedControl
                            value={editMode ? 'edit' : 'play'}
                            onChange={(v) => onEditModeChange(v === 'edit')}
                            data={[
                                { label: 'Edit', value: 'edit' },
                                { label: 'Play', value: 'play' },
                            ]}
                            fullWidth
                        />
                    </>
                )}
            </Stack>
        </Drawer>
    );
}

function PrototypeEntry({ proto, onSpawn, onEdit, onDelete }: { proto: Prototype; onSpawn: (id: string, e: React.MouseEvent) => void; onEdit: (id: string) => void; onDelete: (id: string) => void }) {
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
            <ActionIcon variant="subtle" color="red" size="sm" onClick={() => onDelete(proto.id)}>
                ✕
            </ActionIcon>
        </MantineGroup>
    );
}

function PlayerEntry({ player, onDelete, onAddHiddenRegion }: { player: Player; onDelete?: (id: string) => void; onAddHiddenRegion?: (playerId: string) => void }) {
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
            {onAddHiddenRegion && (
                <ActionIcon variant="subtle" size="sm" title="Add hidden region" onClick={() => onAddHiddenRegion(player.id)}>
                    ▣
                </ActionIcon>
            )}
            {onDelete && (
                <ActionIcon variant="subtle" color="red" size="sm" onClick={() => onDelete(player.id)}>
                    ✕
                </ActionIcon>
            )}
        </MantineGroup>
    );
}
