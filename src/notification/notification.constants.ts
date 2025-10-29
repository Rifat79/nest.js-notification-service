export const NOTIFICATION_QUEUES = {
  WEBHOOK: 'notification_webhook',
  SMS: 'notification_sms',
};

export const NOTIFICATION_PRIORITY = {
  'renew.success': 5,
  'renew.fail': 5,
  'subscription.success': 1,
  'subscription.fail': 1,
  'subscription.cancel': 1,
  'unsubscription.success': 1,
  'unsubscription.fail': 1,
  'pre.renewal.alert': 10,
};
