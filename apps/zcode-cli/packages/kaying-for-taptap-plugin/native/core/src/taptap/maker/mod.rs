//! Maker MCP client — JSON-RPC over NDJSON stdio.
//!
//! Spawns the bundled Maker MCP server (`node maker.js`) and exchanges
//! JSON-RPC 2.0 messages over stdin/stdout. Mirrors the TypeScript
//! implementation in the official plugin Maker MCP client.

pub mod client;
pub mod paths;

pub use client::{MakerCallError, MakerCallInput, MakerCallResult, MakerProgress, call_maker_tool};
pub use paths::{MakerPathsError, resolve_maker_bundle, resolve_node_command};
