"use client";

import { useState, useEffect } from "react";
import { X, Upload, Save, RotateCcw } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import type { BrandingOptions } from "~/types/branding";
import { BRANDING_PRESETS, DEFAULT_BRANDING } from "~/types/branding";

interface BrandingSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (options: BrandingOptions) => void;
  currentOptions?: BrandingOptions;
}

export function BrandingSettingsModal({
  isOpen,
  onClose,
  onSave,
  currentOptions = DEFAULT_BRANDING,
}: BrandingSettingsModalProps) {
  const [options, setOptions] = useState<BrandingOptions>(currentOptions || DEFAULT_BRANDING);
  const [activeTab, setActiveTab] = useState<'company' | 'colors' | 'layout' | 'document'>('company');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  useEffect(() => {
    // Update options when modal opens with new currentOptions
    if (isOpen && currentOptions) {
      setOptions(currentOptions);
      if (currentOptions.logo?.dataUrl) {
        setLogoPreview(currentOptions.logo.dataUrl);
      }
    }
  }, [isOpen, currentOptions]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setLogoPreview(dataUrl);
        setOptions(prev => ({
          ...prev,
          logo: {
            dataUrl,
            position: prev.logo?.position || 'cover',
          },
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleColorChange = (colorType: keyof NonNullable<BrandingOptions['colors']>, value: string) => {
    setOptions(prev => ({
      ...prev,
      colors: {
        ...prev.colors,
        [colorType]: value,
      } as BrandingOptions['colors'],
    }));
  };

  const handlePresetSelect = (presetId: string) => {
    const preset = BRANDING_PRESETS.find(p => p.id === presetId);
    if (preset) {
      // Preserve company information when applying preset
      setOptions(prev => ({
        ...preset.options,
        // Preserve these fields from the current options
        companyName: prev.companyName,
        department: prev.department,
        contactEmail: prev.contactEmail,
        website: prev.website,
        logo: prev.logo,
        // Preserve metadata author if set
        metadata: {
          ...preset.options.metadata,
          author: prev.metadata?.author || preset.options.metadata?.author,
        },
        // Preserve cover page author if set
        coverPage: preset.options.coverPage ? {
          ...preset.options.coverPage,
          enabled: preset.options.coverPage.enabled ?? true,
          author: prev.coverPage?.author || preset.options.coverPage?.author,
        } : prev.coverPage,
      }));
    }
  };

  const handleSave = () => {
    onSave(options);
    // Store in localStorage for persistence
    localStorage.setItem('intune-branding-options', JSON.stringify(options));
    onClose();
  };

  const handleReset = () => {
    setOptions(DEFAULT_BRANDING);
    setLogoPreview(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-slate-900">PDF Branding Settings</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6">
          <button
            onClick={() => setActiveTab('company')}
            className={`px-4 py-3 font-medium transition-colors border-b-2 ${
              activeTab === 'company'
                ? 'text-blue-600 border-blue-600'
                : 'text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            Company Info
          </button>
          <button
            onClick={() => setActiveTab('colors')}
            className={`px-4 py-3 font-medium transition-colors border-b-2 ${
              activeTab === 'colors'
                ? 'text-blue-600 border-blue-600'
                : 'text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            Colors & Style
          </button>
          <button
            onClick={() => setActiveTab('layout')}
            className={`px-4 py-3 font-medium transition-colors border-b-2 ${
              activeTab === 'layout'
                ? 'text-blue-600 border-blue-600'
                : 'text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            Layout
          </button>
          <button
            onClick={() => setActiveTab('document')}
            className={`px-4 py-3 font-medium transition-colors border-b-2 ${
              activeTab === 'document'
                ? 'text-blue-600 border-blue-600'
                : 'text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            Document
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'company' && (
            <div className="space-y-6">
              {/* Company Information */}
              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold">Company Information</h3>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Company Name
                    </label>
                    <input
                      type="text"
                      value={options.companyName || ''}
                      onChange={(e) => setOptions(prev => ({ ...prev, companyName: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Your Company Name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Department
                    </label>
                    <input
                      type="text"
                      value={options.department || ''}
                      onChange={(e) => setOptions(prev => ({ ...prev, department: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="IT Department"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Contact Email
                    </label>
                    <input
                      type="email"
                      value={options.contactEmail || ''}
                      onChange={(e) => setOptions(prev => ({ ...prev, contactEmail: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="it@company.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Website
                    </label>
                    <input
                      type="url"
                      value={options.website || ''}
                      onChange={(e) => setOptions(prev => ({ ...prev, website: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="https://company.com"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Logo Upload */}
              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold">Company Logo</h3>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <label className="block">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleLogoUpload}
                            className="hidden"
                          />
                          <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors">
                            <Upload className="w-4 h-4" />
                            <span>Upload Logo</span>
                          </div>
                        </label>
                      </div>
                      {logoPreview && (
                        <div className="w-24 h-24 border rounded-lg p-2 bg-slate-50">
                          <img src={logoPreview} alt="Logo preview" className="w-full h-full object-contain" />
                        </div>
                      )}
                    </div>
                    {logoPreview && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Logo Position
                        </label>
                        <select
                          value={options.logo?.position || 'header'}
                          onChange={(e) => setOptions(prev => ({
                            ...prev,
                            logo: {
                              ...prev.logo!,
                              position: e.target.value as any,
                            },
                          }))}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="header">Header</option>
                          <option value="footer">Footer</option>
                          <option value="cover">Cover Page Only</option>
                          <option value="watermark">Watermark</option>
                        </select>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'colors' && (
            <div className="space-y-6">
              {/* Preset Templates */}
              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold">Preset Templates</h3>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    {BRANDING_PRESETS.map(preset => (
                      <button
                        key={preset.id}
                        onClick={() => handlePresetSelect(preset.id)}
                        className={`p-4 border rounded-lg hover:border-blue-500 transition-colors ${
                          options.template === preset.id ? 'border-blue-500 bg-blue-50' : ''
                        }`}
                      >
                        <div className="font-medium text-slate-900">{preset.name}</div>
                        <div className="text-sm text-slate-600 mt-1">{preset.description}</div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Color Customization */}
              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold">Custom Colors</h3>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Primary Color (Headers)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={options.colors?.primary || '#003366'}
                          onChange={(e) => handleColorChange('primary', e.target.value)}
                          className="w-12 h-10 border rounded cursor-pointer"
                        />
                        <input
                          type="text"
                          value={options.colors?.primary || '#003366'}
                          onChange={(e) => handleColorChange('primary', e.target.value)}
                          className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Secondary Color (Subheadings)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={options.colors?.secondary || '#0066CC'}
                          onChange={(e) => handleColorChange('secondary', e.target.value)}
                          className="w-12 h-10 border rounded cursor-pointer"
                        />
                        <input
                          type="text"
                          value={options.colors?.secondary || '#0066CC'}
                          onChange={(e) => handleColorChange('secondary', e.target.value)}
                          className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Accent Color (Highlights)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={options.colors?.accent || '#00A652'}
                          onChange={(e) => handleColorChange('accent', e.target.value)}
                          className="w-12 h-10 border rounded cursor-pointer"
                        />
                        <input
                          type="text"
                          value={options.colors?.accent || '#00A652'}
                          onChange={(e) => handleColorChange('accent', e.target.value)}
                          className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Text Color
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={options.colors?.text || '#000000'}
                          onChange={(e) => handleColorChange('text', e.target.value)}
                          className="w-12 h-10 border rounded cursor-pointer"
                        />
                        <input
                          type="text"
                          value={options.colors?.text || '#000000'}
                          onChange={(e) => handleColorChange('text', e.target.value)}
                          className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Typography Settings */}
              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold">Typography</h3>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Font Family
                    </label>
                    <select
                      value={options.fonts?.family || 'helvetica'}
                      onChange={(e) => setOptions(prev => ({
                        ...prev,
                        fonts: {
                          ...prev.fonts,
                          family: e.target.value as any,
                          headerSize: prev.fonts?.headerSize || 14,
                          bodySize: prev.fonts?.bodySize || 11,
                          lineHeight: prev.fonts?.lineHeight || 1.5,
                        },
                      }))}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="helvetica">Helvetica (Sans-serif)</option>
                      <option value="times">Times (Serif)</option>
                      <option value="courier">Courier (Monospace)</option>
                      <option value="arial">Arial (Sans-serif)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Header Font Size: {options.fonts?.headerSize || 14}pt
                    </label>
                    <input
                      type="range"
                      min="12"
                      max="20"
                      value={options.fonts?.headerSize || 14}
                      onChange={(e) => setOptions(prev => ({
                        ...prev,
                        fonts: {
                          ...prev.fonts,
                          family: prev.fonts?.family || 'helvetica',
                          headerSize: parseInt(e.target.value),
                          bodySize: prev.fonts?.bodySize || 11,
                          lineHeight: prev.fonts?.lineHeight || 1.5,
                        },
                      }))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Body Font Size: {options.fonts?.bodySize || 11}pt
                    </label>
                    <input
                      type="range"
                      min="9"
                      max="14"
                      value={options.fonts?.bodySize || 11}
                      onChange={(e) => setOptions(prev => ({
                        ...prev,
                        fonts: {
                          ...prev.fonts,
                          family: prev.fonts?.family || 'helvetica',
                          headerSize: prev.fonts?.headerSize || 14,
                          bodySize: parseInt(e.target.value),
                          lineHeight: prev.fonts?.lineHeight || 1.5,
                        },
                      }))}
                      className="w-full"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'layout' && (
            <div className="space-y-6">
              {/* Cover Page */}
              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold">Cover Page</h3>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="cover-enabled"
                      checked={options.coverPage?.enabled ?? true}
                      onChange={(e) => setOptions(prev => ({
                        ...prev,
                        coverPage: {
                          ...prev.coverPage,
                          enabled: e.target.checked,
                        },
                      }))}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="cover-enabled" className="text-sm font-medium text-slate-700">
                      Include cover page
                    </label>
                  </div>
                  {options.coverPage?.enabled && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Report Title
                        </label>
                        <input
                          type="text"
                          value={options.coverPage?.title || 'Microsoft Intune Configuration Report'}
                          onChange={(e) => setOptions(prev => ({
                            ...prev,
                            coverPage: {
                              ...prev.coverPage!,
                              title: e.target.value,
                            },
                          }))}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Subtitle
                        </label>
                        <input
                          type="text"
                          value={options.coverPage?.subtitle || ''}
                          onChange={(e) => setOptions(prev => ({
                            ...prev,
                            coverPage: {
                              ...prev.coverPage!,
                              subtitle: e.target.value,
                            },
                          }))}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Complete configuration documentation"
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Headers & Footers */}
              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold">Headers & Footers</h3>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        id="header-enabled"
                        checked={options.header?.enabled ?? true}
                        onChange={(e) => setOptions(prev => ({
                          ...prev,
                          header: {
                            ...prev.header,
                            enabled: e.target.checked,
                          },
                        }))}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="header-enabled" className="text-sm font-medium text-slate-700">
                        Include header
                      </label>
                    </div>
                    {options.header?.enabled && (
                      <input
                        type="text"
                        value={options.header?.text || ''}
                        onChange={(e) => setOptions(prev => ({
                          ...prev,
                          header: {
                            ...prev.header!,
                            text: e.target.value,
                          },
                        }))}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Header text"
                      />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        id="footer-enabled"
                        checked={options.footer?.enabled ?? true}
                        onChange={(e) => setOptions(prev => ({
                          ...prev,
                          footer: {
                            ...prev.footer,
                            enabled: e.target.checked,
                          },
                        }))}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="footer-enabled" className="text-sm font-medium text-slate-700">
                        Include footer
                      </label>
                    </div>
                    {options.footer?.enabled && (
                      <>
                        <input
                          type="text"
                          value={options.footer?.text || ''}
                          onChange={(e) => setOptions(prev => ({
                            ...prev,
                            footer: {
                              ...prev.footer!,
                              text: e.target.value,
                            },
                          }))}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                          placeholder="Footer text"
                        />
                        <div className="mt-3 flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="footer-logo"
                            checked={options.footer?.includeLogo ?? false}
                            onChange={(e) => setOptions(prev => ({
                              ...prev,
                              footer: {
                                ...prev.footer!,
                                includeLogo: e.target.checked,
                              },
                            }))}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                          <label htmlFor="footer-logo" className="text-sm text-slate-700">Show logo in footer</label>
                        </div>
                        <input
                          type="text"
                          value={options.footer?.confidentialityNotice || ''}
                          onChange={(e) => setOptions(prev => ({
                            ...prev,
                            footer: {
                              ...prev.footer!,
                              confidentialityNotice: e.target.value,
                            },
                          }))}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Confidentiality notice (e.g., CONFIDENTIAL - Internal Use Only)"
                        />
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Watermark */}
              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold">Watermark</h3>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="watermark-enabled"
                      checked={options.watermark?.enabled ?? false}
                      onChange={(e) => setOptions(prev => ({
                        ...prev,
                        watermark: {
                          ...prev.watermark,
                          enabled: e.target.checked,
                        },
                      }))}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="watermark-enabled" className="text-sm font-medium text-slate-700">
                      Add watermark
                    </label>
                  </div>
                  {options.watermark?.enabled && (
                    <>
                      <input
                        type="text"
                        value={options.watermark?.text || ''}
                        onChange={(e) => setOptions(prev => ({
                          ...prev,
                          watermark: {
                            ...prev.watermark!,
                            text: e.target.value,
                          },
                        }))}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="CONFIDENTIAL"
                      />
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Opacity: {((options.watermark?.opacity || 0.1) * 100).toFixed(0)}%
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={(options.watermark?.opacity || 0.1) * 100}
                          onChange={(e) => setOptions(prev => ({
                            ...prev,
                            watermark: {
                              ...prev.watermark!,
                              opacity: parseInt(e.target.value) / 100,
                            },
                          }))}
                          className="w-full"
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'document' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold">Document Settings</h3>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="toc"
                        checked={options.documentSettings?.includeTableOfContents ?? true}
                        onChange={(e) => setOptions(prev => ({
                          ...prev,
                          documentSettings: {
                            ...prev.documentSettings!,
                            includeTableOfContents: e.target.checked,
                          },
                        }))}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="toc" className="text-sm font-medium text-slate-700">
                        Include table of contents
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="analytics"
                        checked={options.documentSettings?.includeAnalytics ?? true}
                        onChange={(e) => setOptions(prev => ({
                          ...prev,
                          documentSettings: {
                            ...prev.documentSettings!,
                            includeAnalytics: e.target.checked,
                          },
                        }))}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="analytics" className="text-sm font-medium text-slate-700">
                        Include analytics section
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Format
                    </label>
                    <select
                      value={options.documentSettings?.format || 'detailed'}
                      onChange={(e) => setOptions(prev => ({
                        ...prev,
                        documentSettings: {
                          ...prev.documentSettings!,
                          format: e.target.value as 'detailed' | 'condensed',
                        },
                      }))}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="detailed">Detailed (All settings)</option>
                      <option value="condensed">Condensed (Key settings only)</option>
                    </select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold">Document Metadata</h3>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Document Title
                    </label>
                    <input
                      type="text"
                      value={options.metadata?.title || ''}
                      onChange={(e) => setOptions(prev => ({
                        ...prev,
                        metadata: {
                          ...prev.metadata,
                          title: e.target.value,
                        },
                      }))}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Intune Configuration Report"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Author
                    </label>
                    <input
                      type="text"
                      value={options.metadata?.author || ''}
                      onChange={(e) => setOptions(prev => ({
                        ...prev,
                        metadata: {
                          ...prev.metadata,
                          author: e.target.value,
                        },
                      }))}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="IT Department"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Classification
                    </label>
                    <select
                      value={options.metadata?.classification || 'internal'}
                      onChange={(e) => setOptions(prev => ({
                        ...prev,
                        metadata: {
                          ...prev.metadata,
                          classification: e.target.value as any,
                        },
                      }))}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="public">Public</option>
                      <option value="internal">Internal</option>
                      <option value="confidential">Confidential</option>
                      <option value="restricted">Restricted</option>
                    </select>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t bg-slate-50">
          <Button onClick={handleReset} variant="secondary">
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset to Default
          </Button>
          <div className="flex gap-3">
            <Button onClick={onClose} variant="secondary">
              Cancel
            </Button>
            <Button onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" />
              Save Settings
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
