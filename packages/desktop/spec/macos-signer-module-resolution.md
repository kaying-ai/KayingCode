# macOS signer module resolution

## Product rule and owner

- Desktop packaging owns the custom macOS signing hook in `scripts/sign-macos.cjs`.
- The hook uses electron-builder's installed `app-builder-lib` version for its bulk signing pass. `app-builder-lib` is a transitive dependency of `electron-builder`, so the hook must resolve it from electron-builder's installation root rather than from the Desktop package root.
- The hook does not install packages or change signing identity selection. A missing `electron-builder` or signing implementation fails before signing starts.

## Interface and acceptance

- `electron-builder.config.js` continues to call `scripts/sign-macos.cjs` through its `mac.sign` hook.
- With a Bun isolated dependency layout where `electron-builder` is directly accessible to Desktop and `app-builder-lib` is accessible only from electron-builder's dependency tree, loading the hook succeeds.
- Loading the hook does not perform signing. Existing signing, verification, and notarization failure semantics remain in effect when the hook runs.
