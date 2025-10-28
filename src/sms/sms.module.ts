import { Module } from '@nestjs/common';
import { HttpClientModule } from 'src/common/http-client/http-client.module';
import { SMSResultSchedular } from 'src/schedulers/sms-result.scheduler';
import { GpSmsSender } from './senders/gp.sms-sender';
import { SmsTemplateService } from './sms-template.service';
import { SmsService } from './sms.service';

@Module({
  imports: [HttpClientModule],
  providers: [SmsService, SmsTemplateService, GpSmsSender, SMSResultSchedular],
  exports: [SmsService],
})
export class SmsModule {}
