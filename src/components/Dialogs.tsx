// Compatibility facade for dialog consumers. Keep imports stable while dialog
// implementations live in focused modules.
export { TAG_COLORS, CreateEntityDialog, ConfirmTrashDialog, ConfirmLibraryEntityDeleteDialog, RenameDialog } from "./dialogs/EntityDialogs";
export { PreviewDialog, previewDirectionForIndices } from "./dialogs/PreviewDialog";
export { SettingsDialog } from "./dialogs/SettingsDialog";
