import React, { useState } from 'react';
import { Play, Pause, Square, AlertTriangle, KeyRound, CheckCircle, Loader2, ChevronDown } from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, CardContent, CardDescription, Input, Label, Progress, Separator } from '../../components/ui';
import { useAutomationStore } from '../../stores';

export function AutomationPage() {
  const {
    isRunning,
    isPaused,
    currentMapping,
    statusMessage,
    progress,
    needsApproval,
    captchaDetected,
    captchaType,
    otpDetected,
    isLoading,
    startAutomation,
    stopAutomation,
    pauseAutomation,
    resumeAutomation,
    approveMapping,
    submitForm,
    submitOtp,
    resumeAfterCaptcha,
    loadUrl,
  } = useAutomationStore();

  const [selectedClient, setSelectedClient] = useState('');
  const [selectedPortal, setSelectedPortal] = useState('');
  const [otpCode, setOtpCode] = useState('');

  // Placeholder data
  const clients = [
    { _id: '1', name: 'John Smith', hasApprovedExtraction: true },
    { _id: '2', name: 'Maria Garcia', hasApprovedExtraction: true },
  ];

  const portals = [
    { _id: '1', name: 'US Visa Application', url: 'https://ceac.state.gov' },
    { _id: '2', name: 'UK Visa Application', url: 'https://www.gov.uk/apply-uk-visa' },
  ];

  const handleStart = async () => {
    if (!selectedClient || !selectedPortal) return;
    
    const portal = portals.find(p => p._id === selectedPortal);
    if (portal) {
      await loadUrl(portal.url);
      await startAutomation({
        clientId: selectedClient,
        portalId: selectedPortal,
        extractionId: 'placeholder-extraction-id',
      });
    }
  };

  const handleApprove = async () => {
    if (currentMapping) {
      await approveMapping(currentMapping);
    }
  };

  const handleSubmitOtp = async () => {
    if (otpCode) {
      await submitOtp(otpCode);
      setOtpCode('');
    }
  };

  return (
    <div className="split-view">
      {/* Left Panel - Controls */}
      <div className="split-view-left p-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Automation</h1>
          <p className="text-sm text-muted-foreground">AI-powered form filling</p>
        </div>

        {/* Configuration */}
        {!isRunning && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Select Client</Label>
                <select
                  value={selectedClient}
                  onChange={(e) => setSelectedClient(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Choose a client...</option>
                  {clients.filter(c => c.hasApprovedExtraction).map(client => (
                    <option key={client._id} value={client._id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Select Portal</Label>
                <select
                  value={selectedPortal}
                  onChange={(e) => setSelectedPortal(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Choose a portal...</option>
                  {portals.map(portal => (
                    <option key={portal._id} value={portal._id}>
                      {portal.name}
                    </option>
                  ))}
                </select>
              </div>

              <Button 
                onClick={handleStart} 
                className="w-full" 
                disabled={!selectedClient || !selectedPortal || isLoading}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Start Automation
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Status */}
        {isRunning && (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  {isPaused ? (
                    <Pause className="w-5 h-5 text-yellow-500" />
                  ) : (
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  )}
                  <span className="text-sm">{statusMessage}</span>
                </div>
                <Progress value={progress} />
                <p className="text-xs text-muted-foreground text-right">{progress}% complete</p>
              </CardContent>
            </Card>

            {/* Controls */}
            <div className="flex gap-2">
              {isPaused ? (
                <Button onClick={resumeAutomation} className="flex-1">
                  <Play className="w-4 h-4" /> Resume
                </Button>
              ) : (
                <Button onClick={pauseAutomation} variant="outline" className="flex-1">
                  <Pause className="w-4 h-4" /> Pause
                </Button>
              )}
              <Button onClick={stopAutomation} variant="destructive">
                <Square className="w-4 h-4" /> Stop
              </Button>
            </div>

            {/* CAPTCHA Alert */}
            {captchaDetected && (
              <Card className="border-yellow-500 bg-yellow-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-yellow-700">
                    <AlertTriangle className="w-5 h-5" />
                    CAPTCHA Detected
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-yellow-700 mb-3">
                    Please solve the {captchaType} in the browser preview, then click continue.
                  </p>
                  <Button onClick={resumeAfterCaptcha} className="w-full">
                    <CheckCircle className="w-4 h-4" /> I've Solved the CAPTCHA
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* OTP Alert */}
            {otpDetected && (
              <Card className="border-blue-500 bg-blue-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-blue-700">
                    <KeyRound className="w-5 h-5" />
                    OTP Required
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-blue-700">
                    Enter the OTP code sent to the client.
                  </p>
                  <Input
                    placeholder="Enter OTP code"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    maxLength={8}
                  />
                  <Button onClick={handleSubmitOtp} className="w-full" disabled={!otpCode}>
                    Submit OTP
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Form Approval */}
            {needsApproval && currentMapping && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Review Mapping</CardTitle>
                  <CardDescription>{currentMapping.fields.length} fields ready to fill</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {currentMapping.fields.slice(0, 5).map((field, i) => (
                      <div key={i} className="text-xs p-2 rounded bg-muted">
                        <div className="flex justify-between">
                          <span className="font-medium">{field.fieldLabel}</span>
                          <span className={`px-1.5 rounded ${field.confidence === 'high' ? 'bg-green-100 text-green-700' : field.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                            {field.confidence}
                          </span>
                        </div>
                        <p className="text-muted-foreground truncate">{field.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleApprove} className="flex-1">
                      <CheckCircle className="w-4 h-4" /> Approve & Fill
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Right Panel - Browser Preview Placeholder */}
      <div className="split-view-right flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
            <ChevronDown className="w-8 h-8" />
          </div>
          <p className="text-lg font-medium">Browser Preview</p>
          <p className="text-sm">
            {isRunning 
              ? 'The portal is displayed in the embedded browser view' 
              : 'Start automation to see the portal here'}
          </p>
        </div>
      </div>
    </div>
  );
}
