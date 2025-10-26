import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from './prisma.service';

/**
 * BaseRepository is a generic repository for Prisma models.
 * T: The model type (e.g., User)
 * M: The model delegate type (e.g., Prisma.UserDelegate)
 * CreateInput: Input type for create
 * UpdateInput: Input type for update
 * WhereInput: Input type for findFirst/findMany/count
 * WhereUniqueInput: Input type for findUnique/update/delete/upsert
 */
export abstract class BaseRepository<
  T,
  M,
  CreateInput,
  UpdateInput,
  WhereInput,
  WhereUniqueInput,
> {
  protected abstract readonly modelName: string;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly logger: PinoLogger,
  ) {}

  /**
   * Returns the Prisma model delegate (e.g., prisma.user)
   */
  protected abstract getDelegate(
    client: PrismaService | any, // PrismaService or TransactionClient
  ): M;

  async create(data: CreateInput, tx?: any): Promise<T> {
    const client = tx || this.prisma;
    try {
      const result = await (this.getDelegate(client) as any).create({ data });
      this.logger.info(
        { model: this.modelName, action: 'create' },
        'Record created',
      );
      return result as T;
    } catch (error) {
      this.logger.error(
        { model: this.modelName, error },
        'Create operation failed',
      );
      throw error;
    }
  }

  async findUnique(where: WhereUniqueInput, tx?: any): Promise<T | null> {
    const client = tx || this.prisma;
    try {
      const result = await (this.getDelegate(client) as any).findUnique({
        where,
      });
      return result as T | null;
    } catch (error) {
      this.logger.error(
        { model: this.modelName, error },
        'FindUnique operation failed',
      );
      throw error;
    }
  }

  async findFirst(where: WhereInput, tx?: any): Promise<T | null> {
    const client = tx || this.prisma;
    try {
      const result = await (this.getDelegate(client) as any).findFirst({
        where,
      });
      return result as T | null;
    } catch (error) {
      this.logger.error(
        { model: this.modelName, error },
        'FindFirst operation failed',
      );
      throw error;
    }
  }

  async findMany(
    where?: WhereInput,
    options?: { skip?: number; take?: number; orderBy?: any },
    tx?: any,
  ): Promise<T[]> {
    const client = tx || this.prisma;
    try {
      const result = await (this.getDelegate(client) as any).findMany({
        where,
        ...options,
      });
      return result as T[];
    } catch (error) {
      this.logger.error(
        { model: this.modelName, error },
        'FindMany operation failed',
      );
      throw error;
    }
  }

  async update(
    where: WhereUniqueInput,
    data: UpdateInput,
    tx?: any,
  ): Promise<T> {
    const client = tx || this.prisma;
    try {
      const result = await (this.getDelegate(client) as any).update({
        where,
        data,
      });
      this.logger.info(
        { model: this.modelName, action: 'update' },
        'Record updated',
      );
      return result as T;
    } catch (error) {
      this.logger.error(
        { model: this.modelName, error },
        'Update operation failed',
      );
      throw error;
    }
  }

  async delete(where: WhereUniqueInput, tx?: any): Promise<T> {
    const client = tx || this.prisma;
    try {
      const result = await (this.getDelegate(client) as any).delete({ where });
      this.logger.info(
        { model: this.modelName, action: 'delete' },
        'Record deleted',
      );
      return result as T;
    } catch (error) {
      this.logger.error(
        { model: this.modelName, error },
        'Delete operation failed',
      );
      throw error;
    }
  }

  async count(where?: WhereInput, tx?: any): Promise<number> {
    const client = tx || this.prisma;
    try {
      const result: number = await (this.getDelegate(client) as any).count({
        where,
      });
      return result;
    } catch (error) {
      this.logger.error(
        { model: this.modelName, error },
        'Count operation failed',
      );
      throw error;
    }
  }

  async upsert(
    where: WhereUniqueInput,
    create: CreateInput,
    update: UpdateInput,
    tx?: any,
  ): Promise<T> {
    const client = tx || this.prisma;
    try {
      const result = await (this.getDelegate(client) as any).upsert({
        where,
        create,
        update,
      });
      this.logger.info(
        { model: this.modelName, action: 'upsert' },
        'Record upserted',
      );
      return result as T;
    } catch (error) {
      this.logger.error(
        { model: this.modelName, error },
        'Upsert operation failed',
      );
      throw error;
    }
  }

  protected async executeRaw(
    query: string,
    ...parameters: any[]
  ): Promise<any> {
    try {
      const client = this.prisma as any; // force type so $executeRaw works
      if (parameters.length > 0) {
        return await client.$executeRaw(query, ...parameters);
      } else {
        return await client.$executeRaw(query);
      }
    } catch (error) {
      this.logger.error(
        { model: this.modelName, error, query },
        'Raw query execution failed',
      );
      throw error;
    }
  }
}
