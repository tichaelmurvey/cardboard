import type { CanvasState } from "./types";

export function serialize(state: CanvasState): string {
    return JSON.stringify(state, null, 2);
}

export function deserialize(json: string): CanvasState {
    const parsed = JSON.parse(json);
    if (parsed.version !== 1) throw new Error(`Unknown version: ${parsed.version}`);
    if (!Array.isArray(parsed.prototypes)) throw new Error("Invalid state: missing prototypes array");
    if (!Array.isArray(parsed.instances)) throw new Error("Invalid state: missing instances array");
    return parsed as CanvasState;
}

export function downloadJson(state: CanvasState, filename = "cardboard-save.json") {
    const blob = new Blob([serialize(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function uploadJson(): Promise<CanvasState> {
    return new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return reject(new Error("No file selected"));
            const reader = new FileReader();
            reader.onload = () => resolve(deserialize(reader.result as string));
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        };
        input.click();
    });
}
