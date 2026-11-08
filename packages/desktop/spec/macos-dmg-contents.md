# macOS DMG contents

## Product rule and owner

- Desktop packaging owns the DMG layout in `electron-builder.config.js`.
- The DMG window contains the packaged app and an `/Applications` link. The configured `background` and `icon` fields provide the visual assets.
- `dmg.contents` entries describe files or links that `dmgbuild` copies into the mounted image. Generated `.background.tiff` and `.VolumeIcon.icns` are not source files and must not appear as `type: "file"` entries.

## Failure semantics and acceptance

- A missing configured background or icon, or a failed DMG copy, remains a packaging error; the build must not emit a successful release artifact.
- The resolved macOS builder config keeps the app position and `/Applications` link without extra file-copy entries for generated DMG assets.
- On macOS, the DMG stage copies the app and finishes without attempting `ditto .background.tiff` from the package working directory.
