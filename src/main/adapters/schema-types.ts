// Schema types for portal adapters
// Defines structure for portal pages, fields, and actions

export type FieldType = 'text' | 'select' | 'date' | 'email' | 'tel' | 'file' | 'checkbox' | 'radio' | 'textarea';

export interface FieldDefinition {
  id: string;
  selector: string;
  type: FieldType;
  description: string;
  required?: boolean;
  options?: string[];
}

export interface ActionDefinition {
  id: string;
  selector: string;
  description: string;
  tags?: string[];
}

export interface PageDefinition {
  name: string;
  identifyBy: {
    urlContains?: string;
    selector: string;
  };
  fields: FieldDefinition[];
  actions: ActionDefinition[];
}

export interface PortalSchema {
  portalId: string;
  pages: Record<string, PageDefinition>;
}
