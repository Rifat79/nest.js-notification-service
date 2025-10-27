import { registerAs } from '@nestjs/config';
import { validatedEnv } from './validate-env';

export default registerAs('rmq', () => {
  return {
    host: validatedEnv.RMQ_HOST,
    port: validatedEnv.RMQ_PORT,
    user: validatedEnv.RMQ_USER,
    password: validatedEnv.RMQ_PASS,
    queues: {
      subscriptions: 'notifications.subscription.queue',
      renewals: 'notifications.renewal.queue',
    },
    retryAttempts: 3,
    retryDelay: 5000,
    prefetchCount: 100,

    get url() {
      const user = encodeURIComponent(this.user);
      const password = encodeURIComponent(this.password);
      return `amqp://${user}:${password}@${this.host}:${this.port}`;
    },
  };
});
