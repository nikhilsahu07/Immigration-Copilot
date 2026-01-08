import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText, Loader2, CheckCircle, XCircle, Edit, AlertCircle, Eye } from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, CardContent, CardDescription, Label } from '../../components/ui';
import { api } from '../../lib/api';
import type { Extraction, DocumentWithPresignedUrl } from '../../../shared/types';
import { PromptInput } from '../../components/PromptInput';
import { DocumentPreview } from '../../components/DocumentPreview';

export function ExtractionPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [searchParams] = useSearchParams();
  const extractionId = searchParams.get('extractionId');
  const navigate = useNavigate();

  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [documents, setDocuments] = useState<DocumentWithPresignedUrl[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [previewDocument, setPreviewDocument] = useState<DocumentWithPresignedUrl | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (clientId) {
      loadData();
    }
  }, [clientId, extractionId]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Load documents for selecting
      const docResult = await api.document.list({ clientId: clientId! });
      if (docResult.success && docResult.data) {
        setDocuments(docResult.data);
      }

      // If extraction ID provided, load it
      if (extractionId) {
        const extResult = await api.extraction.get({ id: extractionId });
        if (extResult.success && extResult.data) {
          setExtraction(extResult.data);
        } else {
          setError(extResult.error || 'Failed to load extraction');
        }
      } else {
        // Load latest extraction for this client
        const listResult = await api.extraction.list({ clientId: clientId! });
        if (listResult.success && listResult.data && listResult.data.length > 0) {
          setExtraction(listResult.data[0]);
        }
      }
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartExtraction = async () => {
    if (selectedDocIds.length === 0) {
      setError('Please select at least one document');
      return;
    }

    setIsExtracting(true);
    setError(null);

    try {
      const result = await api.extraction.create({
        clientId: clientId!,
        documentIds: selectedDocIds,
        customPrompt: customPrompt || undefined,
      });

      if (result.success && result.data) {
        setExtraction(result.data);
        setSelectedDocIds([]);
      } else {
        setError(result.error || 'Failed to start extraction');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleApprove = async () => {
    if (!extraction) return;

    setIsApproving(true);
    try {
      const result = await api.extraction.approve({ id: extraction._id });
      if (result.success && result.data) {
        setExtraction(result.data);
      } else {
        setError(result.error || 'Failed to approve extraction');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!extraction || !rejectionReason.trim()) return;

    setIsRejecting(true);
    try {
      const result = await api.extraction.reject({ 
        id: extraction._id, 
        data: { rejectionReason: rejectionReason.trim() }
      });
      if (result.success && result.data) {
        setExtraction(result.data);
        setShowRejectModal(false);
        setRejectionReason('');
      } else {
        setError(result.error || 'Failed to reject extraction');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsRejecting(false);
    }
  };

  const toggleDocument = (docId: string) => {
    setSelectedDocIds(prev => 
      prev.includes(docId) 
        ? prev.filter(id => id !== docId) 
        : [...prev, docId]
    );
  };

  const extractedData = extraction?.extractedData || {};

  // Initialize edited data when extraction changes
  useEffect(() => {
    if (extraction?.extractedData) {
      setEditedData(JSON.parse(JSON.stringify(extraction.extractedData)));
    }
  }, [extraction]);

  const handleFieldChange = (section: string, field: string, value: string, index?: number) => {
    setEditedData(prev => {
      const newData = { ...prev };
      if (index !== undefined) {
        // Array field
        const arr = [...(newData[section] as unknown[] || [])];
        arr[index] = { ...(arr[index] as Record<string, unknown>), [field]: value };
        newData[section] = arr;
      } else {
        // Object field
        newData[section] = { ...(newData[section] as Record<string, unknown>), [field]: value };
      }
      return newData;
    });
  };

  const handleSaveEdits = async () => {
    if (!extraction) return;
    try {
      const result = await api.extraction.approve({ 
        id: extraction._id, 
        data: { extractedData: editedData as any }
      });
      if (result.success && result.data) {
        setExtraction(result.data);
        setIsEditing(false);
      }
    } catch (err) {
      setError('Failed to save changes');
    }
  };

  const renderDataSection = (title: string, sectionKey: string, data: Record<string, unknown> | undefined) => {
    if (!data || Object.keys(data).length === 0) return null;
    const sectionData = isEditing ? (editedData[sectionKey] as Record<string, unknown>) || data : data;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {title}
            {!isEditing && extraction?.status === 'pending' && (
              <Button variant="ghost" size="icon" className="ml-auto" onClick={() => setIsEditing(true)}>
                <Edit className="w-4 h-4" />
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(sectionData).map(([key, value]) => (
            <div key={key} className="flex justify-between items-center py-2 border-b last:border-0 gap-4">
              <span className="text-sm text-muted-foreground capitalize flex-shrink-0">
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </span>
              {isEditing ? (
                <input
                  type="text"
                  value={String(value || '')}
                  onChange={(e) => handleFieldChange(sectionKey, key, e.target.value)}
                  className="flex-1 text-sm text-right rounded border border-input px-2 py-1 bg-background"
                />
              ) : (
                <span className="text-sm font-medium text-right">{String(value) || 'N/A'}</span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    );
  };

  const renderArraySection = (title: string, sectionKey: string, data: unknown[] | undefined) => {
    if (!data || data.length === 0) return null;
    const sectionData = isEditing ? (editedData[sectionKey] as unknown[]) || data : data;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {title}
            {!isEditing && extraction?.status === 'pending' && (
              <Button variant="ghost" size="icon" className="ml-auto" onClick={() => setIsEditing(true)}>
                <Edit className="w-4 h-4" />
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sectionData.map((item, i) => (
            <div key={i} className="p-3 rounded-lg bg-muted/50">
              {typeof item === 'object' && item !== null ? (
                Object.entries(item as Record<string, unknown>).map(([key, value]) => (
                  <div key={key} className="flex justify-between items-center py-1 gap-4">
                    <span className="text-sm text-muted-foreground capitalize flex-shrink-0">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={String(value || '')}
                        onChange={(e) => handleFieldChange(sectionKey, key, e.target.value, i)}
                        className="flex-1 text-sm text-right rounded border border-input px-2 py-1 bg-background"
                      />
                    ) : (
                      <span className="text-sm font-medium text-right">{String(value) || 'N/A'}</span>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm">{String(item)}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="page-container flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <Button variant="ghost" className="mb-4" onClick={() => navigate(`/clients/${clientId}`)}>
          <ArrowLeft className="w-4 h-4" />
          Back to Client
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Data Extraction</h1>
            <p className="page-description">
              {extraction 
                ? 'Review and approve the AI-extracted data before automation.'
                : 'Select documents to extract data from.'}
            </p>
          </div>
          {extraction && extraction.status === 'pending' && (
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowRejectModal(true)}>
                <XCircle className="w-4 h-4" />
                Reject
              </Button>
              <Button onClick={handleApprove} disabled={isApproving}>
                {isApproving && <Loader2 className="w-4 h-4 animate-spin" />}
                <CheckCircle className="w-4 h-4" />
                Approve
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-destructive/10 text-destructive flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* No Extraction - Select Documents */}
      {!extraction && documents.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Select Documents</CardTitle>
            <CardDescription>Choose documents to extract data from</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {documents.map(doc => (
              <div 
                key={doc._id} 
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50"
              >
                <label className="flex items-center gap-3 cursor-pointer flex-1">
                  <input 
                    type="checkbox"
                    checked={selectedDocIds.includes(doc._id)}
                    onChange={() => toggleDocument(doc._id)}
                    className="w-4 h-4"
                  />
                  <FileText className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">{doc.originalName}</p>
                    <p className="text-xs text-muted-foreground capitalize">{doc.documentType}</p>
                  </div>
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-primary"
                  onClick={() => {
                    setPreviewDocument(doc);
                    setShowPreview(true);
                  }}
                >
                  <Eye className="w-4 h-4" />
                </Button>
              </div>
            ))}

            {/* Custom Prompt Input */}
            <div className="pt-2 border-t">
              <Label className="text-sm text-muted-foreground mb-2 block">
                Additional Instructions (Optional)
              </Label>
              <PromptInput
                placeholder="E.g., 'Focus on education details' or 'Make sure to extract visa history'"
                onSubmit={(prompt) => setCustomPrompt(prompt)}
                disabled={isExtracting}
              />
              {customPrompt && (
                <div className="mt-2 p-2 rounded bg-primary/10 text-sm text-primary flex items-center justify-between">
                  <span className="truncate">{customPrompt}</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setCustomPrompt('')}
                    className="h-6 px-2"
                  >
                    Clear
                  </Button>
                </div>
              )}
            </div>

            <Button 
              onClick={handleStartExtraction} 
              disabled={selectedDocIds.length === 0 || isExtracting}
              className="w-full"
            >
              {isExtracting && <Loader2 className="w-4 h-4 animate-spin" />}
              <FileText className="w-4 h-4" />
              Start Extraction
            </Button>
          </CardContent>
        </Card>
      )}

      {/* No Documents */}
      {!extraction && documents.length === 0 && (
        <div className="empty-state">
          <FileText className="empty-state-icon" />
          <h3 className="empty-state-title">No documents available</h3>
          <p className="empty-state-description">
            Upload documents to this client first before running extraction.
          </p>
          <Button onClick={() => navigate(`/clients/${clientId}`)}>
            Go to Client Page
          </Button>
        </div>
      )}

      {/* Status Banner */}
      {extraction && extraction.status !== 'pending' && (
        <div className={`mb-6 p-4 rounded-lg flex items-center gap-2 ${
          extraction.status === 'approved' 
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {extraction.status === 'approved' ? (
            <>
              <CheckCircle className="w-5 h-5" />
              <span>This extraction has been approved and is ready for automation.</span>
            </>
          ) : (
            <>
              <XCircle className="w-5 h-5" />
              <span>This extraction was rejected: {extraction.rejectionReason}</span>
            </>
          )}
        </div>
      )}

      {/* Extracted Data */}
      {extraction && (
        <>
          {/* Edit Mode Controls */}
          {isEditing && (
            <div className="mb-4 p-4 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-between">
              <span className="text-sm text-primary font-medium">Editing Mode - Make changes to the extracted data</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => {
                  setIsEditing(false);
                  setEditedData(JSON.parse(JSON.stringify(extraction.extractedData)));
                }}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveEdits}>
                  Save & Approve
                </Button>
              </div>
            </div>
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            {renderDataSection('Personal Information', 'personalInfo', extractedData.personalInfo as Record<string, unknown>)}
            {renderDataSection('Passport Details', 'passport', extractedData.passport as Record<string, unknown>)}
            {renderDataSection('Contact Information', 'contact', extractedData.contact as Record<string, unknown>)}
            {renderArraySection('Education', 'education', extractedData.education as unknown[])}
            {renderArraySection('Employment', 'employment', extractedData.employment as unknown[])}
            {renderDataSection('Financial Information', 'financial', extractedData.financial as Record<string, unknown>)}
            {renderArraySection('Travel History', 'travel', extractedData.travel as unknown[])}
            {renderArraySection('Family Members', 'family', extractedData.family as unknown[])}
            {renderDataSection('Additional Information', 'additionalInfo', extractedData.additionalInfo as Record<string, unknown>)}
          </div>
        </>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md animate-fade-in">
            <CardHeader>
              <CardTitle>Reject Extraction</CardTitle>
              <CardDescription>Please provide a reason for rejection</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>Reason</Label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter the reason for rejection..."
                  className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                />
              </div>
            </CardContent>
            <div className="flex justify-end gap-3 p-6 pt-0">
              <Button variant="outline" onClick={() => setShowRejectModal(false)}>
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={handleReject} 
                disabled={!rejectionReason.trim() || isRejecting}
              >
                {isRejecting && <Loader2 className="w-4 h-4 animate-spin" />}
                Reject
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Document Preview */}
      <DocumentPreview
        document={previewDocument}
        isOpen={showPreview}
        onClose={() => {
          setShowPreview(false);
          setPreviewDocument(null);
        }}
      />
    </div>
  );
}
