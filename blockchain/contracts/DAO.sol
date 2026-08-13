// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title DAO
 * @dev Quadratic Voting DAO contract for Truxify freight corridor tariff governance.
 */
contract DAO is Ownable {

    struct Proposal {
        string description;
        uint256 voteCount;
        uint256 votingDeadline;
        bool executed;
    }

    IERC20 public governanceToken;
    Proposal[] public proposals;
    mapping(uint256 => mapping(address => uint256)) public votesCast;
    // Track deposited token amounts per (proposalId, voter) for withdrawal.
    mapping(uint256 => mapping(address => uint256)) public depositedAmount;

    event ProposalCreated(uint256 indexed proposalId, string description, uint256 deadline);
    event VotedQuadratic(uint256 indexed proposalId, address indexed voter, uint256 votes, uint256 tokenCost);
    event VotesReleased(uint256 indexed proposalId, address indexed voter, uint256 tokenAmount);

    constructor(address _tokenAddress) Ownable(msg.sender) {
        governanceToken = IERC20(_tokenAddress);
    }

    function createProposal(string calldata _description, uint256 _duration) external returns (uint256 proposalId) {
        proposalId = proposals.length;
        proposals.push(Proposal({
            description: _description,
            voteCount: 0,
            votingDeadline: block.timestamp + _duration,
            executed: false
        }));

        emit ProposalCreated(proposalId, _description, block.timestamp + _duration);
    }

    /**
     * @dev Quadratic Voting: Token Cost = votes^2
     */
    function voteQuadratic(uint256 _proposalId, uint256 _votes) external {
        Proposal storage proposal = proposals[_proposalId];
        require(block.timestamp < proposal.votingDeadline, "Voting period ended");
        require(_votes > 0, "Votes must be > 0");

        uint256 tokenCost = _votes * _votes;
        require(governanceToken.transferFrom(msg.sender, address(this), tokenCost), "Token transfer failed");

        votesCast[_proposalId][msg.sender] += _votes;
        depositedAmount[_proposalId][msg.sender] += tokenCost;
        proposal.voteCount += _votes;

        emit VotedQuadratic(_proposalId, msg.sender, _votes, tokenCost);
    }

    /**
     * @dev Release deposited governance tokens for a proposal after the voting deadline.
     * Voters must call this after voting deadline to reclaim their tokens.
     */
    function releaseVotes(uint256 _proposalId) external {
        Proposal storage proposal = proposals[_proposalId];
        require(block.timestamp >= proposal.votingDeadline, "Voting period not yet ended");
        require(proposal.executed || block.timestamp > proposal.votingDeadline, "Cannot release before deadline");

        uint256 amount = depositedAmount[_proposalId][msg.sender];
        require(amount > 0, "No tokens deposited for this proposal");

        depositedAmount[_proposalId][msg.sender] = 0;
        require(governanceToken.transfer(msg.sender, amount), "Token transfer failed");

        emit VotesReleased(_proposalId, msg.sender, amount);
    }
}