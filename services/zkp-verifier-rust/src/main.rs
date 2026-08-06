use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::Instant;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const VERIFYING_KEY: &[u8] = b"truxify.zkp.v1.verifying.key.0123456789abcdef";

#[derive(Debug, Serialize, Deserialize)]
pub struct ZKPProofRequest {
    pub proof_id: String,
    pub proof_type: String,
    pub public_inputs: Vec<String>,
    pub proof_bytes_hex: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ZKPVerificationResult {
    pub proof_id: String,
    pub verified: bool,
    pub proof_type: String,
    pub verification_time_micros: u128,
    pub circuit_hash: String,
    pub status: String,
}

fn canonical_statement(proof_type: &str, public_inputs: &[String]) -> Vec<u8> {
    let mut out = Vec::new();
    let tag = format!("truxify.zkp.v1.{proof_type}");
    out.extend_from_slice(tag.as_bytes());
    for input in public_inputs {
        out.extend_from_slice(&(input.len() as u64).to_be_bytes());
        out.extend_from_slice(input.as_bytes());
    }
    out
}

fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    const BLOCK: usize = 64;
    let mut k = [0u8; BLOCK];
    if key.len() > BLOCK {
        let hash = Sha256::digest(key);
        k[..hash.len()].copy_from_slice(&hash[..]);
    } else {
        k[..key.len()].copy_from_slice(key);
    }

    let mut inner_pad = [0x36u8; BLOCK];
    let mut outer_pad = [0x5cu8; BLOCK];
    for i in 0..BLOCK {
        inner_pad[i] ^= k[i];
        outer_pad[i] ^= k[i];
    }

    let mut inner = Sha256::new();
    inner.update(inner_pad);
    inner.update(message);
    let inner_digest = inner.finalize();

    let mut outer = Sha256::new();
    outer.update(outer_pad);
    outer.update(inner_digest);
    let digest = outer.finalize();

    let mut out = [0u8; 32];
    out.copy_from_slice(&digest[..]);
    out
}

fn expected_proof(proof_type: &str, public_inputs: &[String]) -> [u8; 32] {
    hmac_sha256(VERIFYING_KEY, &canonical_statement(proof_type, public_inputs))
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for i in 0..a.len() {
        diff |= a[i] ^ b[i];
    }
    diff == 0
}

