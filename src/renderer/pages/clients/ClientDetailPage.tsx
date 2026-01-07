import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Upload, Play, CheckCircle, Clock, Trash2 } from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, CardContent, CardDescription, Separator } from '../../components/ui';

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Placeholder data - would be fetched from store
  const client = {
    _id: id,
    name: 'John Smith',
    email: 'john.smith@email.com',
    phone: '+1 555-123-4567',
    nationality: 'United States',
    passportNumber: 'US123456789',
    dateOfBirth: '1985-06-15',
    status: 'active',
  };

  const documents = [
    { _id: '1', originalName: 'passport.pdf', documentType: 'passport', fileSize: 2458000, createdAt: new Date() },
    { _id: '2', originalName: 'degree_certificate.pdf', documentType: 'education', fileSize: 1245000, createdAt: new Date() },
  ];

  const extractions = [
    { _id: '1', status: 'approved', createdAt: new Date(), approvedAt: new Date() },
  ];

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
            <CardTitle>Client Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Phone</p>
              <p className="font-medium">{client.phone}</p>
            </div>
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground">Nationality</p>
              <p className="font-medium">{client.nationality}</p>
            </div>
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground">Passport Number</p>
              <p className="font-medium">{client.passportNumber || 'Not provided'}</p>
            </div>
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground">Date of Birth</p>
              <p className="font-medium">{client.dateOfBirth || 'Not provided'}</p>
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
                <Button variant="outline" size="sm">
                  <Upload className="w-4 h-4" />
                  Upload
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No documents uploaded yet
                </div>
              ) : (
                <div className="space-y-3">
                  {documents.map((doc) => (
                    <div key={doc._id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                          <FileText className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{doc.originalName}</p>
                          <p className="text-xs text-muted-foreground capitalize">{doc.documentType}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
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
                <Button variant="outline" size="sm" onClick={() => navigate(`/extraction/${id}`)}>
                  <FileText className="w-4 h-4" />
                  New Extraction
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {extractions.length === 0 ? (
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
                        ) : (
                          <div className="w-10 h-10 rounded bg-yellow-50 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-yellow-600" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-sm capitalize">{ext.status}</p>
                          <p className="text-xs text-muted-foreground">
                            {ext.status === 'approved' ? 'Ready for automation' : 'Pending review'}
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">View</Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
