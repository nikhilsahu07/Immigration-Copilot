import { useState, useEffect } from 'react';
import { X, FileText, Download, ExternalLink, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from './ui';
import type { DocumentWithPresignedUrl } from '../../shared/types';
import { api } from '../lib/api';

interface DocumentPreviewProps {
  document: DocumentWithPresignedUrl | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DocumentPreview({ document, isOpen, onClose }: DocumentPreviewProps) {
  const [zoom, setZoom] = useState(100);
  const [isLoading, setIsLoading] = useState(true);

  // Reset state when document changes
  useEffect(() => {
    if (document) {
      setIsLoading(true);
      setZoom(100);
      
      // For images, wait for load
      if (document.fileType === 'pdf') {
        setIsLoading(false);
      }
    }
  }, [document?.presignedUrl]);

  if (!isOpen || !document) return null;

  const isPdf = document.fileType === 'pdf';
  const isImage = ['jpg', 'jpeg', 'png'].includes(document.fileType);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50));

  const handleDownload = () => {
    window.open(document.presignedUrl, '_blank');
  };

  const handleDownloadToSystem = async () => {
    try {
      const result = await api.document.download({
        url: document.presignedUrl,
        filename: document.originalName,
      });
      if (result.success && result.data && !result.data.cancelled) {
        onClose();
      } else if (!result.success) {
        window.open(document.presignedUrl, '_blank');
      }
    } catch (error) {
      window.open(document.presignedUrl, '_blank');
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-5xl h-[90vh] flex flex-col bg-background rounded-lg overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-medium">{document.originalName}</h3>
              <p className="text-xs text-muted-foreground capitalize">
                {document.documentType} • {document.fileType.toUpperCase()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isImage && (
              <>
                <Button variant="ghost" size="icon" onClick={handleZoomOut} disabled={zoom <= 50}>
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <span className="text-sm text-muted-foreground w-12 text-center">{zoom}%</span>
                <Button variant="ghost" size="icon" onClick={handleZoomIn} disabled={zoom >= 200}>
                  <ZoomIn className="w-4 h-4" />
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" onClick={handleDownloadToSystem} title="Download to system">
              <Download className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleDownload} title="Open in browser">
              <ExternalLink className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Preview Content */}
        <div className="flex-1 overflow-auto bg-muted/30 flex items-center justify-center p-4 relative">
          {isLoading && isImage && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}
          
          {isPdf && (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <FileText className="w-24 h-24 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-lg font-medium mb-2">PDF Document</p>
              <p className="text-sm text-muted-foreground mb-6">
                Download this PDF to your system to view it.
              </p>
              <Button onClick={handleDownloadToSystem} className="mb-4">
                <Download className="w-4 h-4 mr-2" />
                Download PDF
              </Button>
              <Button variant="outline" onClick={handleDownload}>
                <ExternalLink className="w-4 h-4 mr-2" />
                Open in Browser
              </Button>
            </div>
          )}
          
          {isImage && (
            <img
              src={document.presignedUrl}
              alt={document.originalName}
              className="max-w-full max-h-full object-contain rounded transition-transform"
              style={{ transform: `scale(${zoom / 100})` }}
              onLoad={() => setIsLoading(false)}
              onError={() => setIsLoading(false)}
            />
          )}
          
          {!isPdf && !isImage && (
            <div className="text-center text-muted-foreground">
              <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>Preview not available for this file type</p>
              <Button className="mt-4" onClick={handleDownload}>
                <ExternalLink className="w-4 h-4" />
                Open in Browser
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
