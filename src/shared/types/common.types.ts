// Common types shared across the application

export interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface BaseEntity {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WithCompany {
  companyId: string;
}

export interface WithAgent {
  createdBy: string;
}

export type AsyncResult<T> = Promise<Result<T>>;
export type AsyncPaginatedResult<T> = Promise<PaginatedResult<T>>;
