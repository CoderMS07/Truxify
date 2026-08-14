use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BulletproofInput {
    pub weight_kg: u64,
    pub max_limit_kg: u64,
    pub blinding_factor: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BulletproofResult {
    pub is_in_range: bool,
    pub proof_bytes_hex: String,
    pub commitment_hex: String,
}

pub struct BulletproofsGenerator;

impl BulletproofsGenerator {
    pub fn prove_weight_range(input: &BulletproofInput) -> BulletproofResult {
        let is_in_range = input.weight_kg <= input.max_limit_kg;
        let commitment = format!("0xcomm_{:x}_{}", input.weight_kg, input.blinding_factor);
        let proof = format!("0xbproof_{:x}_{}", input.weight_kg, hex::encode(&input.blinding_factor));

        BulletproofResult {
            is_in_range,
            proof_bytes_hex: proof,
            commitment_hex: commitment,
        }
    }

    pub fn verify_range_proof(result: &BulletproofResult, max_allowed: u64) -> bool {
        // Never trust the prover-supplied flag. Recompute the weight from the
        // commitment and verify it is internally consistent with the proof, then
        // enforce the caller's range bound.

        // Expected commitment format: "0xcomm_<weight_hex>_<blinding>"
        let commitment = match result.commitment_hex.strip_prefix("0xcomm_") {
            Some(rest) => rest,
            None => return false,
        };
        let mut comm_parts = commitment.splitn(2, '_');
        let weight_hex = match comm_parts.next() {
            Some(w) => w,
            None => return false,
        };
        let blinding = match comm_parts.next() {
            Some(b) => b,
            None => return false,
        };
        let weight_kg = match u64::from_str_radix(weight_hex, 16) {
            Ok(w) => w,
            Err(_) => return false,
        };

        // The proof must be consistent with the same weight and blinding.
        let proof = match result.proof_bytes_hex.strip_prefix("0xbproof_") {
            Some(rest) => rest,
            None => return false,
        };
        let mut proof_parts = proof.splitn(2, '_');
        let proof_weight_hex = match proof_parts.next() {
            Some(w) => w,
            None => return false,
        };
        let proof_blinding = match proof_parts.next() {
            Some(b) => b,
            None => return false,
        };

        if weight_hex != proof_weight_hex || blinding != proof_blinding {
            return false;
        }

        // Enforce the actual range bound the caller cares about.
        weight_kg <= max_allowed
    }
}
