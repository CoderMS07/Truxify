import { ethers } from 'ethers';
import logger from '../../middleware/logger.js';

const ESCROW_ABI = [
  'function getPaymentStatus(uint256 bookingId) view returns (uint8)',
  'function getDriverBalance(address driver) view returns (uint256)',
  'function getInsuranceCoverage(uint256 claimId) view returns (bool, uint256)',
  'function getGeofenceStatus(uint256 shipmentId) view returns (bool)',
  'function getReputationScore(address driver) view returns (uint256)',
];

class BatchCallBuilder {
  constructor(deps = {}) {
    this.escrowAddress = process.env.ESCROW_CONTRACT_ADDRESS;
    this.provider = deps.provider;
    this.iface = new ethers.Interface(ESCROW_ABI);
  }

  buildPaymentStatusCall(bookingId) {
    return {
      target: this.escrowAddress,
      callData: this.iface.encodeFunctionData('getPaymentStatus', [bookingId]),
      decodeFn: (data) => {
        const decoded = this.iface.decodeFunctionResult('getPaymentStatus', data);
        return { status: decoded[0] };
      },
    };
  }

  buildDriverBalanceCall(driver) {
    return {
      target: this.escrowAddress,
      callData: this.iface.encodeFunctionData('getDriverBalance', [driver]),
      decodeFn: (data) => {
        const decoded = this.iface.decodeFunctionResult('getDriverBalance', data);
        return { balance: decoded[0].toString() };
      },
    };
  }

  buildInsuranceCall(claimId) {
    return {
      target: this.escrowAddress,
      callData: this.iface.encodeFunctionData('getInsuranceCoverage', [claimId]),
      decodeFn: (data) => {
        const decoded = this.iface.decodeFunctionResult('getInsuranceCoverage', data);
        return {
          approved: decoded[0],
          amount: decoded[1].toString(),
        };
      },
    };
  }

  buildGeofenceCall(shipmentId) {
    return {
      target: this.escrowAddress,
      callData: this.iface.encodeFunctionData('getGeofenceStatus', [shipmentId]),
      decodeFn: (data) => {
        const decoded = this.iface.decodeFunctionResult('getGeofenceStatus', data);
        return { withinBounds: decoded[0] };
      },
    };
  }

  buildReputationCall(driver) {
    return {
      target: this.escrowAddress,
      callData: this.iface.encodeFunctionData('getReputationScore', [driver]),
      decodeFn: (data) => {
        const decoded = this.iface.decodeFunctionResult('getReputationScore', data);
        return { score: decoded[0].toString() };
      },
    };
  }

  buildShipmentCompletionBatch(shipment) {
    const calls = [
      this.buildPaymentStatusCall(shipment.bookingId),
      this.buildDriverBalanceCall(shipment.driverAddress),
      this.buildInsuranceCall(shipment.insuranceClaimId),
      this.buildReputationCall(shipment.driverAddress),
    ];

    if (shipment.geofenceIds && Array.isArray(shipment.geofenceIds)) {
      shipment.geofenceIds.forEach(geofenceId => {
        calls.push(this.buildGeofenceCall(geofenceId));
      });
    }

    return calls;
  }

  buildMultiShipmentBatch(shipments) {
    const allCalls = [];

    shipments.forEach(shipment => {
      const batchCalls = this.buildShipmentCompletionBatch(shipment);
      batchCalls.forEach(call => {
        call.shipmentId = shipment.id;
      });
      allCalls.push(...batchCalls);
    });

    return allCalls;
  }

  buildCustomBatch(callDefinitions) {
    return callDefinitions.map(def => {
      try {
        const functionName = def.functionName;
        const args = def.args || [];

        return {
          target: def.target || this.escrowAddress,
          callData: this.iface.encodeFunctionData(functionName, args),
          decodeFn: (data) => {
            try {
              const result = this.iface.decodeFunctionResult(functionName, data);
              return {
                functionName,
                result: result[0]?.toString?.() || result[0],
              };
            } catch (err) {
              logger.warn('[BatchCallBuilder] Failed to decode result:', err.message);
              return { error: err.message };
            }
          },
          ...def,
        };
      } catch (err) {
        logger.error('[BatchCallBuilder] Error building call:', err.message);
        return { error: err.message };
      }
    });
  }
}

export default BatchCallBuilder;
