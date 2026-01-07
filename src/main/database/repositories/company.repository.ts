import { Collection, ObjectId, Filter, UpdateFilter, FindOptions } from 'mongodb';
import { getDatabase, COLLECTIONS } from '../index';
import { Company, CreateCompanyInput, UpdateCompanyInput } from '../../../shared/types';
import { logger } from '../../core/logger';

export class CompanyRepository {
  private get collection(): Collection<Company> {
    return getDatabase().collection(COLLECTIONS.COMPANIES);
  }

  async create(input: CreateCompanyInput): Promise<Company> {
    const now = new Date();
    const company: Omit<Company, '_id'> = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    const result = await this.collection.insertOne(company as Company);
    logger.info(`Company created: ${result.insertedId}`);
    
    return { ...company, _id: result.insertedId.toString() } as Company;
  }

  async findById(id: string): Promise<Company | null> {
    const company = await this.collection.findOne({ _id: new ObjectId(id) } as Filter<Company>);
    if (company) {
      return { ...company, _id: company._id.toString() } as Company;
    }
    return null;
  }

  async findByEmail(email: string): Promise<Company | null> {
    const company = await this.collection.findOne({ email });
    if (company) {
      return { ...company, _id: company._id.toString() } as Company;
    }
    return null;
  }

  async update(id: string, input: UpdateCompanyInput): Promise<Company | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: new ObjectId(id) } as Filter<Company>,
      { 
        $set: { 
          ...input, 
          updatedAt: new Date() 
        } 
      } as UpdateFilter<Company>,
      { returnDocument: 'after' }
    );

    if (result) {
      logger.info(`Company updated: ${id}`);
      return { ...result, _id: result._id.toString() } as Company;
    }
    return null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: new ObjectId(id) } as Filter<Company>);
    if (result.deletedCount > 0) {
      logger.info(`Company deleted: ${id}`);
      return true;
    }
    return false;
  }
}

export const companyRepository = new CompanyRepository();
