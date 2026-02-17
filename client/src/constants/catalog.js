export const NICOLAZZI_FINISH_GROUPS = ["G0.5", "G1", "G2", "G3", "G4", "G5", "G6", "G7"];

export const HIDDEN_COLLECTIONS = [
    "Geral",
    "Standard",
    "Classic",
    "Modern",
    "Kitchen",
    "Shower"
];

// Helper to check if a collection should be shown
export const shouldShowCollection = (collectionName) => {
    if (!collectionName) return false;
    const name = String(collectionName).trim();
    if (!name) return false;

    // Case insensitive check
    const isHidden = HIDDEN_COLLECTIONS.some(hidden => hidden.toLowerCase() === name.toLowerCase());
    return !isHidden;
};
