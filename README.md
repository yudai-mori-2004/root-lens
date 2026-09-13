# RootLens

Capture infrastructure for turning real work into multimodal training data for embodied AI and robotics.

## Repository layout

```text
root-lens/
├── mobile/            iPhone capture app (React Native, Expo, Swift)
├── glasses/           Mentra Live capture app (Android)
├── desktop/           On-site review and upload app (Python, Qt)
├── web/               rootlens.io and its REST API (Next.js)
├── hardware/
│   ├── rootcap/       iPhone head mounts
│   ├── ego-oscar-split/       Custom stereo capture hardware
│   ├── hampo-rhb02bk-headset/ Hampo camera headset enclosure
│   └── research/      Existing-device assessments and procurement records
├── tools/
│   ├── session_cutter/       Long-session clip extraction
│   ├── hand-visibility-qc/   Hand-visibility quality checks
│   └── sample-select/        Sample statistics and selection
├── tests/             Cross-runtime test vectors
└── document/          Legal sources, task records, and historical specifications
```

Each top-level application is an independently executed product. `tools/` contains operator-run utilities; hardware implementation, fabrication files, and device research live under `hardware/`.

## Capture paths

The iPhone path records locally, creates a server-issued `unit_id`, verifies every source file, uploads the raw session to Cloudflare R2, and registers it through the web API.

The smart-glasses path records locally without network access. A site supervisor connects the glasses to the desktop app, reviews the recordings, and uploads approved sessions to the site's Google Drive folder.

## Development

The iPhone native modules require a physical device:

```bash
cd mobile
npm install
cd ios && LANG=en_US.UTF-8 pod install && cd ..
npx expo run:ios --device
```

See [mobile/README.md](mobile/README.md), [glasses/README.md](glasses/README.md), and [desktop/README.md](desktop/README.md) for each runtime's data contract and validation commands.

## License

[MIT](LICENSE)
