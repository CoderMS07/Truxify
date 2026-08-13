import json
import hashlib
import time
import struct
from datetime import datetime
import numpy as np
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes
from kyber import KyberKEM, DilithiumSignature
import base64
import logging
import numpy as np

logger = logging.getLogger(__name__)

class HybridCrypto:
    """Hybrid Classical + Post-Quantum Cryptography"""
    
    def __init__(self):
        self.kyber = KyberKEM()
        self.dilithium = DilithiumSignature()
        self.classical_key = None
        self.quantum_key = None
        self.hybrid_key = None
        
    def generate_hybrid_keypair(self) -> Dict:
        """Generate hybrid key pair"""
        # Generate classical RSA key
        self.classical_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048
        )
        
        # Generate quantum Kyber key
        quantum_pub, quantum_priv = self.kyber.keygen()
        self.quantum_key = {
            'public': quantum_pub,
            'private': quantum_priv
        }
        
        # Generate Dilithium keys
        dilithium_pub, dilithium_priv = self.dilithium.keygen()
        
        # Combine keys
        hybrid_keys = {
            'classical': {
                'public': self.classical_key.public_key(),
                'private': self.classical_key
            },
            'quantum': self.quantum_key,
            'dilithium': {
                'public': dilithium_pub,
                'private': dilithium_priv
            },
            'hybrid_id': hashlib.sha256(str(time.time()).encode()).hexdigest()[:16]
        }
        
        return hybrid_keys
    
    def hybrid_encrypt(self, data: bytes, hybrid_key: Dict) -> Dict:
        """Encrypt using hybrid approach"""
        try:
            # RSA-2048/OAEP-SHA256 max plaintext = 256 - 2*32 - 2 = 190 bytes.
            # Reserve 4 bytes for length prefix + 32 bytes for quantum_secret = 154 bytes max data.
            MAX_DATA_BYTES = 154
            if len(data) > MAX_DATA_BYTES:
                raise ValueError(
                    f"Payload too large: {len(data)} bytes (max {MAX_DATA_BYTES} for RSA-2048 OAEP). "
                    "Chunk large payloads or use a hybrid scheme with symmetric encryption."
                )

            # Generate quantum shared secret
            quantum_ciphertext, quantum_secret = self.kyber.encapsulate(
                hybrid_key['quantum']['public']
            )

            # Length-prefix framing: encode data length (2 bytes BE) + data + quantum_secret.
            # This avoids the non-injective suffix bug where data ending with quantum_secret
            # bytes would be incorrectly stripped on decryption.
            payload = struct.pack('>H', len(data)) + data + quantum_secret

            encrypted_data = hybrid_key['classical']['public'].encrypt(
                payload,
                padding.OAEP(
                    mgf=padding.MGF1(algorithm=hashes.SHA256()),
                    algorithm=hashes.SHA256(),
                    label=None
                )
            )
            
            # Create hybrid ciphertext
            ciphertext = {
                'quantum_ciphertext': self._serialize_kyber_ciphertext(quantum_ciphertext),
                'encrypted_data': base64.b64encode(encrypted_data).decode(),
                'hybrid_id': hybrid_key.get('hybrid_id', 'unknown')
            }
            
            return ciphertext
            
        except Exception as e:
            logger.error(f"Hybrid encryption failed: {e}")
            raise
    
    def hybrid_decrypt(self, ciphertext: Dict, hybrid_key: Dict) -> bytes:
        """Decrypt using hybrid approach"""
        try:
            # Recover quantum secret
            quantum_ciphertext = self._deserialize_kyber_ciphertext(
                ciphertext['quantum_ciphertext']
            )
            quantum_secret = self.kyber.decapsulate(
                quantum_ciphertext,
                hybrid_key['quantum']['private']
            )

            # Decrypt data
            decrypted = hybrid_key['classical']['private'].decrypt(
                base64.b64decode(ciphertext['encrypted_data']),
                padding.OAEP(
                    mgf=padding.MGF1(algorithm=hashes.SHA256()),
                    algorithm=hashes.SHA256(),
                    label=None
                )
            )

            # Read length prefix to determine data boundaries.
            # Format: 2 bytes (length) + data + quantum_secret
            if len(decrypted) < 2 + len(quantum_secret):
                raise ValueError(
                    f"Decrypted payload too short: {len(decrypted)} bytes "
                    f"(need >= {2 + len(quantum_secret)} for prefix + secret)"
                )

            length_bytes = decrypted[:2]
            data_len = struct.unpack('>H', length_bytes)[0]
            payload_end = 2 + data_len
            secret_start = payload_end

            if len(decrypted) < secret_start + len(quantum_secret):
                raise ValueError(
                    f"Decrypted payload too short for declared data length {data_len}: "
                    f"{len(decrypted)} bytes available"
                )

            data_portion = decrypted[2:payload_end]
            actual_secret = decrypted[secret_start:secret_start + len(quantum_secret)]

            if actual_secret != quantum_secret:
                raise ValueError("Quantum secret mismatch — payload may have been tampered with")

            return data_portion
            
        except Exception as e:
            logger.error(f"Hybrid decryption failed: {e}")
            raise
    
    def _serialize_kyber_ciphertext(self, ciphertext: Dict) -> str:
        """Serialize Kyber ciphertext"""
        return json.dumps({
            'u': ciphertext['u'].tolist(),
            'v': ciphertext['v'].tolist()
        })
    
    def _deserialize_kyber_ciphertext(self, serialized: str) -> Dict:
        """Deserialize Kyber ciphertext"""
        data = json.loads(serialized)
        return {
            'u': np.array(data['u']),
            'v': np.array(data['v'])
        }
    
    def hybrid_sign(self, data: bytes, hybrid_key: Dict) -> bytes:
        """Sign using Dilithium"""
        return self.dilithium.sign(data)
    
    def hybrid_verify(self, data: bytes, signature: bytes, hybrid_key: Dict) -> bool:
        """Verify using Dilithium"""
        return self.dilithium.verify(data, signature)
    
    def get_key_metrics(self, hybrid_key: Dict) -> Dict:
        """Get key metrics"""
        return {
            'classical_key_size': 2048,
            'quantum_key_size': self.kyber.params.k * self.kyber.params.n * 12 / 8,
            'hybrid_key_id': hybrid_key.get('hybrid_id', 'unknown'),
            'algorithm': 'RSA-2048 + Kyber-768 + Dilithium',
            'timestamp': datetime.now().isoformat()
        }