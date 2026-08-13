// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VerificationOracle {
    struct VerificationRecord {
        string orderId;
        string ipfsHash;
        uint256 timestamp;
        bool verified;
        address verifier;
    }

    mapping(string => VerificationRecord) public verifications;
    address public admin;
    
    event VerificationCreated(string indexed orderId, string ipfsHash, uint256 timestamp);
    event VerificationUpdated(string indexed orderId, bool verified);
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this");
        _;
    }
    
    constructor() {
        admin = msg.sender;
    }
    
    function createVerification(
        string memory orderId, 
        string memory ipfsHash
    ) public onlyAdmin {
        // Prevent overwriting an existing attestation.
        // If a verification record already exists for this orderId, reject the
        // new creation to preserve the original attestation and its timestamp.
        require(
            bytes(verifications[orderId].orderId).length == 0,
            "Verification already exists for this orderId; use updateVerification to modify"
        );
        
        verifications[orderId] = VerificationRecord({
            orderId: orderId,
            ipfsHash: ipfsHash,
            timestamp: block.timestamp,
            verified: true,
            verifier: msg.sender
        });
        
        emit VerificationCreated(orderId, ipfsHash, block.timestamp);
    }
    
    function verifyOrder(string memory orderId) public view returns (bool) {
        return verifications[orderId].verified;
    }

    /**
     * @dev Update an existing verification record (only admin can update).
     * @param orderId The order ID
     * @param ipfsHash New IPFS hash (optional — pass empty string to keep existing)
     * @param verified New verified status
     */
    function updateVerification(
        string memory orderId,
        string memory ipfsHash,
        bool verified
    ) public onlyAdmin {
        require(
            bytes(verifications[orderId].orderId).length != 0,
            "No existing verification record to update"
        );
        verifications[orderId].ipfsHash = ipfsHash;
        verifications[orderId].verified = verified;
        verifications[orderId].timestamp = block.timestamp;
        verifications[orderId].verifier = msg.sender;

        emit VerificationUpdated(orderId, verified);
    }
    
    function getVerification(string memory orderId) public view returns (
        string memory ipfsHash,
        uint256 timestamp,
        bool verified,
        address verifier
    ) {
        VerificationRecord memory record = verifications[orderId];
        return (record.ipfsHash, record.timestamp, record.verified, record.verifier);
    }
}