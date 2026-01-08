import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../stores';
import { Button, Input, Label, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Separator } from '../../components/ui';

export function RegisterPage() {
  const { register, isLoading, error, clearError } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    companyName: '',
    companyCountry: '',
    companyEmail: '',
    companyPhone: '',
    agentName: '',
    agentEmail: '',
    agentPassword: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await register({
      company: {
        name: formData.companyName,
        country: formData.companyCountry,
        email: formData.companyEmail,
        phone: formData.companyPhone,
      },
      agent: {
        name: formData.agentName,
        email: formData.agentEmail,
        password: formData.agentPassword,
      },
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    clearError();
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4 py-12">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-foreground flex items-center justify-center shadow-lg">
              <FileText className="w-6 h-6 text-background" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Immigration Copilot</h1>
              <p className="text-sm text-muted-foreground">AI-Powered Form Automation</p>
            </div>
          </div>
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl">Create your account</CardTitle>
            <CardDescription>Register your company and start automating</CardDescription>
          </CardHeader>
          
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
              {error && (
                <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                  {error}
                </div>
              )}

              {/* Company Details */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Company Details</h3>
                
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input
                      id="companyName"
                      name="companyName"
                      placeholder="Your Company Ltd"
                      value={formData.companyName}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyCountry">Country</Label>
                    <Input
                      id="companyCountry"
                      name="companyCountry"
                      placeholder="United States"
                      value={formData.companyCountry}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="companyEmail">Company Email</Label>
                    <Input
                      id="companyEmail"
                      name="companyEmail"
                      type="email"
                      placeholder="info@company.com"
                      value={formData.companyEmail}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyPhone">Phone</Label>
                    <Input
                      id="companyPhone"
                      name="companyPhone"
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                      value={formData.companyPhone}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Admin Agent Details */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Admin Account</h3>
                
                <div className="space-y-2">
                  <Label htmlFor="agentName">Your Name</Label>
                  <Input
                    id="agentName"
                    name="agentName"
                    placeholder="John Doe"
                    value={formData.agentName}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="agentEmail">Your Email</Label>
                  <Input
                    id="agentEmail"
                    name="agentEmail"
                    type="email"
                    placeholder="john@company.com"
                    value={formData.agentEmail}
                    onChange={handleChange}
                    required
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="agentPassword">Password</Label>
                  <div className="relative">
                    <Input
                      id="agentPassword"
                      name="agentPassword"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="At least 8 characters"
                      value={formData.agentPassword}
                      onChange={handleChange}
                      required
                      autoComplete="new-password"
                      minLength={8}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex-col gap-4">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  'Create account'
                )}
              </Button>

              <p className="text-sm text-center text-muted-foreground">
                Already have an account?{' '}
                <Link to="/login" className="text-foreground font-medium hover:underline">
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
