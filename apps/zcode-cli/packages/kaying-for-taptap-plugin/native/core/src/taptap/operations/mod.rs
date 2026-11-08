//! TapTap operation implementations — project, runtime, maker, and content ops.
//!
//! Each module provides handler functions called by `TapTapProvider::prepare()`
//! and `TapTapProvider::execute()`. The full operation catalog and dispatch
//! table live in [`catalog`] and [`dispatch`] respectively.

pub mod agent_contract;
mod agent_contract_schema;
pub mod animation;
pub mod asset;
pub mod build;
pub mod capture;
pub mod catalog;
mod catalog_extended;
mod catalog_maturity;
mod catalog_project;
pub mod component;
pub mod component_helpers;
pub mod data;
pub mod debug;
pub mod dispatch;
pub mod editor;
pub mod gameobject;
pub mod gameobject_xml;
pub mod gameplay;
pub mod helpers;
pub mod maker;
pub mod material;
pub mod network;
pub mod package;
pub mod physics;
pub mod prefab;
pub mod prefab_xml;
pub mod project;
pub mod project_migrate_scan;
pub mod project_scaffold;
pub mod project_validate;
pub mod project_validate_lifecycle;
#[path = "project_validate_v2.rs"]
pub mod project_validate_surfaces;
#[path = "project_validate_v2_cross.rs"]
pub mod project_validate_surfaces_cross;
pub mod refactor;
pub mod refactor_backup;
pub mod refactor_backup_meta;
pub mod refactor_common;
pub mod refactor_lua;
pub mod refactor_lua_blocks;
#[path = "refactor_modular_v2.rs"]
pub mod refactor_modular;
pub mod refactor_modular_classify;
pub mod refactor_modular_metadata;
pub mod refactor_move_split;
pub mod refactor_mutate;
pub mod refactor_redistribute;
pub mod refactor_redistribute_scaffold;
pub mod refactor_scan;
pub mod refactor_transaction;
pub mod runtime;
mod runtime_session;
pub mod scene;
pub mod scene_design;
pub mod script;
pub mod settings;
pub mod surface;
pub mod surface_manifest;
pub mod surface_template;
pub mod ui;
pub mod ui_theme;
pub mod vfx;
pub mod world;

pub use catalog::catalog;
pub use dispatch::dispatch;
