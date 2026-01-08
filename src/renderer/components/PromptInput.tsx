import { useState, KeyboardEvent } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { Button, Input } from './ui';

interface PromptInputProps {
  placeholder?: string;
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
  className?: string;
}

export function PromptInput({ 
  placeholder = "Enter additional instructions for AI...", 
  onSubmit, 
  disabled = false,
  className = ""
}: PromptInputProps) {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = () => {
    if (prompt.trim() && !disabled) {
      onSubmit(prompt.trim());
      setPrompt('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className={`flex items-center gap-2 p-3 rounded-lg border bg-muted/30 ${className}`}>
      <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
      <Input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
      />
      <Button 
        size="sm" 
        onClick={handleSubmit}
        disabled={!prompt.trim() || disabled}
        className="flex-shrink-0"
      >
        <Send className="w-4 h-4" />
      </Button>
    </div>
  );
}

interface PromptChatProps {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function PromptChat({
  messages,
  onSend,
  disabled = false,
  placeholder = "Send instructions to AI...",
  className = ""
}: PromptChatProps) {
  return (
    <div className={`flex flex-col rounded-lg border bg-background ${className}`}>
      {/* Messages */}
      {messages.length > 0 && (
        <div className="flex-1 max-h-40 overflow-y-auto p-3 space-y-2 border-b">
          {messages.map((msg, i) => (
            <div 
              key={i}
              className={`text-sm p-2 rounded-lg ${
                msg.role === 'user' 
                  ? 'bg-primary/10 text-primary ml-4' 
                  : 'bg-muted mr-4'
              }`}
            >
              {msg.content}
            </div>
          ))}
        </div>
      )}
      
      {/* Input */}
      <PromptInput
        placeholder={placeholder}
        onSubmit={onSend}
        disabled={disabled}
        className="border-0 rounded-none"
      />
    </div>
  );
}
