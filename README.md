# RootLens

Proof of authenticity for the content you capture.

A camera app that proves your photos and videos are real — from capture to on-chain proof in one pipeline.

## What it does

Shoot, edit, publish. One tap records the proof on Solana. A verification page is generated instantly — paste the URL anywhere and anyone can verify it.

## How it works

There are three points where a proof of authenticity can be forged. RootLens closes all three.

1. **Capture** — The device's security chip signs the content the moment it's shot using [C2PA](https://c2pa.org/) (industry standard by Adobe, Google, Microsoft). No other device can reproduce that signature.
2. **Registration** — A Trusted Execution Environment verifies the signature and records the result as a compressed NFT on Solana. End-to-end encrypted — nobody sees the raw content, including our servers.
3. **Verification** — The viewer's browser queries Solana directly. No server in between. The chain is the proof.

## Architecture

```
┌─────────────────────────┐
│  React Native App       │  Camera · Editor · Publisher
│  Kotlin/Swift + c2pa-rs │  C2PA signing via device TEE
└───────────┬─────────────┘
            │ Title Protocol SDK
            ▼
┌─────────────────────────┐
│  Title Protocol (TEE)   │  E2E encrypted verification
│  Rust · WASM · Anchor   │  Content-agnostic · Stateless
└───────────┬─────────────┘
            │ Verification result only
            ▼
┌─────────────────────────┐
│  Solana (cNFT)          │  Bubblegum + Concurrent Merkle Tree
│  ~$0.002 per record     │  1M posts < $100
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  Public Verification    │  Client-side only
│  rootlens.io            │  Solana RPC direct query
└─────────────────────────┘
```

## Built on

- **[Title Protocol](https://github.com/yudai-mori-2004/title-protocol)** — Open-source trustless content verification infrastructure. RootLens is the first application built on top of it.
- **Solana** — Compressed NFTs via Bubblegum for low-cost, high-scale on-chain records.
- **C2PA** — Content provenance standard co-developed by Adobe, Google, Microsoft, and others.

## Stack

| Layer | Technology |
|-------|-----------|
| Mobile App | React Native (iOS + Android) |
| Native Modules | Kotlin / Swift + C FFI into c2pa-rs |
| C2PA Signing | c2pa-rs (Rust static library) via device Secure Enclave / StrongBox |
| Authentication | Privy (email / social login) |
| Backend | Title Protocol SDK (TypeScript) |
| Verification | Client-side Ed25519 + pHash via Solana RPC |
| On-chain | Solana devnet (Bubblegum cNFT + Anchor program) |

## UX Principles

- **Zero-login start** — Camera and editor work without an account. Sign up only when you want to publish.
- **No crypto jargon** — "Mint" → "Publish". "cNFT" → "Proof of authenticity". Gas fees are covered by RootLens.
- **Edit constraints** — Only information-reducing operations allowed (crop, mask, trim). Filters, composites, and color adjustments are intentionally prohibited — they contradict proof of authenticity.

## Links

- [Title Protocol](https://github.com/yudai-mori-2004/title-protocol)
- [Specification (Japanese)](document/v0.1.0/SPECS_JA.md)

## License

See [LICENSE](LICENSE).
