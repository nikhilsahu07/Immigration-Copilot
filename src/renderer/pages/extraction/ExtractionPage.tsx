import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Loader2, CheckCircle, XCircle, Edit } from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, CardContent, CardDescription, Separator } from '../../components/ui';

export function ExtractionPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();

  // Placeholder - would be from API
  const extraction = {
    status: 'pending',
    extractedData: {
      personalInfo: {
        fullName: 'John Smith',
        dateOfBirth: '1985-06-15',
        gender: 'Male',
        nationality: 'United States',
        placeOfBirth: 'New York, USA',
      },
      passport: {
        number: 'US123456789',
        issueDate: '2020-01-15',
        expiryDate: '2030-01-14',
        issuingCountry: 'United States',
      },
      contact: {
        email: 'john.smith@email.com',
        phone: '+1 555-123-4567',
        address: '123 Main Street',
        city: 'New York',
        country: 'United States',
      },
      education: [
        {
          degree: 'Bachelor of Science',
          field: 'Computer Science',
          institution: 'MIT',
          yearOfCompletion: 2007,
        },
      ],
    },
  };

  const handleApprove = () => {
    // Would call extraction.approve API
    console.log('Approving extraction');
  };

  const handleReject = () => {
    // Would call extraction.reject API
    console.log('Rejecting extraction');
  };

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
              Review and approve the AI-extracted data before automation.
            </p>
          </div>
          {extraction.status === 'pending' && (
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleReject}>
                <XCircle className="w-4 h-4" />
                Reject
              </Button>
              <Button onClick={handleApprove}>
                <CheckCircle className="w-4 h-4" />
                Approve
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Personal Information
              <Button variant="ghost" size="icon" className="ml-auto">
                <Edit className="w-4 h-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(extraction.extractedData.personalInfo).map(([key, value]) => (
              <div key={key} className="flex justify-between py-2 border-b last:border-0">
                <span className="text-sm text-muted-foreground capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <span className="text-sm font-medium">{value || 'N/A'}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Passport Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Passport Details
              <Button variant="ghost" size="icon" className="ml-auto">
                <Edit className="w-4 h-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(extraction.extractedData.passport).map(([key, value]) => (
              <div key={key} className="flex justify-between py-2 border-b last:border-0">
                <span className="text-sm text-muted-foreground capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <span className="text-sm font-medium">{value || 'N/A'}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Contact Information
              <Button variant="ghost" size="icon" className="ml-auto">
                <Edit className="w-4 h-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(extraction.extractedData.contact).map(([key, value]) => (
              <div key={key} className="flex justify-between py-2 border-b last:border-0">
                <span className="text-sm text-muted-foreground capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <span className="text-sm font-medium">{value || 'N/A'}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Education */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Education
              <Button variant="ghost" size="icon" className="ml-auto">
                <Edit className="w-4 h-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {extraction.extractedData.education.map((edu, i) => (
              <div key={i} className="p-3 rounded-lg bg-muted/50">
                <p className="font-medium">{edu.degree}</p>
                <p className="text-sm text-muted-foreground">{edu.field}</p>
                <p className="text-sm text-muted-foreground">{edu.institution}, {edu.yearOfCompletion}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
