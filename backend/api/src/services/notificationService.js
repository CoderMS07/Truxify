const { supabase } = require('../config/supabase');
const DomainError = require('../errors/DomainError');

const ALLOWED_NOTIF_TYPES = [
  'order_update',
  'payment',
  'load_offer',
  'trip_update',
  'document',
  'system',
];

class NotificationService {
  async insertNotification(notificationData) {
    const notifType = notificationData?.notif_type;
    if (notifType && !ALLOWED_NOTIF_TYPES.includes(notifType)) {
      throw new DomainError(`Invalid notif_type: ${notifType}`);
    }

    const { data, error } = await supabase
      .from('notifications')
      .insert([notificationData])
      .select();

    if (error) {
      console.error('Error inserting notification:', error);
      throw error;
    }
    return data?.[0];
  }

  async sendPushNotification(payload) {
    const notifType = payload?.notif_type;
    if (notifType && !ALLOWED_NOTIF_TYPES.includes(notifType)) {
      throw new DomainError(`Invalid notif_type: ${notifType}`);
    }

    // Push notification logic placeholder / dispatch
    return { success: true };
  }
}

module.exports = new NotificationService();
