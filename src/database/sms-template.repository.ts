import { Injectable } from '@nestjs/common';
import { Prisma, sms_templates } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { BaseRepository } from './base.repository';
import { PrismaService } from './prisma.service';

@Injectable()
export class SmsTemplateRepository extends BaseRepository<
  sms_templates,
  Prisma.sms_templatesDelegate,
  Prisma.sms_templatesCreateInput,
  Prisma.sms_templatesUpdateInput,
  Prisma.sms_templatesWhereInput,
  Prisma.sms_templatesWhereUniqueInput
> {
  protected readonly modelName = 'sms_templates';

  constructor(prisma: PrismaService, logger: PinoLogger) {
    super(prisma, logger);
  }

  protected getDelegate(
    client?: PrismaService | Prisma.TransactionClient,
  ): Prisma.sms_templatesDelegate {
    const prismaClient =
      client instanceof PrismaService
        ? client.client
        : (client ?? this.prisma.client);
    return prismaClient.sms_templates;
  }

  //   async find(
  //     eventType: string,
  //     operator: string,
  //     version = 1,
  //   ): Promise<sms_templates | null> {
  //     return this.findUnique({
  //       event_type_operator_version: {
  //         event_type: eventType,
  //         operator,
  //         version,
  //       },
  //     });
  //   }
}
