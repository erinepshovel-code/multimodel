import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { ScrollArea } from '../components/ui/scroll-area';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Settings, Send, ThumbsUp, ThumbsDown, Copy, Share2, Volume2, Menu, Plus, ChevronLeft, ChevronRight, Download, Pause, Play, CheckSquare, Square, Wand2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import ModelSelector from '../components/ModelSelector';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Label } from '../components/ui/label';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MODEL_COLORS = {
  gpt: '#10A37F',
  claude: '#D97757',
  gemini: '#4285F4',
  perplexity: '#22B8CF',
  grok: '#FFFFFF',
  deepseek: '#4D6BFE'
};

const getModelColor = (model) => {
  const lower = model.toLowerCase();
  for (const [key, color] of Object.entries(MODEL_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return '#FFFFFF';
};

const getModelType = (model) => {
  const lower = model.toLowerCase();
  if (lower.includes('gpt') || lower.startsWith('o')) return 'gpt';
  if (lower.includes('claude')) return 'claude';
  if (lower.includes('gemini')) return 'gemini';
  if (lower.includes('perplexity') || lower.includes('sonar')) return 'perplexity';
  if (lower.includes('grok')) return 'grok';
  if (lower.includes('deepseek')) return 'deepseek';
  return 'unknown';
};

const ResponsePanel = ({ model, messages, onFeedback, onCopy, onShare, onAudio }) => {
  const scrollRef = useRef(null);
  const color = getModelColor(model);
  const modelType = getModelType(model);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const modelMessages = messages.filter(m => m.model === model);
  const lastMessage = modelMessages[modelMessages.length - 1];

  return (
    <div className="h-full flex flex-col bg-[#18181B] border-l border-border" data-testid={`response-panel-${model}`}>
      {/* Header */}
      <div 
        className="p-3 border-b flex items-center justify-between"
        style={{ borderBottomColor: color + '20' }}
      >
        <Badge 
          variant="outline" 
          className={`model-badge-${modelType} text-xs font-medium`}
          data-testid={`model-badge-${model}`}
        >
          {model}
        </Badge>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {modelMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Waiting for response...
            </div>
          ) : (
            modelMessages.map((msg, idx) => (
              <div key={idx} className="chat-message">
                <div className="prose prose-invert max-w-none text-sm leading-relaxed">
                  {msg.content}
                  {msg.streaming && <span className="streaming-cursor" />}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Action Buttons */}
      {lastMessage && !lastMessage.streaming && (
        <div className="p-3 border-t border-border flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onCopy(lastMessage.content)}
            data-testid={`copy-btn-${model}`}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onFeedback(lastMessage.id, 'up')}
            data-testid={`thumbs-up-btn-${model}`}
          >
            <ThumbsUp className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onFeedback(lastMessage.id, 'down')}
            data-testid={`thumbs-down-btn-${model}`}
          >
            <ThumbsDown className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onAudio(lastMessage.content)}
            data-testid={`audio-btn-${model}`}
          >
            <Volume2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onShare(lastMessage.content, model)}
            data-testid={`share-btn-${model}`}
          >
            <Share2 className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default function ChatPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [selectedModels, setSelectedModels] = useState(['gpt-5.2', 'claude-sonnet-4-5-20250929']);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || streaming) return;
    
    const userMessage = input;
    setInput('');
    setStreaming(true);

    // Add user message
    const userMsg = {
      role: 'user',
      content: userMessage,
      model: 'user',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const response = await fetch(`${API}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          message: userMessage,
          models: selectedModels,
          conversation_id: conversationId
        })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      const modelBuffers = {};
      selectedModels.forEach(model => {
        modelBuffers[model] = { id: '', content: '' };
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('event:')) {
            const eventType = line.substring(6).trim();
            continue;
          }
          
          if (line.startsWith('data:')) {
            try {
              const data = JSON.parse(line.substring(5).trim());
              
              if (data.model && data.message_id) {
                if (data.content) {
                  // Chunk received
                  modelBuffers[data.model].id = data.message_id;
                  modelBuffers[data.model].content += data.content;
                  
                  // Update messages
                  setMessages(prev => {
                    const existing = prev.find(m => m.id === data.message_id);
                    if (existing) {
                      return prev.map(m =>
                        m.id === data.message_id
                          ? { ...m, content: modelBuffers[data.model].content, streaming: true }
                          : m
                      );
                    } else {
                      return [...prev, {
                        id: data.message_id,
                        role: 'assistant',
                        content: modelBuffers[data.model].content,
                        model: data.model,
                        streaming: true,
                        timestamp: new Date()
                      }];
                    }
                  });
                } else if (data.message_id) {
                  // Complete event
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === data.message_id
                        ? { ...m, streaming: false }
                        : m
                    )
                  );
                }
              }
              
              if (data.error) {
                toast.error(`${data.model}: ${data.error}`);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      console.error('Stream error:', error);
      toast.error('Failed to send message');
    } finally {
      setStreaming(false);
    }
  };

  const handleFeedback = async (messageId, feedback) => {
    try {
      await axios.post(`${API}/chat/feedback`, {
        message_id: messageId,
        feedback
      });
      toast.success('Feedback submitted');
    } catch (error) {
      toast.error('Failed to submit feedback');
    }
  };

  const handleCopy = (content) => {
    navigator.clipboard.writeText(content);
    toast.success('Copied to clipboard');
  };

  const handleShare = async (content, model) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Response from ${model}`,
          text: content
        });
      } catch (error) {
        handleCopy(content);
      }
    } else {
      handleCopy(content);
    }
  };

  const handleAudio = (content) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(content);
      window.speechSynthesis.speak(utterance);
      toast.success('Playing audio');
    } else {
      toast.error('Text-to-speech not supported');
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setConversationId(null);
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top Bar */}
      <div className="h-14 border-b border-border flex items-center justify-between px-4 bg-[#18181B]">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>Multi-AI Hub</h1>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleNewChat}
            data-testid="new-chat-btn"
          >
            <Plus className="h-4 w-4 mr-2" />
            New
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate('/settings')}
            data-testid="settings-btn"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={logout}
            data-testid="logout-btn"
          >
            Logout
          </Button>
        </div>
      </div>

      {/* Model Selector Bar */}
      <div className="p-3 border-b border-border bg-[#18181B]">
        <ModelSelector
          selectedModels={selectedModels}
          onChange={setSelectedModels}
        />
      </div>

      {/* Main Content - Resizable Panels */}
      <div className="flex-1 overflow-hidden">
        {selectedModels.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            Please select at least one AI model
          </div>
        ) : selectedModels.length === 1 ? (
          <ResponsePanel
            model={selectedModels[0]}
            messages={messages}
            onFeedback={handleFeedback}
            onCopy={handleCopy}
            onShare={handleShare}
            onAudio={handleAudio}
          />
        ) : (
          <PanelGroup direction="vertical">
            <Panel defaultSize={50} minSize={20}>
              <ResponsePanel
                model={selectedModels[0]}
                messages={messages}
                onFeedback={handleFeedback}
                onCopy={handleCopy}
                onShare={handleShare}
                onAudio={handleAudio}
              />
            </Panel>
            <PanelResizeHandle className="h-1 bg-border hover:bg-primary/50 transition-colors" />
            <Panel defaultSize={50} minSize={20}>
              <ResponsePanel
                model={selectedModels[1]}
                messages={messages}
                onFeedback={handleFeedback}
                onCopy={handleCopy}
                onShare={handleShare}
                onAudio={handleAudio}
              />
            </Panel>
          </PanelGroup>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-border bg-[#18181B]">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything to selected AI models..."
            className="resize-none bg-background"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={streaming}
            data-testid="chat-input"
          />
          <Button
            onClick={handleSend}
            disabled={streaming || !input.trim()}
            className="h-full"
            data-testid="send-btn"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
