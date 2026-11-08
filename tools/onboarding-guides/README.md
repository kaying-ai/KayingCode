# Mobile onboarding guide images

`render.py` uses Pillow and the Flutter app's bundled Sarasa UI fonts to render five deterministic, non-scannable UI diagrams. The source positions come from `DesktopMobilePairingEntry`, Flutter `device_management_page.dart`, and Taro `pages/device/index.tsx` / session navigation. The output is copied to both mobile apps; run the script again whenever one of those entry points moves.

```sh
python tools/onboarding-guides/render.py
```

The diagrams are examples, not screenshots or connection codes. Check all five PNGs visually before committing changes.
