export interface BrandingOptions {
  // Company Information
  companyName?: string;
  department?: string;
  contactEmail?: string;
  website?: string;
  
  // Logo Settings
  logo?: {
    dataUrl: string; // Base64 encoded image
    position: 'header' | 'footer' | 'watermark' | 'cover';
    width?: number;
    height?: number;
    opacity?: number; // 0-1 for watermark
  };
  
  // Color Scheme
  colors?: {
    primary: string; // Headers, section dividers
    secondary: string; // Subheadings
    accent: string; // Highlights, important items
    text: string; // Main text color
    background?: string; // Page background
  };
  
  // Typography
  fonts?: {
    family: 'helvetica' | 'times' | 'courier' | 'arial';
    headerSize: number;
    bodySize: number;
    lineHeight: number;
  };
  
  // Cover Page
  coverPage?: {
    enabled: boolean;
    title?: string;
    subtitle?: string;
    author?: string;
    date?: boolean;
    customText?: string;
  };
  
  // Headers & Footers
  header?: {
    enabled: boolean;
    text?: string;
    includePageNumbers?: boolean;
    includeLogo?: boolean;
  };
  
  footer?: {
    enabled: boolean;
    text?: string;
    confidentialityNotice?: string;
    includeDate?: boolean;
  };
  
  // Watermark
  watermark?: {
    enabled: boolean;
    text?: string;
    opacity?: number; // 0-1
    angle?: number; // degrees
    fontSize?: number;
  };
  
  // Document Settings
  documentSettings?: {
    includeTableOfContents?: boolean;
    includeExecutiveSummary?: boolean;
    includeAnalytics?: boolean;
    format: 'detailed' | 'condensed';
  };
  
  // Metadata
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string[];
    classification?: 'public' | 'internal' | 'confidential' | 'restricted';
  };
  
  // Template
  template?: 'default' | 'corporate' | 'modern' | 'minimal' | 'custom';
}

export interface BrandingPreset {
  id: string;
  name: string;
  description: string;
  options: BrandingOptions;
  thumbnail?: string;
}

export const DEFAULT_BRANDING: BrandingOptions = {
  colors: {
    primary: '#003366', // Navy blue
    secondary: '#0066CC', // Blue
    accent: '#00A652', // Green
    text: '#000000', // Black
  },
  fonts: {
    family: 'helvetica',
    headerSize: 14,
    bodySize: 11,
    lineHeight: 1.5,
  },
  documentSettings: {
    includeTableOfContents: true,
    includeExecutiveSummary: true,
    includeAnalytics: true,
    format: 'detailed',
  },
  template: 'default',
};

export const BRANDING_PRESETS: BrandingPreset[] = [
  {
    id: 'corporate',
    name: 'Corporate',
    description: 'Professional corporate style with formal typography',
    options: {
      ...DEFAULT_BRANDING,
      colors: {
        primary: '#1a1a1a',
        secondary: '#4a4a4a',
        accent: '#0066cc',
        text: '#333333',
      },
      fonts: {
        family: 'times',
        headerSize: 16,
        bodySize: 12,
        lineHeight: 1.6,
      },
      template: 'corporate',
    },
  },
  {
    id: 'modern',
    name: 'Modern',
    description: 'Clean, modern design with vibrant colors',
    options: {
      ...DEFAULT_BRANDING,
      colors: {
        primary: '#6366f1', // Indigo
        secondary: '#8b5cf6', // Purple
        accent: '#10b981', // Emerald
        text: '#1f2937',
      },
      fonts: {
        family: 'arial',
        headerSize: 14,
        bodySize: 11,
        lineHeight: 1.5,
      },
      template: 'modern',
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Simple, clean design with minimal colors',
    options: {
      ...DEFAULT_BRANDING,
      colors: {
        primary: '#000000',
        secondary: '#666666',
        accent: '#000000',
        text: '#000000',
      },
      fonts: {
        family: 'helvetica',
        headerSize: 13,
        bodySize: 10,
        lineHeight: 1.4,
      },
      documentSettings: {
        includeTableOfContents: false,
        includeExecutiveSummary: false,
        includeAnalytics: true,
        format: 'condensed',
      },
      template: 'minimal',
    },
  },
];