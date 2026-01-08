import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Upload, Play, CheckCircle, Clock, Trash2, Loader2, Eye, Edit } from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, CardContent, CardDescription, Separator, Input, Label } from '../../components/ui';
import { useClientStore } from '../../stores';
import { api } from '../../lib/api';
import type { DocumentWithPresignedUrl, Extraction } from '../../../shared/types';
import { formatRelativeTime, formatFileSize } from '../../../shared/utils';
import { COUNTRIES } from '../../../shared/constants';
import { DocumentPreview } from '../../components/DocumentPreview';

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { 
    selectedClient, 
    isLoading: clientLoading, 
    getClient, 
    updateClient,
    deleteClient
  } = useClientStore();

  const [documents, setDocuments] = useState<DocumentWithPresignedUrl[]>([]);
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [isLoadingExtractions, setIsLoadingExtractions] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState('passport');
  const [previewDocument, setPreviewDocument] = useState<DocumentWithPresignedUrl | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingClient, setEditingClient] = useState({
    name: '',
    email: '',
    phone: '',
    nationality: '',
    passportNumber: '',
    dateOfBirth: '',
  });
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (id) {
      loadData(id);
    }
  }, [id]);

  const loadData = async (clientId: string) => {
    // Load client
    await getClient(clientId);

    // Load documents
    setIsLoadingDocs(true);
    try {
      const docResult = await api.document.list({ clientId });
      if (docResult.success && docResult.data) {
        setDocuments(docResult.data);
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setIsLoadingDocs(false);
    }

    // Load extractions
    setIsLoadingExtractions(true);
    try {
      const extResult = await api.extraction.list({ clientId });
      if (extResult.success && extResult.data) {
        setExtractions(extResult.data);
      }
    } catch (err) {
      console.error('Failed to load extractions:', err);
    } finally {
      setIsLoadingExtractions(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadError(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !id) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      // Read file as base64
      const fileBuffer = await selectedFile.arrayBuffer();
      const base64Content = btoa(
        new Uint8Array(fileBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const result = await api.document.upload({
        clientId: id,
        documentType: documentType as 'passport' | 'education' | 'employment' | 'financial' | 'identity' | 'other',
        fileData: base64Content,
        fileName: selectedFile.name,
        mimeType: selectedFile.type,
      });

      if (result.success && result.data) {
        setDocuments(prev => [...prev, result.data!]);
        setShowUploadModal(false);
        setSelectedFile(null);
        setDocumentType('passport');
      } else {
        setUploadError(result.error || 'Failed to upload document');
      }
    } catch (err) {
      setUploadError('An unexpected error occurred');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      const result = await api.document.delete({ id: docId });
      if (result.success) {
        setDocuments(prev => prev.filter(d => d._id !== docId));
      }
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  };

  if (clientLoading && !selectedClient) {
    return (
      <div className="page-container flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!selectedClient) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <h3 className="empty-state-title">Client not found</h3>
          <Button onClick={() => navigate('/clients')}>Back to Clients</Button>
        </div>
      </div>
    );
  }

  const client = selectedClient;

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <Button variant="ghost" className="mb-4" onClick={() => navigate('/clients')}>
          <ArrowLeft className="w-4 h-4" />
          Back to Clients
        </Button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
              <span className="text-xl font-medium">{client.name.charAt(0)}</span>
            </div>
            <div>
              <h1 className="page-title">{client.name}</h1>
              <p className="page-description">{client.email}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => navigate(`/extraction/${id}`)}>
              <FileText className="w-4 h-4" />
              Extract Data
            </Button>
            <Button onClick={() => navigate('/automation')}>
              <Play className="w-4 h-4" />
              Start Automation
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Client Info */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Client Information
              <div className="flex gap-2">
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={async () => {
                   if (confirm('Are you sure you want to delete this client? This action cannot be undone.')) {
                     const success = await deleteClient(client._id);
                     if (success) {
                       navigate('/clients');
                     }
                   }
                  }}
                  title="Delete Client"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => {
                    setEditingClient({
                      name: client.name || '',
                      email: client.email || '',
                      phone: client.phone || '',
                      nationality: client.nationality || '',
                      passportNumber: client.passportNumber || '',
                      dateOfBirth: client.dateOfBirth ? new Date(client.dateOfBirth).toISOString().split('T')[0] : '',
                    });
                    setShowEditModal(true);
                  }}
                  title="Edit Client"
                >
                  <Edit className="w-4 h-4" />
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Phone</p>
              <p className="font-medium">{client.phone || 'Not provided'}</p>
            </div>
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground">Nationality</p>
              <p className="font-medium">{client.nationality || 'Not provided'}</p>
            </div>
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground">Passport Number</p>
              <p className="font-medium">{client.passportNumber || 'Not provided'}</p>
            </div>
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground">Date of Birth</p>
              <p className="font-medium">
                {client.dateOfBirth 
                  ? new Date(client.dateOfBirth).toLocaleDateString() 
                  : 'Not provided'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Documents & Extractions */}
        <div className="lg:col-span-2 space-y-6">
          {/* Documents */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Documents</CardTitle>
                  <CardDescription>{documents.length} uploaded documents</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowUploadModal(true)}>
                  <Upload className="w-4 h-4" />
                  Upload
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingDocs ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No documents uploaded yet
                </div>
              ) : (
                <div className="space-y-3">
                  {documents.map((doc) => (
                    <div 
                      key={doc._id} 
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => {
                        setPreviewDocument(doc);
                        setShowPreview(true);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                          <FileText className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{doc.originalName}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {doc.documentType} • {formatFileSize(doc.fileSize)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-muted-foreground hover:text-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewDocument(doc);
                            setShowPreview(true);
                          }}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteDocument(doc._id);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Extractions */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Data Extractions</CardTitle>
                  <CardDescription>AI-extracted data from documents</CardDescription>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => navigate(`/extraction/${id}`)}
                  disabled={documents.length === 0}
                >
                  <FileText className="w-4 h-4" />
                  New Extraction
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingExtractions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : extractions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No extractions yet. Upload documents and run extraction.
                </div>
              ) : (
                <div className="space-y-3">
                  {extractions.map((ext) => (
                    <div key={ext._id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        {ext.status === 'approved' ? (
                          <div className="w-10 h-10 rounded bg-green-50 flex items-center justify-center">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          </div>
                        ) : ext.status === 'rejected' ? (
                          <div className="w-10 h-10 rounded bg-red-50 flex items-center justify-center">
                            <FileText className="w-5 h-5 text-red-600" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded bg-yellow-50 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-yellow-600" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-sm capitalize">{ext.status}</p>
                          <p className="text-xs text-muted-foreground">
                            {ext.status === 'approved' 
                              ? 'Ready for automation' 
                              : ext.status === 'rejected'
                              ? ext.rejectionReason || 'Rejected'
                              : 'Pending review'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(ext.createdAt)}
                        </span>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => navigate(`/extraction/${id}?extractionId=${ext._id}`)}
                        >
                          View
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md animate-fade-in">
            <CardHeader>
              <CardTitle>Upload Document</CardTitle>
              <CardDescription>Add a document for this client</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Document Type</Label>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="passport">Passport</option>
                  <option value="education">Education Certificate</option>
                  <option value="employment">Employment Document</option>
                  <option value="financial">Financial Document</option>
                  <option value="identity">Identity Document</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>File</Label>
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileSelect}
                />
                {selectedFile && (
                  <p className="text-xs text-muted-foreground">
                    Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </p>
                )}
              </div>
              {uploadError && (
                <p className="text-sm text-destructive">{uploadError}</p>
              )}
            </CardContent>
            <div className="flex justify-end gap-3 p-6 pt-0">
              <Button variant="outline" onClick={() => setShowUploadModal(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleUpload} 
                disabled={!selectedFile || isUploading}
              >
                {isUploading && <Loader2 className="w-4 h-4 animate-spin" />}
                Upload
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

      {/* Edit Client Modal */}
      {showEditModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowEditModal(false);
          }}
        >
          <Card className="w-full max-w-md animate-fade-in">
            <CardHeader>
              <CardTitle>Edit Client</CardTitle>
              <CardDescription>Update the client's information</CardDescription>
            </CardHeader>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!id) return;
              setIsUpdating(true);
              try {
                await updateClient(id, editingClient);
                setShowEditModal(false);
              } catch (err) {
                console.error('Failed to update client:', err);
              } finally {
                setIsUpdating(false);
              }
            }}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Full Name *</Label>
                  <Input
                    id="edit-name"
                    value={editingClient.name}
                    onChange={(e) => setEditingClient(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-email">Email *</Label>
                    <Input
                      id="edit-email"
                      type="email"
                      value={editingClient.email}
                      onChange={(e) => setEditingClient(prev => ({ ...prev, email: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-phone">Phone *</Label>
                    <Input
                      id="edit-phone"
                      type="tel"
                      value={editingClient.phone}
                      onChange={(e) => setEditingClient(prev => ({ ...prev, phone: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-nationality">Nationality</Label>
                    <select
                      id="edit-nationality"
                      value={editingClient.nationality}
                      onChange={(e) => setEditingClient(prev => ({ ...prev, nationality: e.target.value }))}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Select country...</option>
                      {COUNTRIES.map((country) => (
                        <option key={country.code} value={country.name}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-passport">Passport Number</Label>
                    <Input
                      id="edit-passport"
                      value={editingClient.passportNumber}
                      onChange={(e) => setEditingClient(prev => ({ ...prev, passportNumber: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-dob">Date of Birth</Label>
                  <Input
                    id="edit-dob"
                    type="date"
                    value={editingClient.dateOfBirth}
                    onChange={(e) => setEditingClient(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                  />
                </div>
              </CardContent>
              <div className="flex justify-end gap-3 p-6 pt-0">
                <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isUpdating}>
                  {isUpdating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