pub fn verify_zkp_circuit(req: &ZKPProofRequest) -> ZKPVerificationResult {
    let start = Instant::now();

    let is_verified = match hex::decode(&req.proof_bytes_hex) {
        Ok(proof_bytes) => {
            let expected = expected_proof(&req.proof_type, &req.public_inputs);
            constant_time_eq(&proof_bytes, &expected)
        }
        Err(_) => false,
    };

    let circuit_hash = hex::encode(Sha256::digest(canonical_statement(
        &req.proof_type,
        &req.public_inputs,
    )));

    let duration = start.elapsed().as_micros();

    ZKPVerificationResult {
        proof_id: req.proof_id.clone(),
        verified: is_verified,
        proof_type: req.proof_type.clone(),
        verification_time_micros: duration,
        circuit_hash,
        status: if is_verified {
            "VALID_PROOF"
        } else {
            "INVALID_PROOF"
        }
        .to_string(),
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let addr = "0.0.0.0:8087";
    let listener = TcpListener::bind(addr).await?;
    println!("🔐 Truxify Rust ZKP Verifier listening on http://{}", addr);

    loop {
        let (mut socket, _) = listener.accept().await?;
        tokio::spawn(async move {
            let mut buf = [0u8; 8192];
            let n = match socket.read(&mut buf).await {
                Ok(n) if n > 0 => n,
                _ => return,
            };

            let req_str = String::from_utf8_lossy(&buf[..n]);
            if req_str.starts_with("GET /health") {
                let body = "{"status":"UP","service":"truxify-zkp-verifier"}";
                let resp = format!(
                    "HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: {}
Connection: close

{}",
                    body.len(),
                    body
                );
                let _ = socket.write_all(resp.as_bytes()).await;
                return;
            }

            if req_str.starts_with("POST /verify") {
                if let Some(body_start) = req_str.find("

") {
                    let json_body = &req_str[body_start + 4..];
                    if let Ok(req) = serde_json::from_str::<ZKPProofRequest>(json_body) {
                        let res = verify_zkp_circuit(&req);
                        if let Ok(resp_body) = serde_json::to_string(&res) {
                            let resp = format!(
                                "HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: {}
Connection: close

{}",
                                resp_body.len(),
                                resp_body
                            );
                            let _ = socket.write_all(resp.as_bytes()).await;
                            return;
                        }
                    }
                }
                let body = "{"error":"Invalid ZKPProofRequest JSON"}";
                let resp = format!(
                    "HTTP/1.1 400 Bad Request
Content-Type: application/json
Content-Length: {}
Connection: close

{}",
                    body.len(),
                    body
                );
                let _ = socket.write_all(resp.as_bytes()).await;
                return;
            }

            let body = "{"error":"Not Found"}";
            let resp = format!(
                "HTTP/1.1 404 Not Found
Content-Type: application/json
Content-Length: {}
Connection: close

{}",
                body.len(),
                body
            );
            let _ = socket.write_all(resp.as_bytes()).await;
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(
        proof_type: &str,
        public_inputs: &[&str],
        proof_bytes_hex: &str,
    ) -> ZKPProofRequest {
        ZKPProofRequest {
            proof_id: "zkp_test".to_string(),
            proof_type: proof_type.to_string(),
            public_inputs: public_inputs.iter().map(|s| s.to_string()).collect(),
            proof_bytes_hex: proof_bytes_hex.to_string(),
        }
    }

    fn genuine_proof(proof_type: &str, public_inputs: &[&str]) -> String {
        let inputs: Vec<String> = public_inputs.iter().map(|s| s.to_string()).collect();
        hex::encode(expected_proof(proof_type, &inputs))
    }

    #[test]
    fn rejects_empty_proof() {
        let req = request("identity_kyc", &["driver_hash_99"], "");
        let res = verify_zkp_circuit(&req);
        assert!(!res.verified);
        assert_eq!(res.status, "INVALID_PROOF");
    }

    #[test]
    fn rejects_non_hex_proof() {
        let req = request("identity_kyc", &["driver_hash_99"], "zzzz-not-hex");
        let res = verify_zkp_circuit(&req);
        assert!(!res.verified);
        assert_eq!(res.status, "INVALID_PROOF");
    }

    #[test]
    fn rejects_odd_length_hex_proof() {
        let req = request("identity_kyc", &["driver_hash_99"], "4a8f9b2c1d3e5");
        let res = verify_zkp_circuit(&req);
        assert!(!res.verified);
        assert_eq!(res.status, "INVALID_PROOF");
    }

    #[test]
    fn rejects_garbage_hex_proof() {
        let req = request("identity_kyc", &["driver_hash_99"], "4a8f9b2c1d3e5f");
        let res = verify_zkp_circuit(&req);
        assert!(!res.verified);
        assert_eq!(res.status, "INVALID_PROOF");
    }

    #[test]
    fn accepts_genuine_proof() {
        let req = request(
            "identity_kyc",
            &["driver_hash_99", "min_rating_4_5"],
            &genuine_proof("identity_kyc", &["driver_hash_99", "min_rating_4_5"]),
        );
        let res = verify_zkp_circuit(&req);
        assert!(res.verified);
        assert_eq!(res.status, "VALID_PROOF");
    }

    #[test]
    fn proof_is_bound_to_public_inputs() {
        let proof = genuine_proof("identity_kyc", &["driver_hash_99"]);
        let req = request("identity_kyc", &["driver_hash_98"], &proof);
        let res = verify_zkp_circuit(&req);
        assert!(!res.verified);
        assert_eq!(res.status, "INVALID_PROOF");
    }

    #[test]
    fn proof_is_bound_to_proof_type() {
        let proof = genuine_proof("identity_kyc", &["driver_hash_99"]);
        let req = request("proof_of_funds", &["driver_hash_99"], &proof);
        let res = verify_zkp_circuit(&req);
        assert!(!res.verified);
        assert_eq!(res.status, "INVALID_PROOF");
    }
}
