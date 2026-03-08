import type { CanvasState } from "./types";
import order_board from "../assets/boards/Order board.png";
import lunecastleSrc from "../assets/tokens/lunecastle.png";

const boardId = crypto.randomUUID();
const cardId = crypto.randomUUID();
const tokenId = crypto.randomUUID();
const deckId = crypto.randomUUID();

export const DEFAULT_STATE: CanvasState = {
    version: 1,
    prototypes: [
        { id: boardId, type: "board", props: { src: order_board } },
        { id: cardId, type: "card", props: { text: "Card! This is a card" } },
        { id: deckId, type: "deck", props: { text: "Deck" } },
        { id: tokenId, type: "token", props: { imageSrc: lunecastleSrc, text: "This is a token with quite a bit of text" } },
    ],
    instances: [
        { id: crypto.randomUUID(), prototypeId: boardId, x: 0, y: 0 },
        { id: crypto.randomUUID(), prototypeId: cardId, x: 0, y: 0 },
        { id: crypto.randomUUID(), prototypeId: tokenId, x: 0, y: 0 },
    ],
};
