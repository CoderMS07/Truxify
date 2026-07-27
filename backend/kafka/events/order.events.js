import { TOPICS } from '../config/kafka.config.js';
import kafka from '../config/kafka.config.js';
import { BaseEvent, EventMetadata, EVENT_SOURCES } from '../../api/src/core/events/index.js';

class OrderEventService {
  constructor({ eventBus: externalEventBus } = {}) {
    this.events = [];
    this._eventBus = externalEventBus || null;
  }

  setEventBus(eventBus) {
    this._eventBus = eventBus;
  }

  _createEvent(eventType, data, source = EVENT_SOURCES.ORDER_SERVICE) {
    return new BaseEvent({
      eventType,
      payload: {
        orderId: data.orderId || data.order_id,
        ...data,
      },
      source,
    });
  }

  _publish(event) {
    if (this._eventBus) {
      this._eventBus.publish(event, { adapters: ['kafka'], deduplicate: false });
    }
    this.events.push(event.toJSON());
    return event;
  }

  async emitOrderCreated(orderData) {
    const event = this._createEvent('ORDER_CREATED', orderData, EVENT_SOURCES.ORDER_SERVICE);

    if (!this._eventBus) {
      await kafka.publishEvent(TOPICS.ORDER_CREATED, event.toJSON(), orderData.orderId);
    } else {
      this._publish(event);
    }
    return event.toJSON();
  }

  async emitOrderUpdated(orderId, updates) {
    const event = this._createEvent('ORDER_UPDATED', { orderId, ...updates }, EVENT_SOURCES.ORDER_SERVICE);

    if (!this._eventBus) {
      await kafka.publishEvent(TOPICS.ORDER_UPDATED, event.toJSON(), orderId);
    } else {
      this._publish(event);
    }
    return event.toJSON();
  }

  async emitOrderCancelled(orderId, reason) {
    const event = this._createEvent('ORDER_CANCELLED', {
      orderId,
      reason,
      cancelledAt: new Date().toISOString(),
    }, EVENT_SOURCES.ORDER_SERVICE);

    if (!this._eventBus) {
      await kafka.publishEvent(TOPICS.ORDER_CANCELLED, event.toJSON(), orderId);
    } else {
      this._publish(event);
    }
    return event.toJSON();
  }

  async emitDriverAssigned(orderId, driverData) {
    const event = this._createEvent('DRIVER_ASSIGNED', { orderId, ...driverData }, EVENT_SOURCES.ORDER_SERVICE);

    if (!this._eventBus) {
      await kafka.publishEvent(TOPICS.DRIVER_ASSIGNED, event.toJSON(), orderId);
    } else {
      this._publish(event);
    }
    return event.toJSON();
  }

  async emitPaymentConfirmed(orderId, paymentData) {
    const event = this._createEvent('PAYMENT_CONFIRMED', { orderId, ...paymentData }, EVENT_SOURCES.PAYMENT_SERVICE);

    if (!this._eventBus) {
      await kafka.publishEvent(TOPICS.PAYMENT_CONFIRMED, event.toJSON(), orderId);
    } else {
      this._publish(event);
    }
    return event.toJSON();
  }

  async emitTripStarted(orderId, tripData) {
    const event = this._createEvent('TRIP_STARTED', { orderId, ...tripData }, EVENT_SOURCES.TRIP_SERVICE);

    if (!this._eventBus) {
      await kafka.publishEvent(TOPICS.TRIP_STARTED, event.toJSON(), orderId);
    } else {
      this._publish(event);
    }
    return event.toJSON();
  }

  async emitTripCompleted(orderId, completionData) {
    const event = this._createEvent('TRIP_COMPLETED', { orderId, ...completionData }, EVENT_SOURCES.TRIP_SERVICE);

    if (!this._eventBus) {
      await kafka.publishEvent(TOPICS.TRIP_COMPLETED, event.toJSON(), orderId);
    } else {
      this._publish(event);
    }
    return event.toJSON();
  }

  async emitEscrowCreated(orderId, escrowData) {
    const event = this._createEvent('ESCROW_CREATED', { orderId, ...escrowData }, EVENT_SOURCES.ESCROW_SERVICE);

    if (!this._eventBus) {
      await kafka.publishEvent(TOPICS.ESCROW_CREATED, event.toJSON(), orderId);
    } else {
      this._publish(event);
    }
    return event.toJSON();
  }

  async emitEscrowReleased(orderId, releaseData) {
    const event = this._createEvent('ESCROW_RELEASED', { orderId, ...releaseData }, EVENT_SOURCES.ESCROW_SERVICE);

    if (!this._eventBus) {
      await kafka.publishEvent(TOPICS.ESCROW_RELEASED, event.toJSON(), orderId);
    } else {
      this._publish(event);
    }
    return event.toJSON();
  }

  async emitETAUpdated(orderId, etaData) {
    const event = this._createEvent('ETA_UPDATED', { orderId, ...etaData }, EVENT_SOURCES.ML_SERVICE);

    if (!this._eventBus) {
      await kafka.publishEvent(TOPICS.ETA_UPDATED, event.toJSON(), orderId);
    } else {
      this._publish(event);
    }
    return event.toJSON();
  }

  async emitLocationUpdated(orderId, locationData) {
    const event = this._createEvent('LOCATION_UPDATED', { orderId, ...locationData }, EVENT_SOURCES.TRACKING_SERVICE);

    if (!this._eventBus) {
      await kafka.publishEvent(TOPICS.LOCATION_UPDATED, event.toJSON(), orderId);
    } else {
      this._publish(event);
    }
    return event.toJSON();
  }

  async emitFraudDetected(orderId, fraudData) {
    const event = this._createEvent('FRAUD_DETECTED', { orderId, ...fraudData }, EVENT_SOURCES.FRAUD_SERVICE);

    if (!this._eventBus) {
      await kafka.publishEvent(TOPICS.FRAUD_DETECTED, event.toJSON(), orderId);
    } else {
      this._publish(event);
    }
    return event.toJSON();
  }

  async emitNotificationSent(orderId, notificationData) {
    const event = this._createEvent('NOTIFICATION_SENT', { orderId, ...notificationData }, EVENT_SOURCES.NOTIFICATION_SERVICE);

    if (!this._eventBus) {
      await kafka.publishEvent(TOPICS.NOTIFICATION_SENT, event.toJSON(), orderId);
    } else {
      this._publish(event);
    }
    return event.toJSON();
  }
}

export default new OrderEventService();
