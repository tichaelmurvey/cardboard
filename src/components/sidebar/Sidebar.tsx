import { memo, useState, useEffect, useCallback } from 'react';
import { Drawer, Button, Stack, Divider, Text as MantineText, Badge, UnstyledButton, Group as MantineGroup, ActionIcon, SegmentedControl, TextInput, Breadcrumbs, Anchor } from '@mantine/core';
import type { Prototype, Player, PrototypeItem, PrototypeGroup } from '../../state_management/types';
import { isPrototypeGroup } from '../../state_management/types';
import { getItemsAtPath } from '../../state_management/prototypeUtils';

interface SidebarProps {
    opened: boolean;
    onClose: () => void;
    prototypes: PrototypeItem[];
    players: Player[];
    onSave: () => void;
    onLoad: () => void;
    onSpawn: (prototypeId: string, e: React.MouseEvent) => void;
    onEditPrototype: (protoId: string) => void;
    onDeletePrototype: (protoId: string) => void;
    onNewPrototype: (path: string[]) => void;
    onNewGroup: (path: string[]) => void;
    onDeleteGroup: (id: string) => void;
    onRenameGroup: (id: string, newName: string) => void;
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

export const Sidebar = memo(function Sidebar({ opened, onClose, prototypes, players, onSave, onLoad, onSpawn, onEditPrototype, onDeletePrototype, onNewPrototype, onNewGroup, onDeleteGroup, onRenameGroup, onAddPlayer, onDeletePlayer, onAddHiddenRegion, onLoadTTS, onImportTTS, isHost, hostPlayerId, editMode, onEditModeChange }: SidebarProps) {
    const [groupPath, setGroupPath] = useState<{ id: string; name: string }[]>([]);

    const currentPath = groupPath.map(g => g.id);
    const currentItems = getItemsAtPath(prototypes, currentPath);

    const openGroup = useCallback((group: PrototypeGroup) => {
        setGroupPath(prev => [...prev, { id: group.id, name: group.name }]);
    }, []);

    const navigateTo = useCallback((index: number) => {
        // index -1 means root
        setGroupPath(prev => prev.slice(0, index + 1));
    }, []);

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
                                    <Breadcrumbs>
                                        <Anchor size="sm" onClick={() => navigateTo(-1)} style={{ cursor: 'pointer' }}>
                                            Prototypes
                                        </Anchor>
                                        {groupPath.map((seg, i) => (
                                            <Anchor key={seg.id} size="sm" onClick={() => navigateTo(i)} style={{ cursor: 'pointer' }}>
                                                {seg.name}
                                            </Anchor>
                                        ))}
                                    </Breadcrumbs>
                                    <MantineGroup gap="xs">
                                        <Button variant="light" size="xs" onClick={() => onNewPrototype(currentPath)} style={{ flex: 1 }}>+ Prototype</Button>
                                        <Button variant="light" size="xs" onClick={() => onNewGroup(currentPath)} style={{ flex: 1 }}>+ Group</Button>
                                    </MantineGroup>
                                    {currentItems.map(item =>
                                        isPrototypeGroup(item)
                                            ? <GroupEntry key={item.id} group={item} onOpen={openGroup} onDelete={onDeleteGroup} onRename={onRenameGroup} />
                                            : <PrototypeEntry key={item.id} proto={item} onSpawn={onSpawn} onEdit={onEditPrototype} onDelete={onDeletePrototype} />
                                    )}
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

const THUMB_MAX = 80;

function PrototypeThumbnail({ proto }: { proto: Prototype }) {
    const src = (proto.props.imageSrc ?? proto.props.src) as string | undefined;
    const gridCol = proto.props.gridCol as number | undefined;
    const gridRow = proto.props.gridRow as number | undefined;
    const gridNumWidth = proto.props.gridNumWidth as number | undefined;
    const gridNumHeight = proto.props.gridNumHeight as number | undefined;
    const hasGrid = gridCol != null && gridNumWidth != null && gridNumHeight != null;

    const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
    useEffect(() => {
        setNaturalSize(null);
        if (!src) return;
        const img = new Image();
        img.onload = () => setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
        img.src = src;
    }, [src]);

    if (!src) return null;

    if (hasGrid && naturalSize) {
        const cellW = naturalSize.w / gridNumWidth!;
        const cellH = naturalSize.h / gridNumHeight!;
        const scale = Math.min(THUMB_MAX / cellW, THUMB_MAX / cellH, 1);
        const dispW = Math.round(cellW * scale);
        const dispH = Math.round(cellH * scale);
        const posX = gridNumWidth! <= 1 ? 0 : (gridCol! / (gridNumWidth! - 1)) * 100;
        const posY = gridNumHeight! <= 1 ? 0 : ((gridRow ?? 0) / (gridNumHeight! - 1)) * 100;
        return (
            <div style={{
                width: dispW,
                height: dispH,
                borderRadius: 4,
                backgroundImage: `url(${src})`,
                backgroundSize: `${naturalSize.w * scale}px ${naturalSize.h * scale}px`,
                backgroundPosition: `${posX}% ${posY}%`,
                flexShrink: 0,
            }} />
        );
    }

    return (
        <img
            src={src}
            style={{
                maxWidth: THUMB_MAX,
                maxHeight: THUMB_MAX,
                objectFit: 'contain',
                borderRadius: 4,
                flexShrink: 0,
            }}
        />
    );
}

const GroupEntry = memo(function GroupEntry({ group, onOpen, onDelete, onRename }: { group: PrototypeGroup; onOpen: (group: PrototypeGroup) => void; onDelete: (id: string) => void; onRename: (id: string, newName: string) => void }) {
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(group.name);

    function handleRename() {
        if (name.trim()) onRename(group.id, name.trim());
        setEditing(false);
    }

    return (
        <MantineGroup gap="xs" wrap="nowrap">
            <UnstyledButton
                onClick={() => onOpen(group)}
                style={{
                    flex: 1,
                    padding: '8px',
                    border: '1px solid var(--mantine-color-default-border)',
                    borderRadius: 'var(--mantine-radius-sm)',
                    cursor: 'pointer',
                }}
            >
                <MantineGroup gap="xs" wrap="nowrap">
                    <MantineText size="lg">📁</MantineText>
                    {editing ? (
                        <TextInput
                            size="xs"
                            value={name}
                            onChange={e => setName(e.currentTarget.value)}
                            onBlur={handleRename}
                            onKeyDown={e => { if (e.key === 'Enter') handleRename(); }}
                            onClick={e => e.stopPropagation()}
                            autoFocus
                            style={{ flex: 1 }}
                        />
                    ) : (
                        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                            <MantineText size="sm" fw={500}>{group.name}</MantineText>
                            <Badge variant="light" size="xs">{group.contents.length} items</Badge>
                        </Stack>
                    )}
                </MantineGroup>
            </UnstyledButton>
            <Button size="xs" variant="subtle" onClick={() => { setName(group.name); setEditing(true); }}>Rename</Button>
            <ActionIcon variant="subtle" color="red" size="sm" onClick={() => onDelete(group.id)}>
                ✕
            </ActionIcon>
        </MantineGroup>
    );
});

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
