import { memo } from 'react';
import { Drawer, Button, Stack, Divider, Text as MantineText, Badge, UnstyledButton, Group as MantineGroup, ActionIcon, SegmentedControl } from '@mantine/core';
import type { Prototype, Player } from '../../state_management/types';

interface SidebarProps {
    opened: boolean;
    onClose: () => void;
    prototypes: Prototype[];
    players: Player[];
    onSave: () => void;
    onLoad: () => void;
    onSpawn: (prototypeId: string, e: React.MouseEvent) => void;
    onEditPrototype: (protoId: string) => void;
    onDeletePrototype: (protoId: string) => void;
    onNewPrototype: () => void;
    onAddPlayer: () => void;
    onDeletePlayer: (id: string) => void;
    onAddHiddenRegion: (playerId: string) => void;
    onLoadTTS: () => void;
    onImportTTS: () => void;
    isHost: boolean;
    hostPlayerId: string | null;
    editMode: boolean;
    onEditModeChange: (editMode: boolean) => void;
}

export const Sidebar = memo(function Sidebar({ opened, onClose, prototypes, players, onSave, onLoad, onSpawn, onEditPrototype, onDeletePrototype, onNewPrototype, onAddPlayer, onDeletePlayer, onAddHiddenRegion, onLoadTTS, onImportTTS, isHost, hostPlayerId, editMode, onEditModeChange }: SidebarProps) {
    return (
        <Drawer position='right' opened={opened} onClose={onClose} trapFocus={false} closeOnClickOutside={false} withOverlay={false}>
            {opened && (
                <>
                    <h2 style={{
                        fontFamily: 'Sheandy',
                        fontWeight: 'normal',
                        margin: 0,
                        textAlign: "center",
                        fontSize: "5rem",
                        color: "sienna"
                    }}>Cardboard</h2>
                    <Stack h="100%" justify='space-between'>
                        <Stack>
                            <Button onClick={onSave}>Save</Button>
                            <Button onClick={onLoad}>Load</Button>
                            {editMode && <Button onClick={onLoadTTS}>Load TTS Save</Button>}
                            {editMode && <Button onClick={onImportTTS}>Import from TTS/Dextrous</Button>}
                            {editMode && (
                                <>
                                    <Divider label="Prototypes" />
                                    <Button variant="light" size="xs" onClick={onNewPrototype}>+ New Prototype</Button>
                                    {prototypes.map(proto => (
                                        <PrototypeEntry key={proto.id} proto={proto} onSpawn={onSpawn} onEdit={onEditPrototype} onDelete={onDeletePrototype} />
                                    ))}
                                </>
                            )}
                            <Divider label="Players" />
                            {players.map(player => (
                                <PlayerEntry key={player.id} player={player} isHost={player.id === hostPlayerId} onDelete={editMode ? onDeletePlayer : undefined} onAddHiddenRegion={isHost && editMode ? onAddHiddenRegion : undefined} />
                            ))}
                            {editMode && <Button variant="light" size="xs" onClick={onAddPlayer}>+ Add Player</Button>}
                        </Stack>
                        {isHost && (
                            <Stack>
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
                            </Stack>
                        )}
                    </Stack>
                </>
            )}
        </Drawer>
    );
});

function PrototypeThumbnail({ proto }: { proto: Prototype }) {
    const src = (proto.props.imageSrc ?? proto.props.src) as string | undefined;
    if (!src) return null;

    const gridCol = proto.props.gridCol as number | undefined;
    const gridRow = proto.props.gridRow as number | undefined;
    const gridNumWidth = proto.props.gridNumWidth as number | undefined;
    const gridNumHeight = proto.props.gridNumHeight as number | undefined;
    const hasGrid = gridCol != null && gridNumWidth != null && gridNumHeight != null;

    if (hasGrid) {
        const posX = gridNumWidth! <= 1 ? 0 : ((gridCol!) / (gridNumWidth! - 1)) * 100;
        const posY = gridNumHeight! <= 1 ? 0 : ((gridRow ?? 0) / (gridNumHeight! - 1)) * 100;
        return (
            <div style={{
                width: 40,
                height: 40,
                borderRadius: 4,
                backgroundImage: `url(${src})`,
                backgroundSize: `${gridNumWidth! * 100}% ${gridNumHeight! * 100}%`,
                backgroundPosition: `${posX}% ${posY}%`,
                flexShrink: 0,
            }} />
        );
    }

    return (
        <img
            src={src}
            style={{
                width: 40,
                height: 40,
                objectFit: 'contain',
                borderRadius: 4,
                flexShrink: 0,
            }}
        />
    );
}

const PrototypeEntry = memo(function PrototypeEntry({ proto, onSpawn, onEdit, onDelete }: { proto: Prototype; onSpawn: (id: string, e: React.MouseEvent) => void; onEdit: (id: string) => void; onDelete: (id: string) => void }) {
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
                <MantineGroup gap="xs" wrap="nowrap">
                    <PrototypeThumbnail proto={proto} />
                    <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
                        <Badge variant="light">{proto.type}</Badge>
                        {typeof proto.props.name === 'string' && proto.props.name && <MantineText size="sm" fw={500}>{proto.props.name}</MantineText>}
                        {typeof proto.props.text === 'string' && <MantineText size="sm">{proto.props.text}</MantineText>}
                    </Stack>
                </MantineGroup>
            </UnstyledButton>
            <Button size="xs" variant="subtle" onClick={() => onEdit(proto.id)}>Edit</Button>
            <ActionIcon variant="subtle" color="red" size="sm" onClick={() => onDelete(proto.id)}>
                ✕
            </ActionIcon>
        </MantineGroup>
    );
});

const PlayerEntry = memo(function PlayerEntry({ player, isHost, onDelete, onAddHiddenRegion }: { player: Player; isHost: boolean; onDelete?: (id: string) => void; onAddHiddenRegion?: (playerId: string) => void }) {
    return (
        <MantineGroup gap="sm" wrap="nowrap">
            <div style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                backgroundColor: player.color,
                flexShrink: 0,
            }} />
            <MantineText size="sm" style={{ flex: 1 }}>{player.name}{isHost && <MantineText span size="xs" c="dimmed"> (host)</MantineText>}</MantineText>
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
});
