//! `kaying-for-taptap-core schema` — print JSON Schema for types or commands.

use clap::{Args, Subcommand};

/// Arguments for the `schema` subcommand.
#[derive(Debug, Args)]
pub struct SchemaArgs {
    /// What schema to print.
    #[command(subcommand)]
    pub target: SchemaTarget,
}

/// What schema to print.
#[derive(Debug, Subcommand)]
pub enum SchemaTarget {
    /// Print the JSON Schema for DetectionResult.
    DetectionResult,
    /// Print the JSON Schema for CapabilityReport.
    CapabilityReport,
    /// Print the JSON Schema for OperationSpec.
    OperationSpec,
    /// Print the JSON Schema for OperationPlan.
    OperationPlan,
}

/// Execute the schema command.
pub fn execute(args: &SchemaArgs) -> Result<serde_json::Value, crate::common::Error> {
    let schema = match &args.target {
        SchemaTarget::DetectionResult => {
            let schema = schemars::schema_for!(crate::model::DetectionResult);
            serde_json::to_value(&schema)
                .map_err(|e| crate::common::Error::new("SERIALIZATION_ERROR", format!("{e}")))?
        }
        SchemaTarget::CapabilityReport => {
            let schema = schemars::schema_for!(crate::model::CapabilityReport);
            serde_json::to_value(&schema)
                .map_err(|e| crate::common::Error::new("SERIALIZATION_ERROR", format!("{e}")))?
        }
        SchemaTarget::OperationSpec => {
            let schema = schemars::schema_for!(crate::model::OperationSpec);
            serde_json::to_value(&schema)
                .map_err(|e| crate::common::Error::new("SERIALIZATION_ERROR", format!("{e}")))?
        }
        SchemaTarget::OperationPlan => {
            let schema = schemars::schema_for!(crate::model::OperationPlan);
            serde_json::to_value(&schema)
                .map_err(|e| crate::common::Error::new("SERIALIZATION_ERROR", format!("{e}")))?
        }
    };

    Ok(schema)
}
