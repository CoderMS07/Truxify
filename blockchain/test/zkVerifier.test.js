import assert from "node:assert/strict";
import hre from "hardhat";
const { ethers } = hre;

async function assertRejectsWith(promise, message) {
  await assert.rejects(promise, error => error.message.includes(message));
}

function encodeProof(a, b, c, input) {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256[2]", "uint256[2][2]", "uint256[2]", "uint256[2]"],
    [a, b, c, input]
  );
}

describe("ZK proof verification", function () {
  async function deployZkEVM() {
    const [owner, user] = await ethers.getSigners();
    const Verifier = await ethers.getContractFactory("Verifier");
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();
    const zkEVM = await (await ethers.getContractFactory("zkEVM")).deploy(await verifier.getAddress());
    await zkEVM.waitForDeployment();
    return { verifier, zkEVM, owner, user };
  }

  it("rejects an all-zero proof in Verifier.verifyProof", async function () {
    const { verifier } = await deployZkEVM();
    await assertRejectsWith(
      verifier.verifyProof([0, 0], [[0, 0], [0, 0]], [0, 0], [1, 1]),
      "Invalid G1 point in proof (a)"
    );
  });

  it("rejects an empty public input in Verifier.verifyProof", async function () {
    const { verifier } = await deployZkEVM();
    await assertRejectsWith(
      verifier.verifyProof([1, 2], [[1, 2], [1, 2]], [1, 2], [0, 0]),
      "Empty public input"
    );
  });

  it("rejects a withdrawal with an empty proof", async function () {
    const { zkEVM, user } = await deployZkEVM();
    await zkEVM.connect(user).depositToL2({ value: ethers.parseEther("1") });
    await assertRejectsWith(
      zkEVM.connect(user).withdrawFromL2(ethers.parseEther("0.5"), "0x"),
      "Empty proof"
    );
  });

  it("rejects a withdrawal with a malformed proof", async function () {
    const { zkEVM, user } = await deployZkEVM();
    await zkEVM.connect(user).depositToL2({ value: ethers.parseEther("1") });
    await assert.rejects(
      zkEVM.connect(user).withdrawFromL2(ethers.parseEther("0.5"), "0xdeadbeef")
    );
  });

  it("rejects a withdrawal with an all-zero proof", async function () {
    const { zkEVM, user } = await deployZkEVM();
    await zkEVM.connect(user).depositToL2({ value: ethers.parseEther("1") });
    const zeroProof = encodeProof([0, 0], [[0, 0], [0, 0]], [0, 0], [1, 1]);
    await assertRejectsWith(
      zkEVM.connect(user).withdrawFromL2(ethers.parseEther("0.5"), zeroProof),
      "Invalid"
    );
  });

  it("rejects an empty batch proof", async function () {
    const { zkEVM, owner } = await deployZkEVM();
    await assertRejectsWith(
      zkEVM.connect(owner).executeBatch(["0x1234"], "0x"),
      "Empty proof"
    );
  });

  it("rejects zero/empty proofs in zkSTARKVerifier", async function () {
    const zkSTARKVerifier = await (await ethers.getContractFactory("zkSTARKVerifier")).deploy();
    await zkSTARKVerifier.waitForDeployment();

    assert.equal(await zkSTARKVerifier.verifyProof("0x", "0x1234"), false);
    assert.equal(await zkSTARKVerifier.verifyProof("0x1234", "0x"), false);
    assert.equal(await zkSTARKVerifier.verifyProof("0x0000", "0x0000"), false);
    assert.equal(await zkSTARKVerifier.verifyProof("0x1234", "0x5678"), true);
  });

  it("rejects zero proofs in KYCVerifier.verifyKYC", async function () {
    const kycVerifier = await (await ethers.getContractFactory("KYCVerifier")).deploy();
    await kycVerifier.waitForDeployment();
    const [admin, user] = await ethers.getSigners();

    await assertRejectsWith(
      kycVerifier.connect(admin).verifyKYC([0, 0], [[0, 0], [0, 0]], [0, 0], [0, 0], user.address),
      "Zero proof rejected"
    );
  });
});
