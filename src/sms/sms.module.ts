import { Module } from '@nestjs/common';
import { HttpClientModule } from 'src/common/http-client/http-client.module';
import { SmsTemplateService } from './sms-template.service';
import { SmsService } from './sms.service';

@Module({
  imports: [HttpClientModule],
  providers: [SmsService, SmsTemplateService],
  exports: [SmsService],
})
export class SmsModule {}
