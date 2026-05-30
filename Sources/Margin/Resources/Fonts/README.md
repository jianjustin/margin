# Bundled fonts

Drop IBM Plex `.ttf` files here. They are auto-registered at app launch by
`FontStack.register()` and resolved by `FontStack.ui(...)` / `mono(...)` / `serif(...)`.

If a file is missing, that lookup falls back to the system font — the app still launches.

## Recommended subset (M3.5)

Download the latest IBM Plex release from
https://github.com/IBM/plex/releases/latest and copy these files into this folder:

- `IBMPlexSans-Regular.ttf`
- `IBMPlexSans-Medium.ttf`
- `IBMPlexSans-SemiBold.ttf`
- `IBMPlexSans-Italic.ttf`
- `IBMPlexSansSC-Regular.ttf`
- `IBMPlexSansSC-Medium.ttf`
- `IBMPlexSansSC-SemiBold.ttf`
- `IBMPlexMono-Regular.ttf`
- `IBMPlexMono-Medium.ttf`
- `IBMPlexSerif-Regular.ttf`
- `IBMPlexSerif-Medium.ttf`

License: SIL Open Font License 1.1 (see IBM Plex repository).
