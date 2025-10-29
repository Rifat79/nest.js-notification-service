import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino'; // or your custom Pino wrapper
import { RedisService } from 'src/common/redis/redis.service';
import { SmsTemplateRepository } from 'src/database/sms-template.repository';

@Injectable()
export class SmsTemplateService {
  constructor(
    private readonly smsTemplateRepo: SmsTemplateRepository,
    private readonly redis: RedisService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SmsTemplateService.name);
  }

  async getTemplate(
    eventType: string,
    operator: string,
    version = 1,
  ): Promise<string> {
    const redisKey = `sms_template:${eventType.toLowerCase()}:${operator.toLowerCase()}:v${version}`;
    const cached = (await this.redis.get(redisKey)) as string;

    if (cached) {
      this.logger.debug({ redisKey }, 'Template cache hit');
      return cached;
    }

    this.logger.debug({ redisKey }, 'Template cache miss, querying DB');
    const result = await this.smsTemplateRepo.findUnique({
      event_type_operator_version: {
        event_type: eventType,
        operator,
        version,
      },
    });

    if (!result) {
      this.logger.warn({ eventType, operator, version }, 'Template not found');
      return '';
    }

    const template = result.template;
    await this.redis.set(redisKey, template, 3600); // Cache for 1 hour
    this.logger.debug({ redisKey }, 'Template cached');

    return template;
  }

  populateTemplate(
    template: string,
    variables: Record<string, string>,
  ): string {
    let populated = template;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      populated = populated.replace(new RegExp(placeholder, 'g'), value);
    }

    const unusedKeys = Object.keys(variables).filter(
      (key) => !template.includes(`{{${key}}}`),
    );
    if (unusedKeys.length > 0) {
      this.logger.warn({ unusedKeys }, 'Unused template variables');
    }

    return populated;
  }
}
