import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { ScrollArea } from '../components/ui/scroll-area';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Settings, Send, ThumbsUp, ThumbsDown, Copy, Share2, Volume2, Plus, ChevronLeft, ChevronRight, Download, Pause, Play, Wand2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import ModelSelector from '../components/ModelSelector';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Separator } from '../components/ui/separator';

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

const ResponsePanel = ({ model, messages, onFeedback, onCopy, onShare, onAudio, onToggleSelect, selectedMessages, isPaused, onTogglePause, messageIndexMap }) => {
  const scrollRef = useRef(null);
  const color = getModelColor(model);
  const modelType = getModelType(model);

  useEffect(() => {
    if (scrollRef.current && !isPaused) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isPaused]);

  const modelMessages = messages.filter(m => m.model === model);

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
        <Button
          size="sm"
          variant="ghost"
          onClick={onTogglePause}
          className="h-7 w-7 p-0"
          data-testid={`pause-btn-${model}`}
        >
          {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {modelMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              {isPaused ? 'Paused' : 'Waiting for response...'}
            </div>
          ) : (
            modelMessages.map((msg, idx) => {
              const msgIndex = messageIndexMap[msg.id] || `${model}-${idx}`;
              const isSelected = selectedMessages.includes(msg.id);
              
              return (
                <div key={msg.id || idx} className="chat-message space-y-2">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelect(msg.id)}
                      className="mt-1"
                      data-testid={`select-msg-${msg.id}`}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs" style={{ borderColor: color + '40', color: color }}>
                          #{msgIndex}
                        </Badge>
                      </div>
                      <div className="prose prose-invert max-w-none text-sm leading-relaxed">
                        {msg.content}
                        {msg.streaming && <span className="streaming-cursor" />}
                      </div>
                    </div>
                  </div>
                  {!msg.streaming && idx === modelMessages.length - 1 && (
                    <div className="flex items-center gap-2 pl-8">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onCopy(msg.content)}
                        className="h-7 px-2"
                        data-testid={`copy-btn-${msg.id}`}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onFeedback(msg.id, 'up')}
                        className="h-7 px-2"
                        data-testid={`thumbs-up-btn-${msg.id}`}
                      >
                        <ThumbsUp className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onFeedback(msg.id, 'down')}
                        className="h-7 px-2"
                        data-testid={`thumbs-down-btn-${msg.id}`}
                      >
                        <ThumbsDown className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onAudio(msg.content)}
                        className="h-7 px-2"
                        data-testid={`audio-btn-${msg.id}`}
                      >
                        <Volume2 className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onShare(msg.content, model)}
                        className="h-7 px-2"
                        data-testid={`share-btn-${msg.id}`}
                      >
                        <Share2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default function ChatPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [selectedModels, setSelectedModels] = useState(['gpt-5.2', 'claude-sonnet-4-5-20250929', 'gemini-3-flash-preview']);
  const [visibleModelIndex, setVisibleModelIndex] = useState(0);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState([]);
  const [pausedModels, setPausedModels] = useState({});
  const [showSynthesisDialog, setShowSynthesisDialog] = useState(false);
  const [synthesisModels, setSynthesisModels] = useState([]);
  const [synthesisPrompt, setSynthesisPrompt] = useState('');
  const [promptHistory, setPromptHistory] = useState([]);
  const [showPromptHistory, setShowPromptHistory] = useState(true);
  const [messageIndexMap, setMessageIndexMap] = useState({});
  const [nextIndex, setNextIndex] = useState(1);

  // Get visible models for carousel (show 2 at a time)
  const getVisibleModels = () => {
    if (selectedModels.length <= 2) return selectedModels;
    return [
      selectedModels[visibleModelIndex],
      selectedModels[(visibleModelIndex + 1) % selectedModels.length]
    ];
  };

  const handlePrevModel = () => {
    setVisibleModelIndex((prev) => 
      prev === 0 ? selectedModels.length - 1 : prev - 1
    );
  };

  const handleNextModel = () => {
    setVisibleModelIndex((prev) => 
      (prev + 1) % selectedModels.length
    );
  };

  const handleSend = async (customMessage = null, targetModels = null) => {
    const messageToSend = customMessage || input;
    if (!messageToSend.trim() || streaming) return;
    
    const modelsToQuery = targetModels || selectedModels.filter(m => !pausedModels[m]);
    if (modelsToQuery.length === 0) {
      toast.error('All models are paused or no models selected');
      return;
    }
    
    if (!customMessage) setInput('');
    setStreaming(true);

    // Add user message with index
    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageToSend,
      model: 'user',
      timestamp: new Date()
    };
    
    // Add to prompt history
    const promptIndex = nextIndex;
    setNextIndex(prev => prev + 1);
    setPromptHistory(prev => [...prev, { index: promptIndex, content: messageToSend, timestamp: new Date() }]);
    
    setMessages(prev => [...prev, userMsg]);

    try {
      const response = await fetch(`${API}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          message: messageToSend,
          models: modelsToQuery,
          conversation_id: conversationId
        })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      const modelBuffers = {};
      modelsToQuery.forEach(model => {
        modelBuffers[model] = { id: '', content: '' };
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data:')) {
            try {
              const data = JSON.parse(line.substring(5).trim());
              
              if (data.model && data.message_id) {
                if (data.content) {
                  // Check if model is paused
                  if (pausedModels[data.model]) continue;
                  
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
                      // Assign index when message is created
                      const msgIndex = nextIndex + Object.keys(modelBuffers).indexOf(data.model);
                      setMessageIndexMap(prev => ({ ...prev, [data.message_id]: msgIndex }));
                      
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
      
      // Update index counter for next batch
      setNextIndex(prev => prev + modelsToQuery.length);
      
    } catch (error) {
      console.error('Stream error:', error);
      toast.error('Failed to send message');
    } finally {
      setStreaming(false);
    }
  };

  const handleSynthesis = async () => {
    if (selectedMessages.length === 0) {
      toast.error('Please select at least one response');
      return;
    }
    
    if (synthesisModels.length === 0) {
      toast.error('Please select at least one model for synthesis');
      return;
    }
    
    // Build synthesis prompt
    const selectedMsgs = messages.filter(m => selectedMessages.includes(m.id));
    const responsesText = selectedMsgs.map((msg, idx) => {
      const msgIndex = messageIndexMap[msg.id] || idx;
      return `Response #${msgIndex} from ${msg.model}:\n${msg.content}`;
    }).join('\n\n');
    
    const fullPrompt = synthesisPrompt || 'Synthesize and analyze these AI responses:';
    const synthesisMessage = `${fullPrompt}\n\n${responsesText}`;
    
    setShowSynthesisDialog(false);
    setSynthesisPrompt('');
    setSynthesisModels([]);
    setSelectedMessages([]);
    
    // Send to selected models
    await handleSend(synthesisMessage, synthesisModels);
  };

  const handleExport = async () => {
    try {
      const exportData = {
        conversation_id: conversationId,
        exported_at: new Date().toISOString(),
        prompts: promptHistory,
        messages: messages.map(m => ({
          index: messageIndexMap[m.id] || 'N/A',
          model: m.model,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp
        }))
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Conversation exported');
    } catch (error) {
      toast.error('Failed to export conversation');
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
      window.speechSynthesis.cancel();
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
    setPromptHistory([]);
    setSelectedMessages([]);
    setMessageIndexMap({});
    setNextIndex(1);
  };

  const handleToggleSelect = (messageId) => {
    setSelectedMessages(prev => 
      prev.includes(messageId)
        ? prev.filter(id => id !== messageId)
        : [...prev, messageId]
    );
  };

  const handleTogglePause = (model) => {
    setPausedModels(prev => ({
      ...prev,
      [model]: !prev[model]
    }));
  };

  const visibleModels = getVisibleModels();

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
            onClick={handleExport}
            disabled={messages.length === 0}
            data-testid="export-btn"
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
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
        <div className="flex items-center justify-between gap-2">
          <ModelSelector
            selectedModels={selectedModels}
            onChange={setSelectedModels}
            maxModels={6}
          />
          
          {selectedMessages.length > 0 && (
            <Button
              size="sm"
              variant="default"
              onClick={() => setShowSynthesisDialog(true)}
              data-testid="synthesis-btn"
            >
              <Wand2 className="h-4 w-4 mr-2" />
              Synthesize ({selectedMessages.length})
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Prompt History Sidebar */}
        <div className={`${showPromptHistory ? 'w-64' : 'w-0'} transition-all duration-200 border-r border-border bg-[#18181B] overflow-hidden`}>
          <div className="h-full flex flex-col">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-medium">Prompts</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowPromptHistory(false)}
                className="h-6 w-6 p-0"
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-2">
                {promptHistory.map((prompt, idx) => (
                  <div key={idx} className="p-2 rounded bg-muted/50 text-xs">
                    <Badge variant="outline" className="text-[10px] mb-1">#{prompt.index}</Badge>
                    <div className="text-muted-foreground line-clamp-2">{prompt.content}</div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Show/Hide Prompt History Button */}
        {!showPromptHistory && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowPromptHistory(true)}
            className="absolute left-0 top-20 z-10 h-8 w-8 p-0 rounded-r"
            data-testid="show-prompts-btn"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}

        {/* Response Panels with Carousel */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {selectedModels.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              Please select at least one AI model
            </div>
          ) : (
            <>
              {/* Carousel Navigation */}
              {selectedModels.length > 2 && (
                <div className="p-2 border-b border-border bg-[#18181B] flex items-center justify-center gap-4">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handlePrevModel}
                    data-testid="prev-model-btn"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Viewing {visibleModelIndex + 1}-{Math.min(visibleModelIndex + 2, selectedModels.length)} of {selectedModels.length}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleNextModel}
                    data-testid="next-model-btn"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
              
              {/* Response Panels */}
              {visibleModels.length === 1 ? (
                <ResponsePanel
                  model={visibleModels[0]}
                  messages={messages}
                  onFeedback={handleFeedback}
                  onCopy={handleCopy}
                  onShare={handleShare}
                  onAudio={handleAudio}
                  onToggleSelect={handleToggleSelect}
                  selectedMessages={selectedMessages}
                  isPaused={pausedModels[visibleModels[0]]}
                  onTogglePause={() => handleTogglePause(visibleModels[0])}
                  messageIndexMap={messageIndexMap}
                />
              ) : (
                <PanelGroup direction="vertical" className="flex-1">
                  <Panel defaultSize={50} minSize={20}>
                    <ResponsePanel
                      model={visibleModels[0]}
                      messages={messages}
                      onFeedback={handleFeedback}
                      onCopy={handleCopy}
                      onShare={handleShare}
                      onAudio={handleAudio}
                      onToggleSelect={handleToggleSelect}
                      selectedMessages={selectedMessages}
                      isPaused={pausedModels[visibleModels[0]]}
                      onTogglePause={() => handleTogglePause(visibleModels[0])}
                      messageIndexMap={messageIndexMap}
                    />
                  </Panel>
                  <PanelResizeHandle className="h-1 bg-border hover:bg-primary/50 transition-colors" />
                  <Panel defaultSize={50} minSize={20}>
                    <ResponsePanel
                      model={visibleModels[1]}
                      messages={messages}
                      onFeedback={handleFeedback}
                      onCopy={handleCopy}
                      onShare={handleShare}
                      onAudio={handleAudio}
                      onToggleSelect={handleToggleSelect}
                      selectedMessages={selectedMessages}
                      isPaused={pausedModels[visibleModels[1]]}
                      onTogglePause={() => handleTogglePause(visibleModels[1])}
                      messageIndexMap={messageIndexMap}
                    />
                  </Panel>
                </PanelGroup>
              )}
            </>
          )}
        </div>
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
            onClick={() => handleSend()}
            disabled={streaming || !input.trim()}
            className="h-full"
            data-testid="send-btn"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Synthesis Dialog */}
      <Dialog open={showSynthesisDialog} onOpenChange={setShowSynthesisDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Synthesize Responses</DialogTitle>
            <DialogDescription>
              Select models to synthesize the {selectedMessages.length} selected response(s)
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Synthesis Prompt (optional)</Label>
              <Textarea
                value={synthesisPrompt}
                onChange={(e) => setSynthesisPrompt(e.target.value)}
                placeholder="E.g., Compare these responses and identify key differences..."
                className="mt-2"
                rows={3}
              />
            </div>
            
            <Separator />
            
            <div>
              <Label>Target Models</Label>
              <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                {selectedModels.map(model => (
                  <div key={model} className="flex items-center space-x-2">
                    <Checkbox
                      id={`synthesis-${model}`}
                      checked={synthesisModels.includes(model)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSynthesisModels(prev => [...prev, model]);
                        } else {
                          setSynthesisModels(prev => prev.filter(m => m !== model));
                        }
                      }}
                    />
                    <label
                      htmlFor={`synthesis-${model}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {model}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowSynthesisDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSynthesis} data-testid="synthesis-submit-btn">
                <Wand2 className="h-4 w-4 mr-2" />
                Synthesize
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
