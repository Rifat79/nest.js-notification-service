import { registerAs } from '@nestjs/config';
import { validatedEnv } from './validate-env';

export default registerAs('batch', () => {
  return {
    smsResultSchedularBatchSize: validatedEnv.SMS_RESULT_SCHEDULAR_BATCH_SIZE,
    webhookResultSchedularBatchSize:
      validatedEnv.WEBHOOK_RESULT_SCHEDULAR_BATCH_SIZE,
  };
});
