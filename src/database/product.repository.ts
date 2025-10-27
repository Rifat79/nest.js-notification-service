import { Injectable } from '@nestjs/common';
import { Prisma, products } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { BaseRepository } from './base.repository';
import { PrismaService } from './prisma.service';

@Injectable()
export class ProductRepository extends BaseRepository<
  products,
  Prisma.productsDelegate,
  Prisma.productsCreateInput,
  Prisma.productsUpdateInput,
  Prisma.productsWhereInput,
  Prisma.productsWhereUniqueInput
> {
  protected readonly modelName = 'products';

  constructor(prisma: PrismaService, logger: PinoLogger) {
    super(prisma, logger);
  }

  protected getDelegate(
    client?: PrismaService | Prisma.TransactionClient,
  ): Prisma.productsDelegate {
    const prismaClient =
      client instanceof PrismaService
        ? client.client
        : (client ?? this.prisma.client);
    return prismaClient.products;
  }

  async findByKeyword(keyword: string): Promise<products | null> {
    return this.findFirst({ name: keyword });
  }

  /**
   * Performs a high-performance bulk insert using Prisma.createMany().
   * All rows are inserted in a single SQL query for maximum efficiency.
   */
  async createMany(data: Prisma.productsCreateManyInput[]): Promise<void> {
    if (!data.length) return;
    try {
      await this.getDelegate().createMany({ data });
      this.logger.debug(
        { model: this.modelName, count: data.length },
        'Bulk createMany operation completed.',
      );
    } catch (error) {
      this.logger.error(
        { model: this.modelName, error },
        'Bulk createMany operation failed.',
      );
      throw error;
    }
  }
}
