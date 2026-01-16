import { useState, useEffect } from 'react';
import { Play, Pause, Square, AlertTriangle, KeyRound, CheckCircle, Loader2, Globe, MessageSquare, FileText, Bot, Sparkles, ArrowRight, XCircle, Search, PlusCircle } from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, CardContent, CardDescription, Input, Label, Progress, Textarea } from '../../components/ui';
import { useAutomationStore, useClientStore, usePortalStore } from '../../stores';
import { api, ChatMessage } from '../../lib/api';
import type { Extraction } from '../../../shared/types';

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
    submitOtp,
    resumeAfterCaptcha,
    loadUrl,
    hidePreview,
    mode,
    setMode,
  } = useAutomationStore();

  const { clients, fetchClients, isLoading: clientsLoading } = useClientStore();
  const { portals, fetchPortals, isLoading: portalsLoading } = usePortalStore();

  const [selectedClient, setSelectedClient] = useState('');
  const [selectedPortal, setSelectedPortal] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [approvedExtraction, setApprovedExtraction] = useState<Extraction | null>(null);
  const [loadingExtraction, setLoadingExtraction] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [browserViewShown, setBrowserViewShown] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');

  useEffect(() => {
    fetchClients();
    fetchPortals();
  }, []);

  // When client is selected, check for approved extraction and load chats
  useEffect(() => {
    if (selectedClient) {
      loadApprovedExtraction(selectedClient);
      loadChatHistory(selectedClient);
    } else {
      setApprovedExtraction(null);
      setChatMessages([]);
    }
  }, [selectedClient]);

  const loadChatHistory = async (clientId: string) => {
    setLoadingChats(true);
    try {
      const result = await api.chat.list({ clientId });
      if (result.success && result.data) {
        setChatMessages(result.data);
      }
    } catch (error) {
      console.error('Failed to load chats:', error);
    } finally {
      setLoadingChats(false);
    }
  };

  // When portal is selected, show BrowserView immediately
  useEffect(() => {
    if (selectedPortal) {
      const portal = portals.find(p => p._id === selectedPortal);
      if (portal) {
        loadUrl(portal.url);
        setBrowserViewShown(true);
      }
    } else {
      if (browserViewShown && !isRunning) {
        hidePreview();
        setBrowserViewShown(false);
      }
    }
  }, [selectedPortal]);

  const loadApprovedExtraction = async (clientId: string) => {
    setLoadingExtraction(true);
    try {
      const result = await api.extraction.list({ clientId });
      if (result.success && result.data) {
        const approved = result.data.find(e => e.status === 'approved');
        setApprovedExtraction(approved || null);
      }
    } catch (err) {
      console.error('Failed to load extraction:', err);
    } finally {
      setLoadingExtraction(false);
    }
  };

  // Get clients with approved extractions only
  const eligibleClients = clients.filter(c => c.hasApprovedExtraction);

  const handleStart = async () => {
    if (!selectedClient || !selectedPortal || !approvedExtraction) return;
    
    await startAutomation({
      clientId: selectedClient,
      portalId: selectedPortal,
      extractionId: approvedExtraction._id,
      customPrompt: customPrompt || undefined,
    });
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

  const handleStop = async () => {
    try {
      if (isRunning) {
        await stopAutomation(); // Use the store's stopAutomation
      } else {
        // If not running but browser is open (manual mode or finished)
        await api.browserView.hide();
        await api.browserView.close();
      }
      // setIsRunning(false); // This state is managed by the store's stopAutomation
      setBrowserViewShown(false);
      // Don't clear selected portal to persist selection
    } catch (err) {
      console.error('Failed to stop automation:', err);
    }
  };

  const handleChatClick = (content: string) => {
    setCustomPrompt(content);
  };

  // Get status icon based on message
  const getStatusIcon = () => {
    if (statusMessage.includes('Loading') || statusMessage.includes('Downloading')) {
      return <Globe className="w-5 h-5 text-blue-500 animate-pulse" />;
    }
    if (statusMessage.includes('Processing') || statusMessage.includes('AI')) {
      return <Bot className="w-5 h-5 text-purple-500 animate-pulse" />;
    }
    if (statusMessage.includes('Filling')) {
      return <FileText className="w-5 h-5 text-orange-500 animate-pulse" />;
    }
    if (statusMessage.includes('filled') || statusMessage.includes('Review')) {
      return <Sparkles className="w-5 h-5 text-green-500" />;
    }
    if (isPaused) {
      return <Pause className="w-5 h-5 text-yellow-500" />;
    }
    return <Loader2 className="w-5 h-5 animate-spin text-primary" />;
  };

  return (
    <div className="split-view">
      {/* Left Panel - Controls */}
      <div className="split-view-left p-6 space-y-6">
        <div className="page-header">
          <h1 className="page-title">Automation</h1>
          <div className="flex gap-2">
            {browserViewShown && !isRunning && (
              <Button variant="outline" onClick={handleStop} className="gap-2">
                <XCircle className="w-4 h-4" />
                Exit Browser
              </Button>
            )}
          </div>



        </div>

        {/* Configuration */}
        {!isRunning && (<>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Select Client</Label>
                {clientsLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Loading clients...</span>
                  </div>
                ) : eligibleClients.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No clients with approved extractions. Create a client and approve their data extraction first.
                  </p>
                ) : (
                  <select
                    value={selectedClient}
                    onChange={(e) => setSelectedClient(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Choose a client...</option>
                    {eligibleClients.map(client => (
                      <option key={client._id} value={client._id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {selectedClient && loadingExtraction && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading extraction data...</span>
                </div>
              )}

              {selectedClient && !loadingExtraction && !approvedExtraction && (
                <p className="text-sm text-yellow-600">
                  No approved extraction found for this client. Please approve their data extraction first.
                </p>
              )}

              <div className="space-y-2">
                <Label>Select Portal</Label>
                {portalsLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Loading portals...</span>
                  </div>
                ) : portals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No portals configured. Add a portal first.
                  </p>
                ) : (
                  <select
                    value={selectedPortal}
                    onChange={(e) => setSelectedPortal(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Choose a portal...</option>
                    {portals.map(portal => (
                      <option key={portal._id} value={portal._id}>
                        {portal.name} ({portal.country})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  AI Instructions (Optional)
                </Label>
                <Textarea
                  placeholder="E.g., 'Fill professionally' or 'Skip optional fields' or 'Use N/A for empty values'"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="min-h-[80px] text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Add custom instructions for the AI to follow when filling the form.
                </p>
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Automation Mode</Label>
                  <p className="text-xs text-muted-foreground">
                    {mode === 'auto' ? 'Continues automatically' : 'Waits for approval'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${mode === 'manual' ? 'font-bold text-primary' : 'text-muted-foreground'}`}>Manual</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={mode === 'auto'}
                    onClick={() => setMode(mode === 'auto' ? 'manual' : 'auto')}
                    className={`
                      relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
                      ${mode === 'auto' ? 'bg-primary' : 'bg-input'}
                    `}
                  >
                    <span
                      className={`
                        pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform
                        ${mode === 'auto' ? 'translate-x-5' : 'translate-x-0.5'}
                      `}
                    />
                  </button>
                  <span className={`text-xs ${mode === 'auto' ? 'font-bold text-primary' : 'text-muted-foreground'}`}>Auto</span>
                </div>
              </div>

              <Button 
                onClick={handleStart} 
                className="w-full" 
                disabled={!selectedClient || !selectedPortal || !approvedExtraction || isLoading}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Start Automation
              </Button>
            </CardContent>
          </Card>

          {/* Chat History */}
          {selectedClient && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Chat History
                </CardTitle>
                <CardDescription>
                  {chatMessages.length} messages with this client
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative mb-3">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search chat history..."
                    className="pl-9 h-9 text-sm"
                    value={chatSearchQuery}
                    onChange={(e) => setChatSearchQuery(e.target.value)}
                  />
                </div>
                {loadingChats ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                ) : chatMessages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No chat history yet. AI instructions will be saved here.
                  </p>
                ) : (

                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {chatMessages
                      .filter(msg => msg.content.toLowerCase().includes(chatSearchQuery.toLowerCase()))
                      .map((msg) => (
                      <div 
                        key={msg._id} 
                        className={`group p-2 rounded text-sm relative transition-colors ${
                          msg.role === 'user' ? 'bg-primary/10 ml-4 hover:bg-primary/15' : 
                          msg.role === 'ai' ? 'bg-muted mr-4 hover:bg-muted/80' : 'text-center italic text-muted-foreground'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1">
                            <p className="font-medium text-xs mb-1 opacity-70">
                              {msg.role === 'user' ? 'You' : msg.role === 'ai' ? 'Immigration Copilot' : 'System'}
                            </p>
                            {msg.content}
                          </div>
                          
                          {/* Add to Prompt Icon - Only for user messages */}
                          {msg.role === 'user' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => handleChatClick(msg.content)}
                              title="Add to prompt"
                            >
                              <PlusCircle className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    {chatMessages.length > 0 && chatMessages.filter(msg => msg.content.toLowerCase().includes(chatSearchQuery.toLowerCase())).length === 0 && (
                      <p className="text-center text-xs text-muted-foreground py-2">No matching messages found</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          </>
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
                  {getStatusIcon()}
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
              <Button onClick={handleStop} variant="destructive">
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

            {/* Form Approval - form is already filled, just needs approval to submit */}
            {needsApproval && currentMapping && (
              <Card className="border-green-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-green-600" />
                    Form Filled - Review & Proceed
                  </CardTitle>
                  <CardDescription>{currentMapping.fields.length} fields filled</CardDescription>
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
                    {currentMapping.fields.length > 5 && (
                      <p className="text-xs text-muted-foreground text-center">
                        +{currentMapping.fields.length - 5} more fields
                      </p>
                    )}
                  </div>
                  
                  {/* Dynamic Action Buttons */}
                  <div className="flex flex-wrap gap-2">
                    {currentMapping.actions && currentMapping.actions.length > 0 ? (
                      currentMapping.actions.map((action, i) => (
                        <Button 
                          key={i} 
                          onClick={() => api.automation.executeAction({ actionIndex: i })} 
                          variant={action.type === 'submit' || action.expectedText?.toLowerCase().includes('submit') ? 'default' : 'outline'}
                          className="flex-1 min-w-[100px]"
                        >
                          <ArrowRight className="w-4 h-4" />
                          {action.expectedText || action.description || 'Proceed'}
                        </Button>
                      ))
                    ) : (
                      <Button onClick={handleApprove} className="flex-1">
                        <ArrowRight className="w-4 h-4" /> Submit Form
                      </Button>
                    )}
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
            <Globe className="w-8 h-8" />
          </div>
          <p className="text-lg font-medium">Browser Preview</p>
          <div className="text-sm">
            {browserViewShown || isRunning 
              ? (
                <div className="space-y-4">
                  <p>The portal is displayed in the embedded browser view</p>
                  {!isRunning && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setSelectedPortal('');
                        hidePreview();
                        setBrowserViewShown(false);
                      }}
                      className="gap-2"
                    >
                      <Square className="w-4 h-4" />
                      Close Preview
                    </Button>
                  )}
                </div>
              )
              : <span>Select a portal to preview it here</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
