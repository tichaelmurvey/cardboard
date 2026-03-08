const STORAGE_KEY = 'cardboard-client-id';

export function getClientId(): string {
    let id = sessionStorage.getItem(STORAGE_KEY);
    if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem(STORAGE_KEY, id);
    }
    return id;
}
